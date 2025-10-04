// Persistent (local JSON) people dataset loader & query facade.
// Ensures that seeding occurs exactly once per process.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export interface PersonRecord {
  id: string; kind: 'member' | 'staff'; full_name: string; first_name: string; last_name: string;
  phone: string; age: number; campus: string; ministries: string[]; roles: string[]; is_active: boolean;
}

let cache: { people: PersonRecord[]; byId: Map<string, PersonRecord> } | null = null;

function load(): PersonRecord[] {
  if (cache) return cache.people;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const dataFile = join(__dirname, '..', '..', 'data', 'people.json');
  const raw = JSON.parse(readFileSync(dataFile, 'utf-8')) as PersonRecord[];
  cache = { people: raw, byId: new Map(raw.map(p => [p.id, p])) };
  return raw;
}

export function query(filter: any): PersonRecord[] {
  const people = load();
  return people.filter(p => {
    if (filter?.roles) {
      const roles = Array.isArray(filter.roles) ? filter.roles : [filter.roles];
      if (!roles.some((r: string) => p.ministries.includes(r))) return false;
    }
    if (filter?.campus && p.campus !== filter.campus) return false;
    if (filter?.is_active !== undefined && p.is_active !== filter.is_active) return false;
    return true;
  });
}

export function get(id: string) {
  load();
  return cache!.byId.get(id);
}

export function all() { return load(); }