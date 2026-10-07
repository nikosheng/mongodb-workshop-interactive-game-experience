import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getDb } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import { validateAnswer, calculateScore } from '@query-quest/shared';
import { challenges } from '../lib/challengeData.js';
import { schemaDesignChallenges } from '../lib/schemaDesignChallengeData.js';
import type { Challenge, SlotAssignment, WorkshopType } from '@query-quest/shared';

const router = Router();

function defaultChallengesFor(workshopType: WorkshopType): Challenge[] {
  return workshopType === 'schema-design' ? schemaDesignChallenges : challenges;
}

// Create a solo game session
const createSessionSchema = z.object({
  mode: z.enum(['solo', 'multiplayer']).default('solo'),
  workshopType: z.enum(['crud', 'schema-design']).default('crud'),
  roomId: z.string().optional(),
});

router.post('/sessions', requireAuth, async (req: Request, res: Response) => {
  const db = getDb();
  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: '遊戲 session 參數有誤' });
    return;
  }
  const playerId = req.session.playerId!;
  const workshopType = parsed.data.workshopType;
  const activeBank = await db.collection<{ _id: ObjectId; challenges: unknown[] }>('questionBanks').findOne(
    { isActive: true, status: 'ready', workshopType },
    { projection: { _id: 1, challenges: 1 } },
  );

  const session = await db.collection('gameSessions').insertOne({
    playerId,
    mode: parsed.data.mode,
    workshopType,
    ...(parsed.data.roomId ? { roomId: parsed.data.roomId } : {}),
    challengeVersion: '1.0',
    challengeBankId: activeBank?._id.toString() ?? 'default',
    totalChallenges: activeBank?.challenges.length ?? defaultChallengesFor(workshopType).length,
    startedAt: new Date(),
    status: 'active',
  });

  res.json({ sessionId: session.insertedId.toString() });
});

// Submit an attempt for a challenge
const submitSchema = z.object({
  sessionId: z.string(),
  challengeId: z.string(),
  slotAssignments: z.record(z.string(), z.string()),
  timeTakenMs: z.number().int().min(0),
  attemptCount: z.number().int().min(1),
  hintsUsed: z.number().int().min(0),
});

router.post('/sessions/attempt', requireAuth, async (req: Request, res: Response) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? '輸入格式有誤' });
    return;
  }

  const { sessionId, challengeId, slotAssignments, timeTakenMs, attemptCount, hintsUsed } = parsed.data;
  const playerId = req.session.playerId!;
  const db = getDb();

  // Verify session belongs to this player
  let sessionDoc: { _id: ObjectId; playerId: string; challengeBankId?: string; workshopType?: WorkshopType } | null = null;
  try {
    sessionDoc = await db.collection<{ _id: ObjectId; playerId: string; challengeBankId?: string; workshopType?: WorkshopType }>('gameSessions').findOne({ _id: new ObjectId(sessionId) });
  } catch {
    res.status(400).json({ error: 'Invalid session ID' });
    return;
  }
  
  if (!sessionDoc || sessionDoc.playerId !== playerId) {
    res.status(403).json({ error: 'Session does not belong to you' });
    return;
  }

  let challenge: Challenge | undefined;
  if (sessionDoc.challengeBankId && sessionDoc.challengeBankId !== 'default' && ObjectId.isValid(sessionDoc.challengeBankId)) {
    const bank = await db.collection<{ challenges: Challenge[] }>('questionBanks').findOne(
      { _id: new ObjectId(sessionDoc.challengeBankId) },
      { projection: { challenges: 1 } },
    );
    challenge = bank?.challenges.find((item) => item.id === challengeId);
  } else {
    challenge = defaultChallengesFor(sessionDoc.workshopType ?? 'crud').find((item) => item.id === challengeId);
  }
  if (!challenge) {
    res.status(404).json({ error: 'Challenge not found' });
    return;
  }

  // Rebuild slot assignments from puzzle IDs
  const assignments: SlotAssignment[] = Object.entries(slotAssignments).map(([slotId, puzzleId]) => {
    const puzzle = challenge.puzzles.find(p => p.id === puzzleId);
    if (!puzzle) throw new Error(`Puzzle ${puzzleId} not found`);
    return { slotId, puzzle };
  });

  const validationResult = validateAnswer(challenge, assignments);
  const previousAttempts = await db.collection('attempts').countDocuments({ sessionId, challengeId });
  const effectiveAttemptCount = previousAttempts + 1;
  const serverScore = validationResult.isCorrect
    ? calculateScore(effectiveAttemptCount, hintsUsed)
    : 0;

  // Store attempt
  await db.collection('attempts').insertOne({
    sessionId,
    playerId,
    challengeId,
    isCorrect: validationResult.isCorrect,
    timeTakenMs,
    attemptCount: effectiveAttemptCount,
    hintsUsed,
    serverScore,
    createdAt: new Date(),
  });

  res.json({
    isCorrect: validationResult.isCorrect,
    serverScore,
    feedback: {
      slotErrors: validationResult.slotErrors,
      structureErrors: validationResult.structureErrors,
      semanticErrors: validationResult.semanticErrors,
      explanation: validationResult.explanation,
    },
  });
});

// Complete a session and optionally submit to leaderboard
const completeSchema = z.object({
  sessionId: z.string(),
  submitToLeaderboard: z.boolean(),
});

router.post('/sessions/complete', requireAuth, async (req: Request, res: Response) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: '輸入格式有誤' });
    return;
  }

  const { sessionId, submitToLeaderboard } = parsed.data;
  const playerId = req.session.playerId!;
  const playerName = req.session.playerName!;
  const db = getDb();

  // Verify session
  let sessionDoc: { _id: ObjectId; playerId: string; startedAt: Date; totalChallenges?: number; mode?: 'solo' | 'multiplayer'; roomId?: string; workshopType?: WorkshopType } | null = null;
  try {
    sessionDoc = await db.collection<{ _id: ObjectId; playerId: string; startedAt: Date; totalChallenges?: number; mode?: 'solo' | 'multiplayer'; roomId?: string; workshopType?: WorkshopType }>('gameSessions').findOne({ _id: new ObjectId(sessionId) });
  } catch {
    res.status(400).json({ error: 'Invalid session ID' });
    return;
  }
  
  if (!sessionDoc || sessionDoc.playerId !== playerId) {
    res.status(403).json({ error: 'Session does not belong to you' });
    return;
  }

  const completedAt = new Date();
  const completionMs = completedAt.getTime() - sessionDoc.startedAt.getTime();

  // Aggregate server-calculated scores
  const attempts = await db.collection<{
    isCorrect: boolean;
    serverScore: number;
    hintsUsed: number;
    challengeId: string;
  }>('attempts').find({ sessionId, playerId }).toArray();

  if (attempts.length === 0 || !attempts.some((attempt) => attempt.isCorrect)) {
    res.status(409).json({ error: '尚未有成功驗證的作答紀錄，無法提交排行榜' });
    return;
  }
  
  const totalScore = attempts.reduce((s, a) => s + (a.isCorrect ? a.serverScore : 0), 0);
  const hintsByChallenge = new Map<string, number>();
  for (const attempt of attempts) {
    hintsByChallenge.set(attempt.challengeId, Math.max(hintsByChallenge.get(attempt.challengeId) ?? 0, attempt.hintsUsed));
  }
  const hintsUsed = [...hintsByChallenge.values()].reduce((sum, count) => sum + count, 0);
  await db.collection('gameSessions').updateOne(
    { _id: new ObjectId(sessionId) },
    { $set: { status: 'completed', completedAt } }
  );

  if (submitToLeaderboard) {
    const workshopType = sessionDoc.workshopType ?? 'crud';
    await db.collection('leaderboardEntries').insertOne({
        playerId,
        playerName,
        sessionId,
        mode: sessionDoc.mode ?? 'solo',
        workshopType,
        ...(sessionDoc.roomId ? { roomId: sessionDoc.roomId } : {}),
      totalScore,
      completionMs,
      hintsUsed,
        totalChallenges: sessionDoc.totalChallenges ?? defaultChallengesFor(workshopType).length,
      completedAt,
    });
  }

  res.json({ totalScore, completionMs, hintsUsed });
});

export default router;
