import type { Challenge, Puzzle } from '@query-quest/shared';
import { isSchemaDesignChallengeType } from '@query-quest/shared';
import { useDroppable } from '@dnd-kit/core';
import styles from './AnswerSlots.module.css';
import type { SlotAssignmentMap } from '../../lib/answerBuilder';

interface FeedbackState {
  type: 'correct' | 'incorrect';
  errors?: string[];
  mql: string;
  score?: number;
}

interface Props {
  challenge: Challenge;
  assignments: SlotAssignmentMap;
  selectedPuzzle: Puzzle | null;
  feedback: FeedbackState | null;
  onSlotClick: (slotId: string) => void;
  embedded?: boolean;
}

function SlotItem({
  slot,
  puzzle,
  selectedPuzzle,
  feedback,
  onClick,
}: {
  slot: Challenge['slots'][number];
  puzzle: Puzzle | undefined;
  selectedPuzzle: Puzzle | null;
  feedback: FeedbackState | null;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: slot.id });

  const canAccept = selectedPuzzle ? slot.accepts.includes(selectedPuzzle.kind) : false;
  const isLocked = feedback?.type === 'correct';

  const cls = [
    styles.slot,
    puzzle ? styles.filled : styles.empty,
    isOver && canAccept ? styles.hovered : '',
    isOver && !canAccept ? styles.invalid : '',
    isLocked ? styles.locked : '',
    !puzzle && canAccept && selectedPuzzle ? styles.droppable : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.slotRow}>
      <span className={styles.slotLabel}>{slot.label}</span>
      <button
        ref={setNodeRef}
        className={cls}
        onClick={onClick}
        disabled={isLocked}
        aria-label={`${slot.label}：${puzzle ? puzzle.label : '（空）'}`}
        title={slot.hint}
      >
        {puzzle ? (
          <code className={styles.puzzleLabel}>{puzzle.label}</code>
        ) : (
          <span className={styles.placeholder}>
            {selectedPuzzle && canAccept ? '← 點擊放入' : '拖曳或點選拼圖放入'}
          </span>
        )}
        {!slot.required && <span className={styles.optional}>選填</span>}
      </button>
    </div>
  );
}

export function AnswerSlots({ challenge, assignments, selectedPuzzle, feedback, onSlotClick, embedded = false }: Props) {
  const content = (
    <>
      <h3 className={styles.title}>{isSchemaDesignChallengeType(challenge.type) ? '選出最佳設計' : '拼出你的 MQL'}</h3>
      <div className={styles.slots}>
        {challenge.slots.map(slot => (
          <SlotItem
            key={slot.id}
            slot={slot}
            puzzle={assignments[slot.id]}
            selectedPuzzle={selectedPuzzle}
            feedback={feedback}
            onClick={() => onSlotClick(slot.id)}
          />
        ))}
      </div>
    </>
  );

  return embedded ? content : (
    <div className="card">
      {content}
    </div>
  );
}
