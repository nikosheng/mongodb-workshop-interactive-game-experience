import { Db } from 'mongodb';

export async function createIndexes(db: Db): Promise<void> {
  // players
  await db.collection('players').createIndexes([
    { key: { sessionToken: 1 }, unique: true },
    { key: { name: 1 } },
  ]);

  // rooms
  await db.collection('rooms').createIndexes([
    { key: { code: 1 }, unique: true },
    { key: { status: 1 } },
    { key: { createdAt: 1 }, expireAfterSeconds: 86400 }, // TTL 24h
  ]);

  // gameSessions
  await db.collection('gameSessions').createIndexes([
    { key: { playerId: 1 } },
    { key: { roomId: 1 } },
    { key: { status: 1 } },
  ]);

  // attempts
  await db.collection('attempts').createIndexes([
    { key: { sessionId: 1, challengeId: 1 } },
    { key: { playerId: 1 } },
  ]);

  // leaderboardEntries
  await db.collection('leaderboardEntries').createIndexes([
    { key: { mode: 1, totalScore: -1, completionMs: 1, hintsUsed: 1 } },
    { key: { playerId: 1 } },
    { key: { roomId: 1 } },
  ]);

  // questionBanks
  await db.collection('questionBanks').createIndexes([
    { key: { createdAt: -1 } },
    { key: { isActive: 1 } },
  ]);

  await db.collection('qualityRuleSuggestions').createIndexes([
    { key: { status: 1, createdAt: -1 } },
    { key: { rule: 1 }, unique: true },
  ]);

  console.log('MongoDB indexes created');
}
