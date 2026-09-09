import { useEffect, useState } from 'react';
import type { Challenge, QuestionBank } from '@query-quest/shared';
import { apiAdminGet, apiAdminPatch, apiAdminPost } from '../../hooks/useApi';
import styles from './QuestionBankReview.module.css';

interface Props { secret: string; bankId: string; onChanged: () => void; onClose: () => void; }

export function QuestionBankReview({ secret, bankId, onChanged, onClose }: Props) {
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [challengeDrafts, setChallengeDrafts] = useState<Record<string, Challenge>>({});
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});
  const [valueErrors, setValueErrors] = useState<Record<string, string>>({});
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
      setDrafts(Object.fromEntries(result.bank.challenges.map((challenge) => [challenge.id, { ...challenge.answerKey }])));
      setChallengeDrafts(Object.fromEntries(result.bank.challenges.map((challenge) => [challenge.id, structuredClone(challenge)])));
      setValueDrafts(Object.fromEntries(result.bank.challenges.flatMap((challenge) => challenge.puzzles.map((puzzle) => [`${challenge.id}:${puzzle.id}`, JSON.stringify(puzzle.value, null, 2)]))));
      setValueErrors({});
    } catch (error) { setMessage(error instanceof Error ? error.message : '無法讀取題庫'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [bankId, secret]);

  const approve = async (challenge: Challenge) => {
    const edited = challengeDrafts[challenge.id] || challenge;
    if (Object.keys(valueErrors).some((key) => key.startsWith(`${challenge.id}:`))) {
      setMessage('請先修正未完成或無效的 JSON。');
      return;
    }
    setBusy(challenge.id);
    try {
      // Persist the current editor draft before approving it. Otherwise the
      // following reload would restore the previous MongoDB document.
      await apiAdminPatch(`/api/question-banks/${bankId}/questions/${challenge.id}`, { ...edited, answerKey: drafts[challenge.id] || edited.answerKey }, secret);
      await apiAdminPost(`/api/question-banks/${bankId}/questions/${challenge.id}/approve`, {}, secret);
      setMessage(`「${challenge.title}」已確認。`);
      await load(); onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : '確認答案失敗'); }
    finally { setBusy(null); }
  };
  const append = async () => {
    if (appendRequest.trim().length < 5) return;
    setBusy('append');
    try { await apiAdminPost(`/api/question-banks/${bankId}/questions/generate`, { request: appendRequest }, secret); setAppendRequest(''); setShowAppendForm(false); setMessage('已新增一題，請確認答案配對。'); await load(); onChanged(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '追加題目失敗'); }
    finally { setBusy(null); }
  };

  if (loading) return <section className={`card ${styles.panel}`}>載入審核內容中...</section>;
  if (!bank) return <section className={`card ${styles.panel}`}>{message || '找不到題庫'}</section>;
  const approved = new Set(bank.approvedQuestionIds);
  return (
    <section className={`card ${styles.panel}`} aria-labelledby="review-title">
      <div className={styles.heading}>
        <div><p className={styles.eyebrow}>Human review</p><h2 id="review-title">審核：{bank.name}</h2><p>{approved.size} / {bank.challenges.length} 題已確認</p></div>
        <div className={styles.headingActions}><button className="btn btn-secondary" onClick={() => setShowAppendForm((open) => !open)} disabled={busy !== null}>＋追加一題</button><button className="btn btn-ghost" onClick={onClose}>關閉</button></div>
      </div>
      {message && <p className={styles.message} role="status">{message}</p>}
      {showAppendForm && <div className={styles.appendForm}><label htmlFor="append-request">追加題目要求</label><textarea id="append-request" value={appendRequest} onChange={(event) => setAppendRequest(event.target.value)} placeholder="例如：新增一題 intermediate 難度，練習 SQL IN 對應 MongoDB $in，避免和既有題目重複。" maxLength={1000} rows={4} disabled={busy !== null} /><div className={styles.appendActions}><button className="btn btn-ghost" onClick={() => setShowAppendForm(false)} disabled={busy !== null}>取消</button><button className="btn btn-primary" onClick={() => void append()} disabled={busy !== null || appendRequest.trim().length < 5}>{busy === 'append' ? '生成中...' : '依要求生成一題'}</button></div></div>}
      <div className={styles.list}>
        {bank.challenges.map((challenge) => {
          const draft = drafts[challenge.id] || challenge.answerKey;
          const edited = challengeDrafts[challenge.id] || challenge;
          const isApproved = approved.has(challenge.id);
          return (
            <article className={`${styles.challenge} ${isApproved ? styles.approved : ''}`} key={challenge.id}>
              <div className={styles.challengeHeader}><div><span className={styles.number}>{edited.type}</span><input className={styles.titleInput} value={edited.title} onChange={(event) => setChallengeDrafts((current) => ({ ...current, [edited.id]: { ...edited, title: event.target.value } }))} /><p className={styles.id}>ID: {edited.id}</p></div><span className={styles.badge}>{isApproved ? '已確認' : '待審核'}</span></div>
              <label className={styles.fullField}><span>SQL 題目</span><textarea value={edited.sql} onChange={(event) => setChallengeDrafts((current) => ({ ...current, [edited.id]: { ...edited, sql: event.target.value } }))} rows={3} /></label>
              <label className={styles.fullField}><span>情境說明</span><textarea value={edited.context} onChange={(event) => setChallengeDrafts((current) => ({ ...current, [edited.id]: { ...edited, context: event.target.value } }))} rows={2} /></label>
              <div className={styles.answerGrid}>
                {edited.slots.filter((slot) => slot.required).map((slot) => (
                  <label key={slot.id}><span>{slot.label}</span><select value={draft[slot.id] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [challenge.id]: { ...draft, [slot.id]: event.target.value } }))}>
                    <option value="">請選擇正確拼圖</option>
                    {edited.puzzles.filter((puzzle) => slot.accepts.includes(puzzle.kind)).map((puzzle) => <option key={puzzle.id} value={puzzle.id}>{puzzle.id} {puzzle.isDistractor ? '[干擾] ' : ''}{puzzle.label}</option>)}
                  </select></label>
                ))}
              </div>
              <details open><summary>所有拼圖選項（可編輯）</summary><div className={styles.puzzles}>{edited.puzzles.map((puzzle, index) => { const valueKey = `${edited.id}:${puzzle.id}`; return <div className={styles.puzzle} key={puzzle.id}><code>{puzzle.id}</code><input value={puzzle.label} onChange={(event) => setChallengeDrafts((current) => ({ ...current, [edited.id]: { ...edited, puzzles: edited.puzzles.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) } }))} /><select value={puzzle.kind} onChange={(event) => setChallengeDrafts((current) => ({ ...current, [edited.id]: { ...edited, puzzles: edited.puzzles.map((item, itemIndex) => itemIndex === index ? { ...item, kind: event.target.value as typeof item.kind } : item) } }))}><option value="command">command</option><option value="filter">filter</option><option value="projection">projection</option><option value="update">update</option><option value="options">options</option><option value="sort">sort</option><option value="limit">limit</option><option value="stage">stage</option></select><label className={styles.check}><input type="checkbox" checked={Boolean(puzzle.isDistractor)} onChange={(event) => setChallengeDrafts((current) => ({ ...current, [edited.id]: { ...edited, puzzles: edited.puzzles.map((item, itemIndex) => itemIndex === index ? { ...item, isDistractor: event.target.checked } : item) } }))} /> 干擾</label><textarea value={valueDrafts[valueKey] ?? JSON.stringify(puzzle.value, null, 2)} onChange={(event) => setValueDrafts((current) => ({ ...current, [valueKey]: event.target.value }))} onBlur={(event) => { try { const value = JSON.parse(event.target.value); setValueErrors((current) => { const next = { ...current }; delete next[valueKey]; return next; }); setChallengeDrafts((current) => ({ ...current, [edited.id]: { ...edited, puzzles: edited.puzzles.map((item, itemIndex) => itemIndex === index ? { ...item, value } : item) } })); } catch { setValueErrors((current) => ({ ...current, [valueKey]: 'JSON 格式尚未完成或無效' })); } }} rows={3} />{valueErrors[valueKey] && <span className={styles.valueError}>{valueErrors[valueKey]}</span>}</div>; })}</div></details>
              <details><summary>查看預期 MQL 與教學解說</summary><p>{edited.concept}</p>{edited.mqlBreakdown?.map((item) => <p key={item.slotId}><strong>{item.title}：</strong>{item.explanation}</p>)}</details>
              <div className={styles.actions}><button className="btn btn-primary" onClick={() => void approve(challenge)} disabled={busy !== null}>{isApproved ? '重新儲存並確認' : '儲存並確認此題'}</button></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
