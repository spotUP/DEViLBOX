/**
 * DJ view fit sweep (DJVR-29): for every common screen resolution, render the DJ
 * view at that size in the owner's real browser and read back what is clipped.
 *
 *   npx tsx tools/dj-layout-sweep.ts                run the cells not yet recorded
 *   npx tsx tools/dj-layout-sweep.ts --only 1280x720-3d    re-run one cell
 *   npx tsx tools/dj-layout-sweep.ts --failed       re-run the cells that failed
 *
 * It drives the running app through the MCP relay (ws://localhost:4003/mcp):
 * set_dj_layout_frame, then get_dj_layout_fit. The browser tab must be open on
 * the DJ view (npm run dev:fullstack). Verdicts go to test-data/dj-layout-fit.json
 * as each cell completes, so an interrupted sweep resumes where it stopped.
 *
 * PASS = the solver found a fit (no floor scroll), no region clipped, and every
 * budgeted band is no taller than its budget + 2 px.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws') as typeof import('ws').default;

const OUT = path.resolve('test-data/dj-layout-fit.json');
const TRACK = path.resolve('public/virus_native_reference.wav');
/** Browser chrome (tabs + toolbar) and the app status bar, subtracted from the screen. */
const CHROME = 100;
const STATUS_BAR = 30;
const BAND_TOLERANCE = 2;

const SCREENS: ReadonlyArray<readonly [number, number]> = [
  [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1512, 982], [1728, 1117], [1920, 1080], [2560, 1440],
];

interface Cell { id: string; width: number; height: number; decks: 2 | 3; deckC: 'none' | 'scratch' | 'track' }

const CELLS: Cell[] = [
  ...SCREENS.flatMap(([w, h]): Cell[] => [
    { id: `${w}x${h}-2d`, width: w, height: h - CHROME - STATUS_BAR, decks: 2, deckC: 'none' },
    { id: `${w}x${h}-3d`, width: w, height: h - CHROME - STATUS_BAR, decks: 3, deckC: 'scratch' },
  ]),
  { id: '1280x720-3d-ctrack', width: 1280, height: 720 - CHROME - STATUS_BAR, decks: 3, deckC: 'track' },
  { id: '1920x1080-3d-ctrack', width: 1920, height: 1080 - CHROME - STATUS_BAR, decks: 3, deckC: 'track' },
];

interface Verdict { id: string; pass: boolean; at: string; tier: string | null; steps: string[]; problems: string[]; fit?: unknown }

function call(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const attempt = (): Promise<Record<string, unknown>> => new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:4003/mcp');
    const id = Math.floor(Math.random() * 1e9);
    const timer = setTimeout(() => { ws.close(); resolve({ error: 'timeout' }); }, 60000);
    ws.on('open', () => ws.send(JSON.stringify({ id, type: 'call', method, params })));
    ws.on('message', (raw: Buffer) => {
      const m = JSON.parse(raw.toString()) as { id: number; type: string; error?: string; data?: Record<string, unknown> };
      if (m.id !== id) return;
      clearTimeout(timer);
      ws.close();
      resolve(m.type === 'error' ? { error: m.error } : (m.data ?? {}));
    });
    ws.on('error', () => { clearTimeout(timer); resolve({ error: 'ws error' }); });
  });
  return (async () => {
    let r: Record<string, unknown> = {};
    for (let i = 0; i < 10; i++) {
      r = await attempt();
      if (!(typeof r.error === 'string' && /No browser/.test(r.error))) break;
      await new Promise((s) => setTimeout(s, 2500));
    }
    return r;
  })();
}

async function setDeckC(on: boolean): Promise<void> {
  const code = `(async()=>{const root=document.querySelector('[data-dj-view]');const b=[...root.querySelectorAll('button')].find(x=>x.textContent.trim()==='Deck C');const isOn=b.className.includes('bg-accent-primary/20');if(isOn!==${on}){b.click();await new Promise(r=>setTimeout(r,500));}return true})()`;
  await call('evaluate_script', { code });
}

async function loadTrack(deck: 'A' | 'B' | 'C'): Promise<void> {
  const state = await call('dj_get_state');
  const decks = (state.decks ?? {}) as Record<string, { fileName?: string | null; trackName?: string | null }>;
  if (decks[deck]?.fileName) return;
  const data = fs.readFileSync(TRACK).toString('base64');
  const r = await call('dj_load_file', { deck, filename: path.basename(TRACK), data });
  if (r.error) throw new Error(`load ${deck}: ${String(r.error)}`);
  await new Promise((s) => setTimeout(s, 2500));
}

function judge(fit: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (fit.error) return [String(fit.error)];
  if (fit.floor) problems.push('solver found no fit (floor scroll)');
  for (const r of (fit.regions ?? []) as Array<{ region: string; clipped: boolean; clientHeight: number; scrollHeight: number; clientWidth: number; scrollWidth: number }>) {
    if (r.clipped) problems.push(`${r.region} clipped: height ${r.scrollHeight}/${r.clientHeight}, width ${r.scrollWidth}/${r.clientWidth}`);
  }
  for (const b of (fit.bands ?? []) as Array<{ band: string; region: string; budgeted: number | null; actual: number }>) {
    if (b.budgeted !== null && b.actual > b.budgeted + BAND_TOLERANCE) problems.push(`${b.region}/${b.band} is ${b.actual}, budget ${b.budgeted}`);
  }
  return problems;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const failedOnly = args.includes('--failed');
  const recorded: Record<string, Verdict> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

  const todo = CELLS.filter((c) => (only ? c.id === only : failedOnly ? recorded[c.id] && !recorded[c.id].pass : !recorded[c.id]));
  if (todo.length === 0) { console.log('nothing to run (all cells recorded; use --only <id> or --failed)'); return; }

  await call('set_active_view', { view: 'dj' });
  await loadTrack('A');
  await loadTrack('B');
  // Scratch-only Deck C cells first, then the cells that need a track on Deck C.
  for (const cell of [...todo].sort((a, b) => Number(a.deckC === 'track') - Number(b.deckC === 'track'))) {
    await setDeckC(cell.decks === 3);
    if (cell.deckC === 'track') await loadTrack('C');
    const zoom = Math.min(1, 1500 / cell.width);
    const set = await call('set_dj_layout_frame', { width: cell.width, height: cell.height, zoom });
    if (set.error) throw new Error(`frame ${cell.id}: ${String(set.error)}`);
    const fit = await call('get_dj_layout_fit');
    const problems = judge(fit);
    const verdict: Verdict = {
      id: cell.id, pass: problems.length === 0, at: new Date().toISOString(),
      tier: (fit.tier as string | null) ?? null, steps: (fit.steps as string[]) ?? [], problems,
      fit: problems.length ? fit : undefined,
    };
    recorded[cell.id] = verdict;
    fs.writeFileSync(OUT, JSON.stringify(recorded, null, 2));
    console.log(`${verdict.pass ? 'PASS' : 'FAIL'}  ${cell.id}  ${verdict.tier} [${verdict.steps.join(',')}]${problems.length ? '\n   ' + problems.join('\n   ') : ''}`);
  }
  await call('set_dj_layout_frame', {});
  await call('stop');
  const all = CELLS.map((c) => recorded[c.id]).filter(Boolean);
  console.log(`${all.filter((v) => v.pass).length} of ${CELLS.length} cells PASS (${all.length} recorded)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
