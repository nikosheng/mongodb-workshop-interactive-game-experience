import { useState } from 'react';
import { apiAdminPost } from '../../hooks/useApi';
import styles from './QuestionBankGenerator.module.css';

interface Props {
  secret: string;
  onGenerated: () => void;
}

export function QuestionBankGenerator({ secret, onGenerated }: Props) {
  const [name, setName] = useState('');
  const [useCase, setUseCase] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    setGenerating(true);
    try {
      const result = await apiAdminPost<{ bank: { challenges: unknown[] } }>('/api/question-banks/generate', { name, useCase }, secret);
      setName('');
      setUseCase('');
      setStatus({ type: 'success', message: `題庫已生成，共 ${result.bank.challenges.length} 題。` });
      onGenerated();
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : '生成題庫失敗' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className={`card ${styles.panel}`} aria-labelledby="generator-title">
      <div>
        <h2 id="generator-title">AI 題庫生成</h2>
        <p>描述想讓玩家練習的業務情境，系統會自動建立並驗證題庫。</p>
      </div>
      <form onSubmit={handleSubmit} className={styles.form}>
        <label htmlFor="question-bank-name">題庫名稱</label>
        <input
          id="question-bank-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：賭場賭客 360 度分析"
          maxLength={60}
          disabled={generating}
          required
        />
        <label htmlFor="use-case">挑戰情境說明</label>
        <textarea
          id="use-case"
          value={useCase}
          onChange={(event) => setUseCase(event.target.value)}
          placeholder="描述你的挑戰情境，例如：電商用戶 360 度分析場景，包含會員分群、訂單與商品偏好..."
          rows={5}
          maxLength={2000}
          disabled={generating}
          required
        />
        {status && <p className={status.type === 'success' ? styles.success : styles.error} role="status">{status.message}</p>}
        <button className="btn btn-primary" type="submit" disabled={generating || name.trim().length < 2 || useCase.trim().length < 5}>
          {generating ? '正在生成題庫...' : '生成題庫'}
        </button>
      </form>
    </section>
  );
}
