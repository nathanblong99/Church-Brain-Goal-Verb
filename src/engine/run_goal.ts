import { plan } from '../agent/planner.js';
import { runMethod } from './executor.js';
import { logEvent } from './events.js';
import { listVerbs } from '../verbs/index.js';

interface RunGoalOptions {
  goal: any;
  session: { tenantId: string; campus?: string };
  ctx?: Record<string, any>;
}

export async function runGoal(opts: RunGoalOptions) {
  logEvent('goal.start', { goal: opts.goal });
  const p = await plan({ goal: opts.goal }, { session: opts.session });
  logEvent('planner.output', { plan: p, rationale: p.rationale, complexity: p.complexity_score });
  const result = await runMethod(p.method, {
    goal: p.goal,
    ctx: opts.ctx,
    verbContext: { now: () => new Date(), emit: () => {}, env: {} }
  });
  logEvent('goal.end', { success: result.success });
  return { plan: p, execution: result };
}
