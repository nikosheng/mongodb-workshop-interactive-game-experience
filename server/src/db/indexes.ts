import { Db } from 'mongodb';

export async function createIndexes(db: Db): Promise<void> {
  // Backfill workshopType on legacy documents created before the Schema Design
  // workshop existed, so they are treated as 'crud' by workshopType-aware queries.
  await db.collection('questionBanks').updateMany(
    { workshopType: { $exists: false } },
    { $set: { workshopType: 'crud' } },
  );
  await db.collection('gameSessions').updateMany(
    { workshopType: { $exists: false } },
    { $set: { workshopType: 'crud' } },
  );
  await db.collection('leaderboardEntries').updateMany(
    { workshopType: { $exists: false } },
    { $set: { workshopType: 'crud' } },
  );
  await db.collection('rooms').updateMany(
    { workshopType: { $exists: false } },
    { $set: { workshopType: 'crud' } },
  );
  await db.collection('qualityRuleSuggestions').updateMany(
    { workshopType: { $exists: false } },
    { $set: { workshopType: 'crud' } },
  );

  // players
  await db.collection('players').createIndexes([
    { key: { sessionToken: 1 }, unique: true },
    { key: { name: 1 } },
  ]);
  await db.collection('gameRounds').createIndexes([
    { key: { roundId: 1 }, unique: true },
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
    { key: { workshopType: 1, totalScore: -1, completionMs: 1, hintsUsed: 1 } },
    { key: { playerId: 1 } },
    { key: { roomId: 1 } },
  ]);

  // questionBanks
  await db.collection('questionBanks').createIndexes([
    { key: { createdAt: -1 } },
    { key: { isActive: 1 } },
    { key: { workshopType: 1, isActive: 1 } },
  ]);

  await db.collection('qualityRuleSuggestions').createIndexes([
    { key: { status: 1, createdAt: -1 } },
    { key: { rule: 1 }, unique: true },
    { key: { workshopType: 1, status: 1 } },
  ]);

  console.log('MongoDB indexes created');
}
