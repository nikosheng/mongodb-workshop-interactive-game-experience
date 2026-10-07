/**
 * Wraps GamePage content with DnDContext to handle drag-and-drop from PuzzleBank to AnswerSlots.
 */
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import type { Puzzle } from '@query-quest/shared';
import type { SlotAssignmentMap } from '../../lib/answerBuilder';
import type { Challenge } from '@query-quest/shared';

interface Props {
  challenge: Challenge;
  setAssignments: React.Dispatch<React.SetStateAction<SlotAssignmentMap>>;
  children: React.ReactNode;
}

export function GameDndWrapper({ challenge, setAssignments, children }: Props) {
  const isTouchDevice = typeof window !== 'undefined'
    && (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(
    ...(isTouchDevice ? [] : [pointerSensor, touchSensor]),
    keyboardSensor,
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const puzzle = active.data.current?.['puzzle'] as Puzzle | undefined;
    if (!puzzle) return;

    const slotId = over.id as string;
    const slot = challenge.slots.find(s => s.id === slotId);
    if (!slot) return;
    if (!slot.accepts.includes(puzzle.kind)) return;

    setAssignments(prev => ({ ...prev, [slotId]: puzzle }));
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {children}
    </DndContext>
  );
}
