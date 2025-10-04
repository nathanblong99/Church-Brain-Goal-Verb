#!/usr/bin/env node
/**
 * Simple simulation harness for inbound SMS processing.
 * Usage (example):
 *   node dist/scripts/simulate_inbound.js --from +1555100100 --body "Can you find me 5 volunteers for next wednesday"
 * (After building with tsc). For direct TS via tsx: `npx tsx scripts/simulate_inbound.ts ...`
 */

import { handleInbound } from '../src/engine/inbound_router.js';
import * as peopleDb from '../src/adapters/people_db.js';
import { getEvents } from '../src/engine/events.js';

interface Args { from: string; body: string; }

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let from = '', body = '';
  for (let i=0;i<argv.length;i++) {
    const a = argv[i];
    if (a === '--from') from = argv[++i];
    else if (a === '--body') body = argv[++i];
  }
  if (!from || !body) {
    console.error('Required: --from <phone> --body <text>');
    process.exit(1);
  }
  return { from, body };
}

async function main() {
  // force-load people DB so staff detection works
  peopleDb.all();
  const { from, body } = parseArgs();
  console.log('--- Inbound Simulation ---');
  console.log('From:', from);
  console.log('Body:', body);
  const result = await handleInbound({ from, body });
  console.log('\nResult:');
  console.log(JSON.stringify(result, null, 2));
  console.log('\nRecent Events:');
  const recent = getEvents().slice(-10); // last 10
  console.log(JSON.stringify(recent, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
