import { useState } from 'react';
import { apiAdminPost } from '../../hooks/useApi';
import styles from './RoundResetControl.module.css';

interface Props { secret: string; onReset: () => void; }

export function RoundResetControl({ secret, onReset }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const reset = async () => {
    if (!window.confirm('確定開始新一輪嗎？這會永久清除所有玩家、遊戲紀錄、作答紀錄、排行榜與房間，但不會刪除題庫。')) return;
    setBusy(true); setMessage('');
    try {
      await apiAdminPost('/api/question-banks/admin/reset-round', {}, secret);
      setMessage('新一輪已開始，所有玩家需要重新登入。');
      onReset();
    } catch (error) { setMessage(error instanceof Error ? error.message : '重置失敗'); }
    finally { setBusy(false); }
  };
  return (
    <section className={`card ${styles.panel}`} aria-labelledby="round-reset-title">
      <div><p className={styles.eyebrow}>Round management</p><h2 id="round-reset-title">新一輪管理</h2><p>清除玩家、遊戲紀錄、作答紀錄、排行榜與房間；題庫、審核資料與 Mastra Memory 不會被刪除。</p></div>
      <button className="btn btn-danger" onClick={() => void reset()} disabled={busy}>{busy ? '重置中...' : '開始新一輪並重置資料'}</button>
      {message && <p className={styles.message} role="status">{message}</p>}
    </section>
  );
}
