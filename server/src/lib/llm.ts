import OpenAI from 'openai';
import { isDeepStrictEqual } from 'node:util';
import type { Challenge, Puzzle } from '@query-quest/shared';

const LLM_PROMPT = `請以 JSON 格式生成 MongoDB Query Quest 的「ANSI SQL → MongoDB Query Language」轉換題目。

每個 Challenge 必須包含 id、type、title、difficulty、sql、collection、context、schema、sampleDocuments、slots、puzzles、answerKey、mqlBreakdown、expected、concept、hint。每題只測試一個明確的 SQL 到 MQL 轉換，且 sql、expected、正確拼圖三者必須表達完全相同的語意。type 與 expected.type 必須完全相同，且只能是大寫 FIND、INSERT、UPDATE、DELETE 或 AGGREGATE。expected.collection 必須存在，且必須逐字等於頂層 collection。UPDATE 與 DELETE 必須使用 expected.multi（true 對應 updateMany/deleteMany，false 對應 updateOne/deleteOne），不要輸出 expected.command。

SQL 規則：使用 ANSI SQL 子集合，所有 SQL 必須以分號結尾。只允許 SELECT ... FROM ... WHERE、ORDER BY、FETCH FIRST n ROWS ONLY、INSERT INTO ... VALUES、UPDATE ... SET ... WHERE、MERGE INTO ... USING ... ON ... WHEN MATCHED ... WHEN NOT MATCHED、DELETE FROM ... WHERE、GROUP BY、HAVING 與標準聚合函式。UPSERT 題型必須使用 ANSI MERGE INTO，不可用普通 UPDATE 假裝 upsert。禁止 LIMIT、TOP、NOW()、反引號、ILIKE、MongoDB 語法及 JOIN。時間請使用 CURRENT_TIMESTAMP。

MQL 題型與固定 slot：
- FIND：slots 為 s_cmd(command)、s_filter(filter)，並依需求加上 s_proj(projection)、s_sort(sort)、s_limit(limit)。正確 command 是 find。SQL SELECT 欄位對應 projection；WHERE 對應 filter；ORDER BY DESC/ASC 對應 sort 的 -1/1；FETCH FIRST n ROWS ONLY 對應 limit n。
- INSERT：slots 為 s_cmd(command)、s_doc(update)。正確 command 是 insertOne；SQL VALUES 對應 document。
- UPDATE：slots 為 s_cmd(command)、s_filter(filter)、s_update(update)，若 expected.upsert 為 true 再加入 s_options(options)。正確 command 是 updateOne 或 updateMany；SET field = field + n 必須對應 $inc，SET field = value 對應 $set；upsert 題目必須使用第三個參數 { upsert: true }。
- DELETE：slots 為 s_cmd(command)、s_filter(filter)。正確 command 是 deleteOne 或 deleteMany；deleteMany 必須使用非空 filter。
- AGGREGATE：slots 為 s_cmd(command) 及依 pipeline 順序排列的 s_stage1、s_stage2、s_stage3（最多三個）。正確 command 是 aggregate；WHERE 對應 $match，GROUP BY 對應 $group，ORDER BY 對應 $sort。

不得自訂或改名任何 slot ID。請直接依下列結構輸出（可依 SQL 移除不需要的選填 FIND slot）：
FIND: "slots": [{"id":"s_cmd","label":"Command","accepts":["command"],"required":true},{"id":"s_filter","label":"Filter 條件","accepts":["filter"],"required":true}]
INSERT: "slots": [{"id":"s_cmd","label":"Command","accepts":["command"],"required":true},{"id":"s_doc","label":"Document","accepts":["update"],"required":true}]
UPDATE: "slots": [{"id":"s_cmd","label":"Command","accepts":["command"],"required":true},{"id":"s_filter","label":"Filter 條件","accepts":["filter"],"required":true},{"id":"s_update","label":"Update 操作","accepts":["update"],"required":true}]（upsert 時追加 {"id":"s_options","label":"Options","accepts":["options"],"required":true}）
DELETE: "slots": [{"id":"s_cmd","label":"Command","accepts":["command"],"required":true},{"id":"s_filter","label":"Filter 條件","accepts":["filter"],"required":true}]
AGGREGATE: "slots": [{"id":"s_cmd","label":"Command","accepts":["command"],"required":true},{"id":"s_stage1","label":"Stage 1","accepts":["stage"],"required":true}]

每個 puzzle 必須有 id、label、kind、value。label 必須是可直接拼成 Mongo shell 查詢的完整 MQL fragment，不得是抽象說明或拆分 token；例如 find、{ total: { $gte: 1000 } }、{ $inc: { points: 100 } }、{ $group: { _id: "$status", count: { $sum: 1 } } }。每個 required slot 都必須有一個 value 與 expected 完全一致的正確拼圖。answerKey 必須是 required slot ID 對唯一正確 puzzle ID 的 JSON object，例如 {"s_cmd":"p_find","s_filter":"p_filter_gold"}；不得包含干擾拼圖或未知 slot/puzzle ID。每個 required slot 都必須至少有一個 kind 相容、isDistractor: true、且不是 answerKey 所指向 puzzle 的混淆選項。不能只在整題放一個 distractor。

mqlBreakdown 必須是陣列，每個 required slot 恰好一項，包含 slotId、title、role、sqlMapping、explanation。slotId 必須與 answerKey 的 key 完全一致。請明確說明參數位置，例如 find(filter, projection) 中 filter 是第一個參數、projection 是第二個參數；也要解釋每個 MongoDB operator（例如 $gte、$in、$inc、$set、$match、$group、$sort）為什麼放在該位置，以及它對應哪個 SQL 子句。不得只寫泛泛的概念說明。

安全規則：禁止使用 $where、mapReduce、$function 或 JavaScript 執行；禁止管理指令（drop、createCollection 等）；multi: true 的 DELETE 必須有非空 filter；不得包含 secret、連線字串或敏感資料。

難度要求：beginner 為等號比較與簡單 find；intermediate 使用比較運算子、$in、排序或 updateMany；advanced 使用複合條件、$and/$or 或 $push；boss 使用 $match、$group、$sort 的 aggregate pipeline。所有使用者可見文字使用繁體中文，SQL 與 MQL 片段保持英文。請只輸出 JSON 陣列，不要使用 markdown code block。`;

function requireMatchingPuzzle(
  challenge: Challenge,
  index: number,
  slotId: string,
  kind: Challenge['puzzles'][number]['kind'],
  value: unknown,
): void {
  const slot = challenge.slots.find((candidate) => candidate.id === slotId);
  if (!slot || !slot.required || !slot.accepts.includes(kind)) {
    throw new Error(`第 ${index + 1} 題缺少正確的 ${slotId} slot`);
  }
  if (!challenge.puzzles.some((puzzle) => puzzle.kind === kind && isDeepStrictEqual(puzzle.value, value))) {
    throw new Error(`第 ${index + 1} 題的 ${slotId} 沒有對應 expected 的完整 MQL 拼圖`);
  }
}

function validateSql(challenge: Challenge, index: number): void {
  const sql = challenge.sql.trim();
  if (!sql.endsWith(';')) throw new Error(`第 ${index + 1} 題的 SQL 必須以分號結尾`);
  if (/\b(LIMIT|TOP|ILIKE|JOIN)\b|NOW\s*\(|`/.test(sql)) {
    throw new Error(`第 ${index + 1} 題的 SQL 包含不支援的非 ANSI 語法`);
  }
  const prefixByType: Record<Challenge['type'], RegExp> = {
    FIND: /^SELECT\b/i,
    INSERT: /^INSERT\s+INTO\b/i,
    UPDATE: /^(UPDATE\b|MERGE\s+INTO\b)/i,
    DELETE: /^DELETE\s+FROM\b/i,
    AGGREGATE: /^SELECT\b/i,
  };
  if (!prefixByType[challenge.type].test(sql)) {
    throw new Error(`第 ${index + 1} 題的 SQL 與題型不一致`);
  }
  if (challenge.type === 'UPDATE') {
    const isMerge = /^MERGE\s+INTO\b/i.test(sql);
    const isUpsert = Boolean((challenge.expected as { upsert?: boolean }).upsert);
    if (isUpsert !== isMerge) {
      throw new Error(`第 ${index + 1} 題的 SQL 與 upsert 題型不一致：upsert 必須使用 MERGE INTO`);
    }
  }
  if (challenge.type === 'AGGREGATE' && !/\bGROUP\s+BY\b/i.test(sql)) {
    throw new Error(`第 ${index + 1} 題的聚合 SQL 必須使用 GROUP BY`);
  }
}

function ensureCorrectPuzzle(challenge: Challenge, slotId: string, kind: Puzzle['kind'], value: unknown): string {
  // A distractor can intentionally share a value with the expected answer;
  // only a non-distractor puzzle may be referenced by answerKey.
  const existing = challenge.puzzles.find((puzzle) => !puzzle.isDistractor && puzzle.kind === kind && isDeepStrictEqual(puzzle.value, value));
  if (existing) return existing.id;
  const baseId = `${challenge.id}_${slotId}_correct`;
  let id = baseId;
  let suffix = 2;
  while (challenge.puzzles.some((puzzle) => puzzle.id === id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }
  challenge.puzzles.push({
    id,
    label: typeof value === 'string' ? value : JSON.stringify(value),
    kind,
    value,
  });
  return id;
}

function normalizePlayableChallenge(challenge: Challenge): void {
  const answerKey: Record<string, string> = {};
  switch (challenge.expected.type) {
    case 'FIND':
      answerKey['s_cmd'] = ensureCorrectPuzzle(challenge, 's_cmd', 'command', 'find');
      answerKey['s_filter'] = ensureCorrectPuzzle(challenge, 's_filter', 'filter', challenge.expected.filter);
      if (challenge.expected.projection) answerKey['s_proj'] = ensureCorrectPuzzle(challenge, 's_proj', 'projection', challenge.expected.projection);
      if (challenge.expected.sort) answerKey['s_sort'] = ensureCorrectPuzzle(challenge, 's_sort', 'sort', challenge.expected.sort);
      if (challenge.expected.limit !== undefined) answerKey['s_limit'] = ensureCorrectPuzzle(challenge, 's_limit', 'limit', challenge.expected.limit);
      break;
    case 'INSERT':
      answerKey['s_cmd'] = ensureCorrectPuzzle(challenge, 's_cmd', 'command', 'insertOne');
      answerKey['s_doc'] = ensureCorrectPuzzle(challenge, 's_doc', 'update', challenge.expected.document);
      break;
    case 'UPDATE':
      answerKey['s_cmd'] = ensureCorrectPuzzle(challenge, 's_cmd', 'command', challenge.expected.multi ? 'updateMany' : 'updateOne');
      answerKey['s_filter'] = ensureCorrectPuzzle(challenge, 's_filter', 'filter', challenge.expected.filter);
      answerKey['s_update'] = ensureCorrectPuzzle(challenge, 's_update', 'update', challenge.expected.update);
      if (challenge.expected.upsert) answerKey['s_options'] = ensureCorrectPuzzle(challenge, 's_options', 'options', { upsert: true });
      break;
    case 'DELETE':
      answerKey['s_cmd'] = ensureCorrectPuzzle(challenge, 's_cmd', 'command', challenge.expected.multi ? 'deleteMany' : 'deleteOne');
      answerKey['s_filter'] = ensureCorrectPuzzle(challenge, 's_filter', 'filter', challenge.expected.filter);
      break;
    case 'AGGREGATE':
      answerKey['s_cmd'] = ensureCorrectPuzzle(challenge, 's_cmd', 'command', 'aggregate');
      challenge.expected.pipeline.forEach((stage, index) => {
        answerKey[`s_stage${index + 1}`] = ensureCorrectPuzzle(challenge, `s_stage${index + 1}`, 'stage', stage);
      });
      break;
  }
  challenge.answerKey = answerKey;
}

function validatePlayableChallenge(challenge: Challenge, index: number): void {
  const allowedSlots: Record<Challenge['type'], string[]> = {
    FIND: ['s_cmd', 's_filter', 's_proj', 's_sort', 's_limit'],
    INSERT: ['s_cmd', 's_doc'],
    UPDATE: ['s_cmd', 's_filter', 's_update', 's_options'],
    DELETE: ['s_cmd', 's_filter'],
    AGGREGATE: ['s_cmd', 's_stage1', 's_stage2', 's_stage3'],
  };
  if (challenge.slots.some((slot) => !allowedSlots[challenge.type].includes(slot.id))) {
    throw new Error(`第 ${index + 1} 題含有目前遊戲不支援的 slot`);
  }
  if (!challenge.puzzles.some((puzzle) => puzzle.isDistractor)) {
    throw new Error(`第 ${index + 1} 題至少需要一個語意合理的干擾選項`);
  }
  for (const slot of challenge.slots.filter((slot) => slot.required)) {
    const puzzleId = challenge.answerKey[slot.id];
    const puzzle = challenge.puzzles.find((candidate) => candidate.id === puzzleId);
    if (!puzzle || puzzle.isDistractor || !slot.accepts.includes(puzzle.kind)) {
      throw new Error(`第 ${index + 1} 題的 answerKey 未正確對應 ${slot.id}`);
    }
  }
  if (Object.keys(challenge.answerKey).some((slotId) => !challenge.slots.some((slot) => slot.required && slot.id === slotId))) {
    throw new Error(`第 ${index + 1} 題的 answerKey 包含無效 slot`);
  }
  for (const slot of challenge.slots.filter((item) => item.required)) {
    const answerId = challenge.answerKey[slot.id];
    const hasDistractor = challenge.puzzles.some((puzzle) => puzzle.id !== answerId && puzzle.isDistractor && slot.accepts.includes(puzzle.kind));
    if (!hasDistractor) {
      throw new Error(`第 ${index + 1} 題的 ${slot.id} 缺少相容的混淆拼圖`);
    }
  }
  const breakdown = challenge.mqlBreakdown;
  const requiredSlotIds = challenge.slots.filter((slot) => slot.required).map((slot) => slot.id);
  if (!breakdown || breakdown.length !== requiredSlotIds.length || new Set(breakdown.map((item) => item.slotId)).size !== breakdown.length || breakdown.some((item) => !requiredSlotIds.includes(item.slotId) || !item.title || !item.role || !item.sqlMapping || !item.explanation)) {
    throw new Error(`第 ${index + 1} 題的 mqlBreakdown 必須逐一解釋每個 required slot`);
  }

  switch (challenge.expected.type) {
    case 'FIND':
      requireMatchingPuzzle(challenge, index, 's_cmd', 'command', 'find');
      requireMatchingPuzzle(challenge, index, 's_filter', 'filter', challenge.expected.filter);
      if (challenge.expected.projection) requireMatchingPuzzle(challenge, index, 's_proj', 'projection', challenge.expected.projection);
      if (challenge.expected.sort) requireMatchingPuzzle(challenge, index, 's_sort', 'sort', challenge.expected.sort);
      if (challenge.expected.limit !== undefined) requireMatchingPuzzle(challenge, index, 's_limit', 'limit', challenge.expected.limit);
      break;
    case 'INSERT':
      requireMatchingPuzzle(challenge, index, 's_cmd', 'command', 'insertOne');
      requireMatchingPuzzle(challenge, index, 's_doc', 'update', challenge.expected.document);
      break;
    case 'UPDATE':
      requireMatchingPuzzle(challenge, index, 's_cmd', 'command', challenge.expected.multi ? 'updateMany' : 'updateOne');
      requireMatchingPuzzle(challenge, index, 's_filter', 'filter', challenge.expected.filter);
      requireMatchingPuzzle(challenge, index, 's_update', 'update', challenge.expected.update);
      if (challenge.expected.upsert) requireMatchingPuzzle(challenge, index, 's_options', 'options', { upsert: true });
      break;
    case 'DELETE':
      requireMatchingPuzzle(challenge, index, 's_cmd', 'command', challenge.expected.multi ? 'deleteMany' : 'deleteOne');
      requireMatchingPuzzle(challenge, index, 's_filter', 'filter', challenge.expected.filter);
      break;
    case 'AGGREGATE':
      if (challenge.expected.pipeline.length === 0 || challenge.expected.pipeline.length > 3) {
        throw new Error(`第 ${index + 1} 題的 pipeline 必須有 1 至 3 個 stage`);
      }
      requireMatchingPuzzle(challenge, index, 's_cmd', 'command', 'aggregate');
      challenge.expected.pipeline.forEach((stage, stageIndex) => {
        requireMatchingPuzzle(challenge, index, `s_stage${stageIndex + 1}`, 'stage', stage);
      });
      break;
  }
}

function validateChallenges(value: unknown, normalizeAnswerKeys = true): Challenge[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('LLM 未回傳非空題目陣列');
  }

  const ids = new Set<string>();
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`第 ${index + 1} 題格式無效`);
    const challenge = item as Partial<Challenge>;
    if (!challenge.id || ids.has(challenge.id)) throw new Error(`第 ${index + 1} 題缺少唯一 id`);
    ids.add(challenge.id);
    if (!['FIND', 'INSERT', 'UPDATE', 'DELETE', 'AGGREGATE'].includes(challenge.type ?? '')) {
      throw new Error(`第 ${index + 1} 題的 type 無效`);
    }
    if (!challenge.title || !challenge.sql || !challenge.collection || !challenge.context || !challenge.expected) {
      throw new Error(`第 ${index + 1} 題缺少必要欄位`);
    }
    if (!Array.isArray(challenge.sampleDocuments) || !Array.isArray(challenge.slots) || challenge.slots.length === 0 || !Array.isArray(challenge.puzzles) || challenge.puzzles.length === 0) {
      throw new Error(`第 ${index + 1} 題的 sampleDocuments、slots 或 puzzles 無效`);
    }
    const objectPuzzleKinds = new Set(['filter', 'projection', 'update', 'options', 'sort', 'stage']);
    for (const puzzle of challenge.puzzles) {
      if (objectPuzzleKinds.has(puzzle.kind) && (!puzzle.value || typeof puzzle.value !== 'object' || Array.isArray(puzzle.value))) {
        throw new Error(`第 ${index + 1} 題 puzzle ${puzzle.id} 的 ${puzzle.kind} value 必須是 JSON object，不可為字串`);
      }
      if (puzzle.kind === 'limit' && typeof puzzle.value !== 'number') {
        throw new Error(`第 ${index + 1} 題 puzzle ${puzzle.id} 的 limit value 必須是 number`);
      }
    }
    if ((challenge.expected as { type?: string }).type !== challenge.type) {
      throw new Error(`第 ${index + 1} 題的 expected.type 與 type 不一致`);
    }
    if ((challenge.expected as { collection?: unknown }).collection !== challenge.collection) {
      throw new Error(`第 ${index + 1} 題的 expected.collection 必須與 collection 完全一致`);
    }
    normalizeCommandShape(challenge as Challenge);
    const raw = JSON.stringify(item);
    if (/\$where|\$function|mapReduce/.test(raw)) throw new Error(`第 ${index + 1} 題包含禁止的 MongoDB 操作`);
    const expected = challenge.expected as { type?: string; multi?: boolean; filter?: Record<string, unknown> };
    if (expected.type === 'DELETE' && expected.multi && (!expected.filter || Object.keys(expected.filter).length === 0)) {
      throw new Error(`第 ${index + 1} 題的 deleteMany 不可使用空 filter`);
    }
    validateSql(challenge as Challenge, index);
    if (normalizeAnswerKeys) normalizePlayableChallenge(challenge as Challenge);
    validatePlayableChallenge(challenge as Challenge, index);
  });

  return value as Challenge[];
}

function normalizeCommandShape(challenge: Challenge): void {
  const expected = challenge.expected as { type: string; command?: string; multi?: boolean };
  if (expected.type !== 'UPDATE' && expected.type !== 'DELETE') return;
  if (expected.multi === undefined && (expected.command === 'updateMany' || expected.command === 'deleteMany')) {
    expected.multi = true;
  } else if (expected.multi === undefined && (expected.command === 'updateOne' || expected.command === 'deleteOne')) {
    expected.multi = false;
  }
  if (expected.command) delete expected.command;
}

export function validateEditedChallenge(value: unknown): Challenge {
  const [challenge] = validateChallenges([value], false);
  return challenge!;
}

function parseJson(content: string): unknown {
  const stripped = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(stripped);
}

function getChallengeCount(): number {
  const configured = process.env['QUESTION_BANK_CHALLENGE_COUNT'];
  if (!configured) return 8;
  const count = Number(configured);
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new Error('QUESTION_BANK_CHALLENGE_COUNT 必須是 1 至 20 的整數');
  }
  return count;
}

export async function generateChallenges(useCase: string, requestedCount?: number): Promise<Challenge[]> {
  const apiKey = process.env['GROVE_API_KEY'];
  const model = process.env['GROVE_MODEL'] || 'gpt-5.6-luna';
  const challengeCount = requestedCount ?? getChallengeCount();
  if (!Number.isInteger(challengeCount) || challengeCount < 1 || challengeCount > 20) {
    throw new Error('題目數量必須是 1 至 20 的整數');
  }
  if (!apiKey) {
    throw new Error('Grove AI Gateway 尚未設定。請設定 GROVE_API_KEY。');
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env['GROVE_API_BASE_URL'] || 'https://grove-gateway-prod.azure-api.net/grove-foundry-prod/openai/v1',
    defaultHeaders: { 'api-key': apiKey },
  });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: LLM_PROMPT },
      { role: 'user', content: `請為以下使用情境剛好生成 ${challengeCount} 道題目：\n${useCase}` },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Azure OpenAI 未回傳生成內容');
  const challenges = validateChallenges(parseJson(content));
  if (challenges.length !== challengeCount) {
    throw new Error(`LLM 回傳 ${challenges.length} 題，預期為 ${challengeCount} 題`);
  }
  return challenges;
}
