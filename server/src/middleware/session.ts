import session from 'express-session';
import MongoStore from 'connect-mongo';

declare module 'express-session' {
  interface SessionData {
    playerId: string;
    playerName: string;
    sessionToken: string;
    roundId: string;
  }
}

export const sessionMiddleware = session({
  secret: process.env['SESSION_SECRET'] ?? 'fallback-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: process.env['MONGODB_URI']
    ? MongoStore.create({
      mongoUrl: process.env['MONGODB_URI'],
      dbName: process.env['MONGODB_SESSION_DB_NAME'] || undefined,
      collectionName: 'expressSessions',
      ttl: 7 * 24 * 60 * 60,
    })
    : undefined,
  cookie: {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});
