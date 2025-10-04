import { describe, it, expect } from 'vitest';
import { runGoal } from '../src/engine/run_goal.js';

describe('runGoal orchestrator', () => {
  it('plans and executes (skip if no Gemini key)', async () => {
    if (!process.env.GEMINI_API_KEY) { expect(true).toBe(true); return; }
    const { plan, execution } = await runGoal({ goal: { kind: 'FillRole', role: 'nursery', count: 1, time: '2025-10-05T09:00:00-05:00' }, session: { tenantId: 'demo' } });
    expect(plan.method).toBeDefined();
    expect(execution).toBeTruthy();
  });
});
