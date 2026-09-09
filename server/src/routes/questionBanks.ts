import { timingSafeEqual } from 'crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Challenge, QuestionBank } from '@query-quest/shared';
import { getDb } from '../db/client.js';
import { runQuestionBankGeneration } from '../workflows/questionBankWorkflow.js';
import { suggestQualityRule } from '../lib/qualityRules.js';
import { GLOBAL_BANK_POLICY, readQualityMemory, updateQualityMemory } from '../lib/qualityMemory.js';
import { validateEditedChallenge } from '../lib/llm.js';

interface QuestionBankDocument {
  name: string;
  useCase: string;
  challenges: Challenge[];
  status: 'generating' | 'review' | 'ready' | 'error';
  approvedQuestionIds: string[];
  errorMsg?: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

const router = Router();
const generateSchema = z.object({
  name: z.string().trim().min(2, '題庫名稱至少需要 2 個字元').max(60, '題庫名稱不可超過 60 個字元'),
  useCase: z.string().trim().min(5, '請至少輸入 5 個字元的挑戰情境說明').max(2000, '挑戰情境說明不可超過 2000 個字元'),
});
const answerKeySchema = z.record(z.string().min(1));
const approveSchema = z.object({ reason: z.string().trim().max(1000).optional() });
const appendSchema = z.object({ request: z.string().trim().min(5, '追加要求至少需要 5 個字元').max(1000, '追加要求不可超過 1000 個字元') });

function toQuestionBank(doc: QuestionBankDocument & { _id: ObjectId }): QuestionBank {
  return { ...doc, _id: doc._id.toString(), createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt?.toISOString() };
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const configuredSecret = process.env['ADMIN_SECRET'];
  if (!configuredSecret) {
    res.status(503).json({ error: 'ADMIN_SECRET 尚未設定' });
    return;
  }
  const suppliedSecret = req.header('X-Admin-Secret');
  if (!suppliedSecret) {
    res.status(401).json({ error: '需要管理員密碼' });
    return;
  }
  const expected = Buffer.from(configuredSecret);
  const supplied = Buffer.from(suppliedSecret);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    res.status(401).json({ error: '管理員密碼錯誤' });
    return;
  }
  next();
}

router.get('/active', async (_req, res) => {
  const db = getDb();
  const bank = await db.collection<QuestionBankDocument>('questionBanks').findOne({ isActive: true, status: 'ready' });
  res.json({ bank: bank ? toQuestionBank(bank) : null });
});

router.use(requireAdmin);

router.get('/', async (_req, res) => {
  const banks = await getDb().collection<QuestionBankDocument>('questionBanks').find().sort({ createdAt: -1 }).toArray();
  res.json({ banks: banks.map(toQuestionBank) });
});

router.get('/quality-rules', async (_req, res) => {
  const suggestions = await getDb().collection('qualityRuleSuggestions').find().sort({ status: 1, createdAt: -1 }).toArray();
  res.json({ suggestions });
});

router.get('/quality-rules/memory', async (_req, res) => {
  res.json({ memory: await readQualityMemory() });
});

router.get('/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params['id'])) {
    res.status(400).json({ error: '題庫 ID 格式有誤' });
    return;
  }
  const bank = await getDb().collection<QuestionBankDocument>('questionBanks').findOne({ _id: new ObjectId(req.params['id']) });
  if (!bank) {
    res.status(404).json({ error: '找不到題庫' });
    return;
  }
  res.json({ bank: toQuestionBank(bank) });
});

router.patch('/:id/questions/:challengeId/answer-key', async (req, res) => {
  const parsed = answerKeySchema.safeParse(req.body?.answerKey);
  if (!parsed.success || !ObjectId.isValid(req.params['id'])) {
    res.status(400).json({ error: 'answerKey 或題庫 ID 格式有誤' });
    return;
  }
  const collection = getDb().collection<QuestionBankDocument>('questionBanks');
  const bank = await collection.findOne({ _id: new ObjectId(req.params['id']) });
  const challenge = bank?.challenges.find((item) => item.id === req.params['challengeId']);
  if (!bank || !challenge) {
    res.status(404).json({ error: '找不到題庫或題目' });
    return;
  }
  if (bank.isActive) {
    res.status(409).json({ error: '啟用中的題庫不可修改' });
    return;
  }
  const answerKey = parsed.data;
  for (const slot of challenge.slots.filter((item) => item.required)) {
    const puzzle = challenge.puzzles.find((item) => item.id === answerKey[slot.id]);
    if (!puzzle || puzzle.isDistractor || !slot.accepts.includes(puzzle.kind)) {
      res.status(400).json({ error: `slot「${slot.label}」的答案拼圖無效` });
      return;
    }
  }
  const requiredIds = challenge.slots.filter((item) => item.required).map((item) => item.id).sort();
  if (Object.keys(answerKey).sort().join(',') !== requiredIds.join(',')) {
    res.status(400).json({ error: 'answerKey 必須剛好包含所有 required slot' });
    return;
  }
  await collection.updateOne(
    { _id: bank._id, 'challenges.id': challenge.id },
    { $set: { 'challenges.$.answerKey': answerKey, updatedAt: new Date() }, $pull: { approvedQuestionIds: challenge.id } as never },
  );
  res.json({ ok: true });
});

router.patch('/:id/questions/:challengeId', async (req, res) => {
  if (!ObjectId.isValid(req.params['id'])) {
    res.status(400).json({ error: '題庫 ID 格式有誤' });
    return;
  }
  const collection = getDb().collection<QuestionBankDocument>('questionBanks');
  const bank = await collection.findOne({ _id: new ObjectId(req.params['id']) });
  const existing = bank?.challenges.find((item) => item.id === req.params['challengeId']);
  if (!bank || !existing) {
    res.status(404).json({ error: '找不到題庫或題目' });
    return;
  }
  if (bank.isActive) {
    res.status(409).json({ error: '啟用中的題庫不可修改' });
    return;
  }
  try {
    const challenge = validateEditedChallenge({ ...req.body, id: existing.id });
    await collection.updateOne(
      { _id: bank._id, 'challenges.id': existing.id },
      { $set: { 'challenges.$': challenge, updatedAt: new Date() }, $pull: { approvedQuestionIds: existing.id } as never },
    );
    res.json({ challenge });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace('第 1 題', `題目 ${existing.id}`) : '題目驗證失敗';
    res.status(400).json({ error: message });
  }
});

router.post('/:id/questions/:challengeId/approve', async (req, res) => {
  if (!ObjectId.isValid(req.params['id'])) {
    res.status(400).json({ error: '題庫 ID 格式有誤' });
    return;
  }
  const collection = getDb().collection<QuestionBankDocument>('questionBanks');
  const bank = await collection.findOne({ _id: new ObjectId(req.params['id']) });
  const challenge = bank?.challenges.find((item) => item.id === req.params['challengeId']);
  if (!bank || !challenge) {
    res.status(404).json({ error: '找不到題庫或題目' });
    return;
  }
  if (bank.isActive) {
    res.status(409).json({ error: '啟用中的題庫不可修改' });
    return;
  }
  const validKey = challenge.slots.filter((item) => item.required).every((slot) => {
    const puzzle = challenge.puzzles.find((item) => item.id === challenge.answerKey[slot.id]);
    return Boolean(puzzle && !puzzle.isDistractor && slot.accepts.includes(puzzle.kind));
  });
  if (!validKey) {
    res.status(400).json({ error: '請先確認每個 required slot 的正確拼圖' });
    return;
  }
  const { reason } = approveSchema.parse(req.body ?? {});
  const approved = [...new Set([...bank.approvedQuestionIds, challenge.id])];
  const allApproved = bank.challenges.every((item) => approved.includes(item.id));
  await collection.updateOne({ _id: bank._id }, { $set: { approvedQuestionIds: approved, status: allApproved ? 'ready' : 'review', updatedAt: new Date() } });
  if (reason) {
    await getDb().collection('questionBankReviewEvents').insertOne({ bankId: bank._id.toString(), challengeId: challenge.id, reason, createdAt: new Date() });
    try {
      const suggestion = await suggestQualityRule(reason);
      if (suggestion) await getDb().collection('qualityRuleSuggestions').updateOne({ rule: suggestion.rule }, { $setOnInsert: { ...suggestion, status: 'pending', createdAt: new Date() } }, { upsert: true });
    } catch {
      // A memory suggestion is an enhancement; it must not block question approval.
    }
  }
  res.json({ approvedQuestionIds: approved, status: allApproved ? 'ready' : 'review' });
});

router.post('/quality-rules/:id/approve', async (req, res) => {
  if (!ObjectId.isValid(req.params['id'])) {
    res.status(400).json({ error: '規則 ID 格式有誤' });
    return;
  }
  const db = getDb();
  const suggestion = await db.collection<{ rule: string; status: string }>('qualityRuleSuggestions').findOne({ _id: new ObjectId(req.params['id']) });
  if (!suggestion) {
    res.status(404).json({ error: '找不到規則建議' });
    return;
  }
  const approvedRules = await db.collection<{ rule: string; status: string }>('qualityRuleSuggestions').find({ status: 'approved' }).sort({ createdAt: 1 }).toArray();
  const rules = [...approvedRules.map((item) => item.rule), ...(suggestion.status === 'approved' ? [] : [suggestion.rule])];
  await db.collection('qualityRuleSuggestions').updateOne({ _id: new ObjectId(req.params['id']) }, { $set: { status: 'approved', approvedAt: new Date() } });
  await updateQualityMemory([...new Set(rules)]);
  res.json({ ok: true });
});

router.post('/quality-rules/:id/reject', async (req, res) => {
  if (!ObjectId.isValid(req.params['id'])) {
    res.status(400).json({ error: '規則 ID 格式有誤' });
    return;
  }
  await getDb().collection('qualityRuleSuggestions').updateOne({ _id: new ObjectId(req.params['id']) }, { $set: { status: 'rejected', rejectedAt: new Date() } });
  res.json({ ok: true });
});

router.post('/:id/questions/generate', async (req, res) => {
  if (!ObjectId.isValid(req.params['id'])) {
    res.status(400).json({ error: '題庫 ID 格式有誤' });
    return;
  }
  const collection = getDb().collection<QuestionBankDocument>('questionBanks');
  const bank = await collection.findOne({ _id: new ObjectId(req.params['id']) });
  if (!bank) {
    res.status(404).json({ error: '找不到題庫' });
    return;
  }
  if (bank.isActive) {
    res.status(409).json({ error: '啟用中的題庫不可追加題目' });
    return;
  }
  const parsed = appendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? '追加要求格式有誤' });
    return;
  }
  const appendRequest = parsed.data.request;
  try {
    const globalQualityRules = await readQualityMemory();
    const [challenge] = await runQuestionBankGeneration(
      `${bank.useCase}\n\nAdmin 這次的追加要求：${appendRequest}\n\n全域品質規則（只遵守跨領域可行性與難度規則，不要複製任何背景）：${globalQualityRules}\n\n既有題目標題（請避免重複）：${bank.challenges.map((item) => item.title).join('、')}`,
      1,
    );
    if (!challenge || bank.challenges.some((item) => item.id === challenge.id)) {
      throw new Error('新增題目的 ID 與現有題目重複');
    }
    await collection.updateOne({ _id: bank._id }, { $push: { challenges: challenge } as never, $set: { status: 'review', updatedAt: new Date() } });
    await getDb().collection('questionBankReviewEvents').insertOne({ bankId: bank._id.toString(), type: 'append-request', request: appendRequest, challengeId: challenge.id, createdAt: new Date() });
    res.status(201).json({ challenge });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : '追加題目失敗' });
  }
});

router.post('/generate', async (req, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? '輸入格式有誤' });
    return;
  }

  const { name, useCase } = parsed.data;
  const db = getDb();
  const collection = db.collection<QuestionBankDocument>('questionBanks');
  const result = await collection.insertOne({
    name,
    useCase,
    challenges: [],
    status: 'generating',
    approvedQuestionIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: false,
  });

  try {
    const globalRules = await readQualityMemory();
    const challenges: Challenge[] = await runQuestionBankGeneration(`${useCase}\n\n${GLOBAL_BANK_POLICY}\n\nApproved cross-bank rules:\n${globalRules}`);
    await collection.updateOne({ _id: result.insertedId }, { $set: { challenges, status: 'review', approvedQuestionIds: [], updatedAt: new Date() }, $unset: { errorMsg: '' } });
    const bank = await collection.findOne({ _id: result.insertedId });
    res.status(201).json({ bank: toQuestionBank(bank!) });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '生成題庫時發生未知錯誤';
    await collection.updateOne({ _id: result.insertedId }, { $set: { status: 'error', errorMsg, updatedAt: new Date() } });
    res.status(502).json({ error: errorMsg });
  }
});

router.post('/:id/activate', async (req, res) => {
  if (!ObjectId.isValid(req.params['id'])) {
    res.status(400).json({ error: '題庫 ID 格式有誤' });
    return;
  }
  const collection = getDb().collection<QuestionBankDocument>('questionBanks');
  const targetId = new ObjectId(req.params['id']);
  const target = await collection.findOne({ _id: targetId, status: 'ready' });
  if (!target) {
    res.status(404).json({ error: '找不到可啟用的完成題庫' });
    return;
  }
  await collection.updateMany({}, { $set: { isActive: false } });
  await collection.updateOne({ _id: targetId }, { $set: { isActive: true } });
  res.json({ bank: toQuestionBank({ ...target, isActive: true }) });
});

router.delete('/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params['id'])) {
    res.status(400).json({ error: '題庫 ID 格式有誤' });
    return;
  }
  const result = await getDb().collection<QuestionBankDocument>('questionBanks').deleteOne({
    _id: new ObjectId(req.params['id']),
    isActive: { $ne: true },
  });
  if (result.deletedCount === 0) {
    res.status(409).json({ error: '找不到題庫，或啟用中的題庫不可刪除' });
    return;
  }
  res.status(204).end();
});

export default router;
