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
  /** Mechanically derived. Correct it — that is the job. */
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

  const tally = new Map<string, number>();
  for (const row of rows) tally.set(row.proposed, (tally.get(row.proposed) ?? 0) + 1);
  console.log('\nproposed readings:');
  for (const [k, v] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }
  close();
}

main().catch((e) => { console.error('[corpus] fatal:', e); close(); process.exit(1); });
