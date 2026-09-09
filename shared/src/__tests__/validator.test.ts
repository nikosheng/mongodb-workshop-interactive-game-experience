import { describe, it, expect } from 'vitest';
import { validateSlotTypes, validateAnswer, calculateScore } from '../validator.js';
import type { Slot, Puzzle, Challenge } from '../types.js';

const mockSlots: Slot[] = [
  { id: 's1', label: 'Command', accepts: ['command'], required: true },
  { id: 's2', label: 'Filter', accepts: ['filter'], required: true },
  { id: 's3', label: 'Projection', accepts: ['projection'], required: false },
];

const puzzles: Puzzle[] = [
  { id: 'p1', label: 'find', kind: 'command', value: 'find' },
  { id: 'p2', label: '{ status: "paid" }', kind: 'filter', value: { status: 'paid' } },
  { id: 'p2_wrong', label: '{ status: "cancelled" }', kind: 'filter', value: { status: 'cancelled' }, isDistractor: true },
  { id: 'p3', label: '{ orderId: 1, total: 1 }', kind: 'projection', value: { orderId: 1, total: 1 } },
  { id: 'p_wrong', label: '$set', kind: 'update', value: '$set', isDistractor: true },
];

describe('validateSlotTypes', () => {
  it('passes when all slots have compatible puzzles', () => {
    const errors = validateSlotTypes(mockSlots, [
      { slotId: 's1', puzzle: puzzles[0]! },
      { slotId: 's2', puzzle: puzzles[1]! },
    ]);
    expect(errors).toHaveLength(0);
  });

  it('errors when wrong puzzle kind placed in slot', () => {
    const errors = validateSlotTypes(mockSlots, [
      { slotId: 's1', puzzle: puzzles[4]! }, // 'update' kind in 'command' slot
      { slotId: 's2', puzzle: puzzles[1]! },
    ]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('不能放入');
  });

  it('errors when required slot is missing', () => {
    const errors = validateSlotTypes(mockSlots, [
      { slotId: 's1', puzzle: puzzles[0]! },
      // s2 (required) missing
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('必填');
  });
});

const challengeBase: Challenge = {
  id: 'ch1',
  type: 'FIND',
  title: 'Test Challenge',
  difficulty: 'beginner',
  sql: "SELECT * FROM orders WHERE status = 'paid'",
  collection: 'orders',
  context: 'Test',
  schema: { status: 'string', total: 'number' },
  sampleDocuments: [
    { _id: '1', status: 'paid', total: 500 },
    { _id: '2', status: 'pending', total: 200 },
  ],
  slots: mockSlots,
  puzzles,
  answerKey: { s1: 'p1', s2: 'p2' },
  expected: {
    type: 'FIND',
    collection: 'orders',
    filter: { status: 'paid' },
  },
  concept: 'Test concept',
  hint: 'Test hint',
};

describe('validateAnswer', () => {
  it('returns isCorrect true for correct answer', () => {
    const result = validateAnswer(
      challengeBase,
      [
        { slotId: 's1', puzzle: puzzles[0]! },
        { slotId: 's2', puzzle: puzzles[1]! },
      ]
    );
    expect(result.isCorrect).toBe(true);
  });

  it('returns false for an incorrect puzzle ID', () => {
    const result = validateAnswer(
      challengeBase,
      [
        { slotId: 's1', puzzle: puzzles[0]! },
        { slotId: 's2', puzzle: puzzles[2]! },
      ]
    );
    expect(result.isCorrect).toBe(false);
    // Could fail at structure or semantic level - either counts
    const allErrors = [...result.slotErrors, ...result.structureErrors, ...result.semanticErrors];
    expect(allErrors.length).toBeGreaterThan(0);
  });

  it('returns false when wrong slot type used', () => {
    const result = validateAnswer(
      challengeBase,
      [
        { slotId: 's1', puzzle: puzzles[4]! }, // update in command slot
        { slotId: 's2', puzzle: puzzles[1]! },
      ]
    );
    expect(result.isCorrect).toBe(false);
    expect(result.slotErrors.length).toBeGreaterThan(0);
  });
});

describe('calculateScore', () => {
  it('returns 100 for first correct attempt, no hints', () => {
    expect(calculateScore(1, 0)).toBe(100);
  });

  it('deducts 10 per wrong attempt', () => {
    expect(calculateScore(3, 0)).toBe(80); // 2 wrong attempts
  });

  it('deducts 15 per hint', () => {
    expect(calculateScore(1, 2)).toBe(70);
  });

  it('never goes below minScore', () => {
    expect(calculateScore(20, 10)).toBe(20);
  });
});
