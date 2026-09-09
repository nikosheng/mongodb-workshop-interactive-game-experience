import { useState } from 'react';
import { apiAdminGet } from '../../hooks/useApi';
import styles from './AdminLoginModal.module.css';

interface Props {
  onAuthenticated: (secret: string) => void;
}

export function AdminLoginModal({ onAuthenticated }: Props) {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiAdminGet('/api/question-banks', secret);
      sessionStorage.setItem('adminSecret', secret);
      onAuthenticated(secret);
    } catch (err) {
      setSecret('');
      setError(err instanceof Error ? err.message : '驗證失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="admin-login-title">
      <form className={styles.modal} onSubmit={handleSubmit}>
        <p className={styles.eyebrow}>Restricted area</p>
        <h1 id="admin-login-title">管理員登入</h1>
        <p>請輸入管理員密碼以管理 AI 生成的題庫。本次登入會在關閉此分頁後失效。</p>
        <label htmlFor="admin-secret">管理員密碼</label>
        <input
          id="admin-secret"
          type="password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          autoFocus
          autoComplete="current-password"
          disabled={submitting}
          required
        />
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={submitting || !secret}>
          {submitting ? '驗證中...' : '登入管理後台'}
        </button>
      </form>
    </div>
  );
}
