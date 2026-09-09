import { useState, useEffect } from 'react';
import { apiGet } from '../../hooks/useApi';
import styles from './LeaderboardPage.module.css';

interface LeaderboardEntry {
  playerName: string;
  totalScore: number;
  completionMs: number;
  mode: string;
  completedAt: string;
}

interface Props {
  roomCode?: string;
  onBack: () => void;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export function LeaderboardPage({ roomCode, onBack }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'solo' | 'multi'>(roomCode ? 'multi' : 'solo');

  useEffect(() => {
    const path = roomCode
      ? `/api/leaderboard/room/${roomCode}`
      : `/api/leaderboard?mode=${tab}&limit=20`;

    apiGet<{ entries: LeaderboardEntry[] }>(path)
      .then(r => { setEntries(r.entries); setLoading(false); })
      .catch(e => { setError((e as Error).message); setLoading(false); });
  }, [tab, roomCode]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className="btn btn-ghost" onClick={onBack}>← 返回</button>
        <h2>排行榜</h2>
      </header>

      {!roomCode && (
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'solo' ? styles.active : ''}`}
            onClick={() => setTab('solo')}
          >
            單人模式
          </button>
          <button
            className={`${styles.tab} ${tab === 'multi' ? styles.active : ''}`}
            onClick={() => setTab('multi')}
          >
            多人模式
          </button>
        </div>
      )}

      <main className={styles.main}>
        {loading && <p className={styles.loading}>載入中...</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}

        {!loading && !error && (
          entries.length === 0
            ? <p className={styles.empty}>尚無排行記錄</p>
            : (
              <div className={styles.table}>
                <div className={styles.tableHead}>
                  <span className={styles.rank}>#</span>
                  <span>玩家</span>
                  <span className={styles.numCol}>分數</span>
                  <span className={styles.numCol}>完成時間</span>
                </div>
                {entries.map((e, i) => (
                  <div key={i} className={`${styles.tableRow} ${i === 0 ? styles.first : ''}`}>
                    <span className={styles.rank}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </span>
                    <span className={styles.playerName}>{e.playerName}</span>
                    <span className={`${styles.numCol} ${styles.score}`}>{e.totalScore}</span>
                    <span className={styles.numCol}>{formatTime(e.completionMs)}</span>
                  </div>
                ))}
              </div>
            )
        )}
      </main>
    </div>
  );
}
