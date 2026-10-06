#!/usr/bin/env npx tsx
/**
 * scaffold-format.ts - put one more UADE format onto the generic eagleplayer
 * runner (eagleplayer-wasm: UADE's score on the Musashi host).
 *
 *   npx tsx tools/eagleplayer/scaffold-format.ts --player <UADE player> --corpus <song> [options]
 *
 *   --player   file name in third-party/uade-3.05/players (e.g. SoundPlayer)
 *   --corpus   a song of the format under public/data/songs
 *   --id       table key / TrackerSong.eaglePlayerId (default: the player name, letters and digits)
 *   --label    display name (default: the player name)
 *   --prefixes comma list (default: eagleplayer.conf `prefixes=` of the player)
 *   --options  eagleplayer options (eagleoptions), rare
 *   --seconds  comparison length (default 30)
 *   --companions comma list of files beside the corpus song the player opens
 *              (e.g. smp.<tune>), passed by name as the app passes them
 *   --write    copy the player to public/eagleplayer/players/ and add the
 *              table entry to src/engine/eagleplayer/eaglePlayerFormats.ts
 *
 * Without --write it only measures: our render vs UADE's, 100 ms envelope of
 * the mono sum to the player's song end (tools/eagleplayer/eagleCompare.ts).
 *
 * The engine (EaglePlayerEngine), worklet and registry descriptor are shared
 * and read the table, and src/engine/__tests__/eaglePlayerPlaysFormats.test.ts
 * runs the watchdog render + UADE comparison for every table entry - so the
 * entry is the whole scaffold except the route. The entry is written with
 * isDefault: false; add the printed route to
 * src/lib/import/parsers/AmigaFormatParsers.ts, set isDefault: true, and the
 * same test proves the default load plays on EaglePlayer. Agreement under
 * 0.95 keeps the format on UADE (owner rule) - the entry records why.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareWithUade } from './eagleCompare';
import { eaglePlayerModuleName, type EaglePlayerFormat } from '../../src/engine/eagleplayer/eaglePlayerFormats';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TABLE = join(ROOT, 'src/engine/eagleplayer/eaglePlayerFormats.ts');
const THRESHOLD = 0.95;

function args(): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2);
    out[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
  return out;
}

function confPrefixes(player: string): string[] {
  const conf = readFileSync(join(ROOT, 'third-party/uade-3.05/eagleplayer.conf'), 'utf8');
  for (const line of conf.split('\n')) {
    const m = line.match(/^(\S+)\s+prefixes=(\S+)/);
    if (m && m[1] === player) return m[2].split(',').map((p) => p.toLowerCase());
  }
  return [];
}

function quote(s: string): string { return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`; }

async function main(): Promise<void> {
  const a = args();
  const player = typeof a.player === 'string' ? a.player : '';
  const corpus = typeof a.corpus === 'string' ? a.corpus : '';
  if (!player || !corpus) {
    console.error('usage: scaffold-format.ts --player <UADE player> --corpus <song> [--id X] [--label L] [--prefixes a,b] [--options O] [--seconds 30] [--write]');
    process.exit(2);
  }
  const playerPath = join(ROOT, 'third-party/uade-3.05/players', player);
  if (!existsSync(playerPath)) throw new Error(`no such UADE player: ${playerPath}`);
  const prefixes = typeof a.prefixes === 'string' ? a.prefixes.split(',').map((p) => p.trim().toLowerCase()) : confPrefixes(player);
  if (!prefixes.length) throw new Error(`no prefixes for ${player} (eagleplayer.conf); pass --prefixes`);
  const id = typeof a.id === 'string' ? a.id : player.replace(/[^A-Za-z0-9]/g, '');
  const table = readFileSync(TABLE, 'utf8');
  if (new RegExp(`^\\s+${id}: \\{`, 'm').test(table)) throw new Error(`${id} is already in eaglePlayerFormats.ts`);
  const seconds = typeof a.seconds === 'string' ? Number(a.seconds) : 30;
  const fmt: EaglePlayerFormat = {
    id, label: typeof a.label === 'string' ? a.label : player, player, prefixes, voices: 4,
    options: typeof a.options === 'string' ? a.options : undefined,
    corpus, uadeEnvelopeCorrelation: 0, isDefault: false,
  };

  const moduleName = eaglePlayerModuleName(fmt, basename(corpus));
  const companions = typeof a.companions === 'string'
    ? a.companions.split(',').map((f) => ({ name: basename(f.trim()), data: new Uint8Array(readFileSync(join(ROOT, f.trim()))) }))
    : [];
  const r = await compareWithUade(new Uint8Array(readFileSync(playerPath)), new Uint8Array(readFileSync(join(ROOT, corpus))), moduleName, seconds, companions);
  const corr = Math.round(r.correlation * 10000) / 10000;
  console.log(`${player} on ${corpus} as "${moduleName}"`);
  console.log(`  load ${r.loadResult} (${r.player || 'no player name'})${r.log ? `\n  score said:\n    ${r.log.trim().split('\n').join('\n    ')}` : ''}`);
  console.log(`  RMS ours ${r.oursRms.toFixed(4)}, UADE ${r.uadeRms.toFixed(4)}; song end ${r.songEndAt > 0 ? `${r.songEndAt.toFixed(2)} s` : 'none'} `);
  console.log(`  envelope correlation ${Number.isFinite(corr) ? corr : 'n/a'} over ${r.seconds} s (needs > ${THRESHOLD})`);
  const passes = r.loadResult === 0 && corr > THRESHOLD;
  if (!a.write) return;

  copyFileSync(playerPath, join(ROOT, 'public/eagleplayer/players', player));
  const held = passes
    ? 'route not added yet: add it to AmigaFormatParsers.ts and set isDefault: true'
    : `stays on UADE: ${r.loadResult !== 0 ? `load failed (${r.loadResult})` : `UADE agreement ${corr} < ${THRESHOLD}`}`;
  const entry = [
    `  ${id}: {`,
    `    id: ${quote(id)}, label: ${quote(fmt.label)}, player: ${quote(player)}, prefixes: [${prefixes.map(quote).join(', ')}], voices: 4,`,
    ...(fmt.options ? [`    options: ${quote(fmt.options)},`] : []),
    `    corpus: ${quote(corpus)}, uadeEnvelopeCorrelation: ${Number.isFinite(corr) ? corr : 0},`,
    ...(typeof a.companions === 'string' ? [`    companions: [${a.companions.split(',').map((f) => quote(f.trim())).join(', ')}],`] : []),
    `    isDefault: false,`,
    `    heldBecause: ${quote(held)},`,
    `  },`,
  ].join('\n');
  const end = table.indexOf('\n};', table.indexOf('export const EAGLE_PLAYER_FORMATS'));
  writeFileSync(TABLE, `${table.slice(0, end)}\n${entry}${table.slice(end)}`);
  console.log(`\nwrote ${id} to eaglePlayerFormats.ts and public/eagleplayer/players/${player}`);
  if (passes) {
    console.log(`\nroute (src/lib/import/parsers/AmigaFormatParsers.ts), then isDefault: true:\n`);
    console.log(`  if (matchesExt(filename, [${prefixes.map(quote).join(', ')}])) {`);
    console.log(`    const { withEaglePlayer } = await import('./withEaglePlayer');`);
    console.log(`    // the format's native parser if it has one, else null (UADE's scan draws the grid)`);
    console.log(`    return withEaglePlayer(${quote(id)}, ctx, null, toUADEPrefixName(originalFileName, [${prefixes.map(quote).join(', ')}]));`);
    console.log(`  }`);
  }
  console.log(`\ntest: npx vitest run src/engine/__tests__/eaglePlayerPlaysFormats.test.ts`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
