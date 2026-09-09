import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getDb } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import { validateAnswer, calculateScore } from '@query-quest/shared';
import { challenges } from '../lib/challengeData.js';
import type { Challenge, SlotAssignment } from '@query-quest/shared';

const router = Router();

// Create a solo game session
router.post('/sessions', requireAuth, async (req: Request, res: Response) => {
  const db = getDb();
  const playerId = req.session.playerId!;
  const activeBank = await db.collection<{ _id: ObjectId }>('questionBanks').findOne(
    { isActive: true, status: 'ready' },
    { projection: { _id: 1 } },
  );

  const session = await db.collection('gameSessions').insertOne({
    playerId,
    mode: 'solo',
    challengeVersion: '1.0',
    challengeBankId: activeBank?._id.toString() ?? 'default',
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
  let sessionDoc: { _id: ObjectId; playerId: string; challengeBankId?: string } | null = null;
  try {
    sessionDoc = await db.collection<{ _id: ObjectId; playerId: string; challengeBankId?: string }>('gameSessions').findOne({ _id: new ObjectId(sessionId) });
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
    challenge = challenges.find((item) => item.id === challengeId);
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
  const serverScore = validationResult.isCorrect
    ? calculateScore(attemptCount, hintsUsed)
    : 0;

  // Store attempt
  await db.collection('attempts').insertOne({
    sessionId,
    playerId,
    challengeId,
    isCorrect: validationResult.isCorrect,
    timeTakenMs,
    attemptCount,
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
  let sessionDoc: { _id: ObjectId; playerId: string; startedAt: Date } | null = null;
  try {
    sessionDoc = await db.collection<{ _id: ObjectId; playerId: string; startedAt: Date }>('gameSessions').findOne({ _id: new ObjectId(sessionId) });
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
  
  const totalScore = attempts.reduce((s, a) => s + (a.isCorrect ? a.serverScore : 0), 0);
  const hintsUsed = attempts.reduce((s, a) => s + a.hintsUsed, 0);
  const correctCount = attempts.filter(a => a.isCorrect).length;

  await db.collection('gameSessions').updateOne(
    { _id: new ObjectId(sessionId) },
    { $set: { status: 'completed', completedAt } }
  );

  if (submitToLeaderboard) {
    await db.collection('leaderboardEntries').insertOne({
      playerId,
      playerName,
      sessionId,
      mode: 'solo',
      totalScore,
      completionMs,
      hintsUsed,
      correctCount,
      totalChallenges: challenges.length,
      completedAt,
    });
  }

  res.json({ totalScore, completionMs, hintsUsed, correctCount });
});

export default router;
