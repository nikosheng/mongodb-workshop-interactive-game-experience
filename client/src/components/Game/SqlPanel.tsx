import type { Challenge } from '@query-quest/shared';
import { isSchemaDesignChallengeType } from '@query-quest/shared';
import styles from './SqlPanel.module.css';

interface Props {
  challenge: Challenge;
}

function formatSchemaType(value: unknown): string {
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function SqlPanel({ challenge }: Props) {
  const isSchemaDesign = isSchemaDesignChallengeType(challenge.type);

  return (
    <div className="card">
      <h3 className={styles.title}>{isSchemaDesign ? '業務情境' : 'SQL 題目'}</h3>
      {isSchemaDesign ? (
        <p className={styles.context} style={{ marginTop: '12px' }}>{challenge.context}</p>
      ) : (
        <>
          <pre className="code-block" style={{ marginTop: '12px' }}>
            <code>{challenge.sql}</code>
          </pre>
          <div className={styles.context}>
            <strong>Collection：</strong>
            <code>{challenge.collection}</code>
            <span className={styles.sep}>·</span>
            {challenge.context}
          </div>
        </>
      )}
      <div className={styles.schema}>
        <strong>{isSchemaDesign ? '目前（未優化）的欄位形狀：' : 'Schema：'}</strong>
        <div className={styles.schemaGrid}>
          {Object.entries(challenge.schema).map(([field, type]) => (
            <div key={field} className={styles.schemaRow}>
              <code className={styles.field}>{field}</code>
              <span className={styles.type}>{formatSchemaType(type)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.sampleDocs}>
        <strong>Sample Documents：</strong>
        <pre className="code-block" style={{ marginTop: '8px', fontSize: '0.78rem' }}>
          <code>{JSON.stringify(challenge.sampleDocuments, null, 2)}</code>
        </pre>
      </div>
    </div>
  );
}
