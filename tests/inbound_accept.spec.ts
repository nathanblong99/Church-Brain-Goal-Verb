import { describe, it, expect } from 'vitest';
import { getVerb } from '../src/verbs/index.js';
import { handleInbound } from '../src/engine/inbound_router.js';
import { db } from '../src/adapters/db.js';

async function makeOffers() {
  const makeOffersVerb = getVerb('make_offers');
  await makeOffersVerb.run({ people: ['A','B'], role: 'nursery', time: '2025-10-05T09:00:00-05:00', request_id: 'REQ' }, { now: () => new Date(), emit: () => {}, env: {} });
}

describe('inbound YES', () => {
  it('accepts an offer', async () => {
    await makeOffers();
  const res = await handleInbound({ from: 'A', body: 'YES' });
  expect(res.kind).toBe('offer.accepted');
  expect(typeof res.reply).toBe('string');
    const assignments = db.getAssignments('REQ');
    expect(assignments.find(a => a.volunteer_id === 'A' && a.state === 'accepted')).toBeTruthy();
  });
});
