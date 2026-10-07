import OpenAI from 'openai';
import type { Challenge } from '@query-quest/shared';

const SCHEMA_DESIGN_PROMPT = `請以 JSON 格式生成 MongoDB「Schema Design Pattern / Anti-Pattern」教學題目。這類題目不是 SQL 轉 MQL，而是訓練玩家判斷正確的 MongoDB schema 設計。

每個 Challenge 必須包含 id、type、title、difficulty、collection、context、schema、sampleDocuments、slots、puzzles、answerKey、patternName、optionExplanations、concept、hint。type 只能是 "SCHEMA_PATTERN"（辨識該使用哪個正確設計模式）或 "SCHEMA_ANTIPATTERN"（診斷現有設計犯了哪個反模式）。

知識範圍（只能使用以下已知的官方模式與反模式，不可自創）：
- 正面設計模式（Design Patterns）：Attribute Pattern、Bucket Pattern、Computed Pattern、Document Versioning Pattern、Extended Reference Pattern、Outlier Pattern、Polymorphic Pattern、Pre-allocated Pattern、Schema Versioning Pattern、Subset Pattern、Tree Pattern、Approximation Pattern。
- 反模式（Anti-Patterns）：Massive Arrays（陣列無界增長）、Massive Number of Collections（集合數量爆炸）、Unnecessary Indexes（不必要的索引）、Bloated Documents（文件塞入過多不相關或過大欄位）、Separating Data that is Accessed Together（該一起讀的資料被拆散到多個集合）、Case-Insensitive Query without Collation（未設定 collation 卻做大小寫不敏感查詢）。
- 基礎決策：Embedding vs Referencing（何時該內嵌、何時該用參照）。

情境設計規則：
- context 必須是一段具體的業務情境敘述（例如某功能的讀寫模式、資料量、更新頻率、一致性需求），讓玩家能推理出正確答案，不能只是抽象描述。
- schema 欄位需描述「現狀」的資料形狀（intermediate/advanced/boss 難度時，現狀應刻意呈現待解決的設計問題）。
- sampleDocuments 至少 1 筆，呈現現狀資料形狀的具體範例。

候選卡規則（固定 3 張，slots 固定為一個 required slot）：
"slots": [{"id":"s_design","label":"最佳設計","accepts":["schema-option"],"required":true}]
puzzles 陣列必須恰好 3 個元素，kind 全部是 "schema-option"，其中恰好 1 個 isDistractor:false（正解），其餘 2 個 isDistractor:true（合理但有明確缺陷的干擾選項，不能是明顯錯誤的選項）。每個 puzzle 必須有 id、label（模式或反模式的正式名稱）、kind、value、isDistractor。value 必須是物件，包含 summary（一句話說明這個設計的做法）與 snippet（示意用的 JSON schema 片段，key 為 collection 名稱）。

answerKey 必須是 {"s_design": "<正解 puzzle 的 id>"}，正解 puzzle 的 isDistractor 必須是 false。

optionExplanations 必須是陣列，長度恰好 3，每個元素對應一張候選卡，包含 puzzleId、verdict（"correct" 或 "incorrect"，須與該 puzzle 的 isDistractor 相反邏輯一致：isDistractor:false 對應 verdict:"correct"）、reason（具體解釋這張卡為什麼是/不是最佳設計，需要引用情境中的具體條件，不能只是泛泛而談）。

patternName 必須是正解卡片對應的正式模式/反模式名稱，必須與正解 puzzle 的 label 一致。

difficulty 對應內容深度：
- beginner：基礎 embedding vs referencing 二選一決策（1 對 1 或 1 對少的關係）。
- intermediate：辨識單一具名官方 design pattern。
- advanced：複合情境，需同時權衡讀寫比例、一致性、文件大小限制，干擾選項要有微妙但明確的缺陷。
- boss：優先用 type "SCHEMA_ANTIPATTERN"，診斷一個已存在、看似能動但有嚴重隱患的 schema。

安全規則：不得包含 secret、連線字串或敏感資料；不得使用真實個資範例。所有使用者可見文字使用繁體中文，模式名稱可保留英文原名（例如 "Extended Reference Pattern"）。請只輸出 JSON 陣列，不要使用 markdown code block。`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateSchemaDesignChallenge(item: unknown, index: number): Challenge {
  if (!item || typeof item !== 'object') throw new Error(`第 ${index + 1} 題格式無效`);
  const challenge = item as Partial<Challenge>;

  if (!challenge.id) throw new Error(`第 ${index + 1} 題缺少 id`);
  if (challenge.type !== 'SCHEMA_PATTERN' && challenge.type !== 'SCHEMA_ANTIPATTERN') {
    throw new Error(`第 ${index + 1} 題的 type 必須是 SCHEMA_PATTERN 或 SCHEMA_ANTIPATTERN`);
  }
  if (!challenge.title || !challenge.collection || !challenge.context) {
    throw new Error(`第 ${index + 1} 題缺少 title、collection 或 context`);
  }
  if (!['beginner', 'intermediate', 'advanced', 'boss'].includes(challenge.difficulty ?? '')) {
    throw new Error(`第 ${index + 1} 題的 difficulty 無效`);
  }
  if (!isPlainObject(challenge.schema) || Object.keys(challenge.schema).length === 0) {
    throw new Error(`第 ${index + 1} 題缺少 schema`);
  }
  if (Object.values(challenge.schema).some((fieldType) => typeof fieldType !== 'string')) {
    throw new Error(`第 ${index + 1} 題的 schema 欄位型別必須是字串`);
  }
  if (!Array.isArray(challenge.sampleDocuments) || challenge.sampleDocuments.length === 0) {
    throw new Error(`第 ${index + 1} 題缺少 sampleDocuments`);
  }

  const slots = challenge.slots;
  if (!Array.isArray(slots) || slots.length !== 1 || slots[0]?.id !== 's_design' || !slots[0]?.accepts?.includes('schema-option')) {
    throw new Error(`第 ${index + 1} 題的 slots 必須恰好是單一 s_design(schema-option) slot`);
  }

  const puzzles = challenge.puzzles;
  if (!Array.isArray(puzzles) || puzzles.length !== 3) {
    throw new Error(`第 ${index + 1} 題必須恰好有 3 張候選卡`);
  }
  for (const puzzle of puzzles) {
    if (!puzzle.id || !puzzle.label || puzzle.kind !== 'schema-option' || !isPlainObject(puzzle.value)) {
      throw new Error(`第 ${index + 1} 題的候選卡 ${puzzle.id ?? '(未知)'} 格式無效`);
    }
    const value = puzzle.value as Record<string, unknown>;
    if (typeof value['summary'] !== 'string' || !isPlainObject(value['snippet'])) {
      throw new Error(`第 ${index + 1} 題的候選卡 ${puzzle.id} 缺少 summary 或 snippet`);
    }
  }
  const correctPuzzles = puzzles.filter((puzzle) => !puzzle.isDistractor);
  if (correctPuzzles.length !== 1) {
    throw new Error(`第 ${index + 1} 題必須恰好有 1 張正解卡（isDistractor:false）`);
  }
  const correctPuzzle = correctPuzzles[0]!;

  const answerKey = challenge.answerKey;
  if (!answerKey || Object.keys(answerKey).length !== 1 || answerKey['s_design'] !== correctPuzzle.id) {
    throw new Error(`第 ${index + 1} 題的 answerKey 必須恰好是 {"s_design": "${correctPuzzle.id}"}`);
  }

  if (!challenge.patternName || challenge.patternName !== correctPuzzle.label) {
    throw new Error(`第 ${index + 1} 題的 patternName 必須與正解卡片的 label 一致`);
  }

  const optionExplanations = challenge.optionExplanations;
  if (!Array.isArray(optionExplanations) || optionExplanations.length !== 3) {
    throw new Error(`第 ${index + 1} 題的 optionExplanations 必須恰好有 3 筆`);
  }
  const puzzleIds = new Set(puzzles.map((puzzle) => puzzle.id));
  const explainedIds = new Set<string>();
  for (const explanation of optionExplanations) {
    if (!explanation.puzzleId || !puzzleIds.has(explanation.puzzleId)) {
      throw new Error(`第 ${index + 1} 題的 optionExplanations 包含未知的 puzzleId`);
    }
    if (explainedIds.has(explanation.puzzleId)) {
      throw new Error(`第 ${index + 1} 題的 optionExplanations 重複解釋同一張卡`);
    }
    explainedIds.add(explanation.puzzleId);
    const relatedPuzzle = puzzles.find((puzzle) => puzzle.id === explanation.puzzleId)!;
    const expectedVerdict = relatedPuzzle.isDistractor ? 'incorrect' : 'correct';
    if (explanation.verdict !== expectedVerdict) {
      throw new Error(`第 ${index + 1} 題的 optionExplanations 中 ${explanation.puzzleId} 的 verdict 與 isDistractor 不一致`);
    }
    if (!explanation.reason || explanation.reason.trim().length < 5) {
      throw new Error(`第 ${index + 1} 題的 optionExplanations 中 ${explanation.puzzleId} 缺少具體的 reason`);
    }
  }

  if (!challenge.concept || !challenge.hint) {
    throw new Error(`第 ${index + 1} 題缺少 concept 或 hint`);
  }

  const raw = JSON.stringify(item);
  if (/\$where|\$function|mapReduce/.test(raw)) {
    throw new Error(`第 ${index + 1} 題包含禁止的 MongoDB 操作`);
  }

  return challenge as Challenge;
}

export function validateSchemaDesignChallenges(value: unknown): Challenge[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('LLM 未回傳非空題目陣列');
  }
  const ids = new Set<string>();
  const challenges = value.map((item, index) => {
    const challenge = validateSchemaDesignChallenge(item, index);
    if (ids.has(challenge.id)) throw new Error(`第 ${index + 1} 題的 id 重複`);
    ids.add(challenge.id);
    return challenge;
  });
  return challenges;
}

export function validateEditedSchemaDesignChallenge(value: unknown): Challenge {
  return validateSchemaDesignChallenge(value, 0);
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

export async function generateSchemaDesignChallenges(useCase: string, requestedCount?: number): Promise<Challenge[]> {
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
      { role: 'system', content: SCHEMA_DESIGN_PROMPT },
      { role: 'user', content: `請為以下使用情境剛好生成 ${challengeCount} 道 Schema Design 題目：\n${useCase}` },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Azure OpenAI 未回傳生成內容');
  const challenges = validateSchemaDesignChallenges(parseJson(content));
  if (challenges.length !== challengeCount) {
    throw new Error(`LLM 回傳 ${challenges.length} 題，預期為 ${challengeCount} 題`);
  }
  return challenges;
}
