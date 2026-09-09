import { Server, Socket } from 'socket.io';
import { getDb } from '../db/client.js';
import type { ServerToClientEvents, ClientToServerEvents } from '@query-quest/shared';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function registerRoomHandlers(io: Server, socket: AppSocket): void {
  const playerId: string = (socket.data as { playerId?: string }).playerId ?? '';
  const playerName: string = (socket.data as { playerName?: string }).playerName ?? 'Unknown';

  // Create room
  socket.on('createRoom', async (data, cb) => {
    try {
      const db = getDb();
      let code = generateRoomCode();
      for (let i = 0; i < 5; i++) {
        const exists = await db.collection('rooms').findOne({ code });
        if (!exists) break;
        code = generateRoomCode();
      }

      const room = {
        code,
        hostId: playerId,
        status: 'lobby' as const,
        players: [{ playerId, name: playerName, isReady: false, isHost: true }],
        maxPlayers: 8,
        challengeSetId: data.challengeSetId || 'default',
        createdAt: new Date(),
      };

      await db.collection('rooms').insertOne(room);
      await socket.join(`room:${code}`);
      cb(room as never);
    } catch (e) {
      cb(null, (e as Error).message);
    }
  });

  // Join room
  socket.on('joinRoom', async (data, cb) => {
    try {
      const db = getDb();
      const code = data.code.toUpperCase();
      const room = await db.collection('rooms').findOne({ code });

      if (!room) { cb(null, '找不到此房間'); return; }
      if (room['status'] !== 'lobby') { cb(null, '遊戲已開始，無法加入'); return; }
      if (room['players'].length >= room['maxPlayers']) { cb(null, '房間已滿（最多 8 人）'); return; }
      if ((room['players'] as { playerId: string }[]).some(p => p.playerId === playerId)) {
        // Already in room - rejoin
        await socket.join(`room:${code}`);
        cb(room as never);
        return;
      }

      const updatedRoom = await db.collection('rooms').findOneAndUpdate(
        { code, status: 'lobby' },
        { $push: { players: { playerId, name: playerName, isReady: false, isHost: false } } as never },
        { returnDocument: 'after' },
      );

      if (!updatedRoom) { cb(null, '加入失敗'); return; }

      await socket.join(`room:${code}`);
      io.to(`room:${code}`).emit('roomUpdated', updatedRoom as never);
      cb(updatedRoom as never);
    } catch (e) {
      cb(null, (e as Error).message);
    }
  });

  // Set ready status
  socket.on('setReady', async (isReady) => {
    try {
      const db = getDb();
      const room = await db.collection('rooms').findOneAndUpdate(
        { 'players.playerId': playerId, status: 'lobby' },
        { $set: { 'players.$.isReady': isReady } as never },
        { returnDocument: 'after' },
      );
      if (room) {
        io.to(`room:${room['code']}`).emit('roomUpdated', room as never);
      }
    } catch (e) {
      socket.emit('error', (e as Error).message);
    }
  });

  // Start game (host only)
  socket.on('startGame', async () => {
    try {
      const db = getDb();
      const room = await db.collection('rooms').findOne({ hostId: playerId, status: 'lobby' });
      if (!room) { socket.emit('error', '你不是房主或房間不存在'); return; }

      const updatedRoom = await db.collection('rooms').findOneAndUpdate(
        { code: room['code'] },
        { $set: { status: 'playing', startedAt: new Date() } as never },
        { returnDocument: 'after' },
      );

      if (updatedRoom) {
        io.to(`room:${room['code']}`).emit('gameStarted', {
          room: updatedRoom as never,
          startTimestamp: Date.now(),
        });
      }
    } catch (e) {
      socket.emit('error', (e as Error).message);
    }
  });

  // Challenge completed notification
  socket.on('challengeCompleted', async (data) => {
    try {
      const db = getDb();
      const room = await db.collection('rooms').findOne({ 'players.playerId': playerId, status: 'playing' });
      if (!room) return;

      io.to(`room:${room['code']}`).emit('playerProgress', {
        playerId,
        completedChallenges: data.score,
      });
    } catch {
      // silent
    }
  });

  // Complete session (multiplayer)
  socket.on('completeSession', async (data) => {
    try {
      const db = getDb();
      const room = await db.collection('rooms').findOne({ 'players.playerId': playerId, status: 'playing' });
      if (!room) return;

      const attempts = await db.collection<{
        isCorrect: boolean;
        serverScore: number;
        hintsUsed: number;
        challengeId: string;
      }>('attempts').find({ sessionId: data.sessionId, playerId }).toArray();

      const totalScore = attempts.reduce((s, a) => s + (a.isCorrect ? a.serverScore : 0), 0);
      const hintsByChallenge = new Map<string, number>();
      for (const attempt of attempts) {
        hintsByChallenge.set(attempt.challengeId, Math.max(hintsByChallenge.get(attempt.challengeId) ?? 0, attempt.hintsUsed));
      }
      const hintsUsed = [...hintsByChallenge.values()].reduce((s, count) => s + count, 0);
      const completedAt = new Date();

      // Update player record in room
      await db.collection('rooms').updateOne(
        { code: room['code'], 'players.playerId': playerId },
        { $set: { 'players.$.completedAt': completedAt, 'players.$.totalScore': totalScore } as never }
      );

      // Check if all players done
      const updatedRoom = await db.collection('rooms').findOne({ code: room['code'] });
      const allDone = (updatedRoom!['players'] as { completedAt?: Date }[]).every(p => p.completedAt);

      if (allDone) {
        await db.collection('rooms').updateOne(
          { code: room['code'] },
          { $set: { status: 'finished', finishedAt: completedAt } as never }
        );

        const entries = await db.collection('leaderboardEntries').find({ roomId: room['_id'].toString() }).toArray();
        io.to(`room:${room['code']}`).emit('gameResult', { entries: entries as never });
      }

      // Store leaderboard entry
      await db.collection('leaderboardEntries').insertOne({
        playerId,
        playerName,
        sessionId: data.sessionId,
        roomId: room['_id'].toString(),
        mode: 'multiplayer',
        totalScore,
        completionMs: completedAt.getTime() - (room['startedAt'] as Date).getTime(),
        hintsUsed,
        completedAt,
      });

    } catch (e) {
      socket.emit('error', (e as Error).message);
    }
  });

  // Leave room
  socket.on('leaveRoom', async () => {
    try {
      const db = getDb();
      const room = await db.collection('rooms').findOne({ 'players.playerId': playerId, status: 'lobby' });
      if (!room) return;

      const isHost = room['hostId'] === playerId;
      const players = (room['players'] as { playerId: string }[]).filter(p => p.playerId !== playerId);

      if (players.length === 0) {
        // Close room
        await db.collection('rooms').deleteOne({ code: room['code'] });
        io.to(`room:${room['code']}`).emit('roomClosed', '所有玩家已離開');
      } else if (isHost) {
        // Transfer host
        const newHostId = players[0]!.playerId;
        await db.collection('rooms').updateOne(
          { code: room['code'] },
          {
            $set: { hostId: newHostId, 'players.$[el].isHost': true } as never,
            $pull: { players: { playerId } } as never,
          },
          { arrayFilters: [{ 'el.playerId': newHostId }] }
        );
        const updatedRoom = await db.collection('rooms').findOne({ code: room['code'] });
        io.to(`room:${room['code']}`).emit('hostChanged', newHostId);
        if (updatedRoom) io.to(`room:${room['code']}`).emit('roomUpdated', updatedRoom as never);
      } else {
        await db.collection('rooms').updateOne(
          { code: room['code'] },
          { $pull: { players: { playerId } } as never }
        );
        const updatedRoom = await db.collection('rooms').findOne({ code: room['code'] });
        if (updatedRoom) io.to(`room:${room['code']}`).emit('roomUpdated', updatedRoom as never);
      }

      await socket.leave(`room:${room['code']}`);
    } catch (e) {
      socket.emit('error', (e as Error).message);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    // Players can reconnect; room state persists in DB
    console.log(`Player ${playerName} (${playerId}) disconnected`);
  });
}
