/**
 * Three-layer puzzle answer validator:
 * 1. Slot-type validation: are puzzles placed in compatible slots?
 * 2. Structural validation: are required operators/fields present?
 * 3. Semantic validation: does executing the answer on sample data match expected output?
 */

import type { Challenge, Puzzle, Slot, ExpectedAnswer } from './types.js';
import { executeInMemory, matchesFilter } from './evaluator.js';

export interface SlotAssignment {
  slotId: string;
  puzzle: Puzzle;
}

export interface ValidationResult {
  isCorrect: boolean;
  slotErrors: string[];
  structureErrors: string[];
  semanticErrors: string[];
  explanation: string;
}

// ─── Layer 1: Slot type validation ────────────────────────────────────────

export function validateSlotTypes(
  slots: Slot[],
  assignments: SlotAssignment[],
): string[] {
  const errors: string[] = [];
  for (const { slotId, puzzle } of assignments) {
    const slot = slots.find(s => s.id === slotId);
    if (!slot) {
      errors.push(`找不到 slot: ${slotId}`);
      continue;
    }
    if (!slot.accepts.includes(puzzle.kind)) {
      errors.push(
        `「${puzzle.label}」（${puzzle.kind}）不能放入「${slot.label}」（接受：${slot.accepts.join(', ')}）`
      );
    }
  }

  // Check required slots
  for (const slot of slots) {
    if (slot.required && !assignments.some(a => a.slotId === slot.id)) {
      errors.push(`必填的 slot「${slot.label}」尚未填入`);
    }
  }

  return errors;
}

// ─── Layer 2: Structural validation ──────────────────────────────────────

function structuralEqual(got: unknown, expected: unknown): boolean {
  if (expected === null || expected === undefined) return true; // wildcard
  if (typeof expected === 'string' && expected === '*') return true;
  if (Array.isArray(expected) && Array.isArray(got)) {
    if (expected.length !== got.length) return false;
    return expected.every((e, i) => structuralEqual((got as unknown[])[i], e));
  }
  if (typeof expected === 'object' && typeof got === 'object' && got !== null) {
    for (const [k, v] of Object.entries(expected as Record<string, unknown>)) {
      if (!structuralEqual((got as Record<string, unknown>)[k], v)) return false;
    }
    return true;
  }
  return expected === got;
}

export function validateStructure(
  builtAnswer: ExpectedAnswer,
  challenge: Challenge,
): string[] {
  const errors: string[] = [];
  const expected = challenge.expected;

  if (builtAnswer.type !== expected.type) {
    errors.push(`指令類型錯誤：期望 ${expected.type}，得到 ${builtAnswer.type}`);
    return errors;
  }

  // Type-specific structural checks
  if (expected.type === 'FIND' && builtAnswer.type === 'FIND') {
    if (expected.sort && !builtAnswer.sort) errors.push('缺少 sort 排序');
    if (expected.limit !== undefined && builtAnswer.limit !== expected.limit) {
      errors.push(`limit 值錯誤：期望 ${expected.limit}，得到 ${builtAnswer.limit ?? '未設定'}`);
    }
    if (expected.projection && !builtAnswer.projection) errors.push('缺少 projection 欄位篩選');
  }

  if (expected.type === 'UPDATE' && builtAnswer.type === 'UPDATE') {
    const expUp = expected.update;
    const gotUp = builtAnswer.update;
    if (expUp.$inc && !gotUp.$inc) errors.push('應使用 $inc 而非 $set 來更新數字');
    if (expUp.$set && !gotUp.$set) errors.push('缺少 $set 更新操作');
    if (expUp.$push && !gotUp.$push) errors.push('缺少 $push 操作');
    if (expected.multi && !builtAnswer.multi) errors.push('應使用 updateMany 而非 updateOne');
  }

  if (expected.type === 'AGGREGATE' && builtAnswer.type === 'AGGREGATE') {
    const expPipeline = expected.pipeline;
    const gotPipeline = builtAnswer.pipeline;
    if (expPipeline.length !== gotPipeline.length) {
      errors.push(`Pipeline 階段數量錯誤：期望 ${expPipeline.length}，得到 ${gotPipeline.length}`);
    } else {
      expPipeline.forEach((stage, i) => {
        const expStageKey = Object.keys(stage)[0];
        const gotStageKey = gotPipeline[i] ? Object.keys(gotPipeline[i])[0] : '(缺少)';
        if (expStageKey !== gotStageKey) {
          errors.push(`Pipeline 第 ${i + 1} 階段：期望 ${expStageKey}，得到 ${gotStageKey}`);
        }
      });
    }
  }

  if (expected.type === 'DELETE' && builtAnswer.type === 'DELETE') {
    if (expected.multi !== builtAnswer.multi) {
      errors.push(expected.multi ? '應使用 deleteMany' : '應使用 deleteOne');
    }
    if (Object.keys(builtAnswer.filter).length === 0 && builtAnswer.multi) {
      errors.push('deleteMany 不能使用空的 filter（危險操作）');
    }
  }

  // Structural check on filter/update via structuralEqual
  if (!structuralEqual(builtAnswer, expected)) {
    // Only add if no other more specific errors
    if (errors.length === 0) {
      errors.push('答案結構與預期不符，請檢查所有條件');
    }
  }

  return errors;
}

// ─── Layer 3: Semantic validation ─────────────────────────────────────────

export function validateSemantics(
  builtAnswer: ExpectedAnswer,
  challenge: Challenge,
): string[] {
  const errors: string[] = [];
  const docs = challenge.sampleDocuments as Record<string, unknown>[];

  try {
    const gotResult = executeInMemory(docs, builtAnswer);
    const expResult = executeInMemory(docs, challenge.expected);

    const gotJson = JSON.stringify(gotResult);
    const expJson = JSON.stringify(expResult);

    if (gotJson !== expJson) {
      errors.push(
        `執行結果與預期不符。` +
        `\n期望：${expJson.slice(0, 200)}` +
        `\n得到：${gotJson.slice(0, 200)}`
      );
    }
  } catch (e) {
    errors.push(`驗證時發生錯誤：${(e as Error).message}`);
  }

  return errors;
}

// ─── Main validator ───────────────────────────────────────────────────────

export function validateAnswer(
  challenge: Challenge,
  slotAssignments: SlotAssignment[],
): ValidationResult {
  const slotErrors = validateSlotTypes(challenge.slots, slotAssignments);
  if (slotErrors.length > 0) {
    return {
      isCorrect: false,
      slotErrors,
      structureErrors: [],
      semanticErrors: [],
      explanation: `Slot 類型錯誤，請先修正拼圖位置。`,
    };
  }

  const answerErrors: string[] = [];
  for (const slot of challenge.slots) {
    if (!slot.required) continue;
    const expectedPuzzleId = challenge.answerKey[slot.id];
    const assignment = slotAssignments.find((item) => item.slotId === slot.id);
    if (!expectedPuzzleId) {
      answerErrors.push(`題目缺少「${slot.label}」的答案鍵`);
      continue;
    }
    if (assignment?.puzzle.id !== expectedPuzzleId) {
      answerErrors.push(`「${slot.label}」放入的拼圖不正確`);
    }
  }
  for (const slotId of Object.keys(challenge.answerKey)) {
    const slot = challenge.slots.find((item) => item.id === slotId);
    if (!slot?.required) answerErrors.push(`答案鍵包含無效 slot: ${slotId}`);
  }

  if (answerErrors.length > 0) {
    return {
      isCorrect: false,
      slotErrors: [],
      structureErrors: answerErrors,
      semanticErrors: [],
      explanation: `拼圖不正確：${answerErrors[0]}`,
    };
  }

  return {
    isCorrect: true,
    slotErrors: [],
    structureErrors: [],
    semanticErrors: [],
    explanation: '答案正確！',
  };
}

// ─── Score calculator ─────────────────────────────────────────────────────

export function calculateScore(
  attemptCount: number,
  hintsUsed: number,
  baseScore = 100,
  wrongPenalty = 10,
  hintPenalty = 15,
  minScore = 20,
): number {
  const wrongAttempts = Math.max(0, attemptCount - 1);
  const score = baseScore - wrongAttempts * wrongPenalty - hintsUsed * hintPenalty;
  return Math.max(minScore, score);
}
