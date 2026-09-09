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

export function GamePage({ user, mode, roomCode: _roomCode, onFinish, onBack }: Props) {
  const [challenges, setChallenges] = useState<Challenge[]>(defaultChallenges);
  const [loadingChallengeBank, setLoadingChallengeBank] = useState(true);

  // Load saved progress synchronously as initial state
  const savedProgress = (() => {
    try {
      const raw = localStorage.getItem('gameProgress');
      if (!raw) return null;
      return JSON.parse(raw) as { currentIndex: number; scores: Record<string, number> };
    } catch { return null; }
  })();

  const [currentIndex, setCurrentIndex] = useState(
    savedProgress ? Math.min(savedProgress.currentIndex, defaultChallenges.length - 1) : 0
  );
  const [assignments, setAssignments] = useState<SlotAssignmentMap>({});
  const [selectedPuzzle, setSelectedPuzzle] = useState<Puzzle | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [hintCount, setHintCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [completedScores, setCompletedScores] = useState<Record<string, number>>(
    savedProgress?.scores ?? {}
  );
  const [submittingToLeaderboard, setSubmittingToLeaderboard] = useState(false);
  // Use a mutable ref container to avoid the impure Date.now() warning
  const challengeStartRef = useRef({ ts: GAME_START_TIME });

  const challenge = challenges[currentIndex]!;

  // Save progress
  useEffect(() => {
    localStorage.setItem('gameProgress', JSON.stringify({
      currentIndex,
      scores: completedScores,
    }));
  }, [currentIndex, completedScores]);

  useEffect(() => {
    if (mode === 'solo') {
      apiPost<{ sessionId: string }>('/api/sessions', {})
        .then(r => setSessionId(r.sessionId))
        .catch(() => { /* offline mode */ });
    }
  }, [mode]);

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
    const count = attemptCount + 1;
    setAttemptCount(count);

    const slotAssignments: SlotAssignment[] = Object.entries(assignments).map(([slotId, puzzle]) => ({
      slotId,
      puzzle,
    }));

    const result = validateAnswer(challenge, slotAssignments);
    const currentHints = hintCount;

    if (result.isCorrect) {
      const score = Math.max(20, 100 - (count - 1) * 10 - currentHints * 15);
      setCompletedScores(prev => ({ ...prev, [challenge.id]: score }));
      setFeedback({ type: 'correct', score, mql: mqlPreview });

      if (sessionId) {
        const slotIdMap: Record<string, string> = {};
        Object.entries(assignments).forEach(([slotId, puzzle]) => {
          slotIdMap[slotId] = puzzle.id;
        });
        await apiPost('/api/sessions/attempt', {
          sessionId,
          challengeId: challenge.id,
          slotAssignments: slotIdMap,
          timeTakenMs: performance.now() - challengeStartRef.current.ts,
          attemptCount: count,
          hintsUsed: currentHints,
        }).catch(() => { /* offline */ });
      }
    } else {
      const errors = [
        ...result.slotErrors,
        ...result.structureErrors,
        ...result.semanticErrors,
      ];
      setFeedback({ type: 'incorrect', errors, mql: mqlPreview });
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
      if (sessionId && mode === 'solo') {
        setSubmittingToLeaderboard(true);
      } else {
        onFinish();
      }
    }
  };

  const handleReset = () => {
    localStorage.removeItem('gameProgress');
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
      await apiPost('/api/sessions/complete', { sessionId, submitToLeaderboard: submit })
        .catch(() => { /* offline */ });
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
