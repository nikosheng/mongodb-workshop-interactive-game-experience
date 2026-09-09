import { useEffect, useState } from 'react';
import { apiAdminGet, apiAdminPost } from '../../hooks/useApi';
import styles from './QualityRuleReview.module.css';

interface RuleSuggestion { _id: string; rule: string; rationale: string; category: string; status: 'pending' | 'approved' | 'rejected'; }
interface Props { secret: string; refreshKey: number; }

export function QualityRuleReview({ secret, refreshKey }: Props) {
  const [suggestions, setSuggestions] = useState<RuleSuggestion[]>([]);
  const [memory, setMemory] = useState('');
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const [result, memoryResult] = await Promise.all([
        apiAdminGet<{ suggestions: RuleSuggestion[] }>('/api/question-banks/quality-rules', secret),
        apiAdminGet<{ memory: string }>('/api/question-banks/quality-rules/memory', secret),
      ]);
      setSuggestions(result.suggestions);
      setMemory(memoryResult.memory);
    }
    catch (err) { setError(err instanceof Error ? err.message : '無法讀取全域規則'); }
  };
  useEffect(() => { void load(); }, [secret, refreshKey]);
  const update = async (id: string, action: 'approve' | 'reject') => {
    try { await apiAdminPost(`/api/question-banks/quality-rules/${id}/${action}`, {}, secret); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : '更新規則失敗'); }
  };
  return (
    <section className={`card ${styles.panel}`} aria-labelledby="quality-rules-title">
      <div><h2 id="quality-rules-title">全域 AI 品質規則</h2><p>只保存跨題庫通用的可行性、答案配對與難度規則，不保存任何題庫背景。</p><ul className={styles.constraints}><li>每個 required slot 至少一個相容的混淆拼圖。</li><li>每題必須有 answerKey 與 mqlBreakdown。</li><li>所有題目儲存與生成都會重新驗證硬性條件。</li></ul></div>
      {error && <p className={styles.error}>{error}</p>}
      <details className={styles.memory} open>
        <summary>Mastra Global Memory Snapshot</summary>
        <p>這是目前已同步到 Mastra Working Memory、會提供給新題庫生成流程參考的內容。</p>
        <pre><code>{memory || '尚未同步任何已批准規則。'}</code></pre>
      </details>
      {suggestions.length === 0 ? <p className={styles.empty}>尚未有規則建議。</p> : <div className={styles.list}>{suggestions.map((item) => <article className={styles.rule} key={item._id}><div className={styles.header}><span className={styles.category}>{item.category}</span><span>{item.status}</span></div><strong>{item.rule}</strong><p>{item.rationale}</p>{item.status === 'pending' && <div className={styles.actions}><button className="btn btn-primary" onClick={() => void update(item._id, 'approve')}>批准寫入 Memory</button><button className="btn btn-danger" onClick={() => void update(item._id, 'reject')}>拒絕</button></div>}</article>)}</div>}
    </section>
  );
}
