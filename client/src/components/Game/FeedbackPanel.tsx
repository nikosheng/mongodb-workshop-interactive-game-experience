import type { Challenge } from '@query-quest/shared';
import { isSchemaDesignChallengeType } from '@query-quest/shared';
import styles from './FeedbackPanel.module.css';

interface FeedbackState {
  type: 'correct' | 'incorrect';
  errors?: string[];
  mql: string;
  score?: number;
}

interface Props {
  feedback: FeedbackState | null;
  challenge: Challenge;
  attemptCount: number;
  onNext: () => void;
  isLastChallenge: boolean;
}

function SchemaDesignExplanation({ challenge }: { challenge: Challenge }) {
  const puzzleLabel = (puzzleId: string) => challenge.puzzles.find((p) => p.id === puzzleId)?.label ?? puzzleId;
  return (
    <div className={styles.breakdown}>
      {(challenge.optionExplanations ?? []).map((item) => (
        <article className={styles.breakdownItem} key={item.puzzleId}>
          <div className={styles.breakdownHeading}>
            <strong>{puzzleLabel(item.puzzleId)}</strong>
            <code>{item.verdict === 'correct' ? '✓ 最佳設計' : '✗ 有缺陷'}</code>
          </div>
          <p>{item.reason}</p>
        </article>
      ))}
    </div>
  );
}

export function FeedbackPanel({ feedback, challenge, attemptCount, onNext, isLastChallenge }: Props) {
  if (!feedback) return null;
  const isSchemaDesign = isSchemaDesignChallengeType(challenge.type);

  // Build the "correct" MQL from expected (CRUD challenges only).
  const buildExpectedMql = (): string => {
    const exp = challenge.expected;
    if (!exp) return '';
    const fmt = (v: unknown) => JSON.stringify(v, null, 2);
    switch (exp.type) {
      case 'FIND': {
        let s = `db.${exp.collection}.find(\n  ${fmt(exp.filter)}`;
        if (exp.projection) s += `,\n  ${fmt(exp.projection)}`;
        s += '\n)';
        if (exp.sort) s += `.sort(${fmt(exp.sort)})`;
        if (exp.limit) s += `.limit(${exp.limit})`;
        return s;
      }
      case 'INSERT':
        return `db.${exp.collection}.insertOne(\n  ${fmt(exp.document)}\n)`;
      case 'UPDATE':
        return `db.${exp.collection}.${exp.multi ? 'updateMany' : 'updateOne'}(\n  ${fmt(exp.filter)},\n  ${fmt(exp.update)}${exp.upsert !== undefined ? `,\n  ${fmt({ upsert: exp.upsert })}` : ''}\n)`;
      case 'DELETE':
        return `db.${exp.collection}.${exp.multi ? 'deleteMany' : 'deleteOne'}(\n  ${fmt(exp.filter)}\n)`;
      case 'AGGREGATE':
        return `db.${exp.collection}.aggregate([\n${exp.pipeline.map(s => `  ${fmt(s)}`).join(',\n')}\n])`;
      default:
        return '';
    }
  };

  const expectedMql = buildExpectedMql();
  const breakdown = challenge.mqlBreakdown ?? [];

  const renderCrudBreakdown = () => (
    <div className={styles.breakdown}>
      {breakdown.length === 0 ? (
        <p className={styles.concept}>這是舊版題庫，尚未提供逐段 MQL 解釋。</p>
      ) : breakdown.map((item) => (
        <article className={styles.breakdownItem} key={item.slotId}>
          <div className={styles.breakdownHeading}>
            <strong>{item.title}</strong>
            <code>{item.slotId}</code>
          </div>
          <p><span className={styles.breakdownLabel}>SQL 對應：</span>{item.sqlMapping}</p>
          <p><span className={styles.breakdownLabel}>MQL 角色：</span>{item.role}</p>
          <p>{item.explanation}</p>
        </article>
      ))}
    </div>
  );

  if (feedback.type === 'correct') {
    return (
      <div className={`${styles.panel} ${styles.correct}`} role="status" aria-live="polite">
        <div className={styles.header}>
          <span className={styles.icon}>✓</span>
          <h3>答對了！</h3>
          {feedback.score !== undefined && (
            <span className={styles.score}>+{feedback.score} 分</span>
          )}
        </div>

        {isSchemaDesign ? (
          <>
            <div className={styles.section}>
              <strong>正確設計模式</strong>
              <p className={styles.concept}>{challenge.patternName}</p>
            </div>
            <div className={styles.section}>
              <strong>每個選項的解說</strong>
              <SchemaDesignExplanation challenge={challenge} />
            </div>
          </>
        ) : (
          <>
            <div className={styles.section}>
              <strong>概念說明</strong>
              <p className={styles.concept}>{challenge.concept}</p>
            </div>

            <div className={styles.section}>
              <strong>正確的 MQL</strong>
              <pre className="code-block" style={{ marginTop: '8px', fontSize: '0.8rem' }}>
                <code>{expectedMql}</code>
              </pre>
            </div>

            <div className={styles.section}>
              <strong>逐段拆解</strong>
              {renderCrudBreakdown()}
            </div>
          </>
        )}

        <button
          className="btn btn-primary"
          onClick={onNext}
          style={{ alignSelf: 'flex-end', marginTop: '4px' }}
        >
          {isLastChallenge ? '完成遊戲' : '下一關 →'}
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.panel} ${styles.incorrect}`} role="alert" aria-live="assertive">
      <div className={styles.header}>
        <span className={styles.icon}>✗</span>
        <h3>答案有誤</h3>
        <span className={styles.attempts}>第 {attemptCount} 次嘗試</span>
      </div>

      <ul className={styles.errors}>
        {(feedback.errors || []).map((err, i) => (
          <li key={i}>{err}</li>
        ))}
      </ul>

      {isSchemaDesign ? (
        <div className={styles.section}>
          <strong>概念說明</strong>
          <p className={styles.concept}>{challenge.concept}</p>
        </div>
      ) : (
        <>
          <div className={styles.section}>
            <strong>正確答案（參考）</strong>
            <pre className="code-block" style={{ marginTop: '8px', fontSize: '0.8rem' }}>
              <code>{expectedMql}</code>
            </pre>
          </div>

          <div className={styles.section}>
            <strong>概念說明</strong>
            <p className={styles.concept}>{challenge.concept}</p>
          </div>

          <div className={styles.section}>
            <strong>逐段拆解</strong>
            {renderCrudBreakdown()}
          </div>
        </>
      )}

      <p className={styles.retry}>修改拼圖後可再次按「檢查答案」繼續嘗試。</p>
    </div>
  );
}
