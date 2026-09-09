/**
 * Safe, allowlisted in-memory evaluator for MongoDB MQL puzzle validation.
 *
 * SECURITY:
 * - No eval(), Function(), or dynamic JS execution.
 * - Only supports the operators explicitly listed below.
 * - Does NOT connect to MongoDB; operates on in-memory sampleDocuments.
 */

import type {
  MongoFilter,
  MongoUpdate,
  MongoPipelineStage,
  FindAnswer,
  InsertAnswer,
  UpdateAnswer,
  DeleteAnswer,
  AggregateAnswer,
  ExpectedAnswer,
} from './types.js';

// ─── Allowed operators ────────────────────────────────────────────────────

const ALLOWED_COMPARISON_OPS = new Set(['$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$ne', '$eq']);
const ALLOWED_LOGICAL_OPS = new Set(['$and', '$or', '$nor', '$not']);
const ALLOWED_UPDATE_OPS = new Set(['$set', '$inc', '$push', '$unset']);
const ALLOWED_PIPELINE_STAGES = new Set(['$match', '$group', '$sort', '$project', '$limit']);

// ─── Filter evaluation ────────────────────────────────────────────────────

function getNestedValue(doc: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = doc;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateComparison(docVal: unknown, op: string, filterVal: unknown): boolean {
  if (!ALLOWED_COMPARISON_OPS.has(op)) {
    throw new Error(`Operator ${op} is not allowed`);
  }
  switch (op) {
    case '$gt': return typeof docVal === 'number' && typeof filterVal === 'number' && docVal > filterVal;
    case '$gte': return typeof docVal === 'number' && typeof filterVal === 'number' && docVal >= filterVal;
    case '$lt': return typeof docVal === 'number' && typeof filterVal === 'number' && docVal < filterVal;
    case '$lte': return typeof docVal === 'number' && typeof filterVal === 'number' && docVal <= filterVal;
    case '$in': return Array.isArray(filterVal) && filterVal.some(v => deepEqual(docVal, v));
    case '$nin': return Array.isArray(filterVal) && !filterVal.some(v => deepEqual(docVal, v));
    case '$ne': return !deepEqual(docVal, filterVal);
    case '$eq': return deepEqual(docVal, filterVal);
    default: return false;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(k => deepEqual(aObj[k], bObj[k]));
  }
  return false;
}

export function matchesFilter(doc: Record<string, unknown>, filter: MongoFilter): boolean {
  for (const [key, filterVal] of Object.entries(filter)) {
    // Logical operators
    if (ALLOWED_LOGICAL_OPS.has(key)) {
      if (!ALLOWED_LOGICAL_OPS.has(key)) throw new Error(`Logical operator ${key} is not allowed`);
      if (key === '$and') {
        if (!Array.isArray(filterVal)) return false;
        if (!filterVal.every(f => matchesFilter(doc, f as MongoFilter))) return false;
        continue;
      }
      if (key === '$or') {
        if (!Array.isArray(filterVal)) return false;
        if (!filterVal.some(f => matchesFilter(doc, f as MongoFilter))) return false;
        continue;
      }
      if (key === '$nor') {
        if (!Array.isArray(filterVal)) return false;
        if (filterVal.some(f => matchesFilter(doc, f as MongoFilter))) return false;
        continue;
      }
      continue;
    }

    const docVal = getNestedValue(doc, key);

    if (filterVal !== null && typeof filterVal === 'object' && !Array.isArray(filterVal)) {
      // Comparison operators
      const ops = filterVal as Record<string, unknown>;
      for (const [op, opVal] of Object.entries(ops)) {
        if (!ALLOWED_COMPARISON_OPS.has(op)) {
          throw new Error(`Operator ${op} is not in the allowlist`);
        }
        if (!evaluateComparison(docVal, op, opVal)) return false;
      }
    } else {
      // Equality
      if (!deepEqual(docVal, filterVal)) return false;
    }
  }
  return true;
}

// ─── Projection ───────────────────────────────────────────────────────────

function applyProjection(
  doc: Record<string, unknown>,
  projection: Record<string, 0 | 1>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keys = Object.keys(projection);
  const isInclusion = keys.some(k => k !== '_id' && projection[k] === 1);

  if (isInclusion) {
    // Always include _id unless explicitly excluded
    if (projection['_id'] !== 0) result['_id'] = doc['_id'];
    for (const k of keys) {
      if (projection[k] === 1) result[k] = doc[k];
    }
  } else {
    // Exclusion
    for (const [k, v] of Object.entries(doc)) {
      if (projection[k] !== 0) result[k] = v;
    }
  }
  return result;
}

// ─── Sort ─────────────────────────────────────────────────────────────────

function applySort(
  docs: Record<string, unknown>[],
  sort: Record<string, 1 | -1>,
): Record<string, unknown>[] {
  const entries = Object.entries(sort);
  return [...docs].sort((a, b) => {
    for (const [field, dir] of entries) {
      const av = getNestedValue(a, field);
      const bv = getNestedValue(b, field);
      if (av === bv) continue;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      const cmp = (av as string | number) < (bv as string | number) ? -1 : 1;
      return cmp * dir;
    }
    return 0;
  });
}

// ─── FIND ─────────────────────────────────────────────────────────────────

export function executeFindInMemory(
  docs: Record<string, unknown>[],
  answer: FindAnswer,
): Record<string, unknown>[] {
  let result = docs.filter(d => matchesFilter(d, answer.filter));
  if (answer.sort) result = applySort(result, answer.sort);
  if (answer.limit !== undefined) result = result.slice(0, answer.limit);
  if (answer.projection) result = result.map(d => applyProjection(d, answer.projection!));
  return result;
}

// ─── INSERT ───────────────────────────────────────────────────────────────

export function executeInsertInMemory(
  docs: Record<string, unknown>[],
  answer: InsertAnswer,
): Record<string, unknown>[] {
  return [...docs, { ...answer.document, _id: `__new_${Date.now()}` }];
}

// ─── UPDATE ───────────────────────────────────────────────────────────────

function applyUpdate(doc: Record<string, unknown>, update: MongoUpdate): Record<string, unknown> {
  const result = { ...doc };

  if (update.$set) {
    for (const [k, v] of Object.entries(update.$set)) {
      result[k] = v;
    }
  }

  if (update.$inc) {
    for (const [k, v] of Object.entries(update.$inc)) {
      const current = typeof result[k] === 'number' ? result[k] as number : 0;
      result[k] = current + v;
    }
  }

  if (update.$push) {
    for (const [k, v] of Object.entries(update.$push)) {
      const arr = Array.isArray(result[k]) ? [...result[k] as unknown[]] : [];
      arr.push(v);
      result[k] = arr;
    }
  }

  return result;
}

export function executeUpdateInMemory(
  docs: Record<string, unknown>[],
  answer: UpdateAnswer,
): Record<string, unknown>[] {
  let updated = false;
  return docs.map(d => {
    if (!matchesFilter(d, answer.filter)) return d;
    if (!answer.multi && updated) return d;
    updated = true;
    return applyUpdate(d, answer.update);
  });
}

// ─── DELETE ───────────────────────────────────────────────────────────────

export function executeDeleteInMemory(
  docs: Record<string, unknown>[],
  answer: DeleteAnswer,
): Record<string, unknown>[] {
  // Security: disallow deleteMany with empty filter
  if (answer.multi && Object.keys(answer.filter).length === 0) {
    throw new Error('deleteMany with empty filter is not allowed');
  }

  let deleted = false;
  return docs.filter(d => {
    if (!matchesFilter(d, answer.filter)) return true;
    if (!answer.multi && deleted) return true;
    deleted = true;
    return false;
  });
}

// ─── AGGREGATE ───────────────────────────────────────────────────────────

function executeMatch(docs: Record<string, unknown>[], filter: MongoFilter) {
  return docs.filter(d => matchesFilter(d, filter));
}

function executeGroup(
  docs: Record<string, unknown>[],
  groupSpec: Record<string, unknown>,
): Record<string, unknown>[] {
  const { _id: groupBy, ...accumulators } = groupSpec;
  const groups = new Map<string, { docs: Record<string, unknown>[]; keyVal: unknown }>();

  for (const doc of docs) {
    let keyVal: unknown;
    if (typeof groupBy === 'string' && groupBy.startsWith('$')) {
      keyVal = getNestedValue(doc, groupBy.slice(1));
    } else {
      keyVal = groupBy;
    }
    const keyStr = JSON.stringify(keyVal);
    if (!groups.has(keyStr)) groups.set(keyStr, { docs: [], keyVal });
    groups.get(keyStr)!.docs.push(doc);
  }

  const result: Record<string, unknown>[] = [];
  for (const { docs: groupDocs, keyVal } of groups.values()) {
    const out: Record<string, unknown> = { _id: keyVal };

    for (const [field, accSpec] of Object.entries(accumulators)) {
      if (accSpec !== null && typeof accSpec === 'object') {
        const acc = accSpec as Record<string, unknown>;
        if ('$sum' in acc) {
          const sumVal = acc['$sum'];
          if (typeof sumVal === 'number') {
            out[field] = groupDocs.length * sumVal;
          } else if (typeof sumVal === 'string' && sumVal.startsWith('$')) {
            const fieldName = sumVal.slice(1);
            out[field] = groupDocs.reduce((s, d) => {
              const v = getNestedValue(d, fieldName);
              return s + (typeof v === 'number' ? v : 0);
            }, 0);
          } else {
            out[field] = 0;
          }
        } else if ('$avg' in acc) {
          const avgField = acc['$avg'];
          if (typeof avgField === 'string' && avgField.startsWith('$')) {
            const fieldName = avgField.slice(1);
            const nums = groupDocs.map(d => getNestedValue(d, fieldName)).filter(v => typeof v === 'number') as number[];
            out[field] = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
          }
        } else if ('$first' in acc) {
          const firstField = acc['$first'];
          if (typeof firstField === 'string' && firstField.startsWith('$')) {
            out[field] = groupDocs.length > 0 ? getNestedValue(groupDocs[0], firstField.slice(1)) : null;
          }
        }
      }
    }

    result.push(out);
  }
  return result;
}

function executePipelineStage(
  docs: Record<string, unknown>[],
  stage: MongoPipelineStage,
): Record<string, unknown>[] {
  const stageKey = Object.keys(stage)[0];
  if (!ALLOWED_PIPELINE_STAGES.has(stageKey)) {
    throw new Error(`Pipeline stage ${stageKey} is not allowed`);
  }

  if ('$match' in stage) return executeMatch(docs, stage.$match);
  if ('$group' in stage) return executeGroup(docs, stage.$group as Record<string, unknown>);
  if ('$sort' in stage) return applySort(docs, stage.$sort);
  if ('$limit' in stage) return docs.slice(0, stage.$limit);
  if ('$project' in stage) {
    const proj = stage.$project as Record<string, 0 | 1>;
    return docs.map(d => applyProjection(d, proj));
  }

  return docs;
}

export function executeAggregateInMemory(
  docs: Record<string, unknown>[],
  answer: AggregateAnswer,
): Record<string, unknown>[] {
  let result = [...docs];
  for (const stage of answer.pipeline) {
    result = executePipelineStage(result, stage);
  }
  return result;
}

// ─── Unified executor ─────────────────────────────────────────────────────

export function executeInMemory(
  docs: Record<string, unknown>[],
  answer: ExpectedAnswer,
): Record<string, unknown>[] {
  switch (answer.type) {
    case 'FIND':      return executeFindInMemory(docs, answer);
    case 'INSERT':    return executeInsertInMemory(docs, answer);
    case 'UPDATE':    return executeUpdateInMemory(docs, answer);
    case 'DELETE':    return executeDeleteInMemory(docs, answer);
    case 'AGGREGATE': return executeAggregateInMemory(docs, answer);
  }
}
