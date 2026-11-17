/**
 * Generates the per-system Furnace effect table from Furnace's own sysDef.cpp
 * (effectHandlers / postEffectHandlers / preEffectHandlers of every DivSysDef).
 *
 *   furnace-wasm/common/FurnaceEffectTable.gen.h        C++: sysDef.cpp's handler-building code
 *                                                        verbatim, compiled into the WASM sequencer
 *   src/engine/furnace-dispatch/furnaceEffectTable.gen.ts  TS: the same maps, evaluated by running
 *                                                        that C++ natively (clang++), for the live
 *                                                        cell-effect path (FurnaceEffectRouter)
 *
 * Both outputs come from one parse of sysDef.cpp. Usage:
 *   npx tsx tools/gen-furnace-effect-table.ts           write both outputs
 *   npx tsx tools/gen-furnace-effect-table.ts --check   exit 1 if checked-in outputs are stale
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const engineDir = join(root, 'third-party/furnace-master/src/engine');
const HEADER_OUT = join(root, 'furnace-wasm/common/FurnaceEffectTable.gen.h');
const TS_OUT = join(root, 'src/engine/furnace-dispatch/furnaceEffectTable.gen.ts');

/** Index of the char after the bracket matching the one at `open`, skipping strings and comments. */
function matchClose(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      for (i++; src[i] !== c; i++) if (src[i] === '\\') i++;
    } else if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i);
    } else if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i) + 1;
    } else if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') if (--depth === 0) return i + 1;
  }
  throw new Error('unbalanced brackets');
}

/** Split `(a, b, {c, d})` content at top-level commas. */
function splitArgs(inner: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '"' || c === "'") {
      for (i++; inner[i] !== c; i++) if (inner[i] === '\\') i++;
    } else if (c === '/' && inner[i + 1] === '/') {
      i = inner.indexOf('\n', i);
    } else if (c === '(' || c === '{' || c === '[') i = matchClose(inner, i) - 1;
    else if (c === ',') {
      out.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  out.push(inner.slice(start));
  return out.map((a) => a.trim());
}

function systemEnum(sysDefH: string): Map<string, number> {
  const body = sysDefH.slice(sysDefH.indexOf('enum DivSystem {')).split('};')[0];
  const ids = new Map<string, number>();
  let n = 0;
  for (const m of body.matchAll(/^\s*(DIV_SYSTEM_\w+)\s*(?:=\s*(\d+))?/gm)) {
    if (m[2] !== undefined) n = Number(m[2]);
    ids.set(m[1], n++);
  }
  return ids;
}

/** Hash of every input; both outputs embed it so a test can detect stale files without clang. */
export function inputHash(): string {
  const h = createHash('sha256');
  for (const f of [join(engineDir, 'sysDef.cpp'), join(engineDir, 'sysDef.h'), join(engineDir, 'dispatch.h'), import.meta.filename]) {
    h.update(readFileSync(f));
  }
  return h.digest('hex').slice(0, 16);
}

function cmdEnumSrc(): string {
  const dispatchH = readFileSync(join(engineDir, 'dispatch.h'), 'utf8');
  const enumStart = dispatchH.indexOf('enum DivDispatchCmds {');
  return dispatchH.slice(enumStart, dispatchH.indexOf('};', enumStart) + 2);
}

function buildHeader(): { header: string; maxSys: number } {
  const sysDef = readFileSync(join(engineDir, 'sysDef.cpp'), 'utf8');
  const sysDefH = readFileSync(join(engineDir, 'sysDef.h'), 'utf8');
  const sysIds = systemEnum(sysDefH);

  const structFrom = sysDefH.indexOf('typedef int EffectValConversion');
  const mapTypedef = sysDefH.indexOf('EffectHandlerMap;', structFrom);
  const structs = sysDefH.slice(structFrom, mapTypedef + 'EffectHandlerMap;'.length);
  const helpers = sysDef.slice(
    sysDef.indexOf('template<const int val> int constVal'),
    sysDef.indexOf('// these are channel definition helpers.'),
  );

  const bodyStart = sysDef.indexOf('\n', sysDef.indexOf('void DivEngine::registerSystems() {')) + 1;
  const bodyEnd = sysDef.indexOf('  for (int i=0; i<DIV_SYSTEM_MAX; i++) {\n    if (sysDefs[i]==NULL) continue;');
  let body = sysDef.slice(bodyStart, bodyEnd).replace(/^\s*logD\(.*\);\n/m, '');

  // Replace every `sysDefs[X]=new DivSysDef(args);` with a call keeping only the three handler maps.
  const re = /sysDefs\[(DIV_SYSTEM_\w+)\]=new DivSysDef\(/g;
  let out = '';
  let last = 0;
  let count = 0;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(body, open);
    const args = splitArgs(body.slice(open + 1, close - 1));
    if (args.length < 16 || args.length > 19) throw new Error(`${m[1]}: ${args.length} args`);
    const id = sysIds.get(m[1]);
    if (id === undefined) throw new Error(`${m[1]} not in DivSystem enum`);
    const [fx, post, pre] = [16, 17, 18].map((i) => args[i] || '{}');
    out += body.slice(last, m.index) + `furnaceSetFx(${id} /* ${m[1].slice(11)} */, ${fx}, ${post}, ${pre})`;
    last = close;
    count++;
    re.lastIndex = close;
  }
  out += body.slice(last);
  if (/sysDefs\[/.test(out)) throw new Error('unconverted sysDefs[] use left in body');
  const maxSys = Math.max(...sysIds.values());

  const header = `// GENERATED by tools/gen-furnace-effect-table.ts from third-party/furnace-master/src/engine/sysDef.cpp
// (${count} DivSysDef entries). Do not edit; regenerate with: npx tsx tools/gen-furnace-effect-table.ts
// The handler maps below are Furnace's own code, copied verbatim; only the DivSysDef metadata is dropped.
// source-hash: ${inputHash()}
// DivDispatchCmds is Furnace's own enum from dispatch.h, emitted unless dispatch.h itself is included.
#pragma once
#include <unordered_map>
#include <functional>
#ifndef _DISPATCH_H
${cmdEnumSrc()}
#endif
#ifndef _
#define _(x) x
#endif

${structs}

${helpers}
struct FurnaceFxSet {
  const EffectHandlerMap *fx = nullptr, *post = nullptr, *pre = nullptr;  // const-valued maps are not assignable
};
enum { FURNACE_FX_EFFECT = 0, FURNACE_FX_POST = 1, FURNACE_FX_PRE = 2 };
#define FURNACE_FX_SYSTEMS ${maxSys + 1}

static FurnaceFxSet g_furnaceFx[FURNACE_FX_SYSTEMS];
static void furnaceSetFx(int sys, const EffectHandlerMap& fx, const EffectHandlerMap& post, const EffectHandlerMap& pre) {
  g_furnaceFx[sys].fx = new EffectHandlerMap(fx);
  g_furnaceFx[sys].post = new EffectHandlerMap(post);
  g_furnaceFx[sys].pre = new EffectHandlerMap(pre);
}

static void furnaceBuildEffectTables() {
${out}}

/** The handler Furnace would use for (system, effect) in the given lane, or nullptr. */
static const EffectHandler* furnaceFindEffect(int kind, int sys, int effect) {
  static bool built = false;
  if (!built) {
    furnaceBuildEffectTables();
    built = true;
  }
  if (sys < 0 || sys >= FURNACE_FX_SYSTEMS) return nullptr;
  const EffectHandlerMap* m = kind == FURNACE_FX_EFFECT ? g_furnaceFx[sys].fx : kind == FURNACE_FX_POST ? g_furnaceFx[sys].post : g_furnaceFx[sys].pre;
  if (!m) return nullptr;
  auto it = m->find((unsigned char)effect);
  return it == m->end() ? nullptr : &it->second;
}
`;
  return { header, maxSys };
}

type Lane = Record<number, [number, number, number, string]>;
interface Dump {
  systems: Record<string, { effect: Lane; post: Lane; pre: Lane }>;
  pool: (number | null)[][];
}

function dumpNative(header: string): Dump {
  const dir = mkdtempSync(join(tmpdir(), 'furfx-'));
  try {
    const src = `#include <cstdio>
#include <map>
#include <vector>
#include <cstring>
#include "table.h"
static void jstr(const char* s) {
  putchar('"');
  for (; s && *s; s++) {
    unsigned char c = *s;
    if (c == '"' || c == '\\\\') printf("\\\\%c", c);
    else if (c < 32) printf("\\\\u%04x", c);
    else putchar(c);
  }
  putchar('"');
}
int main() {
  std::vector<std::vector<int>> pool;
  auto poolId = [&](EffectValConversion* f, int effect) -> int {
    if (!f) return -1;
    std::vector<int> a;
    for (int v = 0; v < 256; v++) {
      try { a.push_back(f(effect, v)); } catch (DivDoNotHandleEffect&) { a.push_back(2147483647); }
    }
    for (size_t i = 0; i < pool.size(); i++) if (pool[i] == a) return (int)i;
    pool.push_back(a);
    return (int)pool.size() - 1;
  };
  furnaceFindEffect(0, 0, 0);
  printf("{\\"systems\\":{");
  bool firstSys = true;
  for (int s = 0; s < FURNACE_FX_SYSTEMS; s++) {
    const EffectHandlerMap* lanes[3] = {g_furnaceFx[s].fx, g_furnaceFx[s].post, g_furnaceFx[s].pre};
    if (!lanes[0] || (!lanes[0]->size() && !lanes[1]->size() && !lanes[2]->size())) continue;
    printf("%s\\"%d\\":{", firstSys ? "" : ",", s);
    firstSys = false;
    const char* names[3] = {"effect", "post", "pre"};
    for (int k = 0; k < 3; k++) {
      std::map<int, const EffectHandler*> sorted;
      for (auto& e : *lanes[k]) sorted[e.first] = &e.second;
      printf("%s\\"%s\\":{", k ? "," : "", names[k]);
      bool first = true;
      for (auto& e : sorted) {
        printf("%s\\"%d\\":[%d,%d,%d,", first ? "" : ",", e.first, (int)e.second->dispatchCmd, poolId(e.second->val, e.first), poolId(e.second->val2, e.first));
        jstr(e.second->description);
        printf("]");
        first = false;
      }
      printf("}");
    }
    printf("}");
  }
  printf("},\\"pool\\":[");
  for (size_t i = 0; i < pool.size(); i++) {
    printf("%s[", i ? "," : "");
    for (int v = 0; v < 256; v++) {
      if (pool[i][v] == 2147483647) printf("%snull", v ? "," : ""); else printf("%s%d", v ? "," : "", pool[i][v]);
    }
    printf("]");
  }
  printf("]}\\n");
  furnaceFindEffect(0, 0, 0);
  return 0;
}
`;
    writeFileSync(join(dir, 'table.h'), header);
    writeFileSync(join(dir, 'dump.cpp'), src);
    try {
      execFileSync('clang++', ['-std=c++17', '-O0', '-w', '-I', dir, join(dir, 'dump.cpp'), '-o', join(dir, 'dump')], { stdio: 'pipe' });
    } catch (e) {
      throw new Error(String((e as { stderr?: Buffer }).stderr).split('\n').filter((l) => /error/.test(l)).slice(0, 8).join('\n'));
    }
    return JSON.parse(execFileSync(join(dir, 'dump'), { maxBuffer: 64 * 1024 * 1024 }).toString());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function buildTs(dump: Dump): string {
  const cmdNames = new Map<number, string>();
  const dispatchH = readFileSync(join(engineDir, 'dispatch.h'), 'utf8');
  const e = dispatchH.slice(dispatchH.indexOf('enum DivDispatchCmds {'));
  let n = 0;
  for (const m of e.slice(0, e.indexOf('};')).matchAll(/^\s*(DIV_CMD_\w+)\s*(?:=\s*(\w+))?/gm)) {
    if (m[2] !== undefined) n = Number(m[2]);
    cmdNames.set(n++, m[1]);
  }
  const lane = (l: Lane) =>
    Object.keys(l)
      .map(Number)
      .sort((a, b) => a - b)
      .map((k) => `${k}:[${l[k].slice(0, 3).join(',')}]`)
      .join(',');
  const text = (l: Lane) =>
    Object.keys(l)
      .map(Number)
      .sort((a, b) => a - b)
      .map((k) => `${k}:${JSON.stringify(l[k][3])}`)
      .join(',');
  const systems = Object.keys(dump.systems)
    .map(Number)
    .sort((a, b) => a - b)
    .map((s) => {
      const d = dump.systems[s];
      return `  ${s}:{effect:{${lane(d.effect)}},post:{${lane(d.post)}},pre:{${lane(d.pre)}}},`;
    })
    .join('\n');
  const texts = Object.keys(dump.systems)
    .map(Number)
    .sort((a, b) => a - b)
    .map((s) => {
      const d = dump.systems[s];
      return `  ${s}:{effect:{${text(d.effect)}},post:{${text(d.post)}},pre:{${text(d.pre)}}},`;
    })
    .join('\n');
  const cmds = [...cmdNames].map(([k, v]) => `${k}:'${v}'`).join(',');
  return `// GENERATED by tools/gen-furnace-effect-table.ts from sysDef.cpp. Do not edit.
// source-hash: ${inputHash()}
// Per Furnace system id (DivSystem): effect / post / pre handler maps. Each entry is
// [dispatch command, val pool index, val2 pool index]; a pool index of -1 means Furnace's default
// (val = effect parameter, val2 = 0). Pool rows map the effect parameter 0..255 to the converted
// value (null = Furnace throws DivDoNotHandleEffect).
export type FurnaceEffectEntry = readonly [cmd: number, val: number, val2: number];
export interface FurnaceSystemEffects {
  effect: Readonly<Record<number, FurnaceEffectEntry>>;
  post: Readonly<Record<number, FurnaceEffectEntry>>;
  pre: Readonly<Record<number, FurnaceEffectEntry>>;
}

export const FURNACE_EFFECT_POOL: ReadonlyArray<ReadonlyArray<number | null>> = ${JSON.stringify(dump.pool)};

export const FURNACE_EFFECT_TABLE: Readonly<Record<number, FurnaceSystemEffects>> = {
${systems}
};

/** Furnace's own help string (EffectHandler.description) for every handler in FURNACE_EFFECT_TABLE. */
export const FURNACE_EFFECT_TEXT: Readonly<Record<number, { effect: Readonly<Record<number, string>>; post: Readonly<Record<number, string>>; pre: Readonly<Record<number, string>> }>> = {
${texts}
};

export const FURNACE_DISPATCH_CMD_NAMES: Readonly<Record<number, string>> = {${cmds}};
`;
}

async function coverage(dump: Dump): Promise<void> {
  const mod = (await import(TS_OUT)) as { FURNACE_EFFECT_TABLE: Record<number, Record<string, Record<number, unknown>>> };
  let pairs = 0;
  let missing = 0;
  for (const [sys, lanes] of Object.entries(dump.systems)) {
    for (const lane of ['effect', 'post', 'pre'] as const) {
      for (const code of Object.keys(lanes[lane])) {
        pairs++;
        if (!mod.FURNACE_EFFECT_TABLE[Number(sys)]?.[lane]?.[Number(code)]) missing++;
      }
    }
  }
  console.log(`coverage: ${Object.keys(dump.systems).length} systems, ${pairs} (system, lane, effect) handlers, ${missing} missing from the TS table`);
}

async function main(): Promise<void> {
  if (!existsSync(join(engineDir, 'sysDef.cpp'))) throw new Error('third-party/furnace-master missing');
  const { header } = buildHeader();
  const dump = dumpNative(header);
  const ts = buildTs(dump);
  if (process.argv.includes('--check')) {
    const stale = [[HEADER_OUT, header], [TS_OUT, ts]].filter(([p, t]) => !existsSync(p) || readFileSync(p, 'utf8') !== t);
    if (stale.length) {
      console.error('stale:', stale.map(([p]) => p).join(', '));
      process.exit(1);
    }
    return;
  }
  writeFileSync(HEADER_OUT, header);
  writeFileSync(TS_OUT, ts);
  console.log('wrote', HEADER_OUT, TS_OUT);
  await coverage(dump);
}

if (process.argv[1]?.endsWith('gen-furnace-effect-table.ts')) void main();
