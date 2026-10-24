/**
 * Extract SunVox controller metadata from the open psynth sources.
 *
 * Each open module declares its controllers with
 *   psynth_register_ctl( synth_id, name, label, min, max, def, type, &value, net )
 * (third-party/sunvox_sources-master/sunvox_engine/psynth/psynth.h:208). `label` is the unit, or for a
 * selector (type 1) a slash-separated list of the value names. The shipped SunVox.wasm reports name/min/
 * max/type/group at runtime but no label or default, so those come from this generated table.
 *
 * Usage: npx tsx tools/extract-sunvox-ctls.ts
 * Writes src/engine/sunvox/sunvoxModuleControls.generated.ts
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PSYNTH_DIR = join(ROOT, 'third-party/sunvox_sources-master/sunvox_engine/psynth');
const OUT = join(ROOT, 'src/engine/sunvox/sunvoxModuleControls.generated.ts');

export interface ExtractedCtl {
  name: string;
  /** Unit text ("ms", "ch."); empty for selectors and unitless controls. */
  unit: string;
  min: number;
  max: number;
  def: number;
  /** 0 = continuous, 1 = selector. */
  type: number;
  enumLabels?: string[];
}

/** Strip // and block comments, keeping string literals intact. */
function stripComments(src: string): string {
  return src.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_m, str: string | undefined) => str ?? '');
}

/** #define NAME <number> and enum { A = n, B, ... } constants of one file. */
function collectConstants(src: string): Map<string, number> {
  const consts = new Map<string, number>();
  for (const m of src.matchAll(/^\s*#define\s+(\w+)\s+(-?\d+)\s*$/gm)) consts.set(m[1], Number(m[2]));
  for (const m of src.matchAll(/\benum\s*\w*\s*\{([^}]*)\}/g)) {
    let next = 0;
    for (const raw of m[1].split(',')) {
      const item = raw.trim();
      if (!item) continue;
      const [name, value] = item.split('=').map((s) => s.trim());
      if (value !== undefined) next = evalExpr(value, consts);
      consts.set(name, next);
      next++;
    }
  }
  return consts;
}

/** Integer expression of literals, known constants and + - * / ( ). */
function evalExpr(expr: string, consts: Map<string, number>): number {
  const substituted = expr.replace(/[A-Za-z_]\w*/g, (id) => {
    const v = consts.get(id);
    if (v === undefined) throw new Error(`unknown constant ${id} in "${expr}"`);
    return String(v);
  });
  if (!/^[\d\s+\-*/()]+$/.test(substituted)) throw new Error(`unsupported expression "${expr}"`);
  return Math.trunc(Number(new Function(`return (${substituted});`)()));
}

/** Split a C argument list on top-level commas, respecting string literals and parentheses. */
function splitArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '', inStr = false;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (inStr) {
      cur += ch;
      if (ch === '\\') cur += args[++i];
      else if (ch === '"') inStr = false;
    } else if (ch === '"') { inStr = true; cur += ch; }
    else if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function cString(arg: string): string {
  const m = /^"((?:\\.|[^"\\])*)"$/.exec(arg);
  if (!m) throw new Error(`expected string literal, got ${arg}`);
  return m[1].replace(/\\(.)/g, '$1');
}

export function extractModule(srcRaw: string): { typeName: string; controls: ExtractedCtl[] } {
  const src = stripComments(srcRaw);
  const nameMatch = /COMMAND_GET_SYNTH_NAME\s*:\s*retval\s*=\s*\(\s*int\s*\)\s*"([^"]+)"/.exec(src);
  if (!nameMatch) throw new Error('no COMMAND_GET_SYNTH_NAME');
  const consts = collectConstants(src);
  const controls: ExtractedCtl[] = [];
  for (const m of src.matchAll(/psynth_register_ctl\s*\(([^;]*)\)\s*;/g)) {
    const a = splitArgs(m[1]);
    if (a.length !== 9) throw new Error(`psynth_register_ctl with ${a.length} args: ${m[0]}`);
    const label = cString(a[2]);
    const type = evalExpr(a[6], consts);
    const ctl: ExtractedCtl = {
      name: cString(a[1]),
      unit: type === 1 && label.includes('/') ? '' : label,
      min: evalExpr(a[3], consts),
      max: evalExpr(a[4], consts),
      def: evalExpr(a[5], consts),
      type,
    };
    if (type === 1 && label.includes('/')) ctl.enumLabels = label.split('/');
    controls.push(ctl);
  }
  return { typeName: nameMatch[1], controls };
}

export function extractAll(dir = PSYNTH_DIR): Record<string, ExtractedCtl[]> {
  const table: Record<string, ExtractedCtl[]> = {};
  for (const file of readdirSync(dir).filter((f) => /^psynths_.*\.cpp$/.test(f)).sort()) {
    const { typeName, controls } = extractModule(readFileSync(join(dir, file), 'utf8'));
    table[typeName] = controls;
  }
  return table;
}

function render(table: Record<string, ExtractedCtl[]>): string {
  const body = JSON.stringify(table, null, 2);
  return `// GENERATED by tools/extract-sunvox-ctls.ts from third-party/sunvox_sources-master/sunvox_engine/psynth.
// Do not edit by hand: run \`npx tsx tools/extract-sunvox-ctls.ts\`.

export interface SunVoxStaticCtl {
  name: string;
  /** Unit text; empty for selectors and unitless controllers. */
  unit: string;
  min: number;
  max: number;
  def: number;
  /** 0 = continuous, 1 = selector. */
  type: number;
  /** Selector value names, index 0 = min. */
  enumLabels?: string[];
}

/** Controllers per SunVox module type name (as sv_get_module_type reports it), in registration order. */
export const SUNVOX_MODULE_CONTROLS: Readonly<Record<string, readonly SunVoxStaticCtl[]>> = ${body};
`;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const table = extractAll();
  writeFileSync(OUT, render(table));
  const count = Object.values(table).reduce((n, c) => n + c.length, 0);
  console.log(`[OK] ${Object.keys(table).length} module types, ${count} controllers -> ${OUT}`);
}
