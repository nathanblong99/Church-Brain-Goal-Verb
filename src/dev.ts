import 'dotenv/config';
import { runGoal } from './engine/run_goal.js';

async function main(){
  if(!process.env.GEMINI_API_KEY){
    console.log('No GEMINI_API_KEY set; skipping live planner. Provide key to see full plan.');
    return;
  }
  const res = await runGoal({ goal: { kind: 'FillRole', role: 'nursery', count: 2, time: new Date().toISOString() }, session: { tenantId: 'demo', campus: 'main' } });
  console.log('Plan:', res.plan);
  console.log('Execution success:', res.execution.success);
}
main().catch(e=>{ console.error(e); process.exit(1); });
