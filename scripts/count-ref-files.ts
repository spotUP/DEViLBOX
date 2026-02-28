#!/usr/bin/env npx tsx
/**
 * count-ref-files.ts — Reference Music Format Popularity Counter
 *
 * Counts files per top-level subdirectory in `Reference Music/` to estimate
 * format popularity, then outputs a ranked table + CSV.
 *
 * Output: docs/format-popularity-YYYY-MM-DD.csv (+ printed table)
 *
 * Usage: npx tsx scripts/count-ref-files.ts [--ref-dir <path>]
 */

import { readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const refDirIdx = args.indexOf('--ref-dir');
const REF_DIR = refDirIdx !== -1
  ? args[refDirIdx + 1]
  : join(ROOT, 'Reference Music');

// ── Known UADE extension → format name mapping ────────────────────────────────
// Maps Reference Music/ directory names to canonical format identifiers.
// Used to annotate the popularity table with parser status hints.

const DIR_TO_FORMAT: Record<string, string> = {
  // Already have native WASM synths
  'AHX': 'HivelyTracker (ahx)',
  'BP SoundMon 2': 'SoundMon (bp)',
  'BP SoundMon 3': 'SoundMon (bp3)',
  'Digital Mugician': 'DigitalMugician (dmu)',
  'Digital Mugician 2': 'DigitalMugician (dmu2)',
  'Future Composer': 'FutureComposer (fc)',
  'HivelyTracker': 'HivelyTracker (hvl)',
  'Jochen Hippel CoSo': 'HippelCoSo (hipc)',
  'OctaMED': 'OctaMED (octamed)',
  'Rob Hubbard Amiga': 'RobHubbard (rh)',
  'SidMon': 'SidMon2 (sid)',
  'Sound Mon': 'SoundMon (sndmon)',
  // Native sampler parsers
  'JamCracker': 'JamCracker (jam)',
  'Sound FX': 'SoundFX (sfx)',
  'Sonic Arranger': 'SonicArranger (sa)',
  'Delta Music': 'DeltaMusic (dlm1)',
  'Delta Music 2': 'DeltaMusic2 (dlm2)',
  // Detection-only / partial
  'Ben Daglish': 'BenDaglish (bd)',
  'Ben Daglish SID': 'BenDaglish-SID (bds)',
  'Dave Lowe': 'DaveLowe (dl)',
  'Dave Lowe New': 'DaveLoweNew (dln)',
  'Magnetic Fields Packer': 'MagneticFieldsPacker (mfp)',
  'Richard Joseph': 'RichardJoseph (rjp)',
  'UFO': 'UFO (ufo)',
  // UADE_ONLY targets
  'Art Of Noise': 'ArtOfNoise (aon)',
  'Ashley Hogg': 'AshleyHogg (ash)',
  'Audio Sculpture': 'AudioSculpture (adsc)',
  'AY Amadeus': 'AYAmadeus (UADE)',
  'AY Emul': 'AYEmul (UADE)',
  'AY STRC': 'AYSTRC (UADE)',
  'Beathoven Synthesizer': 'BeathovenSynthesizer (bss)',
  'ChipTracker': 'ChipTracker (kris)',
  'Cinemaware': 'Cinemaware (cin)',
  'Composer 669': 'Composer669 (UADE)',
  'Core Design': 'CoreDesign (core)',
  'Custom': 'Custom (cus)',
  'Darius Zendeh': 'DariusZendeh (dz)',
  'David Hanney': 'DavidHanney (dh)',
  'David Whittaker': 'DavidWhittaker (dw)',
  'Delitracker Custom': 'DeliTrackerCustom (UADE)',
  'Digi Trakker': 'DigiTrakker (UADE)',
  'Digibooster': 'DigiBooster (db)',
  'Digibooster Pro': 'DigiBoosterPro (dbm)',
  'Digital Sonix And Chrome': 'DigitalSonixChrome (dsc)',
  'Digital Sound Studio': 'DigitalSoundStudio (dss)',
  'Digital Symphony': 'DigitalSymphony (dsym)',
  'Disorder Tracker 2': 'DisorderTracker2 (UADE)',
  'Dynamic Synthesizer': 'DynamicSynthesizer (dns)',
  'EMS': 'EMS (ems)',
  'Fashion Tracker': 'FashionTracker (ex)',
  'Fred Gray': 'FredGray (gray)',
  'Fred': 'Fred (fred)',
  'Future Player': 'FuturePlayer (fp)',
  'Glue Mon': 'GlueMon (glue)',
  'Hip Hippel': 'JochenHippel (hip)',
  'Hip Hippel 7V': 'JochenHippel-7V (hip7)',
  'Hippel-COSO': 'HippelCoSo (hipc)',
  'Images Music System': 'ImagesMusicSystem (ims)',
  'In Stereo': 'InStereo (is)',
  'Infogrames': 'Infogrames (dum)',
  'Janko Mrsic-Flogel': 'JankoMrsicFlogel (jmf)',
  'Jason Brooke': 'JasonBrooke (jcb)',
  'Jason Page': 'JasonPage (jpn)',
  'Jeroen Tel': 'JeroenTel (jt)',
  'Jesper Olsen': 'JesperOlsen (jo)',
  'Jochen Hippel': 'JochenHippel (hip)',
  'Kim Christensen': 'KimChristensen (kim)',
  'Kris Hatlelid': 'KrisHatlelid (kh)',
  'Laxity': 'Laxity (powt)',
  'Leggless Music Editor': 'LME (lme)',
  'Magnetic Fields': 'MagneticFieldsPacker (mfp)',
  'Maniacs Of Noise': 'ManiacsOfNoise (mon)',
  'Major Tom': 'MajorTom (hn)',
  'Mark Cooksey': 'MarkCooksey (mc)',
  'MarkII': 'MarkII (mk2)',
  'Martin Walker': 'MartinWalker (avp)',
  'Maximum Effect': 'MaximumEffect (max)',
  'MED': 'MED (med)',
  'Mike Davies': 'MikeDavies (md)',
  'MMDC': 'MMDC (mmdc)',
  'Mosh Packer': 'MoshPacker (mosh)',
  'Mugician': 'Mugician (mug)',
  'Music Assembler': 'MusicAssembler (ma)',
  'Music Maker': 'MusicMaker (mm4)',
  'MultiMedia Sound': 'MultiMediaSound (mms)',
  'Nick Pelling Packer': 'NickPellingPacker (npp)',
  'NovoTrade Packer': 'NovoTradePacker (ntp)',
  'Paul Robotham': 'PaulRobotham (dat)',
  'Paul Shields': 'PaulShields (ps)',
  'Paul Summers': 'PaulSummers (snk)',
  'Paul Tonge': 'PaulTonge (pat)',
  'Pokey Noise': 'PokeyNoise (pn)',
  'Professional Sound Artists': 'PSA (psa)',
  'ProTracker 4': 'ProTracker4 (ptm)',
  'Puma Tracker': 'PumaTracker (puma)',
  'QuadraComposer': 'QuadraComposer (emod)',
  'RiffRaff': 'RiffRaff (riff)',
  'SCUMM': 'SCUMM (scumm)',
  'Sean Connolly': 'SeanConnolly (s-c)',
  'Sean Conran': 'SeanConran (scr)',
  'Sidmon 1': 'SidMon1 (smn)',
  'Sidmon 2': 'SidMon2 (sid2)',
  'Silmarils': 'Silmarils (mok)',
  'SonixMusicDriver': 'SonixMusicDriver (smus)',
  'Sound Control': 'SoundControl (sc)',
  'Sound Factory': 'SoundFactory (psf)',
  'Sound Images': 'SoundImages (tw)',
  'Sound Master': 'SoundMaster (sm)',
  'Sound Player': 'SoundPlayer (sjs)',
  'Special FX': 'SpecialFX (jd)',
  'Speedy A1 System': 'SpeedyA1 (sas)',
  'Steve Barrett': 'SteveBarrett (sb)',
  'Steve Turner': 'SteveTurner (jpo)',
  'SUN Tronic': 'SUNTronic (sun)',
  'Synth Pack': 'SynthPack (syn)',
  'SynTracker': 'SynTracker (st)',
  'TCB Tracker': 'TCBTracker (tcb)',
  'TFMX': 'TFMX (mdat)',
  'Thomas Hermann': 'ThomasHermann (thm)',
  'Tim Follin': 'TimFollin (tf)',
  'Time Tracker': 'TimeTracker (tmk)',
  'TME': 'TME (tme)',
  'Tronic': 'Tronic (trc)',
  'Wally Beben': 'WallyBeben (wb)',
};

// ── Count files recursively ───────────────────────────────────────────────────

function countFiles(dir: string): number {
  let count = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        count += countFiles(join(dir, e.name));
      } else if (e.isFile()) {
        count++;
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return count;
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface FormatCount {
  dirName: string;
  formatName: string;
  count: number;
}

function main() {
  console.log(`📂 Scanning: ${REF_DIR}\n`);

  let topLevelDirs: string[];
  try {
    topLevelDirs = readdirSync(REF_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
  } catch (err) {
    console.error(`❌ Cannot read directory: ${REF_DIR}`);
    console.error(`   Run from DEViLBOX root, or pass --ref-dir <path>`);
    process.exit(1);
  }

  const results: FormatCount[] = [];

  for (const dir of topLevelDirs) {
    const fullPath = join(REF_DIR, dir);
    const count = countFiles(fullPath);
    const formatName = DIR_TO_FORMAT[dir] ?? dir;
    results.push({ dirName: dir, formatName, count });
  }

  // Sort descending by count
  results.sort((a, b) => b.count - a.count);

  // Print table
  const totalFiles = results.reduce((s, r) => s + r.count, 0);
  console.log('Rank  Files  Directory                              Format');
  console.log('────  ─────  ─────────────────────────────────────  ──────────────────────────────────');
  results.forEach((r, i) => {
    const rank = String(i + 1).padStart(4);
    const files = String(r.count).padStart(5);
    const dir = r.dirName.substring(0, 38).padEnd(38);
    console.log(`${rank}  ${files}  ${dir}  ${r.formatName}`);
  });
  console.log(`\nTotal files: ${totalFiles} across ${results.length} directories`);

  // Write CSV
  const date = new Date().toISOString().slice(0, 10);
  const csvPath = join(ROOT, `docs/format-popularity-${date}.csv`);
  const csvLines = [
    'rank,file_count,directory_name,format_name',
    ...results.map((r, i) =>
      `${i + 1},${r.count},"${r.dirName}","${r.formatName}"`
    ),
  ];
  writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf8');
  console.log(`\n✅ Written: ${csvPath}`);
}

main();
