import fs from 'node:fs/promises';
import path from 'node:path';
import Handlebars from 'handlebars';

const cache = new Map<string, Handlebars.TemplateDelegate>();

export async function renderTemplate(name: string, vars: Record<string, any>): Promise<string> {
  let tmpl = cache.get(name);
  if (!tmpl) {
    const file = path.join(process.cwd(), 'src', 'templates', `${name}.hbs`);
    const source = await fs.readFile(file, 'utf8');
    tmpl = Handlebars.compile(source);
    cache.set(name, tmpl);
  }
  return tmpl(vars);
}

export function clearTemplateCache(){ cache.clear(); }
