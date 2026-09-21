#!/usr/bin/env npx tsx
/**
 * Channel evidence corpus — ground truth for the Channel Intelligence phases.
 *
 * Phase 0 of `thoughts/shared/plans/2026-09-22-channel-intelligence.md`, moved
 * ahead of the classification phases on purpose. Every bug found on
 * 2026-09-21/22 was inaudible: three that removed an audio path and still
 * sounded plausible, and a classifier that labels every AHX channel `bass`
 * while the music plainly disagrees. A phase that cannot be scored is a phase
 * that will be argued about instead of measured.
 *
 * What it does: loads each song through the real import path, reads
 * `get_channel_evidence`, and writes one row per channel-pattern with the
 * measurements, a mechanically PROPOSED reading, and `label: null` for a human
 * to fill in. The proposal is a starting point to correct, never an answer —
 * it is derived from the evidence by the crude rules in `propose()` below, and
 * disagreeing with it is the entire point of having a corpus.
 *
 * Re-running preserves any `label` already set, keyed by song/order/channel, so
 * labelling survives a re-measure.
 *
 * Prereq: `npm run dev:fullstack` and a browser tab on the app.
 * Usage: npx tsx tools/channel-evidence-corpus.ts
 */

import { connect, call, sleep, close } from './lib/mcpRelay';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { basename, dirname, resolve } from 'path';

const OUT = resolve(
  'src/bridge/analysis/__tests__/fixtures/channel-evidence-corpus.json',
);

/**
 * Songs to measure — chosen for FORMAT spread, not for being easy.
 *
 * The AHX pair is what exposed the all-bass collapse; the MOD/XM/IT/S3M
 * entries carry named samples and real drum kits, so they exercise the
 * evidence layer on material where a human label is obvious and the current
 * classifier has a fair chance. A corpus of only hard cases measures nothing.
 */
const SONGS = [
  'public/data/songs/ahx/amanda.ahx',
  'server/data/modland-cache/files/pub__modules__AHX__Mortimer Twang__jennipha.ahx',
  'public/data/songs/formats/aces_high.ahx',
  'public/data/songs/formats/hexplosion.hvl',
  'public/data/songs/formats/a sleep so deep.mod',
  'public/data/songs/formats/flo boarding - level 1.xm',
  'public/data/songs/formats/absm chain mod.it',
  'public/data/songs/formats/andante.s3m',
];

/** How many order positions to take per song. Enough to catch a channel
 *  changing character, short of dumping an entire arrangement. */
const MAX_ORDER = 8;

interface Row {
  song: string;
  format: string;
  orderIndex: number;
  patternIndex: number;
  channelIndex: number;
  channelName: string | null;
  silent: boolean;
  /** Rounded so the file stays readable and diffs stay small. */
  evidence: Record<string, number | boolean | number[]> | null;
  /** Name of the instrument this channel-pattern mostly uses, when the format
   *  carries one. AHX/HVL instruments are named with ASCII art, so this is
   *  usually noise there and genuinely informative on MOD/XM/IT/S3M. */
  instrumentName: string | null;
  /** What that NAME alone suggests, independent of the measurements. */
  nameHint: string | null;
  /** Mechanically derived from the measurements. Correct it — that is the job. */
  proposed: string;
  /** Human ground truth. null until somebody fills it in. */
  label: string | null;
  /** Free text for the labeller: why, or what makes it ambiguous. */
  note?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * A crude reading of the evidence, for a human to argue with.
 *
 * Deliberately simple and deliberately NOT the classifier under test: if this
 * shared code with `classifyChannel`, the corpus would agree with the thing it
 * exists to score.
 */
function propose(c: any): string {
  if (c.silent) return 'silent';
  const p = c.pitch, r = c.rhythm, h = c.harmony;
  if (h.maxPolyphony >= 3) return r.offbeatRatio > 0.6 ? 'chord-skank' : 'chord';
  if (r.skankConfidence >= 0.65) return 'skank';
  if (p.median <= 28 && p.stepwiseRatio >= 0.5) return 'bass';
  if (p.median <= 28) return 'bass-or-low-perc';
  if (r.density >= 0.4 && p.stepwiseRatio >= 0.5 && p.range <= 12) return 'arpeggio';
  if (r.density >= 0.25 && p.leapRatio >= 0.4) return 'lead';
  if (r.regularity >= 0.9 && r.density >= 0.2 && p.range <= 5) return 'percussion-or-pulse';
  if (r.density <= 0.08 && p.range >= 12) return 'stab-or-fx';
  return 'unclear';
}

/**
 * What an instrument NAME suggests, on its own. LOW-confidence evidence.
 *
 * Tracker sample and instrument name slots were a message board. Musicians put
 * greetings, credits and liner notes in them, not descriptions of the sound —
 * stated by the author 2026-09-22 and visible all over this corpus: the AHX
 * entries read `for Revision 2017`, `by AceMan`, `Put into tracker`,
 * `lost count a long`, one phrase of a paragraph per instrument slot.
 *
 * So a name is never identity here. Matching stays deliberately NARROW even
 * though that leaves coverage on the table — only 31 of 552 rows come back
 * decisive. Widening it to catch the concatenated demoscene names (`jstbass5`,
 * `jsttom1`) would also start matching greetings that happen to contain
 * "bell" or "bass", and a hint that is right most of the time is worse than no
 * hint when a human is using it to write ground truth.
 *
 * Written out here rather than imported from `ChannelNaming`, at the cost of
 * some duplication: the corpus exists to score that module, and sharing its
 * regexes would make the two agree by construction.
 */
function hintFromName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw.toLowerCase().trim();
  // Chip formats put the song's liner notes in the instrument slots — measured
  // in this corpus: "for Revision 2017", "by AceMan", "lost count a long".
  // Anything without letters, or that reads as an address, tells us nothing.
  if (!/[a-z]{3}/.test(n)) return null;
  if (/@|http|www\./.test(n)) return null;

  // Substring, not word-boundary. Demoscene sample names are concatenated —
  // `jstbass5`, `jsttom1`, `jstdrumriff1` — and `\bbass\b` matches none of
  // them. That mistake cost this corpus most of its usable names on the first
  // pass: 31 rows instead of the 100+ the names actually support.
  //
  // Ordered most specific first, because these overlap: "bassdrum" contains
  // "bass", and "openhat" contains "hat".
  const tokens: [RegExp, string][] = [
    [/bassdrum|bass ?drum|\bbd\d|kick|\bkik/, 'kick'],
    [/snare|\bsnr|\bsd\d/, 'snare'],
    [/hihat|hi-hat|openhat|closedhat|\bhat|\bhh\d/, 'hat'],
    [/clap|snap/, 'clap'],
    [/tom\d|\btom\b|conga|bongo|shaker|tamb|clave|ride|crash|cymbal|\bperc|drumriff|\bdrum/, 'percussion'],
    [/bass|\bsub\b|\b303\b/, 'bass'],
    [/lead|\bsolo|melody/, 'lead'],
    [/\bpad\b|string|choir|atmos|\bstr\d/, 'pad'],
    [/chord|stab|skank|organ|piano|rhodes|bell|\bepi/, 'chord-or-keys'],
    [/\bvox|vocal|voice|speech/, 'vocal'],
    [/\bfx\b|\bsfx|noise|sweep|riser|\bzap/, 'fx'],
  ];
  for (const [re, hint] of tokens) if (re.test(n)) return hint;
  return null;
}

function loadExistingLabels(): Map<string, { label: string | null; note?: string }> {
  const map = new Map<string, { label: string | null; note?: string }>();
  if (!existsSync(OUT)) return map;
  try {
    const prev = JSON.parse(readFileSync(OUT, 'utf8')) as { rows?: Row[] };
    for (const row of prev.rows ?? []) {
      if (row.label === null && !row.note) continue;
      map.set(`${row.song}|${row.orderIndex}|${row.channelIndex}`, { label: row.label, note: row.note });
    }
  } catch { /* a corrupt or older file is not worth failing over */ }
  return map;
}

async function main(): Promise<void> {
  await connect();
  const kept = loadExistingLabels();
  console.log(`[corpus] ${kept.size} existing label(s) will be preserved`);

  const rows: Row[] = [];
  const summary: { song: string; format: string; channels: number; rows: number; skipped?: string }[] = [];

  for (const path of SONGS) {
    const name = basename(path);
    if (!existsSync(path)) {
      console.log(`[corpus] SKIP ${name} — not on disk`);
      summary.push({ song: name, format: '?', channels: 0, rows: 0, skipped: 'missing' });
      continue;
    }
    let format = '?';
    try {
      const bytes = readFileSync(path);
      const loaded = await call('load_file', { filename: name, data: bytes.toString('base64') }, 60000);
      format = loaded?.format ?? '?';
      await sleep(900);
    } catch (e) {
      console.log(`[corpus] SKIP ${name} — load failed: ${(e as Error).message}`);
      summary.push({ song: name, format, channels: 0, rows: 0, skipped: 'load failed' });
      continue;
    }

    // Instrument names are fetched per song, not per row: the list is small
    // and the same for every pattern.
    const names = new Map<number, string>();
    try {
      for (const inst of (await call('get_instruments_list', {}, 30000)) ?? []) {
        if (typeof inst?.id === 'number') names.set(inst.id, String(inst.name ?? ''));
      }
    } catch { /* format may not expose instruments */ }

    const ev = await call('get_channel_evidence', {}, 60000);
    if (!ev?.patternsLoaded) {
      console.log(`[corpus] SKIP ${name} — no patterns after load`);
      summary.push({ song: name, format, channels: 0, rows: 0, skipped: 'no patterns' });
      continue;
    }

    let added = 0;
    for (const entry of (ev.entries ?? []).slice(0, MAX_ORDER)) {
      for (const c of entry.channels ?? []) {
        const key = `${name}|${entry.orderIndex}|${c.channelIndex}`;
        const prior = kept.get(key);
        const domId = c.source?.instrumentIds?.[0];
        const instName = typeof domId === 'number' ? (names.get(domId) ?? null) : null;
        rows.push({
          song: name,
          format,
          orderIndex: entry.orderIndex,
          patternIndex: entry.patternIndex,
          channelIndex: c.channelIndex,
          channelName: ev.names?.[c.channelIndex] ?? null,
          silent: c.silent,
          evidence: c.silent ? null : {
            lowest: c.pitch.lowest,
            highest: c.pitch.highest,
            median: c.pitch.median,
            range: c.pitch.range,
            stepwiseRatio: r2(c.pitch.stepwiseRatio),
            leapRatio: r2(c.pitch.leapRatio),
            uniquePitchClasses: c.pitch.uniquePitchClasses,
            octaveSpread: c.pitch.octaveSpread,
            density: r3(c.rhythm.density),
            offbeatRatio: r2(c.rhythm.offbeatRatio),
            skankConfidence: r2(c.rhythm.skankConfidence),
            medianInterOnset: c.rhythm.medianInterOnset,
            regularity: r2(c.rhythm.regularity),
            maxPolyphony: c.harmony.maxPolyphony,
            monophonic: c.harmony.monophonic,
            instrumentCount: c.source.instrumentIds.length,
            dominance: r2(c.source.dominance),
          },
          instrumentName: instName,
          nameHint: hintFromName(instName),
          proposed: propose(c),
          label: prior?.label ?? null,
          ...(prior?.note ? { note: prior.note } : {}),
        });
        added++;
      }
    }
    summary.push({ song: name, format, channels: ev.channelCount, rows: added });
    console.log(`[corpus] ${name.padEnd(46)} ${String(format).padEnd(16)} ${added} rows`);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    note: 'Ground truth for Channel Intelligence. `proposed` is mechanical; `label` is human and authoritative. Re-running preserves labels.',
    summary,
    rows,
  }, null, 2) + '\n');

  const labelled = rows.filter(r => r.label !== null).length;
  console.log(`\n[corpus] ${rows.length} rows across ${summary.filter(s => !s.skipped).length} songs -> ${OUT}`);
  console.log(`[corpus] ${labelled} labelled, ${rows.length - labelled} awaiting a human`);

  const withHint = rows.filter(r => r.nameHint !== null);
  console.log(`[corpus] ${withHint.length} rows carry a decisive instrument name`);
  if (withHint.length > 0) {
    const hintTally = new Map<string, number>();
    for (const row of withHint) hintTally.set(row.nameHint!, (hintTally.get(row.nameHint!) ?? 0) + 1);
    console.log('name hints:');
    for (const [k, v] of [...hintTally.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(22)} ${v}`);
    }
  }

  const tally = new Map<string, number>();
  for (const row of rows) tally.set(row.proposed, (tally.get(row.proposed) ?? 0) + 1);
  console.log('\nproposed readings:');
  for (const [k, v] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }
  close();
}

main().catch((e) => { console.error('[corpus] fatal:', e); close(); process.exit(1); });
