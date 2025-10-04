// Seed or augment church info database with sample facilities, services, and events.
import { load, addFacility, addEvent, addService, dataPath, listFacilities, listEvents, listServices } from '../src/adapters/church_info_db.js';
import * as peopleDb from '../src/adapters/people_db.js';

function pick<T>(arr: T[]) { return arr[Math.floor(Math.random()*arr.length)]; }

const facilitiesSeed = [
  { name: 'Main Sanctuary', capacity: 500, location: 'Building A', rooms: ['Floor'], notes: 'Primary worship space' },
  { name: 'Fellowship Hall', capacity: 200, location: 'Building B', rooms: ['Hall'], notes: 'Meals & large gatherings' },
  { name: 'Student Center', capacity: 120, location: 'Building C', rooms: ['Auditorium','Game Room'], notes: 'Youth ministry hub' },
  { name: 'Children Wing', capacity: 150, location: 'Building D', rooms: ['Nursery','PreK','Elementary'], notes: 'Secure check-in required' },
  { name: 'Gym', capacity: 250, location: 'Family Life Center', rooms: ['Court'], notes: 'Multipurpose sports/outreach' },
  { name: 'Prayer Chapel', capacity: 40, location: 'Building A', rooms: ['Chapel'], notes: 'Quiet space' },
  { name: 'Cafe', capacity: 60, location: 'Lobby', rooms: ['Service Counter'], notes: 'Open Sundays & events' }
];

const eventTitles = [
  'Youth Worship Night','Leadership Training','Volunteer Appreciation Dinner','Community Outreach Prep',
  'Prayer and Worship Evening','Staff Vision Retreat','Marriage Workshop','Kids VBS Planning Meeting',
  'Missions Informational Lunch','Baptism Class','New Member Orientation','Tech Team Workshop'
];

const ministries = ['students','worship','children','hospitality','tech','prayer','outreach'];

// Choose a staff phone for ownership
const staff = peopleDb.all().filter(p => p.kind === 'staff');
if (!staff.length) throw new Error('Seed people first (scripts/seed.ts) to have staff records');
const staffPhone = pick(staff).phone;

load();

// Seed facilities if empty
if (!listFacilities().length) {
  for (const f of facilitiesSeed) addFacility(f, staffPhone);
}

// Seed weekly services (next 8 Sundays)
function nextSunday(d: Date) { const dt = new Date(d); dt.setDate(dt.getDate() + ((7 - dt.getDay()) % 7)); return dt; }
if (!listServices().length) {
  let start = nextSunday(new Date());
  for (let i=0;i<8;i++) {
    const s = new Date(start.getTime() + i*7*24*3600*1000);
    const startIso = new Date(s.setHours(15, 0, 0, 0)).toISOString(); // 10:00 local placeholder (using UTC shift simplified)
    const endIso = new Date(s.getTime() + 90*60000).toISOString();
    addService({ campus: pick(['north','south','east','west','online']), start: startIso, end: endIso, ministries_needed: { nursery: 4, children: 8, worship: 6, tech: 3 } }, staffPhone);
  }
}

// Seed random events (10) if fewer than 5 existing
if (listEvents().length < 5) {
  for (let i=0;i<10;i++) {
    const start = new Date(Date.now() + (i+2) * 3 * 24 * 3600 * 1000); // spaced every ~3 days
    const end = new Date(start.getTime() + (60 + Math.floor(Math.random()*120))*60000);
    const facility = pick(listFacilities());
    const title = pick(eventTitles);
    addEvent({ title, description: `${title} for ${pick(ministries)} ministry`, start: start.toISOString(), end: end.toISOString(), facility_id: facility.id, ministry: pick(ministries) }, staffPhone);
  }
}

console.log('Church info seeded at', dataPath());
console.log('Facilities:', listFacilities().length, 'Events:', listEvents().length, 'Services:', listServices().length);
