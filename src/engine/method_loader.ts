import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'yaml';

export interface MethodDefStep { call: string; args?: any; out?: string; foreach?: string }
export interface MethodDef { method: string; applicable_if?: string; steps: MethodDefStep[]; success_when?: string[] }

const cache = new Map<string, MethodDef>();

export async function loadMethod(methodName: string): Promise<MethodDef> {
  if (cache.has(methodName)) return cache.get(methodName)!;
  const file = path.join(process.cwd(), 'src', 'methods', `${methodName}.yaml`);
  const raw = await fs.readFile(file, 'utf8');
  const parsed = yaml.parse(raw) as MethodDef;
  if (parsed.method !== methodName) throw new Error(`Method name mismatch in ${file}`);
  cache.set(methodName, parsed);
  return parsed;
}

export function clearMethodCache(){ cache.clear(); }
