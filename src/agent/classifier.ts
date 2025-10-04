import '../env_bootstrap.ts';
import { buildGemini } from './gemini_client.js';
import { startLLM, finishLLM } from './llm_instrumentation.js';
import { INTENT_LIST, validateIntent, ClassifiedIntent } from './intent_schema.js';
import * as peopleDb from '../adapters/people_db.js';

function staffPhones() { return new Set(peopleDb.all().filter(p=>p.kind==='staff').map(p=>p.phone)); }

export async function classifyInbound(text: string, from: string): Promise<ClassifiedIntent> {
  // Simple rule shortcuts (cheap):
  const t = text.trim().toLowerCase();
  if (/^(yes|y)$/i.test(t)) return { intent:'volunteer_accept', confidence:0.99, slots:{} };
  if (/^(no|n)$/i.test(t)) return { intent:'volunteer_decline', confidence:0.99, slots:{} };
  if (/\brelease\b/i.test(t)) return { intent:'staff_release_excess', confidence:0.8, slots:{} };
  if (/\bkeep\b/i.test(t)) return { intent:'staff_keep_all', confidence:0.8, slots:{} };

  // Offline fallback: if no API key, return conservative unknown intent
  // This allows tests to exercise inbound flow without requiring a live model.
  if (!process.env.GEMINI_API_KEY) {
    return { intent: 'unknown', confidence: 0.1, slots: {} };
  }

  const isStaff = staffPhones().has(from);
  const allowed = isStaff ? INTENT_LIST : INTENT_LIST.filter(i=> i.startsWith('volunteer_') || ['ask_status','unknown','fill_role_request'].includes(i));
  const schemaDesc = allowed.join('|');
  const { model } = buildGemini();
  const prompt = [
    'Task: Classify the inbound church ops SMS into an intent and extract structured slots.',
    'Output JSON ONLY: {"intent":"...","confidence":0-1,"slots":{}}',
    `Allowed intents: ${schemaDesc}`,
    'Guidelines:\n- If ambiguous -> intent:"unknown" confidence <=0.4\n- Normalize datetimes to ISO if obvious\n- Minimal slots only',
    'If reducing target, include slot new_target (number).',
    `Text: ${JSON.stringify(text)}`
  ].join('\n\n');
  let rec: any | undefined; let raw: string | undefined; let jsonOk = false; let validationOk = false;
  try {
    rec = startLLM('classifier.classify', prompt);
    const result = await model.generateContent({ contents: [{ role:'user', parts:[{ text: prompt }]}]});
    raw = result.response.text().trim().replace(/```json|```/g,'');
    let json: any;
    try { json = JSON.parse(raw); jsonOk = true; } catch (e) {
      finishLLM(rec, { output: raw, error: e, json_parse_ok: false, validation_ok: false });
      throw e;
    }
    try { if (!validateIntent(json)) throw new Error('Invalid intent shape'); validationOk = true; } catch (e) {
      finishLLM(rec, { output: raw, error: e, json_parse_ok: jsonOk, validation_ok: false });
      throw e;
    }
    if (!allowed.includes(json.intent)) json.intent = 'unknown';
    finishLLM(rec, { output: raw, json_parse_ok: jsonOk, validation_ok: validationOk });
    return json;
  } catch (e) {
    if (rec) finishLLM(rec, { output: raw, error: e, json_parse_ok: jsonOk, validation_ok: validationOk });
    throw e;
  }
}
