import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/client.js';
import { getCurrentRound } from '../lib/rounds.js';

const router = Router();

const loginSchema = z.object({
  name: z
    .string()
    .min(2, '名字至少需要 2 個字元')
    .max(30, '名字最多 30 個字元')
    .regex(/^[^\x00-\x1f\x7f\s].*[^\x00-\x1f\x7f]$|^[^\x00-\x1f\x7f\s]{2,}$/, '名字不能包含控制字元'),
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? '輸入格式有誤' });
    return;
  }

  const name = parsed.data.name.trim();
  const sessionToken = uuidv4();
  const db = getDb();
  const round = await getCurrentRound();

  const result = await db.collection('players').insertOne({
    name,
    sessionToken,
    createdAt: new Date(),
  });

  req.session.playerId = result.insertedId.toString();
  req.session.playerName = name;
  req.session.sessionToken = sessionToken;
  req.session.roundId = round.roundId;

  res.json({ playerId: result.insertedId.toString(), name });
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to logout' });
      return;
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req: Request, res: Response) => {
  if (!req.session.playerId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({ playerId: req.session.playerId, name: req.session.playerName });
});

export default router;
