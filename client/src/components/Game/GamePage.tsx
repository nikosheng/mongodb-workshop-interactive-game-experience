import { useState, useEffect, useCallback, useRef } from 'react';
import type { AuthUser } from '../../App';
import type { Puzzle, Challenge, QuestionBank, SlotAssignment } from '@query-quest/shared';
import { validateAnswer } from '@query-quest/shared';
import { defaultChallenges } from '../../data/challenges';
import { buildMqlPreview } from '../../lib/answerBuilder';
import type { SlotAssignmentMap } from '../../lib/answerBuilder';
import { apiGet, apiPost } from '../../hooks/useApi';
import { ChallengeHeader } from './ChallengeHeader';
import { SqlPanel } from './SqlPanel';
import { AnswerSlots } from './AnswerSlots';
import { PuzzleBank } from './PuzzleBank';
import { MqlPreview } from './MqlPreview';
import { FeedbackPanel } from './FeedbackPanel';
import { GameDndWrapper } from './GameDndWrapper';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import styles from './GamePage.module.css';

interface Props {
  user: AuthUser;
  mode: 'solo' | 'multiplayer';
  roomCode?: string;
  onFinish: () => void;
  onBack: () => void;
}

type FeedbackState =
  | null
  | { type: 'correct'; score: number; mql: string }
  | { type: 'incorrect'; errors: string[]; mql: string };

// Initialize challenge start time outside component to avoid impure render
const GAME_START_TIME = performance.now();

export function GamePage({ user, mode, roomCode, onFinish, onBack }: Props) {
  const [challenges, setChallenges] = useState<Challenge[]>(defaultChallenges);
  const [loadingChallengeBank, setLoadingChallengeBank] = useState(true);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [assignments, setAssignments] = useState<SlotAssignmentMap>({});
  const [selectedPuzzle, setSelectedPuzzle] = useState<Puzzle | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [hintCount, setHintCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [serverSyncError, setServerSyncError] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [completedScores, setCompletedScores] = useState<Record<string, number>>({});
  const [submittingToLeaderboard, setSubmittingToLeaderboard] = useState(false);
  // Use a mutable ref container to avoid the impure Date.now() warning
  const challengeStartRef = useRef({ ts: GAME_START_TIME });

  const challenge = challenges[currentIndex]!;

  useEffect(() => {
    if (mode === 'solo' || mode === 'multiplayer') {
      apiPost<{ sessionId: string }>('/api/sessions', { mode, roomId: roomCode })
        .then(r => setSessionId(r.sessionId))
        .catch((error) => setServerSyncError(error instanceof Error ? error.message : '無法建立遊戲 session，請重新登入。'));
    }
  }, [mode, roomCode]);

  useEffect(() => {
    apiGet<{ bank: QuestionBank | null }>('/api/question-banks/active')
      .then(({ bank }) => {
        if (bank?.challenges.length) {
          setChallenges(bank.challenges);
          setCurrentIndex((index) => Math.min(index, bank.challenges.length - 1));
        }
      })
      .catch(() => {
        // A missing or unavailable bank should not prevent the default game from starting.
      })
      .finally(() => setLoadingChallengeBank(false));
  }, []);

  const mqlPreview = buildMqlPreview(challenge, assignments);

  const handleSlotClick = useCallback((slotId: string) => {
    if (feedback && feedback.type === 'correct') return;
    if (selectedPuzzle) {
      const slot = challenge.slots.find(s => s.id === slotId);
      if (!slot) return;
      if (!slot.accepts.includes(selectedPuzzle.kind)) return;
      setAssignments(prev => ({ ...prev, [slotId]: selectedPuzzle }));
      setSelectedPuzzle(null);
    } else {
      setAssignments(prev => {
        const next = { ...prev };
        delete next[slotId];
        return next;
      });
    }
  }, [selectedPuzzle, challenge.slots, feedback]);

  const handlePuzzleClick = useCallback((puzzle: Puzzle) => {
    if (feedback && feedback.type === 'correct') return;
    if (selectedPuzzle?.id === puzzle.id) {
      setSelectedPuzzle(null);
    } else {
      setSelectedPuzzle(puzzle);
    }
  }, [selectedPuzzle, feedback]);

  const handleCheck = async () => {
    if (mode === 'solo' && !sessionId) {
      setFeedback({ type: 'incorrect', errors: [serverSyncError || '遊戲 session 尚未建立，請重新登入後再試。'], mql: mqlPreview });
      return;
    }
    const count = attemptCount + 1;
    setAttemptCount(count);

    const slotAssignments: SlotAssignment[] = Object.entries(assignments).map(([slotId, puzzle]) => ({
      slotId,
      puzzle,
    }));

    const result = validateAnswer(challenge, slotAssignments);
    const currentHints = hintCount;
    const slotIdMap: Record<string, string> = {};
    Object.entries(assignments).forEach(([slotId, puzzle]) => {
      slotIdMap[slotId] = puzzle.id;
    });

    const submitAttempt = sessionId
      ? apiPost<{ isCorrect: boolean; serverScore: number }>('/api/sessions/attempt', {
        sessionId,
        challengeId: challenge.id,
        slotAssignments: slotIdMap,
        timeTakenMs: Math.max(0, Math.round(performance.now() - challengeStartRef.current.ts)),
        attemptCount: count,
        hintsUsed: currentHints,
      })
      : Promise.resolve(null);

    if (result.isCorrect) {
      let score = Math.max(20, 100 - (count - 1) * 10 - currentHints * 15);
      try {
        const serverResult = await submitAttempt;
        if (serverResult) {
          if (!serverResult.isCorrect) {
            setFeedback({ type: 'incorrect', errors: ['Server 驗證未通過，請重新檢查拼圖配對'], mql: mqlPreview });
            return;
          }
          score = serverResult.serverScore;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '成績驗證失敗，請確認 server 連線後重試。';
        setServerSyncError(message);
        setFeedback({ type: 'incorrect', errors: [message], mql: mqlPreview });
        return;
      }
      setServerSyncError('');
      setCompletedScores(prev => ({ ...prev, [challenge.id]: score }));
      setFeedback({ type: 'correct', score, mql: mqlPreview });
    } else {
      const errors = [
        ...result.slotErrors,
        ...result.structureErrors,
        ...result.semanticErrors,
      ];
      setFeedback({ type: 'incorrect', errors, mql: mqlPreview });
      try {
        await submitAttempt;
        setServerSyncError('');
      } catch (error) {
        setServerSyncError(error instanceof Error ? error.message : '成績驗證失敗，請確認 server 連線後重試。');
      }
    }
  };

  const handleClear = () => {
    setAssignments({});
    setSelectedPuzzle(null);
    setFeedback(null);
  };

  const handleHint = () => {
    setShowHint(true);
    if (!hintUsed) {
      setHintUsed(true);
      setHintCount(prev => prev + 1);
    }
  };

  const handleNext = () => {
    if (serverSyncError) return;
    if (currentIndex < challenges.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setAssignments({});
      setSelectedPuzzle(null);
      setFeedback(null);
      setHintUsed(false);
      setAttemptCount(0);
      setShowHint(false);
      challengeStartRef.current = { ts: performance.now() };
    } else {
      if (sessionId) {
        setSubmittingToLeaderboard(true);
      } else {
        onFinish();
      }
    }
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setAssignments({});
    setSelectedPuzzle(null);
    setFeedback(null);
    setHintUsed(false);
    setAttemptCount(0);
    setCompletedScores({});
    setShowHint(false);
    challengeStartRef.current = { ts: performance.now() };
    setShowResetConfirm(false);
  };

  const handleSubmitLeaderboard = async (submit: boolean) => {
    if (sessionId) {
      try {
        await apiPost('/api/sessions/complete', { sessionId, submitToLeaderboard: submit });
      } catch (error) {
        setServerSyncError(error instanceof Error ? error.message : '無法完成遊戲，請確認 server 連線後重試。');
        setSubmittingToLeaderboard(false);
        return;
      }
    }
    setSubmittingToLeaderboard(false);
    onFinish();
  };

  const totalScore = Object.values(completedScores).reduce((a, b) => a + b, 0);
  const isLastChallenge = currentIndex === challenges.length - 1;

  if (loadingChallengeBank) {
    return (
      <div className={styles.loading} role="status">
        載入題庫中...
      </div>
    );
  }

  return (
    <GameDndWrapper challenge={challenge} setAssignments={setAssignments}>
      <div className={styles.page}>
        <ChallengeHeader
          challenge={challenge}
          currentIndex={currentIndex}
          totalChallenges={challenges.length}
          totalScore={totalScore}
          onBack={onBack}
          onReset={() => setShowResetConfirm(true)}
          playerName={user.name}
        />

        <main className={styles.main}>
          <div className={styles.sqlSection}>
            <SqlPanel challenge={challenge} />
          </div>

          <section className={`card ${styles.workspace}`} aria-labelledby="mql-workspace-title">
            <header className={styles.workspaceHeader}>
              <p>SQL to MongoDB Query Language</p>
              <h2 id="mql-workspace-title">MQL 組裝台</h2>
            </header>
            <div className={styles.workspaceGrid}>
              <div className={styles.answerSection}>
                <AnswerSlots
                  challenge={challenge}
                  assignments={assignments}
                  selectedPuzzle={selectedPuzzle}
                  feedback={feedback}
                  onSlotClick={handleSlotClick}
                  embedded
                />
              </div>
              <div className={styles.puzzleSection}>
                <PuzzleBank
                  challenge={challenge}
                  assignments={assignments}
                  selectedPuzzle={selectedPuzzle}
                  onPuzzleClick={handlePuzzleClick}
                  embedded
                />
              </div>
            </div>
            <div className={styles.previewSection}>
              <MqlPreview
                preview={mqlPreview}
                collection={challenge.collection}
                embedded
              />
            </div>
          </section>

          <div className={styles.controlsSection}>
            <div className={styles.actions}>
              <button
                className="btn btn-primary"
                onClick={handleCheck}
                disabled={!!feedback && feedback.type === 'correct'}
              >
                檢查答案
              </button>
              <button className="btn btn-secondary" onClick={handleHint}>
                提示 {hintCount > 0 && `(${hintCount})`}
              </button>
              <button className="btn btn-ghost" onClick={handleClear}>
                清除
              </button>
            </div>

            {showHint && (
              <div className={styles.hintBox} role="note">
                <strong>提示：</strong> {challenge.hint}
              </div>
            )}

            <FeedbackPanel
              feedback={feedback}
              challenge={challenge}
              attemptCount={attemptCount}
              onNext={handleNext}
              isLastChallenge={isLastChallenge}
            />
          </div>
        </main>

        {showResetConfirm && (
          <ConfirmDialog
            title="確定重設進度？"
            message="這將清除所有關卡進度和分數，無法復原。"
            confirmLabel="確定重設"
            cancelLabel="取消"
            confirmVariant="danger"
            onConfirm={handleReset}
            onCancel={() => setShowResetConfirm(false)}
          />
        )}

        {submittingToLeaderboard && (
          <div className={styles.overlay} role="dialog" aria-modal="true">
            <div className={styles.completeCard}>
              <h2>🎉 恭喜完成所有關卡！</h2>
              <p>總分：<strong>{totalScore}</strong> 分</p>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                是否要把本次成績提交到全站排行榜？
              </p>
              <div className={styles.completeActions}>
                <button className="btn btn-primary" onClick={() => handleSubmitLeaderboard(true)}>
                  提交排行榜
                </button>
                <button className="btn btn-ghost" onClick={() => handleSubmitLeaderboard(false)}>
                  不用了，繼續
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </GameDndWrapper>
  );
}
