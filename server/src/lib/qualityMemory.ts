import { Memory } from '@mastra/memory';
import { MongoDBStore } from '@mastra/mongodb';
import { getDb } from '../db/client.js';

const resourceId = 'question-bank-quality-policy';
const threadId = 'admin-review-corrections';
let cachedQualityMemory = '';

export const GLOBAL_BANK_POLICY = `Global question-bank hard constraints:
- Include beginner, intermediate, advanced, and boss difficulty levels when the bank has enough questions.
- Cover FIND, INSERT, UPDATE, DELETE, and AGGREGATE when the bank has enough questions.
- The final challenge must be an aggregate using $group, $match, and $sort when the bank has at least 3 questions.
- Every challenge must include answerKey and mqlBreakdown.
- Every required slot must have at least one compatible distractor puzzle that is not the answerKey puzzle.
- These constraints are domain-independent. Never copy a bank's business context into global policy.`;

const uri = process.env['MONGODB_URI'];
if (!uri) throw new Error('MONGODB_URI environment variable is not set');

const dbName = process.env['MASTRA_MONGODB_DB_NAME'] || `${new URL(uri).pathname.replace(/^\//, '') || 'query-quest'}_mastra`;
const storage = new MongoDBStore({ id: 'query-quest-mastra-memory', uri, dbName });

export const qualityMemory = new Memory({
  storage,
  options: {
    lastMessages: false,
    workingMemory: {
      enabled: true,
      scope: 'resource',
      template: `# Global Question Quality Rules\n\n${GLOBAL_BANK_POLICY}\n\n## Approved rules\n`,
    },
  },
});

export async function updateQualityMemory(rules: string[]): Promise<void> {
  const workingMemory = [
    '# Global Question Quality Rules',
    '',
    GLOBAL_BANK_POLICY,
    '',
    'These rules are domain-independent and approved by an administrator.',
    '',
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
  ].join('\n');
  cachedQualityMemory = workingMemory;

  try {
    await qualityMemory.updateWorkingMemory({ threadId, resourceId, workingMemory });
  } catch {
    await qualityMemory.createThread({ threadId, resourceId, title: 'Global question quality policy' });
    await qualityMemory.updateWorkingMemory({ threadId, resourceId, workingMemory });
  }
}

export async function ensureQualityMemory(): Promise<void> {
  const approved = await getDb().collection<{ rule: string; status: string; workshopType?: string }>('qualityRuleSuggestions')
    .find({ status: 'approved', workshopType: { $ne: 'schema-design' } })
    .sort({ approvedAt: 1, createdAt: 1 })
    .toArray();
  await updateQualityMemory([...new Set(approved.map((item) => item.rule))]);
}

export async function readQualityMemory(): Promise<string> {
  try {
    await ensureQualityMemory();
    const thread = await qualityMemory.getThreadById({ threadId });
    const workingMemory = thread?.metadata?.['workingMemory'];
    return typeof workingMemory === 'string' && workingMemory.length > 0 ? workingMemory : cachedQualityMemory;
  } catch {
    return cachedQualityMemory;
  }
}

export const qualityMemoryIds = { resourceId, threadId };
