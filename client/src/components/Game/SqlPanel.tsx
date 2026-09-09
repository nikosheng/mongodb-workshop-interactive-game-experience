import type { Challenge } from '@query-quest/shared';
import styles from './SqlPanel.module.css';

interface Props {
  challenge: Challenge;
}

export function SqlPanel({ challenge }: Props) {
  return (
    <div className="card">
      <h3 className={styles.title}>SQL 題目</h3>
      <pre className="code-block" style={{ marginTop: '12px' }}>
        <code>{challenge.sql}</code>
      </pre>
      <div className={styles.context}>
        <strong>Collection：</strong>
        <code>{challenge.collection}</code>
        <span className={styles.sep}>·</span>
        {challenge.context}
      </div>
      <div className={styles.schema}>
        <strong>Schema：</strong>
        <div className={styles.schemaGrid}>
          {Object.entries(challenge.schema).map(([field, type]) => (
            <div key={field} className={styles.schemaRow}>
              <code className={styles.field}>{field}</code>
              <span className={styles.type}>{type}</span>
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
