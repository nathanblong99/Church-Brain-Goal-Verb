import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
}

export function buildGemini(config?: Partial<GeminiConfig>) {
  const cfg: GeminiConfig = {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
    maxOutputTokens: Number(process.env.PLANNER_MAX_TOKENS || '2000'),
    ...config
  };
  if (!cfg.apiKey) throw new Error('Missing GEMINI_API_KEY');
  const genAI = new GoogleGenerativeAI(cfg.apiKey);
  const model = genAI.getGenerativeModel({ model: cfg.model });
  return { model, cfg };
}
