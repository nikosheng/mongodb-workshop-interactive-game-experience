import { useEffect, useState } from 'react';
import type { Challenge, QuestionBank } from '@query-quest/shared';
import { apiAdminGet, apiAdminPatch, apiAdminPost } from '../../hooks/useApi';
import styles from './QuestionBankReview.module.css';

interface Props { secret: string; bankId: string; onChanged: () => void; onClose: () => void; }

function stringifySnippet(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function SchemaDesignQuestionReview({ secret, bankId, onChanged, onClose }: Props) {
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [challengeDrafts, setChallengeDrafts] = useState<Record<string, Challenge>>({});
  const [snippetDrafts, setSnippetDrafts] = useState<Record<string, string>>({});
  const [snippetErrors, setSnippetErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [appendRequest, setAppendRequest] = useState('');
  const [showAppendForm, setShowAppendForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await apiAdminGet<{ bank: QuestionBank }>(`/api/question-banks/${bankId}`, secret);
      setBank(result.bank);
      setChallengeDrafts(Object.fromEntries(result.bank.challenges.map((challenge) => [challenge.id, structuredClone(challenge)])));
      setSnippetDrafts(Object.fromEntries(result.bank.challenges.flatMap((challenge) => challenge.puzzles.map((puzzle) => [`${challenge.id}:${puzzle.id}`, stringifySnippet((puzzle.value as { snippet?: unknown })?.snippet ?? {})]))));
      setSnippetErrors({});
    } catch (error) { setMessage(error instanceof Error ? error.message : '無法讀取題庫'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [bankId, secret]);

  const updateChallenge = (id: string, updater: (challenge: Challenge) => Challenge) => {
    setChallengeDrafts((current) => {
      const existing = current[id];
      if (!existing) return current;
      return { ...current, [id]: updater(existing) };
    });
  };

  const selectCorrect = (challenge: Challenge, puzzleId: string) => {
    updateChallenge(challenge.id, (draft) => {
      const puzzles = draft.puzzles.map((puzzle) => ({ ...puzzle, isDistractor: puzzle.id !== puzzleId }));
      const correctPuzzle = puzzles.find((puzzle) => puzzle.id === puzzleId);
      const optionExplanations = (draft.optionExplanations ?? []).map((item) => ({
        ...item,
        verdict: (item.puzzleId === puzzleId ? 'correct' : 'incorrect') as 'correct' | 'incorrect',
      }));
      return {
        ...draft,
        puzzles,
        answerKey: { s_design: puzzleId },
        patternName: correctPuzzle?.label ?? draft.patternName,
        optionExplanations,
      };
    });
  };

  const approve = async (challenge: Challenge) => {
    const edited = challengeDrafts[challenge.id] || challenge;
    if (Object.keys(snippetErrors).some((key) => key.startsWith(`${challenge.id}:`))) {
      setMessage('請先修正未完成或無效的 JSON snippet。');
      return;
    }
    setBusy(challenge.id);
    try {
      await apiAdminPatch(`/api/question-banks/${bankId}/questions/${challenge.id}`, edited, secret);
      await apiAdminPost(`/api/question-banks/${bankId}/questions/${challenge.id}/approve`, {}, secret);
      setMessage(`「${challenge.title}」已確認。`);
      await load(); onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : '確認答案失敗'); }
    finally { setBusy(null); }
  };

  const append = async () => {
    if (appendRequest.trim().length < 5) return;
    setBusy('append');
    try {
      await apiAdminPost(`/api/question-banks/${bankId}/questions/generate`, { request: appendRequest }, secret);
      setAppendRequest(''); setShowAppendForm(false); setMessage('已新增一題，請確認候選卡與正解。');
      await load(); onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : '追加題目失敗'); }
    finally { setBusy(null); }
  };

  if (loading) return <section className={`card ${styles.panel}`}>載入審核內容中...</section>;
  if (!bank) return <section className={`card ${styles.panel}`}>{message || '找不到題庫'}</section>;
  const approved = new Set(bank.approvedQuestionIds);

  return (
    <section className={`card ${styles.panel}`} aria-labelledby="schema-review-title">
      <div className={styles.heading}>
        <div><p className={styles.eyebrow}>Human review · Schema Design</p><h2 id="schema-review-title">審核：{bank.name}</h2><p>{approved.size} / {bank.challenges.length} 題已確認</p></div>
        <div className={styles.headingActions}><button className="btn btn-secondary" onClick={() => setShowAppendForm((open) => !open)} disabled={busy !== null}>＋追加一題</button><button className="btn btn-ghost" onClick={onClose}>關閉</button></div>
      </div>
      {message && <p className={styles.message} role="status">{message}</p>}
      {showAppendForm && (
        <div className={styles.appendForm}>
          <label htmlFor="schema-append-request">追加題目要求</label>
          <textarea id="schema-append-request" value={appendRequest} onChange={(event) => setAppendRequest(event.target.value)} placeholder="例如：新增一題 advanced 難度，聚焦在 Subset Pattern 的取捨，避免和既有題目重複。" maxLength={1000} rows={4} disabled={busy !== null} />
          <div className={styles.appendActions}>
            <button className="btn btn-ghost" onClick={() => setShowAppendForm(false)} disabled={busy !== null}>取消</button>
            <button className="btn btn-primary" onClick={() => void append()} disabled={busy !== null || appendRequest.trim().length < 5}>{busy === 'append' ? '生成中...' : '依要求生成一題'}</button>
          </div>
        </div>
      )}
      <div className={styles.list}>
        {bank.challenges.map((challenge) => {
          const edited = challengeDrafts[challenge.id] || challenge;
          const isApproved = approved.has(challenge.id);
          const correctId = edited.answerKey['s_design'];
          return (
            <article className={`${styles.challenge} ${isApproved ? styles.approved : ''}`} key={challenge.id}>
              <div className={styles.challengeHeader}>
                <div>
                  <span className={styles.number}>{edited.type === 'SCHEMA_ANTIPATTERN' ? 'ANTI-PATTERN' : 'PATTERN'} · {edited.difficulty}</span>
                  <input className={styles.titleInput} value={edited.title} onChange={(event) => updateChallenge(edited.id, (d) => ({ ...d, title: event.target.value }))} />
                  <p className={styles.id}>ID: {edited.id} · 正解模式：{edited.patternName}</p>
                </div>
                <span className={styles.badge}>{isApproved ? '已確認' : '待審核'}</span>
              </div>
              <label className={styles.fullField}><span>業務情境</span><textarea value={edited.context} onChange={(event) => updateChallenge(edited.id, (d) => ({ ...d, context: event.target.value }))} rows={3} /></label>

              <details open>
                <summary>三張候選卡（點選單選鈕設定正解）</summary>
                <div className={styles.puzzles}>
                  {edited.puzzles.map((puzzle, index) => {
                    const snippetKey = `${edited.id}:${puzzle.id}`;
                    const explanation = edited.optionExplanations?.find((item) => item.puzzleId === puzzle.id);
                    return (
                      <div className={styles.puzzle} key={puzzle.id} style={{ gridTemplateColumns: '1fr' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <label className={styles.check}>
                            <input
                              type="radio"
                              name={`${edited.id}-correct`}
                              checked={correctId === puzzle.id}
                              onChange={() => selectCorrect(edited, puzzle.id)}
                            /> 正解
                          </label>
                          <code>{puzzle.id}</code>
                          <input
                            style={{ flex: 1 }}
                            value={puzzle.label}
                            onChange={(event) => updateChallenge(edited.id, (d) => ({
                              ...d,
                              puzzles: d.puzzles.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)),
                            }))}
                          />
                        </div>
                        <textarea
                          placeholder="一句話摘要（summary）"
                          value={(puzzle.value as { summary?: string })?.summary ?? ''}
                          onChange={(event) => updateChallenge(edited.id, (d) => ({
                            ...d,
                            puzzles: d.puzzles.map((item, i) => (i === index ? { ...item, value: { ...(item.value as object), summary: event.target.value } } : item)),
                          }))}
                          rows={2}
                        />
                        <textarea
                          placeholder="JSON schema snippet"
                          value={snippetDrafts[snippetKey] ?? ''}
                          onChange={(event) => setSnippetDrafts((current) => ({ ...current, [snippetKey]: event.target.value }))}
                          onBlur={(event) => {
                            try {
                              const snippet = JSON.parse(event.target.value);
                              setSnippetErrors((current) => { const next = { ...current }; delete next[snippetKey]; return next; });
                              updateChallenge(edited.id, (d) => ({
                                ...d,
                                puzzles: d.puzzles.map((item, i) => (i === index ? { ...item, value: { ...(item.value as object), snippet } } : item)),
                              }));
                            } catch {
                              setSnippetErrors((current) => ({ ...current, [snippetKey]: 'JSON 格式尚未完成或無效' }));
                            }
                          }}
                          rows={4}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
                        />
                        {snippetErrors[snippetKey] && <span className={styles.valueError}>{snippetErrors[snippetKey]}</span>}
                        <textarea
                          placeholder="這張卡的解說（optionExplanations.reason）"
                          value={explanation?.reason ?? ''}
                          onChange={(event) => updateChallenge(edited.id, (d) => ({
                            ...d,
                            optionExplanations: (d.optionExplanations ?? []).map((item) => (item.puzzleId === puzzle.id ? { ...item, reason: event.target.value } : item)),
                          }))}
                          rows={2}
                        />
                      </div>
                    );
                  })}
                </div>
              </details>

              <details><summary>查看教學提示</summary><p>{edited.concept}</p><p><strong>提示：</strong>{edited.hint}</p></details>

              <div className={styles.actions}>
                <button className="btn btn-primary" onClick={() => void approve(challenge)} disabled={busy !== null}>{isApproved ? '重新儲存並確認' : '儲存並確認此題'}</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
