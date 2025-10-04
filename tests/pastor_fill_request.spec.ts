import { describe, it, expect } from 'vitest';
import { handleInbound } from '../src/engine/inbound_router.js';

// This test ensures inbound classification gracefully degrades when GEMINI_API_KEY is absent.
// We send a natural language fill request and expect a fallback 'unhandled' or partial flow
// rather than a thrown error.

describe('pastor fill role (LLM fallback)', () => {
	it('does not throw without GEMINI_API_KEY', async () => {
		delete process.env.GEMINI_API_KEY; // ensure missing
		const res = await handleInbound({ from: 'PastorPhone', body: 'Can you find 2 nursery volunteers for Oct 5 9am?' });
		expect(res).toBeTruthy();
		// Without model it will classify as unknown and return unhandled currently.
		expect(['unhandled','fill_role.pending','fill_role.created','fill_role.joined']).toContain(res.kind);
	});
});
