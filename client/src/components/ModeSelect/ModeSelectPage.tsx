import { useState } from 'react';
import type { AuthUser } from '../../App';
import styles from './ModeSelectPage.module.css';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { apiPost } from '../../hooks/useApi';

interface Props {
  user: AuthUser;
  onSelectSolo: () => void;
  onSelectMultiplayer: () => void;
  onLogout: () => void;
}

export function ModeSelectPage({ user, onSelectSolo, onSelectMultiplayer, onLogout }: Props) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await apiPost('/api/logout', {});
    } finally {
      onLogout();
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>⬡</span>
          <span className={styles.brandName}>MongoDB Query Quest</span>
        </div>
        <div className={styles.userInfo}>
          <span className={styles.playerName}>{user.name}</span>
          <button
            className="btn btn-ghost"
            onClick={() => setShowLogoutConfirm(true)}
          >
            離開遊戲
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <h2 className={styles.heading}>選擇遊戲模式</h2>
        <p className={styles.sub}>透過拼圖學習 SQL → MongoDB MQL 轉換</p>

        <div className={styles.modes}>
          <button className={styles.modeCard} onClick={onSelectSolo}>
            <span className={styles.modeIcon}>👤</span>
            <h3 className={styles.modeTitle}>單人模式</h3>
            <p className={styles.modeDesc}>按自己的節奏完成 8 關挑戰，成績可提交至全站排行榜</p>
            <span className="btn btn-primary" style={{ marginTop: 'auto' }}>開始單人遊戲</span>
          </button>

          <button className={styles.modeCard} onClick={onSelectMultiplayer}>
            <span className={styles.modeIcon}>👥</span>
            <h3 className={styles.modeTitle}>多人模式</h3>
            <p className={styles.modeDesc}>建立房間或輸入邀請碼，與朋友同場競技，即時排行</p>
            <span className="btn btn-secondary" style={{ marginTop: 'auto' }}>進入多人大廳</span>
          </button>
        </div>
      </main>

      {showLogoutConfirm && (
        <ConfirmDialog
          title="確定離開遊戲？"
          message="你的進度已儲存，下次輸入相同名字可繼續。"
          confirmLabel="確定離開"
          cancelLabel="取消"
          confirmVariant="danger"
          onConfirm={() => {
            setShowLogoutConfirm(false);
            handleLogout();
          }}
          onCancel={() => setShowLogoutConfirm(false)}
          loading={loggingOut}
        />
      )}
    </div>
  );
}
