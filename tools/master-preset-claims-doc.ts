/**
 * Writes thoughts/shared/research/2026-10-08_master-preset-claims.md from the claim
 * table (src/constants/masterPresetClaims.ts), so the research record and the test
 * cannot drift apart. Measured numbers come from a test run with CLAIMS_DUMP:
 *   CLAIMS_DUMP=/path/dump.jsonl npx vitest run --config vite.config.ts src/constants/__tests__/masterPresetClaims.test.ts
 *   npx tsx tools/master-preset-claims-doc.ts /path/dump.jsonl [tools/master-fx-claims-live.json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FX_PRESETS } from '../src/constants/fxPresets';
import { PRESET_CLAIMS, LIVE_CLAIMS, liveOnlyReason, type Claim, type Metric } from '../src/constants/masterPresetClaims';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, '../thoughts/shared/research/2026-10-08_master-preset-claims.md');
const dumpFile = process.argv[2];
const liveFile = process.argv[3];
const measured = new Map<string, number>();
if (dumpFile && fs.existsSync(dumpFile)) for (const l of fs.readFileSync(dumpFile, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); measured.set(`${r.preset}|${r.say}`, r.value); }
const live: Record<string, Record<string, unknown>> = liveFile && fs.existsSync(liveFile) ? JSON.parse(fs.readFileSync(liveFile, 'utf8')) : {};

const metric = (m: Metric): string => {
  switch (m.k) {
    case 'tilt': return `tilt ${m.hz} Hz vs ${m.ref ?? 1000} Hz`;
    case 'thd': return `harmonics of a ${m.hz} Hz sine`;
    case 'gr': return `gain reduction, ${m.hz ?? 1000} Hz sine to ${m.hi ?? -10} dBFS`;
    default: return m.k;
  }
};
const bound = (c: Claim) => [c.min !== undefined ? `>= ${c.min}` : '', c.max !== undefined ? `<= ${c.max}` : ''].filter(Boolean).join(' and ');

const lines: string[] = [];
lines.push('---', 'date: 2026-10-08', 'topic: master FX presets - what each description promises, as numbers', 'tags: [fx, presets, calibration, FX5]', 'status: final', '---', '');
lines.push('# Master FX preset claims', '');
lines.push('Every claim in a preset description (src/constants/fxPresets.ts) is a metric with a bound. The table is the test (src/constants/__tests__/masterPresetClaims.test.ts) and was written before the presets were retuned; presets whose chain missed a bound were retuned (reusing the chain\'s own effects) until it measured. "Offline" is the real effect nodes rendered by src/test/audio/masterChainRig.ts (WASM effects through their real worklets); "live" is measure_master_effect on a playing MOD in Chrome (tools/master-fx-claims-live.ts).', '');
lines.push('Metrics: tilt = gain of a third-octave noise band minus the 1 kHz band (a Web Audio compressor adds automatic make-up, so absolute gains move with its threshold); thd = harmonics 2-6 of a -12 dBFS sine under the fundamental; gr = a -40 dBFS to -10 dBFS step minus the output rise; crest/bvr on a drum loop; tail/echo/shimmer on noise bursts; am/fm swing of a 1 kHz sine; width on half-correlated stereo noise; noise from silence; ceil = hot drum loop peak.', '');
for (const [group, table] of Object.entries(PRESET_CLAIMS)) {
  lines.push(`## ${group}`, '');
  for (const [name, claims] of Object.entries(table)) {
    const p = FX_PRESETS.find((x) => x.name === name);
    lines.push(`### ${name}`, '', `> ${p?.description ?? ''}`, '', '| Claim | Metric | Target | Offline |', '|---|---|---|---|');
    for (const c of claims) lines.push(`| ${c.say} | ${metric(c.m)} | ${bound(c)} | ${measured.get(`${name}|${c.say}`) ?? ''} |`);
    lines.push('');
  }
}
lines.push('## Live only (the offline rig cannot build the chain)', '');
for (const p of FX_PRESETS) {
  const reason = liveOnlyReason(p.effects);
  if (!reason) continue;
  const claims = LIVE_CLAIMS[p.name] ?? [];
  lines.push(`### ${p.name}`, '', `> ${p.description}`, '', `Why live only: ${reason}`, '', '| Claim | Metric | Target | Live |', '|---|---|---|---|');
  for (const c of claims) lines.push(`| ${c.say} | ${metric(c.m)} | ${bound(c)} | ${(live[p.name] as { results?: Record<string, number> } | undefined)?.results?.[c.say] ?? ''} |`);
  lines.push('');
}
fs.writeFileSync(OUT, lines.join('\n'));
console.log('wrote', OUT);
