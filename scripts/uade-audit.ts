#!/usr/bin/env npx tsx
/**
 * uade-audit.ts — UADE Format Synthesis Status Audit
 *
 * Produces a three-tier status table for every extension in UADE_EXTENSIONS:
 *   FULLY_NATIVE     — custom WASM synth + UI editor; no UADE needed for synthesis
 *   NATIVE_SAMPLER   — native parser extracts PCM samples (Sampler instruments); no UADE synth
 *   DETECTION_ONLY   — native parser for detection/names, but synthesis still via UADESynth
 *   UADE_ONLY        — no native parser; pure UADE catch-all
 *
 * Output: docs/uade-audit-YYYY-MM-DD.md
 *
 * Usage: npx tsx scripts/uade-audit.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

// ── Status type ───────────────────────────────────────────────────────────────

type Status = 'FULLY_NATIVE' | 'NATIVE_SAMPLER' | 'DETECTION_ONLY' | 'UADE_ONLY';

interface ExtensionRecord {
  ext: string;
  formatGroup: string;
  status: Status;
  synthType: string;
  notes: string;
}

// ── Status map ────────────────────────────────────────────────────────────────
// Manually curated from reading parseModuleToSong.ts and the SynthType union.
// Extensions NOT listed here fall through as UADE_ONLY.

interface FormatEntry {
  group: string;
  exts: string[];
  status: Status;
  synthType: string;
  notes: string;
}

const FORMAT_ENTRIES: FormatEntry[] = [
  // ── FULLY_NATIVE: dedicated WASM synth (no UADESynth needed) ─────────────
  {
    group: 'SoundMon',
    exts: ['bp', 'bp3', 'sndmon'],
    status: 'FULLY_NATIVE',
    synthType: 'SoundMonSynth',
    notes: 'Brian Postma SoundMon II — wavetable + ADSR WASM synth',
  },
  {
    group: 'SidMon1',
    exts: ['smn'],
    status: 'FULLY_NATIVE',
    synthType: 'SidMon1Synth',
    notes: 'SidMon 1.0 — ADSR + arpeggio + wavetable WASM synth',
  },
  {
    group: 'SidMon2',
    exts: ['sid', 'sid1', 'sid2'],
    status: 'FULLY_NATIVE',
    synthType: 'SidMonSynth',
    notes: 'SidMon II — SID-like synthesis WASM synth',
  },
  {
    group: 'DigitalMugician',
    exts: ['dmu', 'dmu2', 'mug', 'mug2'],
    status: 'FULLY_NATIVE',
    synthType: 'DigMugSynth',
    notes: 'Digital Mugician — 4-wave blending wavetable WASM synth',
  },
  {
    group: 'FutureComposer',
    exts: ['fc', 'fc13', 'fc14', 'sfc', 'bfc', 'bsi', 'fc-bsi', 'fc2', 'fc3', 'fc4', 'smod'],
    status: 'FULLY_NATIVE',
    synthType: 'FCSynth',
    notes: 'Future Composer 1.x/BSI — 47 waveforms + macro WASM synth',
  },
  {
    group: 'Fred',
    exts: ['fred'],
    status: 'FULLY_NATIVE',
    synthType: 'FredSynth',
    notes: 'Fred Editor — macro-driven wavetable WASM synth',
  },
  {
    group: 'TFMX',
    exts: ['tfmx', 'mdat', 'tfmxpro', 'tfmx1.5', 'tfmx7v', 'tfhd1.5', 'tfhd7v', 'tfhdpro'],
    status: 'FULLY_NATIVE',
    synthType: 'TFMXSynth',
    notes: 'TFMX / Jochen Hippel — SndMod/VolMod sequence WASM synth',
  },
  {
    group: 'HippelCoSo',
    exts: ['hipc', 'soc'],
    status: 'FULLY_NATIVE',
    synthType: 'HippelCoSoSynth',
    notes: 'Jochen Hippel CoSo — freq/vol sequence WASM synth',
  },
  {
    group: 'RobHubbard',
    exts: ['rh', 'rho'],
    status: 'FULLY_NATIVE',
    synthType: 'RobHubbardSynth',
    notes: 'Rob Hubbard Amiga — PCM sample + vibrato/wobble WASM synth',
  },
  {
    group: 'OctaMED',
    exts: ['octamed'],
    status: 'FULLY_NATIVE',
    synthType: 'OctaMEDSynth',
    notes: 'OctaMED SynthInstr — vol/wf command table oscillator WASM synth',
  },
  {
    group: 'DavidWhittaker',
    exts: ['dw', 'dwold'],
    status: 'FULLY_NATIVE',
    synthType: 'DavidWhittakerSynth',
    notes: 'David Whittaker — Amiga period-based frq/vol sequence WASM synth',
  },
  {
    group: 'Symphonie',
    exts: ['symmod'],
    status: 'FULLY_NATIVE',
    synthType: 'SymphonieSynth',
    notes: 'Symphonie Pro — native AudioWorklet replayer',
  },

  // ── NATIVE_SAMPLER: native parser → Sampler instruments (PCM, no UADE synth) ─
  {
    group: 'SoundFX',
    exts: ['sfx', 'sfx13'],
    status: 'NATIVE_SAMPLER',
    synthType: 'Sampler',
    notes: 'SoundFXParser → PCM Sampler instruments; UADE fallback if parse fails',
  },
  {
    group: 'JamCracker',
    exts: ['jam', 'jc'],
    status: 'NATIVE_SAMPLER',
    synthType: 'Sampler',
    notes: 'JamCrackerParser → PCM Sampler instruments; UADE fallback if parse fails',
  },
  {
    group: 'QuadraComposer',
    exts: ['emod', 'qc'],
    status: 'NATIVE_SAMPLER',
    synthType: 'Sampler',
    notes: 'QuadraComposerParser → PCM Sampler instruments; UADE fallback if parse fails',
  },
  {
    group: 'AMOSMusicBank',
    exts: ['abk'],
    status: 'NATIVE_SAMPLER',
    synthType: 'Sampler',
    notes: 'AMOSMusicBankParser → PCM Sampler instruments; UADE fallback if parse fails',
  },
  {
    group: 'SonicArranger',
    exts: ['sa', 'sa-p', 'sa_old', 'sonic', 'lion'],
    status: 'NATIVE_SAMPLER',
    synthType: 'Sampler',
    notes: 'SonicArrangerParser → PCM Sampler instruments; UADE fallback if parse fails',
  },
  {
    group: 'DeltaMusic2',
    exts: ['dlm2', 'dm2'],
    status: 'NATIVE_SAMPLER',
    synthType: 'Sampler',
    notes: 'DeltaMusic2Parser → PCM Sampler instruments; UADE fallback if parse fails',
  },

  // ── DETECTION_ONLY: detection/routing exists but synthesis still via UADE ──
  {
    group: 'RichardJoseph',
    exts: ['rjp', 'rj'],
    status: 'DETECTION_ONLY',
    synthType: 'UADESynth (native pref: RJPParser)',
    notes: 'Native parser behind prefs.rjp flag; default synthesis via UADE',
  },
  {
    group: 'BenDaglish',
    exts: ['bd', 'bds'],
    status: 'DETECTION_ONLY',
    synthType: 'UADESynth',
    notes: 'bd.* prefix routing in parseModuleToSong; still uses UADE synthesis',
  },
  {
    group: 'DigiBooster',
    exts: ['dbm'],
    status: 'DETECTION_ONLY',
    synthType: 'Sampler (DigiBoosterProParser)',
    notes: 'DigiBoosterProParser registered; UADE fallback in extension list',
  },
  {
    group: 'DigitalSymphony',
    exts: ['dsym'],
    status: 'DETECTION_ONLY',
    synthType: 'Sampler (DigitalSymphonyParser)',
    notes: 'DigitalSymphonyParser registered; also in UADE_EXTENSIONS as fallback',
  },
  {
    group: 'GraoumfTracker2',
    exts: ['gt2', 'gtk'],
    status: 'DETECTION_ONLY',
    synthType: 'Sampler (GraoumfTracker2Parser)',
    notes: 'GraoumfTracker2Parser registered; also in UADE_EXTENSIONS as fallback',
  },
  {
    group: 'ChuckBiscuits',
    exts: ['cba'],
    status: 'DETECTION_ONLY',
    synthType: 'Sampler (ChuckBiscuitsParser)',
    notes: 'ChuckBiscuitsParser registered; also in UADE_EXTENSIONS as fallback',
  },
  {
    group: 'AMS',
    exts: ['ams'],
    status: 'DETECTION_ONLY',
    synthType: 'Sampler (AMSParser)',
    notes: 'AMSParser registered; also in libopenmpt; UADE_EXTENSIONS as fallback',
  },
  {
    group: 'FaceTheMusic',
    exts: ['ftm'],
    status: 'DETECTION_ONLY',
    synthType: 'Sampler (FaceTheMusicParser)',
    notes: 'FaceTheMusicParser registered; also in libopenmpt; UADE_EXTENSIONS fallback',
  },
  {
    group: 'Actionamics',
    exts: ['act'],
    status: 'DETECTION_ONLY',
    synthType: 'Sampler (ActionamicsParser)',
    notes: 'ActionamicsParser registered; also in UADE_EXTENSIONS as fallback',
  },
  {
    group: 'GameMusicCreator',
    exts: ['gmc'],
    status: 'DETECTION_ONLY',
    synthType: 'UADESynth',
    notes: 'Routing in parseModuleToSong; still uses UADE synthesis',
  },
  {
    group: 'UFO',
    exts: ['ufo', 'mus'],
    status: 'DETECTION_ONLY',
    synthType: 'UADESynth (native pref: UFOParser)',
    notes: 'UFO native parser behind prefs.ufo flag; default synthesis via UADE',
  },
  {
    group: 'MagneticFieldsPacker',
    exts: ['mfp'],
    status: 'DETECTION_ONLY',
    synthType: 'UADESynth',
    notes: 'Two-file format; special routing in parseModuleToSong; UADE synthesis',
  },
];

// ── Extract UADE_EXTENSIONS from source ────────────────────────────────────────

function extractUadeExtensions(): Set<string> {
  const src = readFileSync(join(ROOT, 'src/lib/import/formats/UADEParser.ts'), 'utf8');
  // Find the UADE_EXTENSIONS block
  const start = src.indexOf('const UADE_EXTENSIONS: Set<string> = new Set([');
  const end = src.indexOf(']);', start);
  if (start === -1 || end === -1) {
    throw new Error('Could not find UADE_EXTENSIONS in UADEParser.ts');
  }
  const block = src.slice(start, end + 2);
  // Extract all quoted strings
  const matches = Array.from(block.matchAll(/'([^']+)'/g));
  const exts = new Set<string>();
  for (const m of matches) {
    exts.add(m[1]);
  }
  return exts;
}

// ── Build records ─────────────────────────────────────────────────────────────

function buildRecords(uadeExts: Set<string>): ExtensionRecord[] {
  // Build lookup map from FORMAT_ENTRIES
  const statusMap = new Map<string, FormatEntry>();
  for (const entry of FORMAT_ENTRIES) {
    for (const ext of entry.exts) {
      statusMap.set(ext, entry);
    }
  }

  const records: ExtensionRecord[] = [];
  const seen = new Set<string>();

  // First: process all known entries in order
  for (const entry of FORMAT_ENTRIES) {
    for (const ext of entry.exts) {
      if (uadeExts.has(ext) && !seen.has(ext)) {
        records.push({
          ext,
          formatGroup: entry.group,
          status: entry.status,
          synthType: entry.synthType,
          notes: entry.notes,
        });
        seen.add(ext);
      }
    }
  }

  // Then: any remaining UADE_EXTENSIONS not in our map → UADE_ONLY
  const sorted = Array.from(uadeExts).sort();
  for (const ext of sorted) {
    if (!seen.has(ext)) {
      records.push({
        ext,
        formatGroup: guessFormatGroup(ext),
        status: 'UADE_ONLY',
        synthType: 'UADESynth',
        notes: 'No native parser; pure UADE catch-all',
      });
      seen.add(ext);
    }
  }

  return records;
}

// ── Guess format group from UADEParser.ts comments ────────────────────────────

function guessFormatGroup(ext: string): string {
  const src = readFileSync(join(ROOT, 'src/lib/import/formats/UADEParser.ts'), 'utf8');
  // Find the comment before the extension
  const escapedExt = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`//\\s*([^\\n]+)\\n(?:[^\\n]*\\'${escapedExt}\\'[^\\n]*)`, 'g');
  const m = re.exec(src);
  if (m) return m[1].trim();
  return ext.toUpperCase();
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function computeStats(records: ExtensionRecord[]) {
  const counts: Record<Status, number> = {
    FULLY_NATIVE: 0,
    NATIVE_SAMPLER: 0,
    DETECTION_ONLY: 0,
    UADE_ONLY: 0,
  };
  for (const r of records) {
    counts[r.status]++;
  }
  return counts;
}

// ── Output markdown ───────────────────────────────────────────────────────────

function statusEmoji(s: Status): string {
  switch (s) {
    case 'FULLY_NATIVE': return '✅';
    case 'NATIVE_SAMPLER': return '🎵';
    case 'DETECTION_ONLY': return '🔍';
    case 'UADE_ONLY': return '🎮';
  }
}

function renderMarkdown(records: ExtensionRecord[], date: string): string {
  const stats = computeStats(records);
  const total = records.length;

  const sections: Record<Status, ExtensionRecord[]> = {
    FULLY_NATIVE: records.filter(r => r.status === 'FULLY_NATIVE'),
    NATIVE_SAMPLER: records.filter(r => r.status === 'NATIVE_SAMPLER'),
    DETECTION_ONLY: records.filter(r => r.status === 'DETECTION_ONLY'),
    UADE_ONLY: records.filter(r => r.status === 'UADE_ONLY'),
  };

  function tableFor(recs: ExtensionRecord[]): string {
    const rows = recs.map(r =>
      `| \`${r.ext}\` | ${r.formatGroup} | ${r.synthType} | ${r.notes} |`
    );
    return [
      '| Extension | Format Group | Synth Type | Notes |',
      '|-----------|-------------|------------|-------|',
      ...rows,
    ].join('\n');
  }

  return `---
date: ${date}
topic: uade-format-synthesis-audit
tags: [uade, audit, formats, synthesis]
status: final
---

# UADE Format Synthesis Audit — ${date}

Generated by \`scripts/uade-audit.ts\`.

## Summary

| Status | Count | % |
|--------|-------|---|
| ✅ FULLY_NATIVE (dedicated WASM synth) | ${stats.FULLY_NATIVE} | ${pct(stats.FULLY_NATIVE, total)} |
| 🎵 NATIVE_SAMPLER (PCM Sampler, no UADE synth) | ${stats.NATIVE_SAMPLER} | ${pct(stats.NATIVE_SAMPLER, total)} |
| 🔍 DETECTION_ONLY (parser exists, UADE synthesis) | ${stats.DETECTION_ONLY} | ${pct(stats.DETECTION_ONLY, total)} |
| 🎮 UADE_ONLY (no native parser) | ${stats.UADE_ONLY} | ${pct(stats.UADE_ONLY, total)} |
| **Total** | **${total}** | 100% |

Native coverage (FULLY_NATIVE + NATIVE_SAMPLER): **${stats.FULLY_NATIVE + stats.NATIVE_SAMPLER}** extensions (${pct(stats.FULLY_NATIVE + stats.NATIVE_SAMPLER, total)})

---

## ✅ FULLY_NATIVE (${stats.FULLY_NATIVE} extensions)

Custom WASM synth exists. No UADE needed for synthesis.

${tableFor(sections.FULLY_NATIVE)}

---

## 🎵 NATIVE_SAMPLER (${stats.NATIVE_SAMPLER} extensions)

Native parser extracts PCM samples → Sampler instruments. No UADE for synthesis.

${tableFor(sections.NATIVE_SAMPLER)}

---

## 🔍 DETECTION_ONLY (${stats.DETECTION_ONLY} extensions)

Native parser exists (format detection / instrument names / PCM extraction) but synthesis
still routes through UADESynth or has UADE as primary path.

${tableFor(sections.DETECTION_ONLY)}

---

## 🎮 UADE_ONLY (${stats.UADE_ONLY} extensions)

No native parser. Goes directly to \`parseUADEFile()\` / \`UADESynth\`.
These are the **implementation targets** for future native WASM synths.

${tableFor(sections.UADE_ONLY)}
`;
}

function pct(n: number, total: number): string {
  return `${Math.round((n / total) * 100)}%`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('🔍 Extracting UADE_EXTENSIONS from UADEParser.ts...');
  const uadeExts = extractUadeExtensions();
  console.log(`   Found ${uadeExts.size} extensions.`);

  console.log('📊 Building audit records...');
  const records = buildRecords(uadeExts);

  const stats = computeStats(records);
  console.log('\n── Summary ─────────────────────────────────────────────');
  console.log(`  ✅ FULLY_NATIVE:    ${stats.FULLY_NATIVE}`);
  console.log(`  🎵 NATIVE_SAMPLER:  ${stats.NATIVE_SAMPLER}`);
  console.log(`  🔍 DETECTION_ONLY:  ${stats.DETECTION_ONLY}`);
  console.log(`  🎮 UADE_ONLY:       ${stats.UADE_ONLY}`);
  console.log(`  Total:              ${records.length}`);
  console.log('────────────────────────────────────────────────────────\n');

  const date = new Date().toISOString().slice(0, 10);
  const outPath = join(ROOT, `docs/uade-audit-${date}.md`);
  const md = renderMarkdown(records, date);
  writeFileSync(outPath, md, 'utf8');
  console.log(`✅ Written: ${outPath}`);
}

main();
