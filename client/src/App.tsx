import { useState, useEffect } from 'react';
import type { WorkshopType } from '@query-quest/shared';
import { LoginPage } from './components/Login/LoginPage';
import { ModeSelectPage } from './components/ModeSelect/ModeSelectPage';
import { GamePage } from './components/Game/GamePage';
import { LobbyPage } from './components/Lobby/LobbyPage';
import { LeaderboardPage } from './components/Leaderboard/LeaderboardPage';
import { AdminPage } from './components/Admin/AdminPage';
import { apiGet } from './hooks/useApi';

export type AppRoute =
  | { page: 'login' }
  | { page: 'mode-select' }
  | { page: 'game'; mode: 'solo'; workshopType: WorkshopType }
  | { page: 'lobby'; roomCode?: string; workshopType: WorkshopType }
  | { page: 'multiplayer-game'; roomCode: string; workshopType: WorkshopType }
  | { page: 'leaderboard'; roomCode?: string }
  | { page: 'admin' };

export interface AuthUser {
  playerId: string;
  name: string;
}

function isAdminPath() {
  return window.location.pathname.replace(/\/$/, '') === '/admin';
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [route, setRoute] = useState<AppRoute>(() => (
    isAdminPath()
      ? { page: 'admin' }
      : { page: 'login' }
  ));
  const [loading, setLoading] = useState(() => !isAdminPath());

  useEffect(() => {
    if (isAdminPath()) return;

    // Check if already logged in
    apiGet<AuthUser>('/api/me')
      .then(u => {
        setUser(u);
        setRoute({ page: 'mode-select' });
      })
      .catch(() => {
        setRoute({ page: 'login' });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-text-secondary)' }}>
        載入中...
      </div>
    );
  }

  const handleLogin = (u: AuthUser) => {
    setUser(u);
    setRoute({ page: 'mode-select' });
  };

  const handleLogout = () => {
    setUser(null);
    setRoute({ page: 'login' });
  };

  const navigate = (r: AppRoute) => setRoute(r);

  if (!user && route.page !== 'login' && route.page !== 'admin') {
    return <LoginPage onLogin={handleLogin} />;
  }

  switch (route.page) {
    case 'login':
      return <LoginPage onLogin={handleLogin} />;

    case 'mode-select':
      return (
        <ModeSelectPage
          user={user!}
          onSelectSolo={(workshopType) => navigate({ page: 'game', mode: 'solo', workshopType })}
          onSelectMultiplayer={(workshopType) => navigate({ page: 'lobby', workshopType })}
          onLogout={handleLogout}
        />
      );

    case 'game':
      return (
        <GamePage
          user={user!}
          mode="solo"
          workshopType={(route as { workshopType: WorkshopType }).workshopType}
          onFinish={() => navigate({ page: 'leaderboard' })}
          onBack={() => navigate({ page: 'mode-select' })}
        />
      );

    case 'lobby':
      return (
        <LobbyPage
          user={user!}
          roomCode={(route as { roomCode?: string }).roomCode}
          workshopType={(route as { workshopType: WorkshopType }).workshopType}
          onGameStart={(code, workshopType) => navigate({ page: 'multiplayer-game', roomCode: code, workshopType })}
          onBack={() => navigate({ page: 'mode-select' })}
        />
      );

    case 'multiplayer-game':
      return (
        <GamePage
          user={user!}
          mode="multiplayer"
          workshopType={(route as { workshopType: WorkshopType }).workshopType}
          roomCode={(route as { roomCode: string }).roomCode}
          onFinish={() => navigate({ page: 'leaderboard', roomCode: (route as { roomCode: string }).roomCode })}
          onBack={() => navigate({ page: 'mode-select' })}
        />
      );

    case 'leaderboard':
      return (
        <LeaderboardPage
          roomCode={(route as { roomCode?: string }).roomCode}
          onBack={() => navigate({ page: 'mode-select' })}
        />
      );

    case 'admin':
      return (
        <AdminPage
          onBack={() => {
            window.history.pushState(null, '', '/');
            navigate(user ? { page: 'mode-select' } : { page: 'login' });
          }}
        />
      );

    default:
      return <LoginPage onLogin={handleLogin} />;
  }
}
