import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { generateSchemaDesignChallenges } from '../lib/schemaDesignLlm.js';
import type { Challenge } from '@query-quest/shared';

const generateStep = createStep({
  id: 'generate-and-validate-schema-design-challenges',
  inputSchema: z.object({ useCase: z.string(), challengeCount: z.number().int().min(1).max(20).optional() }),
  outputSchema: z.object({ challenges: z.array(z.unknown()) }),
  execute: async ({ inputData }) => {
    const challenges = await generateSchemaDesignChallenges(inputData.useCase, inputData.challengeCount);
    return { challenges };
  },
});

export const schemaDesignGenerationWorkflow = createWorkflow({
  id: 'schema-design-generation',
  inputSchema: z.object({ useCase: z.string(), challengeCount: z.number().int().min(1).max(20).optional() }),
  outputSchema: z.object({ challenges: z.array(z.unknown()) }),
})
  .then(generateStep)
  .commit();

export async function runSchemaDesignGeneration(useCase: string, challengeCount?: number): Promise<Challenge[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const run = await schemaDesignGenerationWorkflow.createRun();
      const result = await run.start({ inputData: { useCase, challengeCount } });
      if (result.status !== 'success') {
        throw result.status === 'failed' ? result.error : new Error(`Workflow ended with status: ${result.status}`);
      }
      return result.result.challenges as Challenge[];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Schema Design 題庫生成 workflow 失敗');
}
