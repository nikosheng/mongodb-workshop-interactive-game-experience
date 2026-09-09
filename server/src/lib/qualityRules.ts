import OpenAI from 'openai';

export interface QualityRuleSuggestion {
  rule: string;
  rationale: string;
  category: 'feasibility' | 'difficulty' | 'format';
}

export async function suggestQualityRule(reason: string): Promise<QualityRuleSuggestion | null> {
  if (!reason.trim()) return null;
  const apiKey = process.env['GROVE_API_KEY'];
  if (!apiKey) return null;
  const client = new OpenAI({
    apiKey,
    baseURL: process.env['GROVE_API_BASE_URL'] || 'https://grove-gateway-prod.azure-api.net/grove-foundry-prod/openai/v1',
    defaultHeaders: { 'api-key': apiKey },
  });
  const completion = await client.chat.completions.create({
    model: process.env['GROVE_MODEL'] || 'gpt-5.6-luna',
    messages: [
      { role: 'system', content: 'You extract one domain-independent quality rule for ANSI SQL to MongoDB Query Language educational questions. Return only JSON: {"rule":"...","rationale":"...","category":"feasibility|difficulty|format"}. Never mention business domains, collection names, field names, people, or data values. Focus on operator placement, answer feasibility, answer-key correctness, or difficulty calibration.' },
      { role: 'user', content: reason },
    ],
  });
  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) return null;
  const parsed = JSON.parse(content.replace(/^```json\s*/i, '').replace(/\s*```$/, '')) as QualityRuleSuggestion;
  if (!parsed.rule || !parsed.rationale || !['feasibility', 'difficulty', 'format'].includes(parsed.category)) return null;
  return parsed;
}
