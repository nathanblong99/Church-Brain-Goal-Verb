import '../env_bootstrap.ts';
import { buildGemini } from './gemini_client.js';
import { listVerbs, getVerb } from '../verbs/index.js';
import { startLLM, finishLLM } from './llm_instrumentation.js';

/*
 * Experimental free-form planner: Given the raw inbound message + minimal context,
 * ask the model to directly produce a plan of verb calls to satisfy the user's goal.
 * This bypasses the existing classifier + structured planner pipeline.
 *
 * Schema (best-effort):
 * {
 *   "goal_summary": string,
 *   "steps": [ { "call": string, "args": object, "save_as"?: string } ],
 *   "reply_template"?: string
 * }
 *
 * Execution:
 *  - Each step.call must be in registered verbs list.
 *  - Args are passed as-is (no strict schema enforcement here: HIGH RISK MODE).
 *  - If save_as provided, the result of verb.run gets stored under that key for later template substitution.
 *  - After steps, if reply_template provided, interpolate {{var}} with JSON-stringified stored values (primitive flattening) and return reply.
 */

export interface ExperimentalPlanStep {
  call: string;
  args?: any;
  save_as?: string;
}
export interface ExperimentalPlan {
  goal_summary: string;
  steps: ExperimentalPlanStep[];
  reply_template?: string;
}

function buildPrompt(message: string, context: any){
  return [
    'You are an autonomous church operations assistant. Generate a JSON plan to achieve the user\'s request using ONLY available verbs.',
    `Available verbs: ${listVerbs().join(', ')}`,
    'JSON schema: {"goal_summary":"...","steps":[{"call":"verb_name","args":{...},"save_as":"optional"}],"reply_template":"optional short SMS <=160 chars"}',
    'Rules:',
    '- Use as few steps as possible.',
    '- If the user only needs information, you may skip steps and just produce a reply_template.',
    '- reply_template may reference saved variables like {{candidates}} or {{candidates[0].id}}.',
    '- JSON ONLY. No markdown.',
    `Message: ${JSON.stringify(message)}`,
    `Context: ${JSON.stringify(context)}`
  ].join('\n\n');
}

export async function generateExperimentalPlan(message: string, context: any = {}): Promise<ExperimentalPlan | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  const { model } = buildGemini();
  const prompt = buildPrompt(message, context);
  const rec = startLLM('experimental.plan', prompt);
  let raw: string | undefined;
  try {
    const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }]}] });
    raw = result.response.text().trim().replace(/```json|```/g,'');
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch (e) { finishLLM(rec, { output: raw, error: e, json_parse_ok: false, validation_ok: false }); return null; }
    if (!parsed || !Array.isArray(parsed.steps)) { finishLLM(rec, { output: raw, error: new Error('missing steps'), json_parse_ok: true, validation_ok: false }); return null; }
    finishLLM(rec, { output: raw, json_parse_ok: true, validation_ok: true });
    return parsed as ExperimentalPlan;
  } catch (e) {
    finishLLM(rec, { output: raw, error: e, json_parse_ok: false, validation_ok: false });
    return null;
  }
}

export async function executeExperimentalPlan(plan: ExperimentalPlan, execCtx: any){
  const store: Record<string, any> = {};
  for (const step of plan.steps) {
    if (!listVerbs().includes(step.call)) continue; // skip unknown
    try {
      const verb = getVerb(step.call as any);
      const result = await verb.run(step.args || {}, execCtx);
      if (step.save_as) store[step.save_as] = result;
    } catch (e) {
      store['__error'] = String((e as any).message || e);
      break;
    }
  }
  let reply: string | undefined;
  if (plan.reply_template) {
    reply = interpolate(plan.reply_template, store);
  }
  return { store, reply };
}

function interpolate(tpl: string, bag: Record<string, any>): string {
  return tpl.replace(/{{([^}]+)}}/g, (_, expr) => {
    try {
      const path = expr.trim();
      const val = resolvePath(bag, path);
      if (val == null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    } catch { return ''; }
  });
}

function resolvePath(obj: any, path: string) {
  if (path.includes('[') || path.includes('.')) {
    // very naive eval-like resolution but safe subset
    const segments: (string|number)[] = [];
    path.split('.').forEach(part => {
      const m = part.match(/([^\[]+)(.*)/);
      if (!m) return;
      const head = m[1];
      if (head) segments.push(head);
      const rest = m[2];
      if (rest) {
        const idxMatches = [...rest.matchAll(/\[(\d+)\]/g)];
        for (const im of idxMatches) segments.push(Number(im[1]));
      }
    });
    let cur = obj;
    for (const seg of segments) {
      if (cur == null) return undefined;
      cur = cur[seg as any];
    }
    return cur;
  }
  return obj[path];
}
