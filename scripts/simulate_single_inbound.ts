import 'dotenv/config';
import { handleInbound } from '../src/engine/inbound_router.js';

async function main(){
  const from = '+19998887777'; // random visitor number
  const body = 'what time is church on sunday?';
  const res = await handleInbound({ from, body });
  console.log('Inbound Result:', res);
}

main().catch(e=>{ console.error(e); process.exit(1); });
