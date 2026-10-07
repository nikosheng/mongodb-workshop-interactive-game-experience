import { useState } from 'react';
import type { WorkshopType } from '@query-quest/shared';
import { AdminLoginModal } from './AdminLoginModal';
import { QuestionBankGenerator } from './QuestionBankGenerator';
import { QuestionBankGallery } from './QuestionBankGallery';
import { QuestionBankReview } from './QuestionBankReview';
import { SchemaDesignQuestionReview } from './SchemaDesignQuestionReview';
import { QualityRuleReview } from './QualityRuleReview';
import { RoundResetControl } from './RoundResetControl';
import { AdminLeaderboard } from './AdminLeaderboard';
import styles from './AdminPage.module.css';

interface Props {
  onBack: () => void;
}

const WORKSHOP_TABS: { id: WorkshopType; label: string }[] = [
  { id: 'crud', label: 'CRUD Workshop' },
  { id: 'schema-design', label: 'Schema Design Workshop' },
];

export function AdminPage({ onBack }: Props) {
  const [secret, setSecret] = useState(() => sessionStorage.getItem('adminSecret'));
  const [refreshKey, setRefreshKey] = useState(0);
  const [reviewBankId, setReviewBankId] = useState<string | null>(null);
  const [workshopType, setWorkshopType] = useState<WorkshopType>('crud');

  if (!secret) return <AdminLoginModal onAuthenticated={setSecret} />;

  const switchWorkshop = (next: WorkshopType) => {
    setWorkshopType(next);
    setReviewBankId(null);
  };

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

        <div className={styles.workshopTabs}>
          {WORKSHOP_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.workshopTab} ${workshopType === tab.id ? styles.workshopTabActive : ''}`}
              onClick={() => switchWorkshop(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <QuestionBankGenerator secret={secret} workshopType={workshopType} onGenerated={() => setRefreshKey((key) => key + 1)} />
        <QuestionBankGallery secret={secret} workshopType={workshopType} refreshKey={refreshKey} onReview={setReviewBankId} />
        {reviewBankId && (
          workshopType === 'schema-design' ? (
            <SchemaDesignQuestionReview secret={secret} bankId={reviewBankId} onChanged={() => setRefreshKey((key) => key + 1)} onClose={() => setReviewBankId(null)} />
          ) : (
            <QuestionBankReview secret={secret} bankId={reviewBankId} onChanged={() => setRefreshKey((key) => key + 1)} onClose={() => setReviewBankId(null)} />
          )
        )}
        <QualityRuleReview secret={secret} workshopType={workshopType} refreshKey={refreshKey} />
        <RoundResetControl secret={secret} onReset={() => setRefreshKey((key) => key + 1)} />
        <AdminLeaderboard secret={secret} refreshKey={refreshKey} />
      </main>
    </div>
  );
}
