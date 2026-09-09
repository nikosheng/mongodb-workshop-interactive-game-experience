import { Router, Request, Response } from 'express';
import { getDb } from '../db/client.js';

const router = Router();

router.get('/leaderboard', async (req: Request, res: Response) => {
  const db = getDb();
  const mode = (req.query['mode'] as string) || 'solo';
  const limit = Math.min(parseInt(req.query['limit'] as string || '20', 10), 100);

  const entries = await db
    .collection('leaderboardEntries')
    .find({ mode })
    .sort({ totalScore: -1, completionMs: 1, hintsUsed: 1 })
    .limit(limit)
    .project({ _id: 0, playerId: 0 })
    .toArray();

  res.json({ entries });
});

router.get('/leaderboard/room/:roomId', async (req: Request, res: Response) => {
  const db = getDb();
  const { roomId } = req.params;

  const entries = await db
    .collection('leaderboardEntries')
    .find({ roomId })
    .sort({ totalScore: -1, completionMs: 1, hintsUsed: 1 })
    .project({ _id: 0, playerId: 0 })
    .toArray();

  res.json({ entries });
});

export default router;
