import styles from './MqlPreview.module.css';

interface Props {
  preview: string;
  collection: string;
  embedded?: boolean;
}

export function MqlPreview({ preview, collection, embedded = false }: Props) {
  const content = (
    <>
      <h3 className={styles.title}>MQL 預覽</h3>
      <p className={styles.sub}>db.<strong>{collection}</strong></p>
      <pre className="code-block">
        <code>{preview || `db.${collection}.__`}</code>
      </pre>
    </>
  );

  return embedded ? content : <div className="card">{content}</div>;
}
