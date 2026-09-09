import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';

interface RoundDocument { _id: 'current'; roundId: string; startedAt: Date; }

export async function getCurrentRound(): Promise<RoundDocument> {
  const db = getDb();
  const existing = await db.collection<RoundDocument>('gameRounds').findOne({ _id: 'current' });
  if (existing) return existing;
  const round: RoundDocument = { _id: 'current', roundId: randomUUID(), startedAt: new Date() };
  await db.collection<RoundDocument>('gameRounds').updateOne({ _id: 'current' }, { $setOnInsert: round }, { upsert: true });
  return (await db.collection<RoundDocument>('gameRounds').findOne({ _id: 'current' }))!;
}

export async function resetCurrentRound(): Promise<RoundDocument> {
  const db = getDb();
  const round: RoundDocument = { _id: 'current', roundId: randomUUID(), startedAt: new Date() };
  await Promise.all([
    db.collection('players').deleteMany({}),
    db.collection('gameSessions').deleteMany({}),
    db.collection('attempts').deleteMany({}),
    db.collection('leaderboardEntries').deleteMany({}),
    db.collection('rooms').deleteMany({}),
  ]);
  await db.collection<RoundDocument>('gameRounds').replaceOne({ _id: 'current' }, round, { upsert: true });
  return round;
}
