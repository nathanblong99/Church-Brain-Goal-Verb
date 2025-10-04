import { buildGemini } from './gemini_client.js';
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
  const result = await model.generateContent({ contents: [{ role:'user', parts:[{ text: prompt }]}]});
  const raw = result.response.text().trim().replace(/```json|```/g,'');
  let json: any;
  try { json = JSON.parse(raw); } catch { throw new Error('Classifier output not JSON'); }
  if (!validateIntent(json)) throw new Error('Invalid intent shape');
  if (!allowed.includes(json.intent)) json.intent = 'unknown';
  return json;
}
