import { Memory } from '@mastra/memory';
import { MongoDBStore } from '@mastra/mongodb';
import { getDb } from '../db/client.js';

const resourceId = 'schema-design-bank-quality-policy';
const threadId = 'schema-design-review-corrections';
let cachedQualityMemory = '';

export const SCHEMA_DESIGN_BANK_POLICY = `Global schema-design question-bank hard constraints:
- Every challenge must have exactly 3 candidate cards: 1 correct, 2 plausible-but-flawed distractors.
- Every challenge must include answerKey and optionExplanations covering all 3 cards.
- patternName must exactly match the correct card's label.
- Only use the known catalog of official MongoDB design patterns and anti-patterns. Never invent a new pattern name.
- Cover beginner (embedding vs referencing), intermediate (named pattern recognition), advanced (multi-factor tradeoffs) and boss (anti-pattern diagnosis) difficulty when the bank has enough questions.
- These constraints are domain-independent. Never copy a bank's business context into global policy.`;

const uri = process.env['MONGODB_URI'];
if (!uri) throw new Error('MONGODB_URI environment variable is not set');

const dbName = process.env['MASTRA_MONGODB_DB_NAME'] || `${new URL(uri).pathname.replace(/^\//, '') || 'query-quest'}_mastra`;
const storage = new MongoDBStore({ id: 'query-quest-schema-design-mastra-memory', uri, dbName });

export const schemaDesignQualityMemory = new Memory({
  storage,
  options: {
    lastMessages: false,
    workingMemory: {
      enabled: true,
      scope: 'resource',
      template: `# Global Schema Design Quality Rules\n\n${SCHEMA_DESIGN_BANK_POLICY}\n\n## Approved rules\n`,
    },
  },
});

export async function updateSchemaDesignQualityMemory(rules: string[]): Promise<void> {
  const workingMemory = [
    '# Global Schema Design Quality Rules',
    '',
    SCHEMA_DESIGN_BANK_POLICY,
    '',
    'These rules are domain-independent and approved by an administrator.',
    '',
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
  ].join('\n');
  cachedQualityMemory = workingMemory;

  try {
    await schemaDesignQualityMemory.updateWorkingMemory({ threadId, resourceId, workingMemory });
  } catch {
    await schemaDesignQualityMemory.createThread({ threadId, resourceId, title: 'Global schema design quality policy' });
    await schemaDesignQualityMemory.updateWorkingMemory({ threadId, resourceId, workingMemory });
  }
}

export async function ensureSchemaDesignQualityMemory(): Promise<void> {
  const approved = await getDb().collection<{ rule: string; status: string; workshopType?: string }>('qualityRuleSuggestions')
    .find({ status: 'approved', workshopType: 'schema-design' })
    .sort({ approvedAt: 1, createdAt: 1 })
    .toArray();
  await updateSchemaDesignQualityMemory([...new Set(approved.map((item) => item.rule))]);
}

export async function readSchemaDesignQualityMemory(): Promise<string> {
  try {
    await ensureSchemaDesignQualityMemory();
    const thread = await schemaDesignQualityMemory.getThreadById({ threadId });
    const workingMemory = thread?.metadata?.['workingMemory'];
    return typeof workingMemory === 'string' && workingMemory.length > 0 ? workingMemory : cachedQualityMemory;
  } catch {
    return cachedQualityMemory;
  }
}

export const schemaDesignQualityMemoryIds = { resourceId, threadId };
