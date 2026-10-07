import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

router.post('/rooms', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({ challengeSetId: z.string().optional(), workshopType: z.enum(['crud', 'schema-design']).default('crud') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: '輸入格式有誤' });
    return;
  }

  const db = getDb();
  const playerId = req.session.playerId!;
  const playerName = req.session.playerName!;

  let code = generateRoomCode();
  // Ensure unique code
  for (let i = 0; i < 5; i++) {
    const exists = await db.collection('rooms').findOne({ code });
    if (!exists) break;
    code = generateRoomCode();
  }

  const room = {
    code,
    hostId: playerId,
    status: 'lobby',
    players: [{ playerId, name: playerName, isReady: false, isHost: true }],
    maxPlayers: 50,
    challengeSetId: parsed.data.challengeSetId || 'default',
    workshopType: parsed.data.workshopType,
    createdAt: new Date(),
  };

  await db.collection('rooms').insertOne(room);
  res.json(room);
});

router.get('/rooms/:code', requireAuth, async (req: Request, res: Response) => {
  const db = getDb();
  const room = await db.collection('rooms').findOne({ code: req.params['code']!.toUpperCase() });
  if (!room) {
    res.status(404).json({ error: '找不到此房間' });
    return;
  }
  res.json(room);
});

export default router;
