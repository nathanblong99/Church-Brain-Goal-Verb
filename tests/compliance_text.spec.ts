import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Simple compliance test: ensure no outbound-facing source contains forbidden directive phrases
// like "Reply KEEP" or "Reply RELEASE" etc. Natural language principle forbids instructional keyword replies.

const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /Reply\s+KEEP/i, reason: 'Should not instruct user to reply with KEEP' },
  { pattern: /Reply\s+RELEASE/i, reason: 'Should not instruct user to reply with RELEASE' },
  { pattern: /Reply\s+STATUS/i, reason: 'Should not instruct user to reply with STATUS command' },
  { pattern: /Reply\s+FILL/i, reason: 'Should not instruct user to reply with FILL command' },
  { pattern: /Reply\s+REB/i, reason: 'Should not instruct user to reply with REB command' },
  { pattern: /\bSEND\s+KEEP\b/i, reason: 'Imperative keyword prompt not allowed' },
  { pattern: /\bSEND\s+RELEASE\b/i, reason: 'Imperative keyword prompt not allowed' }
];

// Directories to scan for user-facing strings (src + templates + Agent doc)
const PROJECT_ROOT = path.resolve(__dirname, '..'); // tests directory parent is project root

function gatherFiles(dir: string, acc: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // skip node_modules and external symlinks
      if (e.name === 'node_modules') continue;
      acc = gatherFiles(full, acc);
    } else if (/\.(ts|js|md|hbs|txt)$/i.test(e.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('Natural language communication compliance', () => {
  const thisFile = __filename;
  const files = gatherFiles(PROJECT_ROOT).filter(f => !/\/dist\//.test(f) && f !== thisFile);
  it('contains no forbidden keyword reply instructions', () => {
    const violations: { file: string; line: number; text: string; reason: string }[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return; // ignore comments
        FORBIDDEN_PATTERNS.forEach(p => {
          if (p.pattern.test(line)) {
            violations.push({ file, line: idx + 1, text: line.trim(), reason: p.reason });
          }
        });
      });
    }
    if (violations.length) {
      const msg = violations.map(v => `${v.file}:${v.line} -> ${v.reason}: ${v.text}`).join('\n');
      throw new Error('Forbidden keyword reply directives found:\n' + msg);
    }
    expect(violations.length).toBe(0);
  });
});
