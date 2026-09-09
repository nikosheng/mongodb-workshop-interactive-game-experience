import { useState, useEffect } from 'react';
import type { AuthUser } from '../../App';
import type { Room } from '@query-quest/shared';
import { getSocket, connectSocket, useSocketEvent } from '../../hooks/useSocket';
import styles from './LobbyPage.module.css';

interface Props {
  user: AuthUser;
  roomCode?: string;
  onGameStart: (code: string) => void;
  onBack: () => void;
}

export function LobbyPage({ user, roomCode: initialCode, onGameStart, onBack }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [joinCode, setJoinCode] = useState(initialCode || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'choose' | 'lobby'>(initialCode ? 'lobby' : 'choose');

  useEffect(() => {
    connectSocket();
    const socket = getSocket();

    if (initialCode) {
      socket.emit('joinRoom', { code: initialCode }, (r, err) => {
        if (err || !r) { setError(err || '加入失敗'); setMode('choose'); }
        else setRoom(r as Room);
      });
    }

    return () => {
      // Don't disconnect on unmount if game started
    };
  }, [initialCode]);

  useSocketEvent('roomUpdated', (r: Room) => setRoom(r));
  useSocketEvent('gameStarted', ({ room: r }) => {
    setRoom(r as Room);
    onGameStart((r as Room).code);
  });
  useSocketEvent('roomClosed', (reason: string) => {
    setError(`房間已關閉：${reason}`);
    setMode('choose');
    setRoom(null);
  });
  useSocketEvent('hostChanged', (newHostId: string) => {
    setRoom(prev => prev ? { ...prev, hostId: newHostId } : prev);
  });

  const handleCreate = () => {
    setLoading(true);
    setError('');
    const socket = getSocket();
    socket.emit('createRoom', {}, (r, err) => {
      setLoading(false);
      if (err || !r) { setError(err || '建立失敗'); return; }
      setRoom(r as Room);
      setMode('lobby');
    });
  };

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setError('房間碼需為 6 個字元'); return; }
    setLoading(true);
    setError('');
    const socket = getSocket();
    socket.emit('joinRoom', { code }, (r, err) => {
      setLoading(false);
      if (err || !r) { setError(err || '加入失敗'); return; }
      setRoom(r as Room);
      setMode('lobby');
    });
  };

  const handleReady = () => {
    const socket = getSocket();
    const myPlayer = room?.players.find(p => p.playerId === user.playerId);
    socket.emit('setReady', !myPlayer?.isReady);
  };

  const handleStart = () => {
    const socket = getSocket();
    socket.emit('startGame');
  };

  const handleLeave = () => {
    const socket = getSocket();
    socket.emit('leaveRoom');
    setRoom(null);
    setMode('choose');
    onBack();
  };

  if (mode === 'choose') {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <button className="btn btn-ghost" onClick={onBack}>← 返回</button>
          <h2>多人大廳</h2>
        </header>
        <main className={styles.main}>
          <div className={styles.options}>
            <div className="card" style={{ textAlign: 'center', gap: '16px', display: 'flex', flexDirection: 'column' }}>
              <h3>建立新房間</h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                你將成為房主，可設定題庫並開始遊戲
              </p>
              <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
                {loading ? '建立中...' : '建立房間'}
              </button>
            </div>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3>加入房間</h3>
              <input
                className={styles.codeInput}
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="輸入 6 字元房間碼"
                maxLength={6}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
              />
              <button className="btn btn-secondary" onClick={handleJoin} disabled={loading || joinCode.length < 6}>
                加入房間
              </button>
            </div>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </main>
      </div>
    );
  }

  if (!room) return <div className={styles.page}><p>載入中...</p></div>;

  const isHost = room.hostId === user.playerId;
  const myPlayer = room.players.find(p => p.playerId === user.playerId);
  const allReady = room.players.every(p => p.isReady || p.isHost);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className="btn btn-ghost" onClick={handleLeave}>← 離開</button>
        <h2>房間：<code className={styles.roomCode}>{room.code}</code></h2>
        {isHost && <span className={styles.hostBadge}>房主</span>}
      </header>

      <main className={styles.lobbyMain}>
        <div className="card" style={{ flex: 1 }}>
          <h3 style={{ marginBottom: '16px' }}>玩家列表 ({room.players.length}/{room.maxPlayers})</h3>
          <ul className={styles.playerList}>
            {room.players.map(p => (
              <li key={p.playerId} className={styles.playerItem}>
                <span className={styles.playerName}>
                  {p.name}
                  {p.isHost && <span className={styles.hostTag}> 👑</span>}
                </span>
                <span className={p.isReady || p.isHost ? styles.ready : styles.notReady}>
                  {p.isHost ? '房主' : p.isReady ? '準備好了' : '未準備'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.controls}>
          {!isHost && (
            <button
              className={`btn ${myPlayer?.isReady ? 'btn-ghost' : 'btn-primary'}`}
              onClick={handleReady}
            >
              {myPlayer?.isReady ? '取消準備' : '我準備好了'}
            </button>
          )}
          {isHost && (
            <button
              className="btn btn-primary"
              onClick={handleStart}
              disabled={!allReady || room.players.length < 2}
              title={room.players.length < 2 ? '至少需要 2 位玩家' : !allReady ? '等待所有玩家準備' : ''}
            >
              開始遊戲
            </button>
          )}
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
            {isHost
              ? `等待所有玩家準備（${room.players.filter(p => p.isReady || p.isHost).length}/${room.players.length}）`
              : '等待房主開始遊戲'}
          </p>
        </div>
      </main>
    </div>
  );
}
