import { describe, it, expect } from 'vitest';
import { plan } from '../src/agent/planner.js';

describe('planner', () => {
  it('returns a plan for FillRole (skips live if no key)', async () => {
    if (!process.env.GEMINI_API_KEY) {
      expect(true).toBe(true);
      return;
    }
  const p = await plan({ goal: { kind: 'FillRole', role: 'nursery', count: 2, time: '2025-10-05T09:00:00-05:00' } }, { session: { tenantId: 'demo' } });
  expect(p.goal.kind).toBe('FillRole');
  expect(p.method).toBeDefined();
  expect(Array.isArray(p.steps)).toBe(true);
  expect(typeof p.rationale).toBe('string');
  expect(p.rationale.length).toBeGreaterThan(0);
  expect(p.complexity_score).toBeGreaterThan(0);
  });
});
