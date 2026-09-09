import type { Challenge } from '@query-quest/shared';
import styles from './ChallengeHeader.module.css';

interface Props {
  challenge: Challenge;
  currentIndex: number;
  totalChallenges: number;
  totalScore: number;
  playerName: string;
  onBack: () => void;
  onReset: () => void;
}

const difficultyLabel: Record<string, string> = {
  beginner: '初級',
  intermediate: '中級',
  advanced: '高級',
  boss: 'Boss',
};

export function ChallengeHeader({
  challenge, currentIndex, totalChallenges, totalScore, playerName, onBack, onReset
}: Props) {
  const progress = ((currentIndex + 1) / totalChallenges) * 100;

  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <div className={styles.left}>
          <button className="btn btn-ghost" onClick={onBack} aria-label="返回模式選擇">
            ← 返回
          </button>
          <div className={styles.brand}>
            <span className={styles.logo}>⬡</span>
            <span className={styles.brandName}>Query Quest</span>
          </div>
        </div>
        <div className={styles.center}>
          <span className={`badge badge-${challenge.difficulty}`}>
            {difficultyLabel[challenge.difficulty]}
          </span>
          <span className={styles.challengeTitle}>{challenge.title}</span>
          <span className={styles.challengeNum}>
            {currentIndex + 1} / {totalChallenges}
          </span>
        </div>
        <div className={styles.right}>
          <span className={styles.score}>分數：{totalScore}</span>
          <span className={styles.player}>{playerName}</span>
          <button className="btn btn-ghost" onClick={onReset} title="重設進度">
            ↺ 重設
          </button>
        </div>
      </div>
      <div className={styles.progressBar} role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemax={totalChallenges}>
        <div className={styles.progressFill} style={{ width: `${progress}%` }} />
      </div>
    </header>
  );
}
