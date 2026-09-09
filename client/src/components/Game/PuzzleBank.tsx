import type { Challenge, Puzzle } from '@query-quest/shared';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import styles from './PuzzleBank.module.css';
import type { SlotAssignmentMap } from '../../lib/answerBuilder';

interface DraggablePuzzleProps {
  puzzle: Puzzle;
  isSelected: boolean;
  isUsed: boolean;
  onClick: () => void;
}

function DraggablePuzzle({ puzzle, isSelected, isUsed, onClick }: DraggablePuzzleProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: puzzle.id,
    data: { puzzle },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  const cls = [
    styles.piece,
    isSelected ? styles.selected : '',
    isUsed ? styles.used : '',
    isDragging ? styles.dragging : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={cls}
      onClick={onClick}
      aria-label={`拼圖：${puzzle.label}`}
      title={`種類：${puzzle.kind}`}
      {...listeners}
      {...attributes}
    >
      <code>{puzzle.label}</code>
      <span className={styles.kindBadge}>{puzzle.kind}</span>
    </button>
  );
}

interface Props {
  challenge: Challenge;
  assignments: SlotAssignmentMap;
  selectedPuzzle: Puzzle | null;
  onPuzzleClick: (puzzle: Puzzle) => void;
  embedded?: boolean;
}

export function PuzzleBank({ challenge, assignments, selectedPuzzle, onPuzzleClick, embedded = false }: Props) {
  const usedIds = new Set(Object.values(assignments).map(p => p.id));
  const content = (
    <>
      <h3 className={styles.title}>拼圖庫</h3>
      <p className={styles.sub}>選取拼圖後，點擊對應的 MQL 欄位放入；也可直接拖曳。</p>
      <div className={styles.bank}>
        {challenge.puzzles.map(puzzle => (
          <DraggablePuzzle
            key={puzzle.id}
            puzzle={puzzle}
            isSelected={selectedPuzzle?.id === puzzle.id}
            isUsed={usedIds.has(puzzle.id)}
            onClick={() => onPuzzleClick(puzzle)}
          />
        ))}
      </div>
    </>
  );

  return embedded ? content : <div className="card">{content}</div>;
}
