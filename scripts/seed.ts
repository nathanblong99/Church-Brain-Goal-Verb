// Seed script: creates an in-memory dataset of members & staff.
// Run with: npm run seed (while process alive) OR import in tests/dev runtime.
// (In-memory only; restart clears data.)

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Simple in-memory people store (augment existing db adapter later)
export interface Person {
  id: string;
  kind: 'member' | 'staff';
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  age: number;
  campus: string;
  ministries: string[]; // areas they can serve
  roles: string[];      // staff roles or leader tags
  is_active: boolean;
}

const firstNames = ['Alex','Jamie','Taylor','Jordan','Casey','Riley','Morgan','Avery','Quinn','Hayden','Parker','Reese','Rowan','Blake','Emerson','Finley','Harper','Kendall','Logan','Reagan'];
const lastNames  = ['Smith','Johnson','Williams','Brown','Jones','Miller','Davis','Garcia','Rodriguez','Wilson','Martinez','Anderson','Taylor','Thomas','Hernandez','Moore','Martin','Jackson','Thompson','White'];
const campuses   = ['north','south','east','west','online'];
const ministries = ['nursery','children','students','hospitality','worship','tech','prayer','outreach'];
const staffRoles = ['pastor','associate_pastor','worship_pastor','youth_pastor','kids_director','tech_director','outreach_lead','care_pastor','executive_pastor','operations','finance','facilities','communications','discipleship','missions'];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random()*arr.length)]; }
function pickMany<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    const i = Math.floor(Math.random()*copy.length);
    out.push(copy.splice(i,1)[0]);
  }
  return out;
}

function phone(i: number) { return `+1555${String(100000 + i).slice(-6)}`; }

export const people: Person[] = [];

// Determine persistence file path (relative to project root data/people.json)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataFile = join(__dirname, '..', 'data', 'people.json');

if (existsSync(dataFile)) {
  const raw = JSON.parse(readFileSync(dataFile, 'utf-8')) as Person[];
  people.push(...raw);
} else {
  // Generate members
  for (let i=0;i<100;i++) {
    const fn = pick(firstNames);
    const ln = pick(lastNames);
    const id = `M${i+1}`;
    const mins = pickMany(ministries, 1 + Math.floor(Math.random()*3));
    people.push({
      id,
      kind: 'member',
      first_name: fn,
      last_name: ln,
      full_name: `${fn} ${ln}`,
      phone: phone(i),
      age: 16 + Math.floor(Math.random()*55),
      campus: pick(campuses),
      ministries: mins,
      roles: [],
      is_active: Math.random() > 0.05
    });
  }
  // Generate staff
  for (let i=0;i<15;i++) {
    const fn = pick(firstNames);
    const ln = pick(lastNames);
    const id = `S${i+1}`;
    const role = staffRoles[i] || pick(staffRoles);
    people.push({
      id,
      kind: 'staff',
      first_name: fn,
      last_name: ln,
      full_name: `${fn} ${ln}`,
      phone: phone(100 + i),
      age: 25 + Math.floor(Math.random()*40),
      campus: pick(campuses),
      ministries: pickMany(ministries, 1 + Math.floor(Math.random()*2)),
      roles: [role],
      is_active: true
    });
  }
  writeFileSync(dataFile, JSON.stringify(people, null, 2));
}

// Indexes
const byId = new Map(people.map(p => [p.id, p] as const));

// Query helpers
export function findPeople(filter: any) {
  // Basic filter fields supported: roles (ministries), campus, is_active
  return people.filter(p => {
    if (filter?.roles) {
      const roles = Array.isArray(filter.roles) ? filter.roles : [filter.roles];
      if (!roles.some((r: string) => p.ministries.includes(r))) return false;
    }
    if (filter?.campus && p.campus !== filter.campus) return false;
    if (filter?.is_active !== undefined && p.is_active !== filter.is_active) return false;
    return true;
  }).map(p => p.id);
}

// Expose registry
(globalThis as any).__PEOPLE_DATA__ = { people, byId, findPeople, dataFile };

console.log(`Loaded people dataset (${people.length} total; ${people.filter(p=>p.kind==='staff').length} staff) from ${existsSync(dataFile) ? 'disk' : 'memory'} at ${dataFile}`);
console.log('Sample:', people.slice(0,3));
