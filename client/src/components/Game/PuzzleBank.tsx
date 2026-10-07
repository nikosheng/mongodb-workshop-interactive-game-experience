import type { Challenge, Puzzle } from '@query-quest/shared';
import { isSchemaDesignChallengeType } from '@query-quest/shared';
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

  if (puzzle.kind === 'schema-option') {
    const value = puzzle.value as { summary?: string; snippet?: Record<string, unknown> } | undefined;
    return (
      <button
        ref={setNodeRef}
        style={style}
        className={`${cls} ${styles.schemaCard}`}
        onClick={onClick}
        aria-label={`候選設計：${puzzle.label}`}
        {...listeners}
        {...attributes}
      >
        <strong className={styles.schemaCardTitle}>{puzzle.label}</strong>
        {value?.summary && <span className={styles.schemaCardSummary}>{value.summary}</span>}
        {value?.snippet && (
          <span className={styles.schemaCardCode}>
            <span className={styles.schemaCardCodeLabel}>JSON</span>
            <code className={styles.schemaCardSnippet}>{JSON.stringify(value.snippet, null, 2)}</code>
          </span>
        )}
      </button>
    );
  }

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
  const isSchemaDesign = isSchemaDesignChallengeType(challenge.type);
  const content = (
    <>
      <h3 className={styles.title}>{isSchemaDesign ? '候選設計卡' : '拼圖庫'}</h3>
      <p className={styles.sub}>{isSchemaDesign ? '點選一張候選卡，再點擊右側插槽放入；桌面也可直接拖曳。' : '點選拼圖後，再點擊對應的 MQL 欄位放入；桌面也可直接拖曳。'}</p>
      <div className={`${styles.bank} ${isSchemaDesign ? styles.schemaBank : ''}`}>
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
