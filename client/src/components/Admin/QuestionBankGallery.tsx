import { useEffect, useState } from 'react';
import type { QuestionBank } from '@query-quest/shared';
import { apiAdminDelete, apiAdminGet, apiAdminPost } from '../../hooks/useApi';
import styles from './QuestionBankGallery.module.css';

interface Props {
  secret: string;
  refreshKey: number;
  onReview: (bankId: string) => void;
}

export function QuestionBankGallery({ secret, refreshKey, onReview }: Props) {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadBanks = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiAdminGet<{ banks: QuestionBank[] }>('/api/question-banks', secret);
      setBanks(result.banks);
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法讀取題庫');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadBanks(); }, [refreshKey, secret]);

  const activate = async (id: string) => {
    setUpdatingId(id);
    try {
      await apiAdminPost(`/api/question-banks/${id}/activate`, {}, secret);
      await loadBanks();
    } catch (err) {
      setError(err instanceof Error ? err.message : '啟用題庫失敗');
    } finally {
      setUpdatingId(null);
    }
  };

  const remove = async (bank: QuestionBank) => {
    if (!window.confirm(`確定要刪除「${bank.name}」嗎？`)) return;
    setUpdatingId(bank._id);
    try {
      await apiAdminDelete(`/api/question-banks/${bank._id}`, secret);
      await loadBanks();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除題庫失敗');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className={`card ${styles.panel}`} aria-labelledby="gallery-title">
      <div className={styles.heading}>
        <div><h2 id="gallery-title">題庫 Gallery</h2><p>啟用的題庫會在玩家開始新遊戲時載入。</p></div>
        <button className="btn btn-ghost" onClick={() => void loadBanks()} disabled={loading}>刷新</button>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading ? <p className={styles.empty}>載入題庫中...</p> : banks.length === 0 ? <p className={styles.empty}>尚未生成任何題庫。</p> : (
        <div className={styles.grid}>
          {banks.map((bank) => (
            <article key={bank._id} className={`${styles.bank} ${bank.isActive ? styles.active : ''}`}>
              <div className={styles.bankHeader}>
                <h3>{bank.name}</h3>
                <span className={`${styles.status} ${styles[bank.status]}`}>{bank.isActive ? '使用中' : bank.status}</span>
              </div>
              <p className={styles.useCase}>{bank.useCase}</p>
              <p className={styles.meta}>{new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(bank.createdAt))} · {bank.challenges.length} 題</p>
              {bank.errorMsg && <p className={styles.error}>{bank.errorMsg}</p>}
              <div className={styles.actions}>
                <button className="btn btn-secondary" onClick={() => onReview(bank._id)} disabled={bank.isActive}>查看審核</button>
                <button className="btn btn-secondary" onClick={() => void activate(bank._id)} disabled={bank.isActive || bank.status !== 'ready' || updatingId === bank._id}>啟用</button>
                <button className="btn btn-danger" onClick={() => void remove(bank)} disabled={bank.isActive || updatingId === bank._id} title={bank.isActive ? '啟用中的題庫不可刪除' : undefined}>刪除</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
