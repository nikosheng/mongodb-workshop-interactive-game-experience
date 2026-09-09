import session from 'express-session';

declare module 'express-session' {
  interface SessionData {
    playerId: string;
    playerName: string;
    sessionToken: string;
  }
}

export const sessionMiddleware = session({
  secret: process.env['SESSION_SECRET'] ?? 'fallback-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});
