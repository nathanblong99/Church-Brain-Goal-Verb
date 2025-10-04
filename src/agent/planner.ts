import { buildGemini } from './gemini_client.js';
import { validatePlan, RawPlan } from './plan_schema.js';
import { listVerbs } from '../verbs/index.js';

const KNOWN_METHODS = new Set(['fill_roles', 'rebalance_roles', 'cancel_request']);

export interface PlannerContext {
  session: { tenantId: string; campus?: string };
  requestSnapshot?: any;
}

export interface PlannerInput { goal: any; }

export async function plan(input: PlannerInput, ctx: PlannerContext): Promise<RawPlan> {
  const { model } = buildGemini();
  const prompt = buildPrompt(input.goal, ctx);
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });
  const text = result.response.text().trim();
  const json = extractJson(text);
  validateOrThrow(json);
  // Compute a simple local complexity score (not part of model output)
  json.complexity_score = computeComplexity(json);
  return json;
}

function buildPrompt(goal: any, ctx: PlannerContext) {
  return [
    systemFrame(),
    sessionFrame(ctx),
    taskFrame(goal),
    'Include a concise overall reasoning string field "rationale" (<=120 chars) explaining method/ordering choice.',
    'Return ONLY compact JSON: {"goal":...,"method":...,"rationale":"...","steps":[...],"success_when":[...]}. No extra text.'
  ].join('\n\n');
}

function systemFrame() {
  return `SYSTEM FRAME:\nYou are the Planner. Output valid JSON only. No explanations. Verbs: ${listVerbs().join(', ')}`;
}
function sessionFrame(ctx: PlannerContext) {
  return `SESSION FRAME:\nTenant=${ctx.session.tenantId} Campus=${ctx.session.campus || 'default'} Snapshot=${JSON.stringify(ctx.requestSnapshot || null)}`;
}
function taskFrame(goal: any) { return `TASK FRAME:\nGoal=${JSON.stringify(goal)}`; }

function extractJson(raw: string) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* try brace match */ }
  const m = cleaned.match(/\{[\s\S]*\}$/); if (!m) throw new Error('Planner output not JSON');
  return JSON.parse(m[0]);
}

function validateOrThrow(plan: any) {
  if (!validatePlan(plan)) throw new Error('Plan validation failed');
  if (!KNOWN_METHODS.has(plan.method)) throw new Error(`Unknown method ${plan.method}`);
  for (const s of plan.steps) {
    if (!listVerbs().includes(s.call)) throw new Error(`Unknown verb ${s.call}`);
  }
}

function computeComplexity(plan: RawPlan): number {
  try {
    const distinctVerbs = new Set(plan.steps.map(s => s.call)).size;
    const stepCount = plan.steps.length;
    const score = distinctVerbs + 0.5 * stepCount;
    return Math.round(score * 100) / 100; // 2 decimal places
  } catch {
    return 0;
  }
}
