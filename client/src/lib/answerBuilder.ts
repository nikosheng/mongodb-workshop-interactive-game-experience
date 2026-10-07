/**
 * Converts slot assignments (slotId -> puzzle) into a structured ExpectedAnswer AST.
 * This is used for real-time MQL preview and client-side validation feedback.
 * The server re-validates independently; this result is NOT trusted for scoring.
 */
import type { Challenge, ExpectedAnswer, Puzzle } from '@query-quest/shared';

export interface SlotAssignmentMap {
  [slotId: string]: Puzzle;
}

export function buildAnswer(
  challenge: Challenge,
  assignments: SlotAssignmentMap,
): ExpectedAnswer | null {
  const getPuzzle = (slotId: string): Puzzle | undefined => assignments[slotId];

  try {
    switch (challenge.type) {
      case 'FIND': {
        const filter = (getPuzzle('s_filter')?.value ?? {}) as Record<string, unknown>;
        const projection = getPuzzle('s_proj')?.value as Record<string, 0 | 1> | undefined;
        const sort = getPuzzle('s_sort')?.value as Record<string, 1 | -1> | undefined;
        const limitPuzzle = getPuzzle('s_limit');
        const limit = limitPuzzle ? (limitPuzzle.value as number) : undefined;
        return {
          type: 'FIND',
          collection: challenge.collection,
          filter,
          ...(projection ? { projection } : {}),
          ...(sort ? { sort } : {}),
          ...(limit !== undefined ? { limit } : {}),
        };
      }

      case 'INSERT': {
        const doc = (getPuzzle('s_doc')?.value ?? {}) as Record<string, unknown>;
        return {
          type: 'INSERT',
          collection: challenge.collection,
          document: doc,
        };
      }

      case 'UPDATE': {
        const cmdPuzzle = getPuzzle('s_cmd');
        const isMulti = cmdPuzzle?.value === 'updateMany';
        const filter = (getPuzzle('s_filter')?.value ?? {}) as Record<string, unknown>;
        const update = (getPuzzle('s_update')?.value ?? {}) as Record<string, unknown>;
        const options = getPuzzle('s_options')?.value as { upsert?: boolean } | undefined;
        return {
          type: 'UPDATE',
          collection: challenge.collection,
          filter,
          update: update as { $set?: Record<string, unknown>; $inc?: Record<string, number>; $push?: Record<string, unknown> },
          multi: isMulti,
          ...(options?.upsert !== undefined ? { upsert: options.upsert } : {}),
        };
      }

      case 'DELETE': {
        const cmdPuzzle = getPuzzle('s_cmd');
        const isMulti = cmdPuzzle?.value === 'deleteMany';
        const filter = (getPuzzle('s_filter')?.value ?? {}) as Record<string, unknown>;
        return {
          type: 'DELETE',
          collection: challenge.collection,
          filter,
          multi: isMulti,
        };
      }

      case 'AGGREGATE': {
        const stage1 = getPuzzle('s_stage1')?.value;
        const stage2 = getPuzzle('s_stage2')?.value;
        const stage3 = getPuzzle('s_stage3')?.value;
        const pipeline = [stage1, stage2, stage3]
          .filter(Boolean)
          .map(s => s as import('@query-quest/shared').MongoPipelineStage);
        return {
          type: 'AGGREGATE',
          collection: challenge.collection,
          pipeline,
        };
      }

      // Schema design challenges are validated purely by answerKey matching
      // (see shared/src/validator.ts); there is no MQL AST to build.
      case 'SCHEMA_PATTERN':
      case 'SCHEMA_ANTIPATTERN':
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Build a formatted MQL string for display (preview).
 * This is purely cosmetic; it does NOT execute any code.
 */
export function buildMqlPreview(
  challenge: Challenge,
  assignments: SlotAssignmentMap,
): string {
  const getPuzzle = (slotId: string): Puzzle | undefined => assignments[slotId];
  const fmt = (val: unknown): string => JSON.stringify(val, null, 2);

  try {
    switch (challenge.type) {
      case 'FIND': {
        const filter = getPuzzle('s_filter');
        const proj = getPuzzle('s_proj');
        const sort = getPuzzle('s_sort');
        const limit = getPuzzle('s_limit');
        const cmd = getPuzzle('s_cmd');
        if (!cmd) return `db.${challenge.collection}.__`;
        const args = [filter ? fmt(filter.value) : '__'];
        if (proj) args.push(fmt(proj.value));
        let mql = `db.${challenge.collection}.${cmd.label}(\n  ${args.join(',\n  ')}\n)`;
        if (sort) mql += `.sort(${fmt(sort.value)})`;
        if (limit) mql += `.limit(${limit.value})`;
        return mql;
      }

      case 'INSERT': {
        const cmd = getPuzzle('s_cmd');
        const doc = getPuzzle('s_doc');
        if (!cmd) return `db.${challenge.collection}.__`;
        return `db.${challenge.collection}.${cmd.label}(\n  ${doc ? fmt(doc.value) : '__'}\n)`;
      }

      case 'UPDATE': {
        const cmd = getPuzzle('s_cmd');
        const filter = getPuzzle('s_filter');
        const update = getPuzzle('s_update');
        const options = getPuzzle('s_options');
        if (!cmd) return `db.${challenge.collection}.__`;
        return `db.${challenge.collection}.${cmd.label}(\n  ${filter ? fmt(filter.value) : '__'},\n  ${update ? fmt(update.value) : '__'}${options ? `,\n  ${fmt(options.value)}` : ''}\n)`;
      }

      case 'DELETE': {
        const cmd = getPuzzle('s_cmd');
        const filter = getPuzzle('s_filter');
        if (!cmd) return `db.${challenge.collection}.__`;
        return `db.${challenge.collection}.${cmd.label}(\n  ${filter ? fmt(filter.value) : '__'}\n)`;
      }

      case 'AGGREGATE': {
        const cmd = getPuzzle('s_cmd');
        const stages = ['s_stage1', 's_stage2', 's_stage3']
          .map(id => getPuzzle(id))
          .filter(Boolean);
        if (!cmd) return `db.${challenge.collection}.__`;
        const stageStr = stages.length
          ? stages.map(s => `  ${fmt(s!.value)}`).join(',\n')
          : '  __';
        return `db.${challenge.collection}.${cmd.label}([\n${stageStr}\n])`;
      }

      case 'SCHEMA_PATTERN':
      case 'SCHEMA_ANTIPATTERN':
      default:
        return '';
    }
  } catch {
    return `db.${challenge.collection}.__`;
  }
}
