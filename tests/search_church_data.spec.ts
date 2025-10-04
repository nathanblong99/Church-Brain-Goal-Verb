import { describe, it, expect } from 'vitest';
import { getVerb } from '../src/verbs/index.js';
import * as churchInfo from '../src/adapters/church_info_db.js';

// Minimal fixture injection: ensure at least one event with target keywords.
function ensureEvent(title: string, desc: string) {
  const existing = churchInfo.listEvents().find(e => e.title === title);
  if (existing) return existing.id;
  // Add draft event (will infer status)
  const evt = churchInfo.addEvent({ title, description: desc, start: new Date(Date.now()+60*24*3600*1000).toISOString(), end: new Date(Date.now()+60*24*3600*1000+3600000).toISOString(), ministry: 'students' }, '+1555100100');
  return evt.id;
}

describe('search_church_data verb', () => {
  it('returns events matching keywords', async () => {
    const id = ensureEvent('Christmas Play', 'Nativity drama focusing on hope and community');
    const verb = getVerb('search_church_data');
    const res = await verb.run({ query: 'christmas play' }, { now: () => new Date(), emit: ()=>{}, env: {} });
    expect(res.events.some((e: any) => e.id === id)).toBe(true);
    expect(res.meta.tokens).toContain('christmas');
    expect(typeof res.meta.matched).toBe('number');
  });

  it('handles no keyword matches gracefully', async () => {
    const verb = getVerb('search_church_data');
    const res = await verb.run({ query: 'zzzwontmatch' }, { now: () => new Date(), emit: ()=>{}, env: {} });
    expect(res.events.length).toBe(0);
    expect(res.meta.matched).toBe(0);
  });
});
