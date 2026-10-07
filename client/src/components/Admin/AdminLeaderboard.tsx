import { useEffect, useState } from 'react';
import { apiAdminGet } from '../../hooks/useApi';
import styles from './AdminLeaderboard.module.css';

interface Entry { playerName: string; totalScore: number; completionMs: number; hintsUsed: number; mode: string; workshopType?: string; completedAt: string; }
interface Props { secret: string; refreshKey: number; }

function formatTime(ms: number) { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }

export function AdminLeaderboard({ secret, refreshKey }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [mode, setMode] = useState<'all' | 'solo' | 'multiplayer'>('all');
  const [workshopType, setWorkshopType] = useState<'all' | 'crud' | 'schema-design'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (mode !== 'all') params.set('mode', mode);
      if (workshopType !== 'all') params.set('workshopType', workshopType);
      const query = params.toString() ? `?${params.toString()}` : '';
      const result = await apiAdminGet<{ entries: Entry[] }>(`/api/question-banks/admin/leaderboard${query}`, secret);
      setEntries(result.entries);
    }
    catch (err) { setError(err instanceof Error ? err.message : '無法讀取排行榜'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [secret, refreshKey, mode, workshopType]);
  return (
    <section className={`card ${styles.panel}`} aria-labelledby="admin-leaderboard-title">
      <div className={styles.heading}><div><p className={styles.eyebrow}>Current round</p><h2 id="admin-leaderboard-title">當前輪次總得分榜</h2><p>每位玩家只顯示最佳成績，重置新一輪後會清空。</p></div><button className="btn btn-ghost" onClick={() => void load()} disabled={loading}>刷新</button></div>
      <div className={styles.tabs}>{(['all', 'crud', 'schema-design'] as const).map((item) => <button key={item} className={`${styles.tab} ${workshopType === item ? styles.active : ''}`} onClick={() => setWorkshopType(item)}>{item === 'all' ? '全部工作坊' : item === 'crud' ? 'CRUD' : 'Schema Design'}</button>)}</div>
      <div className={styles.tabs}>{(['all', 'solo', 'multiplayer'] as const).map((item) => <button key={item} className={`${styles.tab} ${mode === item ? styles.active : ''}`} onClick={() => setMode(item)}>{item === 'all' ? '全部模式' : item === 'solo' ? '單人' : '多人'}</button>)}</div>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? <p className={styles.empty}>載入中...</p> : entries.length === 0 ? <p className={styles.empty}>尚無排行記錄。</p> : <div className={styles.table}><div className={styles.rowHead}><span>#</span><span>玩家</span><span>分數</span><span>時間</span></div>{entries.map((entry, index) => <div className={styles.row} key={`${entry.playerName}-${entry.completedAt}`}><strong>{index + 1}</strong><strong>{entry.playerName}</strong><strong className={styles.score}>{entry.totalScore}</strong><span>{formatTime(entry.completionMs)}</span></div>)}</div>}
    </section>
  );
}
