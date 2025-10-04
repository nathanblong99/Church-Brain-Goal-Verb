import { describe, it, expect } from 'vitest';
import { listVerbs } from '../src/verbs/index.js';

describe('bootstrap', () => {
  it('registers core verbs', () => {
    const verbs = listVerbs();
    expect(verbs).toContain('search_people');
    expect(verbs).toContain('assign');
  });
});
