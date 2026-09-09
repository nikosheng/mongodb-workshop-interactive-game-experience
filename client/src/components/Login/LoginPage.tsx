import { useState } from 'react';
import type { FormEvent } from 'react';
import { apiPost } from '../../hooks/useApi';
import type { AuthUser } from '../../App';
import styles from './LoginPage.module.css';

interface Props {
  onLogin: (user: AuthUser) => void;
}

export function LoginPage({ onLogin }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = (val: string): string => {
    const trimmed = val.trim();
    if (trimmed.length < 2) return '名字至少需要 2 個字元';
    if (trimmed.length > 30) return '名字最多 30 個字元';
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(trimmed)) return '名字不能包含控制字元';
    return '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validate(name);
    if (err) { setError(err); return; }
    setLoading(true);
    setError('');
    try {
      const user = await apiPost<AuthUser>('/api/login', { name: name.trim() });
      onLogin(user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <span className={styles.logo}>⬡</span>
          <h1 className={styles.title}>MongoDB<br /><span className={styles.accent}>Query Quest</span></h1>
        </div>
        <p className={styles.subtitle}>
          透過遊戲化拼圖，學習把 SQL 查詢轉換為 MongoDB MQL
        </p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <label className={styles.label} htmlFor="playerName">
            你的名字
          </label>
          <input
            id="playerName"
            className={`${styles.input} ${error ? styles.inputError : ''}`}
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            placeholder="輸入你的名字（2–30 字）"
            maxLength={30}
            autoComplete="nickname"
            autoFocus
            aria-describedby={error ? 'name-error' : undefined}
            aria-invalid={!!error}
          />
          {error && (
            <p id="name-error" className={styles.error} role="alert">{error}</p>
          )}
          <button
            type="submit"
            className={`btn btn-primary ${styles.submitBtn}`}
            disabled={loading || name.trim().length < 2}
          >
            {loading ? '登入中...' : '開始遊戲'}
          </button>
        </form>

        <p className={styles.note}>
          無需 email 或密碼，直接輸入暱稱即可開始。
        </p>
      </div>
    </div>
  );
}
