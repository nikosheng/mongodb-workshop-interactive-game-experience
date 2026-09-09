import { useState } from 'react';
import { AdminLoginModal } from './AdminLoginModal';
import { QuestionBankGenerator } from './QuestionBankGenerator';
import { QuestionBankGallery } from './QuestionBankGallery';
import { QuestionBankReview } from './QuestionBankReview';
import { QualityRuleReview } from './QualityRuleReview';
import { RoundResetControl } from './RoundResetControl';
import { AdminLeaderboard } from './AdminLeaderboard';
import styles from './AdminPage.module.css';

interface Props {
  onBack: () => void;
}

export function AdminPage({ onBack }: Props) {
  const [secret, setSecret] = useState(() => sessionStorage.getItem('adminSecret'));
  const [refreshKey, setRefreshKey] = useState(0);
  const [reviewBankId, setReviewBankId] = useState<string | null>(null);

  if (!secret) return <AdminLoginModal onAuthenticated={setSecret} />;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>⬡</span>
          <div>
            <p className={styles.eyebrow}>Admin</p>
            <h1 className={styles.title}>題庫管理</h1>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={onBack}>
          返回遊戲
        </button>
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <h2>AI 題庫管理</h2>
          <p>生成、啟用與整理題庫。玩家只會在開始新遊戲時讀取目前啟用的題庫。</p>
        </section>
        <QuestionBankGenerator secret={secret} onGenerated={() => setRefreshKey((key) => key + 1)} />
        <QuestionBankGallery secret={secret} refreshKey={refreshKey} onReview={setReviewBankId} />
        {reviewBankId && <QuestionBankReview secret={secret} bankId={reviewBankId} onChanged={() => setRefreshKey((key) => key + 1)} onClose={() => setReviewBankId(null)} />}
        <QualityRuleReview secret={secret} refreshKey={refreshKey} />
        <RoundResetControl secret={secret} onReset={() => setRefreshKey((key) => key + 1)} />
        <AdminLeaderboard secret={secret} refreshKey={refreshKey} />
      </main>
    </div>
  );
}
