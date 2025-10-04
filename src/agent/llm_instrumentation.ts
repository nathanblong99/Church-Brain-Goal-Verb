// Lightweight LLM instrumentation utilities.
// Collects recent call metadata for debugging without large log noise.

interface LLMRecord {
  id: number;
  label: string;
  start: number;
  end?: number;
  elapsed_ms?: number;
  prompt_hash: string;
  prompt_chars: number;
  output_chars?: number;
  ok?: boolean;
  error?: string;
  json_parse_ok?: boolean;
  validation_ok?: boolean;
}

const RING_SIZE = 50;
const ring: LLMRecord[] = [];
let seq = 1;

function hash(text: string): string {
  let h = 0, i = 0, len = text.length;
  while (i < len) { h = (h * 31 + text.charCodeAt(i++)) | 0; }
  return (h >>> 0).toString(16);
}

export function startLLM(label: string, prompt: string): LLMRecord {
  const rec: LLMRecord = {
    id: seq++,
    label,
    start: Date.now(),
    prompt_hash: hash(prompt),
    prompt_chars: prompt.length,
  };
  ring.push(rec);
  if (ring.length > RING_SIZE) ring.shift();
  return rec;
}

export function finishLLM(rec: LLMRecord, opts: { output?: string; error?: any; json_parse_ok?: boolean; validation_ok?: boolean }) {
  rec.end = Date.now();
  rec.elapsed_ms = rec.end - rec.start;
  if (opts.output !== undefined) rec.output_chars = opts.output.length;
  if (opts.error) { rec.ok = false; rec.error = String(opts.error.message || opts.error); }
  else rec.ok = true;
  if (opts.json_parse_ok !== undefined) rec.json_parse_ok = opts.json_parse_ok;
  if (opts.validation_ok !== undefined) rec.validation_ok = opts.validation_ok;
  if (process.env.DEBUG_LLM) {
    const base = `[llm] ${rec.label} id=${rec.id} hash=${rec.prompt_hash} ms=${rec.elapsed_ms} ok=${rec.ok}`;
    if (!rec.ok) console.warn(base, 'err=', rec.error);
    else console.debug(base, 'outChars=', rec.output_chars, 'jsonOk=', rec.json_parse_ok, 'valOk=', rec.validation_ok);
  }
}

export function recentLLMRecords() { return [...ring]; }
