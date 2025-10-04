import * as peopleDb from './people_db.js';

export interface PeopleSearchFilter {
  roles?: string[];
  campus?: string;
  is_active?: boolean;
}

export function searchPeople(filter: PeopleSearchFilter = {}) {
  const all = peopleDb.all();
  return all.filter(p => {
    if (filter.is_active !== undefined && p.is_active !== filter.is_active) return false;
    if (filter.roles && filter.roles.length) {
      if (!p.roles || !filter.roles.some(r => (p.roles||[]).includes(r))) return false;
    }
    if (filter.campus && p.campus !== filter.campus) return false;
    return true;
  });
}
