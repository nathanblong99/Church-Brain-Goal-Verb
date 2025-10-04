// Generates natural language outbound messages using the same model, with safety constraints.
import '../env_bootstrap.ts';
import { buildGemini } from './gemini_client.js';
import { startLLM, finishLLM } from './llm_instrumentation.js';

export interface GenerateOpts {
  kind: string;               // semantic type e.g., offer.accepted
  requiredPhrases?: string[];  // phrases that MUST appear (e.g., YES instructions or disclaimers)
  context?: Record<string, any>;
}

export async function generateReply(opts: GenerateOpts): Promise<string> {
  const { model } = buildGemini();
  const ctx = JSON.stringify(opts.context || {});
  const required = (opts.requiredPhrases || []).map(p=>`- ${p}`).join('\n');
  const prompt = [
    'You write one concise SMS (≤160 chars) in warm, clear, plain language.',
    `Event Kind: ${opts.kind}`,
    `Context JSON: ${ctx}`,
    required && 'Required phrases (exact substring somewhere):\n'+required,
    'Rules: \n- NO JSON.\n- One line.\n- Must retain meaning of event.\n- Include required phrases verbatim.',
    'Reply with ONLY the SMS text.'
  ].filter(Boolean).join('\n\n');
  let text: string; let rec: any | undefined; let raw: string | undefined;
  try {
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || '1200');
    rec = startLLM('response.generate', prompt);
    const result = await Promise.race([
      model.generateContent({ contents: [{ role:'user', parts:[{ text: prompt }]}]}),
      new Promise((_, reject)=> setTimeout(()=> reject(new Error('LLM_TIMEOUT')), timeoutMs))
    ]) as any;
  raw = result.response.text().trim().replace(/\n+/g,' ');
  text = raw || '';
    finishLLM(rec, { output: raw, json_parse_ok: false, validation_ok: true });
  } catch (e) {
    if (rec) finishLLM(rec, { output: raw, error: e, json_parse_ok: false, validation_ok: false });
    // fallback simple template
    text = `${opts.kind.replace(/[_\.]/g,' ')} update.`;
  }
  // Enforce required phrases if missing (simple fallback append)
  for (const phrase of opts.requiredPhrases || []) {
    if (!text.includes(phrase)) {
      // append ensuring space
      if (text.length + phrase.length + 1 < 160) text = text + ' ' + phrase;
    }
  }
  return text.slice(0,160);
}

// Higher level convenience for dynamic summary messages.
export async function generateSummary(kind: string, context: Record<string,any>, requiredPhrases?: string[]) {
  return generateReply({ kind, context, requiredPhrases });
}