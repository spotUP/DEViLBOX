import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../public/data/songs');
let byName: Map<string, string> | null = null;

/** Absolute path of a bundled song by file name, wherever its format directory is. */
export function songFile(name: string): string {
  // Fixtures sit one level down (<format>/<name>): check those before walking the whole corpus
  // (46k files; the full walk blocks the test thread past its timeout on a loaded machine).
  if (!byName) {
    for (const dir of readdirSync(ROOT, { withFileTypes: true })) {
      const p = join(ROOT, dir.name, name);
      if (dir.isDirectory() && existsSync(p)) return p;
    }
  }
  if (!byName) {
    byName = new Map();
    for (const dir of readdirSync(ROOT, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const walk = (d: string): void => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (!byName!.has(e.name)) byName!.set(e.name, p);
        }
      };
      walk(join(ROOT, dir.name));
    }
  }
  const hit = byName.get(name) ?? (existsSync(join(ROOT, name)) ? join(ROOT, name) : undefined);
  if (!hit) throw new Error(`song not found under public/data/songs: ${name}`);
  return hit;
}
