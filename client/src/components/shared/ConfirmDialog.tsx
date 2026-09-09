import styles from './ConfirmDialog.module.css';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  title, message, confirmLabel, cancelLabel, confirmVariant = 'primary',
  onConfirm, onCancel, loading,
}: Props) {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className={styles.dialog}>
        <h3 id="dialog-title" className={styles.title}>{title}</h3>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            className={`btn btn-${confirmVariant}`}
            onClick={onConfirm}
            disabled={loading}
            autoFocus
          >
            {loading ? '處理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
