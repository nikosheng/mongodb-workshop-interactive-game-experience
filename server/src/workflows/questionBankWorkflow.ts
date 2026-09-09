import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { generateChallenges } from '../lib/llm.js';
import type { Challenge } from '@query-quest/shared';

const generateStep = createStep({
  id: 'generate-and-validate-challenges',
  inputSchema: z.object({ useCase: z.string(), challengeCount: z.number().int().min(1).max(20).optional() }),
  outputSchema: z.object({ challenges: z.array(z.unknown()) }),
  execute: async ({ inputData }) => {
    const challenges = await generateChallenges(inputData.useCase, inputData.challengeCount);
    return { challenges };
  },
});

export const questionBankGenerationWorkflow = createWorkflow({
  id: 'question-bank-generation',
  inputSchema: z.object({ useCase: z.string(), challengeCount: z.number().int().min(1).max(20).optional() }),
  outputSchema: z.object({ challenges: z.array(z.unknown()) }),
})
  .then(generateStep)
  .commit();

export async function runQuestionBankGeneration(useCase: string, challengeCount?: number): Promise<Challenge[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const run = await questionBankGenerationWorkflow.createRun();
      const result = await run.start({ inputData: { useCase, challengeCount } });
      if (result.status !== 'success') {
        throw result.status === 'failed' ? result.error : new Error(`Workflow ended with status: ${result.status}`);
      }
      return result.result.challenges as Challenge[];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('題庫生成 workflow 失敗');
}
