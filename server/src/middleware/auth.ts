import { Request, Response, NextFunction } from 'express';
import { getCurrentRound } from '../lib/rounds.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.playerId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const round = await getCurrentRound();
  if (req.session.roundId !== round.roundId) {
    req.session.destroy(() => undefined);
    res.status(401).json({ error: '遊戲輪次已重置，請重新登入' });
    return;
  }
  next();
}
