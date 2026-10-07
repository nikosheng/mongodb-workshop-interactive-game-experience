import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { connectDb } from './db/client.js';
import { getCurrentRound } from './lib/rounds.js';
import { createIndexes } from './db/indexes.js';
import { sessionMiddleware } from './middleware/session.js';
import authRouter from './routes/auth.js';
import sessionsRouter from './routes/sessions.js';
import leaderboardRouter from './routes/leaderboard.js';
import roomsRouter from './routes/rooms.js';
import questionBanksRouter from './routes/questionBanks.js';
import { ensureQualityMemory } from './lib/qualityMemory.js';
import { registerRoomHandlers } from './socket/roomHandlers.js';
import type { ServerToClientEvents, ClientToServerEvents } from '@query-quest/shared';

const app = express();
const httpServer = createServer(app);

const clientOrigin = process.env['CLIENT_ORIGIN'] || 'http://localhost:5173';

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: clientOrigin,
    credentials: true,
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(sessionMiddleware);

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '請求過於頻繁，請稍後再試' },
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: '登入請求過於頻繁，請稍後再試' },
});

// ─── Routes ───────────────────────────────────────────────────────────────
app.post('/api/login', authLimiter);
app.use('/api', authRouter);
app.use('/api', sessionsRouter);
app.use('/api', leaderboardRouter);
app.use('/api', roomsRouter);
app.use('/api/question-banks', questionBanksRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── Socket.IO - share session ────────────────────────────────────────────
type SocketMiddlewareNext = (err?: Error) => void;

io.use((socket, next: SocketMiddlewareNext) => {
  sessionMiddleware(
    socket.request as express.Request,
    {} as express.Response,
    next as express.NextFunction,
  );
});

io.use((socket, next: SocketMiddlewareNext) => {
  const session = (socket.request as express.Request).session;
  if (!session.playerId) {
    next(new Error('Not authenticated'));
    return;
  }
  (socket.data as Record<string, unknown>)['playerId'] = session.playerId;
  (socket.data as Record<string, unknown>)['playerName'] = session.playerName;
  next();
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id} (${(socket.data as { playerName?: string }).playerName ?? 'unknown'})`);
  registerRoomHandlers(io, socket);
});

// ─── Start ────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env['PORT'] || '3001', 10);

async function start() {
  try {
    const db = await connectDb();
    await createIndexes(db);
    await getCurrentRound();
    try {
      await ensureQualityMemory();
      console.log('Mastra global quality memory initialized');
    } catch (err) {
      console.warn('Mastra global quality memory initialization skipped:', err);
    }
    httpServer.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
