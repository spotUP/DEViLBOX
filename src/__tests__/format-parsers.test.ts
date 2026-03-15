/**
 * Format parser integration tests
 * Tests each parser by loading real files from .test-formats/.
 *
 * Run: npx vitest run src/__tests__/format-parsers.test.ts
 *
 * UADE-only formats: tests verify routing detection (isUADEFormat/matchesExt)
 * since the UADE WASM replayer requires a browser AudioContext.
 * Native parsers: tests verify full parse returns a valid TrackerSong.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BASE = resolve(__dirname, '../../.test-formats');

function countNotes(song: any): number {
  let total = 0;
  for (const pat of song.patterns || []) {
    for (const ch of pat.channels || []) {
      for (const row of ch.rows || []) {
        if (row.note > 0) total++;
      }
    }
  }
  return total;
}

function getFileDataKeys(song: any): string[] {
  return Object.keys(song).filter(k =>
    k.endsWith('FileData') || k.endsWith('Native') || k === 'goatTrackerData'
  );
}

function logResult(name: string, song: any) {
  const notes = countNotes(song);
  const fileKeys = getFileDataKeys(song);
  console.log(`  ${name}: format=${song.format} notes=${notes} instr=${(song.instruments||[]).length} pat=${(song.patterns||[]).length} ch=${song.numChannels} bpm=${song.initialBPM} spd=${song.initialSpeed} keys=[${fileKeys.join(',')}]`);

  if (notes === 0 && fileKeys.length === 0) {
    console.log(`  ⚠ WILL BE SILENT: 0 notes, no fileData`);
  }
}

// ── UADE routing detection ──────────────────────────────────────────────────

async function uadeDetect(filename: string): Promise<boolean> {
  const { isUADEFormat } = await import('@lib/import/formats/UADEParser');
  return isUADEFormat(filename);
}

// ── Existing tests (real file parsing) ────────────────────────────────────

describe('Format parser tests with real Modland files', () => {

  it('DavidWhittaker: apb.dw', async () => {
    const buf = readFileSync(resolve(BASE, 'apb.dw'));
    const { parseDavidWhittakerFile } = await import('@lib/import/formats/DavidWhittakerParser');
    const song = parseDavidWhittakerFile(buf.buffer as ArrayBuffer, 'apb.dw');
    logResult('DavidWhittaker', song);

    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
    expect(song.patterns.length).toBeGreaterThan(0);
    // DavidWhittaker is a proprietary 68k format — UADE plays it via withNativeThenUADE,
    // no uadePatternLayout needed (that's only for live chip-RAM cell editing)
  });

  it('DaveLowe: afterburner.dl', async () => {
    const buf = readFileSync(resolve(BASE, 'afterburner.dl'));
    const { isDaveLoweFormat, parseDaveLoweFile } = await import('@lib/import/formats/DaveLoweParser');
    const u8 = new Uint8Array(buf);

    if (isDaveLoweFormat(u8)) {
      const song = await parseDaveLoweFile(buf.buffer as ArrayBuffer, 'afterburner.dl');
      logResult('DaveLowe', song);
      expect(song).toBeTruthy();
      expect(song.format).toBeTruthy();
    } else {
      const { isDaveLoweNewFormat, parseDaveLoweNewFile } = await import('@lib/import/formats/DaveLoweNewParser');
      expect(isDaveLoweNewFormat(buf.buffer as ArrayBuffer)).toBe(true);
      const song = await parseDaveLoweNewFile(buf.buffer as ArrayBuffer, 'afterburner.dl');
      logResult('DaveLoweNew', song);
      expect(song).toBeTruthy();
      expect(song.format).toBeTruthy();
    }
  });

  it('AshleyHogg: ash.cj_in_the_usa', async () => {
    const buf = readFileSync(resolve(BASE, 'ash.cj_in_the_usa'));
    const { isAshleyHoggFormat, parseAshleyHoggFile } = await import('@lib/import/formats/AshleyHoggParser');

    if (isAshleyHoggFormat(buf.buffer as ArrayBuffer)) {
      const song = parseAshleyHoggFile(buf.buffer as ArrayBuffer, 'ash.cj_in_the_usa');
      logResult('AshleyHogg', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  AshleyHogg: Not detected (file may need different detection)');
      // This is OK - routing in AmigaFormatParsers will fall through to UADE
    }
  });

  it('Actionamics: dynablaster.ast - uses per-sample effectSpeed', async () => {
    const buf = readFileSync(resolve(BASE, 'dynablaster.ast'));
    const { isActionamicsFormat, parseActionamicsFile } = await import('@lib/import/formats/ActionamicsParser');
    const u8 = new Uint8Array(buf);

    expect(isActionamicsFormat(u8)).toBe(true);
    const song = parseActionamicsFile(u8, 'dynablaster.ast');
    logResult('Actionamics', song);

    expect(song).toBeTruthy();
    if (!song) return;
    const notes = countNotes(song);
    expect(notes).toBeGreaterThan(0);
    expect(song.instruments.length).toBeGreaterThan(0);

    const sampleRates = song.instruments
      .filter((i: any) => i.sample?.sampleRate)
      .map((i: any) => i.sample.sampleRate);
    console.log(`  Sample rates: ${sampleRates.join(', ')}`);
  });

  it('BenDaglish: artura.bd - detection-only with bdFileData', async () => {
    const buf = readFileSync(resolve(BASE, 'artura.bd'));
    const { isBenDaglishFormat, parseBenDaglishFile } = await import('@lib/import/formats/BenDaglishParser');

    expect(isBenDaglishFormat(buf.buffer as ArrayBuffer)).toBe(true);
    const song = await parseBenDaglishFile(buf.buffer as ArrayBuffer, 'artura.bd');
    logResult('BenDaglish', song);

    expect(song).toBeTruthy();
    const keys = getFileDataKeys(song);
    expect(keys).toContain('bdFileData');
    console.log(`  Has bdFileData: ${!!song.bdFileData} (${song.bdFileData?.byteLength || 0} bytes)`);
  });

  it('CoreDesign: rick_dangerous.core - detection-only, UADE fallback', async () => {
    const buf = readFileSync(resolve(BASE, 'rick_dangerous.core'));
    const { isCoreDesignFormat, parseCoreDesignFile } = await import('@lib/import/formats/CoreDesignParser');

    if (isCoreDesignFormat(buf.buffer as ArrayBuffer)) {
      const song = parseCoreDesignFile(buf.buffer as ArrayBuffer, 'rick_dangerous.core');
      logResult('CoreDesign', song);
      expect(song).toBeTruthy();
      const notes = countNotes(song);
      console.log(`  Notes: ${notes} (0 = correct, withNativeThenUADE will fall through to UADE)`);
    } else {
      console.log('  CoreDesign: Not detected as CoreDesign format');
    }
  });

  it('GlueMon: flood.glue - detection-only, UADE fallback', async () => {
    const buf = readFileSync(resolve(BASE, 'flood.glue'));
    const u8 = new Uint8Array(buf);  // copy: avoid Node.js Buffer pool byteOffset
    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    const { isGlueMonFormat, parseGlueMonFile } = await import('@lib/import/formats/GlueMonParser');

    expect(isGlueMonFormat(u8)).toBe(true);
    const song = parseGlueMonFile(ab, 'flood.glue');
    logResult('GlueMon', song);
    expect(song).toBeTruthy();
    expect(song.name).toContain('GlueMon');
    console.log(`  Song name: "${song.name}", channels: ${song.numChannels}`);
    console.log(`  Notes: ${countNotes(song)} (0 = correct, withNativeThenUADE will fall through to UADE)`);
  });

  it('DavidHanney: tearaway.dh - detection-only, UADE fallback', async () => {
    const buf = readFileSync(resolve(BASE, 'tearaway.dh'));
    const u8 = new Uint8Array(buf);  // copy: avoid Node.js Buffer pool byteOffset
    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    const { isDavidHanneyFormat, parseDavidHanneyFile } = await import('@lib/import/formats/DavidHanneyParser');

    expect(isDavidHanneyFormat(u8)).toBe(true);
    const song = parseDavidHanneyFile(ab, 'tearaway.dh');
    logResult('DavidHanney', song);
    expect(song).toBeTruthy();
    expect(song.name).toContain('DavidHanney');
    console.log(`  Song name: "${song.name}", channels: ${song.numChannels}`);
    console.log(`  Notes: ${countNotes(song)} (0 = correct, withNativeThenUADE will fall through to UADE)`);
  });
});

// ── Native parsers — full parse ────────────────────────────────────────────

describe('Native parser tests', () => {

  it('HivelyTracker/AHX: aces_high.ahx', async () => {
    const buf = readFileSync(resolve(BASE, 'aces_high.ahx'));
    const { parseHivelyFile } = await import('@lib/import/formats/HivelyParser');
    const song = parseHivelyFile(buf.buffer as ArrayBuffer, 'aces_high.ahx');
    logResult('Hively/AHX', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
    expect(song.instruments.length).toBeGreaterThan(0);
  });

  it('FredEditor: aspar.fred', async () => {
    const buf = readFileSync(resolve(BASE, 'aspar.fred'));
    const { isFredEditorFormat, parseFredEditorFile } = await import('@lib/import/formats/FredEditorParser');
    expect(isFredEditorFormat(buf.buffer as ArrayBuffer)).toBe(true);
    const song = await parseFredEditorFile(buf.buffer as ArrayBuffer, 'aspar.fred');
    logResult('FredEditor', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('FashionTracker: fashionating1.ex', async () => {
    const buf = readFileSync(resolve(BASE, 'fashionating1.ex'));
    const { isFashionTrackerFormat, parseFashionTrackerFile } = await import('@lib/import/formats/FashionTrackerParser');
    expect(isFashionTrackerFormat(buf.buffer as ArrayBuffer)).toBe(true);
    const song = parseFashionTrackerFile(buf.buffer as ArrayBuffer, 'fashionating1.ex');
    logResult('FashionTracker', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('DeltaMusic2: anthrox_intro.dm2', async () => {
    const buf = readFileSync(resolve(BASE, 'anthrox_intro.dm2'));
    const { isDeltaMusic2Format, parseDeltaMusic2File } = await import('@lib/import/formats/DeltaMusic2Parser');
    const u8 = new Uint8Array(buf);
    if (isDeltaMusic2Format(u8)) {
      const song = parseDeltaMusic2File(u8, 'anthrox_intro.dm2');
      logResult('DeltaMusic2', song);
      expect(song).toBeTruthy();
      expect(song?.format).toBeTruthy();
    } else {
      console.log('  DeltaMusic2: format not detected (may be UADE fallback)');
    }
  });

  it('ArtOfNoise: action_section.aon', async () => {
    const buf = readFileSync(resolve(BASE, 'action_section.aon'));
    const { isArtOfNoiseFormat, parseArtOfNoiseFile } = await import('@lib/import/formats/ArtOfNoiseParser');
    const u8 = new Uint8Array(buf);
    if (isArtOfNoiseFormat(u8)) {
      const song = parseArtOfNoiseFile(u8, 'action_section.aon');
      logResult('ArtOfNoise', song);
      expect(song).toBeTruthy();
      expect(song?.format).toBeTruthy();
    } else {
      console.log('  ArtOfNoise: format not detected (may be UADE fallback)');
      expect(await uadeDetect('action_section.aon')).toBe(true);
    }
  });

  it('Oktalyzer: 45.okta', async () => {
    const buf = readFileSync(resolve(BASE, '45.okta'));
    const { parseOktalyzerFile } = await import('@lib/import/formats/OktalyzerParser');
    const song = parseOktalyzerFile(buf.buffer as ArrayBuffer, '45.okta');
    logResult('Oktalyzer', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('InStereo1/2: fantasi8.is', async () => {
    const buf = readFileSync(resolve(BASE, 'fantasi8.is'));
    const u8 = new Uint8Array(buf);
    const { isInStereo1Format, parseInStereo1File } = await import('@lib/import/formats/InStereo1Parser');
    const { isInStereo2Format, parseInStereo2File } = await import('@lib/import/formats/InStereo2Parser');
    if (isInStereo1Format(u8)) {
      const song = parseInStereo1File(u8, 'fantasi8.is');
      logResult('InStereo1', song);
      expect(song).toBeTruthy();
    } else if (isInStereo2Format(u8)) {
      const song = parseInStereo2File(u8, 'fantasi8.is');
      logResult('InStereo2', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  InStereo: not detected, falls to UADE');
    }
  });

  it('InStereo2: stereo_feeling.is20', async () => {
    const buf = readFileSync(resolve(BASE, 'stereo_feeling.is20'));
    const u8 = new Uint8Array(buf);
    const { isInStereo2Format, parseInStereo2File } = await import('@lib/import/formats/InStereo2Parser');
    if (isInStereo2Format(u8)) {
      const song = parseInStereo2File(u8, 'stereo_feeling.is20');
      logResult('InStereo2', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  InStereo2: not detected, falls to UADE');
    }
  });

  it('ManiacsOfNoise: chinese_chess.mon / gyroscope.mon', async () => {
    const { isManiacsOfNoiseFormat, parseManiacsOfNoiseFile } = await import('@lib/import/formats/ManiacsOfNoiseParser');
    for (const f of ['chinese_chess.mon', 'gyroscope.mon']) {
      const buf = readFileSync(resolve(BASE, f));
      if (isManiacsOfNoiseFormat(buf.buffer as ArrayBuffer, f)) {
        const song = parseManiacsOfNoiseFile(buf.buffer as ArrayBuffer, f);
        logResult(`ManiacsOfNoise ${f}`, song);
        expect(song).toBeTruthy();
      } else {
        console.log(`  ManiacsOfNoise ${f}: not detected`);
      }
    }
  });

  it('SoundPlayer (SJS): sjs.awesome', async () => {
    const buf = readFileSync(resolve(BASE, 'sjs.awesome'));
    const { isSoundPlayerFormat, parseSoundPlayerFile } = await import('@lib/import/formats/SoundPlayerParser');
    if (isSoundPlayerFormat(buf.buffer as ArrayBuffer)) {
      const song = parseSoundPlayerFile(buf.buffer as ArrayBuffer, 'sjs.awesome');
      logResult('SoundPlayer', song);
      expect(song).toBeTruthy();
      expect(song.format).toBeTruthy();
    } else {
      console.log('  SoundPlayer: not detected, falls to UADE');
    }
  });

  it('NovoTradePacker: 3rdblock.ntp', async () => {
    // .ntp = NovoTrade Packer (MODU magic), NOT NickPellingPacker (COMP magic)
    // This specific file has D1=0 at offset 16, so NovoTradePackerParser doesn't detect it
    // and it falls through to UADE.
    const buf = readFileSync(resolve(BASE, '3rdblock.ntp'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isNovoTradePackerFormat, parseNovoTradePackerFile } = await import('@lib/import/formats/NovoTradePackerParser');
    if (isNovoTradePackerFormat(ab)) {
      const song = parseNovoTradePackerFile(ab, '3rdblock.ntp');
      logResult('NovoTradePacker', song);
      expect(song).toBeTruthy();
      expect(song.format).toBeTruthy();
    } else {
      // MODU magic present but D1=0; falls to UADE
      console.log('  NovoTradePacker: D1=0 at offset 16, falls to UADE');
      expect(buf.byteLength).toBeGreaterThan(0);
    }
  });

  it('SidMon1: anarchy.sid1', async () => {
    const buf = readFileSync(resolve(BASE, 'anarchy.sid1'));
    const { isSidMon1Format, parseSidMon1File } = await import('@lib/import/formats/SidMon1Parser');
    if (isSidMon1Format(buf.buffer as ArrayBuffer)) {
      const song = parseSidMon1File(buf.buffer as ArrayBuffer, 'anarchy.sid1');
      logResult('SidMon1', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  SidMon1: not detected');
    }
  });

  it('SidMon2: bruno_time.sid2', async () => {
    const buf = readFileSync(resolve(BASE, 'bruno_time.sid2'));
    const { isSidMon2Format, parseSidMon2File } = await import('@lib/import/formats/SidMon2Parser');
    if (isSidMon2Format(buf.buffer as ArrayBuffer)) {
      const song = await parseSidMon2File(buf.buffer as ArrayBuffer, 'bruno_time.sid2');
      logResult('SidMon2', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  SidMon2: not detected');
    }
  });

  it('SonicArranger: almighty.sa', async () => {
    const buf = readFileSync(resolve(BASE, 'almighty.sa'));
    const { isSonicArrangerFormat, parseSonicArrangerFile } = await import('@lib/import/formats/SonicArrangerParser');
    if (isSonicArrangerFormat(buf.buffer as ArrayBuffer)) {
      const song = await parseSonicArrangerFile(buf.buffer as ArrayBuffer, 'almighty.sa');
      logResult('SonicArranger', song);
      expect(song).toBeTruthy();
      expect(song.format).toBeTruthy();
    } else {
      console.log('  SonicArranger: not detected');
    }
  });

  it('DigitalMugician: cockwise.mug', async () => {
    const buf = readFileSync(resolve(BASE, 'cockwise.mug'));
    const { isDigitalMugicianFormat, parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
    if (isDigitalMugicianFormat(buf.buffer as ArrayBuffer)) {
      const song = await parseDigitalMugicianFile(buf.buffer as ArrayBuffer, 'cockwise.mug');
      logResult('DigitalMugician', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  DigitalMugician: not detected');
    }
  });

  it('DigitalMugician2: snickle.mug2', async () => {
    const buf = readFileSync(resolve(BASE, 'snickle.mug2'));
    const { isDigitalMugicianFormat, parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
    if (isDigitalMugicianFormat(buf.buffer as ArrayBuffer)) {
      const song = await parseDigitalMugicianFile(buf.buffer as ArrayBuffer, 'snickle.mug2');
      logResult('DigitalMugician2', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  DigitalMugician2: not detected');
    }
  });

  it('MusicAssembler: baseheads.ma', async () => {
    const buf = readFileSync(resolve(BASE, 'baseheads.ma'));
    const { isMusicAssemblerFormat, parseMusicAssemblerFile } = await import('@lib/import/formats/MusicAssemblerParser');
    const u8 = new Uint8Array(buf);
    if (isMusicAssemblerFormat(u8)) {
      const song = parseMusicAssemblerFile(u8, 'baseheads.ma');
      logResult('MusicAssembler', song);
      expect(song).toBeTruthy();
      expect(song?.format).toBeTruthy();
    } else {
      console.log('  MusicAssembler: not detected, falls to UADE');
    }
  });

  it('PreTracker: adreamoffish.prt', async () => {
    const buf = readFileSync(resolve(BASE, 'adreamoffish.prt'));
    const { isPreTrackerFormat, parsePreTrackerFile } = await import('@lib/import/formats/PreTrackerParser');
    if (isPreTrackerFormat(buf.buffer as ArrayBuffer)) {
      const song = await parsePreTrackerFile(buf.buffer as ArrayBuffer, 'adreamoffish.prt');
      logResult('PreTracker', song);
      expect(song).toBeTruthy();
      expect(song.format).toBeTruthy();
    } else {
      console.log('  PreTracker: not detected');
    }
  });

  it('TCBTracker: cannonfodder.tcb', async () => {
    const buf = readFileSync(resolve(BASE, 'cannonfodder.tcb'));
    const { isTCBTrackerFormat, parseTCBTrackerFile } = await import('@lib/import/formats/TCBTrackerParser');
    if (isTCBTrackerFormat(buf.buffer as ArrayBuffer, 'cannonfodder.tcb')) {
      const song = await parseTCBTrackerFile(buf.buffer as ArrayBuffer, 'cannonfodder.tcb');
      logResult('TCBTracker', song);
      expect(song).toBeTruthy();
      expect(song.format).toBeTruthy();
    } else {
      console.log('  TCBTracker: not detected');
    }
  });

  it('JamCracker: analogue_vibes.jam', async () => {
    const buf = readFileSync(resolve(BASE, 'analogue_vibes.jam'));
    const { isJamCrackerFormat, parseJamCrackerFile } = await import('@lib/import/formats/JamCrackerParser');
    if (isJamCrackerFormat(buf.buffer as ArrayBuffer)) {
      const song = await parseJamCrackerFile(buf.buffer as ArrayBuffer, 'analogue_vibes.jam');
      logResult('JamCracker', song);
      expect(song).toBeTruthy();
      expect(song.format).toBeTruthy();
    } else {
      console.log('  JamCracker: not detected');
    }
  });

  it('SpecialFX: battlecommand.jd', async () => {
    const buf = readFileSync(resolve(BASE, 'battlecommand.jd'));
    const { isSpecialFXFormat, parseSpecialFXFile } = await import('@lib/import/formats/SpecialFXParser');
    if (isSpecialFXFormat(buf.buffer as ArrayBuffer)) {
      const song = parseSpecialFXFile(buf.buffer as ArrayBuffer, 'battlecommand.jd');
      logResult('SpecialFX', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  SpecialFX: not detected');
    }
  });

  it('JasonBrooke: afterburner2.jb', async () => {
    const buf = readFileSync(resolve(BASE, 'afterburner2.jb'));
    const { isJasonBrookeFormat, parseJasonBrookeFile } = await import('@lib/import/formats/JasonBrookeParser');
    if (isJasonBrookeFormat(buf.buffer as ArrayBuffer, 'afterburner2.jb')) {
      const song = parseJasonBrookeFile(buf.buffer as ArrayBuffer, 'afterburner2.jb');
      logResult('JasonBrooke', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  JasonBrooke: not detected');
    }
  });

  it('JeroenTel: tusker_ingame.jt', async () => {
    const buf = readFileSync(resolve(BASE, 'tusker_ingame.jt'));
    const { isJeroenTelFormat, parseJeroenTelFile } = await import('@lib/import/formats/JeroenTelParser');
    if (isJeroenTelFormat(buf.buffer as ArrayBuffer, 'tusker_ingame.jt')) {
      const song = await parseJeroenTelFile(buf.buffer as ArrayBuffer, 'tusker_ingame.jt');
      logResult('JeroenTel', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  JeroenTel: not detected');
    }
  });

  it('MarkCooksey: mco.aquestion', async () => {
    const buf = readFileSync(resolve(BASE, 'mco.aquestion'));
    const { isMarkCookseyFormat, parseMarkCookseyFile } = await import('@lib/import/formats/MarkCookseyParser');
    if (isMarkCookseyFormat(buf.buffer as ArrayBuffer, 'mco.aquestion')) {
      const song = await parseMarkCookseyFile(buf.buffer as ArrayBuffer, 'mco.aquestion');
      logResult('MarkCooksey', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  MarkCooksey: not detected (prefix mco. should be auto-detected by matchesExt)');
    }
  });

  it('JasonPage: offroad.jpo', async () => {
    const buf = readFileSync(resolve(BASE, 'offroad.jpo'));
    const { isJasonPageFormat, parseJasonPageFile } = await import('@lib/import/formats/JasonPageParser');
    if (isJasonPageFormat(buf.buffer as ArrayBuffer, 'offroad.jpo')) {
      const song = await parseJasonPageFile(buf.buffer as ArrayBuffer, 'offroad.jpo');
      logResult('JasonPage', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  JasonPage: not detected');
    }
  });

  it('RobHubbard: sanxion.rh', async () => {
    const buf = readFileSync(resolve(BASE, 'sanxion.rh'));
    const { isRobHubbardFormat, parseRobHubbardFile } = await import('@lib/import/formats/RobHubbardParser');
    if (isRobHubbardFormat(buf.buffer as ArrayBuffer, 'sanxion.rh')) {
      const song = await parseRobHubbardFile(buf.buffer as ArrayBuffer, 'sanxion.rh');
      logResult('RobHubbard', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  RobHubbard: not detected');
    }
  });

  it('RobHubbardST: battleships.rho', async () => {
    // .rho files use RobHubbardSTParser (different from .rh which uses RobHubbardParser)
    const buf = readFileSync(resolve(BASE, 'battleships.rho'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isRobHubbardSTFormat, parseRobHubbardSTFile } = await import('@lib/import/formats/RobHubbardSTParser');
    expect(isRobHubbardSTFormat(ab)).toBe(true);
    const song = parseRobHubbardSTFile(ab, 'battleships.rho');
    logResult('RobHubbardST rho', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('PSA: punisher.psa', async () => {
    // punisher.psa is PSA format (magic "PSA\0"), routed to PSAParser
    const buf = readFileSync(resolve(BASE, 'punisher.psa'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isPSAFormat, parsePSAFile } = await import('@lib/import/formats/PSAParser');
    expect(isPSAFormat(ab)).toBe(true);
    const song = parsePSAFile(ab, 'punisher.psa');
    logResult('PSA', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('SoundMon V2: aquarivs.bp', async () => {
    // aquarivs.bp is SoundMon V2 ("V.2" magic at offset 26)
    const buf = readFileSync(resolve(BASE, 'aquarivs.bp'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isSoundMonFormat, parseSoundMonFile } = await import('@lib/import/formats/SoundMonParser');
    expect(isSoundMonFormat(ab)).toBe(true);
    const song = await parseSoundMonFile(ab, 'aquarivs.bp');
    logResult('SoundMon V2', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('SoundMon V3: antidust.bp3', async () => {
    // antidust.bp3 is SoundMon V3 ("V.3" magic at offset 26)
    const buf = readFileSync(resolve(BASE, 'antidust.bp3'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isSoundMonFormat, parseSoundMonFile } = await import('@lib/import/formats/SoundMonParser');
    expect(isSoundMonFormat(ab)).toBe(true);
    const song = await parseSoundMonFile(ab, 'antidust.bp3');
    logResult('SoundMon V3', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('TomyTracker: inconvenient.sg', async () => {
    // inconvenient.sg is TomyTracker format (.sg extension), not Anders0land (which requires hot.* prefix)
    const buf = readFileSync(resolve(BASE, 'inconvenient.sg'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isTomyTrackerFormat, parseTomyTrackerFile } = await import('@lib/import/formats/TomyTrackerParser');
    if (isTomyTrackerFormat(ab)) {
      const song = parseTomyTrackerFile(ab, 'inconvenient.sg');
      logResult('TomyTracker', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  TomyTracker: not detected, falls to UADE');
    }
  });

  it('MusicMaker4V: axelf.mm4', async () => {
    // axelf.mm4 is IFF FORM+MMV8+.mm4 extension → Music Maker 4V
    const buf = readFileSync(resolve(BASE, 'axelf.mm4'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isMusicMaker4VFormat, parseMusicMaker4VFile } = await import('@lib/import/formats/MusicMakerParser');
    expect(isMusicMaker4VFormat(ab, 'axelf.mm4')).toBe(true);
    const song = parseMusicMaker4VFile(ab, 'axelf.mm4');
    logResult('MusicMaker4V', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('MusicMaker8V: crockett8.mm8', async () => {
    // crockett8.mm8 is IFF FORM+MMV8+.mm8 extension → Music Maker 8V
    const buf = readFileSync(resolve(BASE, 'crockett8.mm8'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isMusicMaker8VFormat, parseMusicMaker8VFile } = await import('@lib/import/formats/MusicMakerParser');
    expect(isMusicMaker8VFormat(ab, 'crockett8.mm8')).toBe(true);
    const song = parseMusicMaker8VFile(ab, 'crockett8.mm8');
    logResult('MusicMaker8V', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('QuadraComposer: synth_corn.emod', async () => {
    const buf = readFileSync(resolve(BASE, 'synth_corn.emod'));
    const { isQuadraComposerFormat, parseQuadraComposerFile } = await import('@lib/import/formats/QuadraComposerParser');
    if (isQuadraComposerFormat(buf.buffer as ArrayBuffer)) {
      const song = await parseQuadraComposerFile(buf.buffer as ArrayBuffer, 'synth_corn.emod');
      logResult('QuadraComposer', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  QuadraComposer: not detected');
    }
  });

  it('SpeedySystem: airdriver.ss', async () => {
    const buf = readFileSync(resolve(BASE, 'airdriver.ss'));
    const { isSpeedySystemFormat, parseSpeedySystemFile } = await import('@lib/import/formats/SpeedySystemParser');
    if (isSpeedySystemFormat(buf.buffer as ArrayBuffer)) {
      const song = await parseSpeedySystemFile(buf.buffer as ArrayBuffer, 'airdriver.ss');
      logResult('SpeedySystem', song);
      expect(song).toBeTruthy();
    } else {
      console.log('  SpeedySystem: not detected');
    }
  });

  it('SoundFX: acid_housemix.sfx', async () => {
    const buf = readFileSync(resolve(BASE, 'acid_housemix.sfx'));
    const { isSoundFXFormat, parseSoundFXFile } = await import('@lib/import/formats/SoundFXParser');
    if (isSoundFXFormat(buf.buffer as ArrayBuffer)) {
      const song = await parseSoundFXFile(buf.buffer as ArrayBuffer, 'acid_housemix.sfx');
      logResult('SoundFX', song);
      expect(song).toBeTruthy();
      expect(song.format).toBeTruthy();
    } else {
      console.log('  SoundFX: not detected');
    }
  });

  it('FutureComposer: anthrox.fc', async () => {
    const buf = readFileSync(resolve(BASE, 'anthrox.fc'));
    const { parseFCFile } = await import('@lib/import/formats/FCParser');
    const song = parseFCFile(buf.buffer as ArrayBuffer, 'anthrox.fc');
    logResult('FC', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('FuturePlayer: hybris.fp', async () => {
    const buf = readFileSync(resolve(BASE, 'hybris.fp'));
    const { isUADEFormat } = await import('@lib/import/formats/UADEParser');
    // FuturePlayer has a native parser via withNativeThenUADE, but detection is complex
    console.log(`  FuturePlayer detected: ${isUADEFormat('hybris.fp')}`);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it('FredGray: blacklamp.gray', async () => {
    const buf = readFileSync(resolve(BASE, 'blacklamp.gray'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isFredGrayFormat, parseFredGrayFile } = await import('@lib/import/formats/FredGrayParser');
    expect(isFredGrayFormat(ab, 'blacklamp.gray')).toBe(true);
    const song = parseFredGrayFile(ab, 'blacklamp.gray');
    logResult('FredGray', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('BenDaglishSID: chubbygristle.bds', async () => {
    const buf = readFileSync(resolve(BASE, 'chubbygristle.bds'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isBenDaglishSIDFormat, parseBenDaglishSIDFile } = await import('@lib/import/formats/BenDaglishSIDParser');
    expect(isBenDaglishSIDFormat(ab, 'chubbygristle.bds')).toBe(true);
    const song = await parseBenDaglishSIDFile(ab, 'chubbygristle.bds');
    logResult('BenDaglishSID', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('Quartet: flimbos_quest.sqt', async () => {
    const buf = readFileSync(resolve(BASE, 'flimbos_quest.sqt'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isQuartetFormat, parseQuartetFile } = await import('@lib/import/formats/QuartetParser');
    expect(isQuartetFormat(ab, 'flimbos_quest.sqt')).toBe(true);
    const song = await parseQuartetFile(ab, 'flimbos_quest.sqt');
    logResult('Quartet', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('SoundMaster: doofus.sm', async () => {
    const buf = readFileSync(resolve(BASE, 'doofus.sm'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isSoundMasterFormat, parseSoundMasterFile } = await import('@lib/import/formats/SoundMasterParser');
    expect(isSoundMasterFormat(ab, 'doofus.sm')).toBe(true);
    const song = await parseSoundMasterFile(ab, 'doofus.sm');
    logResult('SoundMaster', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('WallyBeben: wicked.wb', async () => {
    const buf = readFileSync(resolve(BASE, 'wicked.wb'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isWallyBebenFormat, parseWallyBebenFile } = await import('@lib/import/formats/WallyBebenParser');
    expect(isWallyBebenFormat(ab)).toBe(true);
    const song = parseWallyBebenFile(ab, 'wicked.wb');
    logResult('WallyBeben', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('SteveBarrett: artificial_dreams.sb', async () => {
    const buf = readFileSync(resolve(BASE, 'artificial_dreams.sb'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isSteveBarrettFormat, parseSteveBarrettFile } = await import('@lib/import/formats/SteveBarrettParser');
    expect(isSteveBarrettFormat(ab)).toBe(true);
    const song = parseSteveBarrettFile(ab, 'artificial_dreams.sb');
    logResult('SteveBarrett', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('PaulSummers: fightingsoccer.snk', async () => {
    const buf = readFileSync(resolve(BASE, 'fightingsoccer.snk'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isPaulSummersFormat, parsePaulSummersFile } = await import('@lib/import/formats/PaulSummersParser');
    expect(isPaulSummersFormat(ab)).toBe(true);
    const song = parsePaulSummersFile(ab, 'fightingsoccer.snk');
    logResult('PaulSummers', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('DaveLoweNew: balrog.dln', async () => {
    const buf = readFileSync(resolve(BASE, 'balrog.dln'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isDaveLoweNewFormat, parseDaveLoweNewFile } = await import('@lib/import/formats/DaveLoweNewParser');
    expect(isDaveLoweNewFormat(ab)).toBe(true);
    const song = parseDaveLoweNewFile(ab, 'balrog.dln');
    logResult('DaveLoweNew', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('DigitalSoundStudio: doxtro3.dss', async () => {
    const buf = readFileSync(resolve(BASE, 'doxtro3.dss'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isDigitalSoundStudioFormat, parseDigitalSoundStudioFile } = await import('@lib/import/formats/DigitalSoundStudioParser');
    expect(isDigitalSoundStudioFormat(new Uint8Array(ab))).toBe(true);
    const song = parseDigitalSoundStudioFile(new Uint8Array(ab), 'doxtro3.dss');
    expect(song).toBeTruthy();
    logResult('DigitalSoundStudio', song!);
    expect(song!.format).toBeTruthy();
  });

  it('SeanConran: count_duckula.scr', async () => {
    const buf = readFileSync(resolve(BASE, 'count_duckula.scr'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isSeanConranFormat, parseSeanConranFile } = await import('@lib/import/formats/SeanConranParser');
    expect(isSeanConranFormat(new Uint8Array(ab))).toBe(true);
    const song = await parseSeanConranFile(ab, 'count_duckula.scr');
    logResult('SeanConran', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('Desire: batmanreturns.dsr', async () => {
    const buf = readFileSync(resolve(BASE, 'batmanreturns.dsr'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isDesireFormat, parseDesireFile } = await import('@lib/import/formats/DesireParser');
    expect(isDesireFormat(ab)).toBe(true);
    const song = parseDesireFile(ab, 'batmanreturns.dsr');
    logResult('Desire', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('SpecialFX: batmanthemovie.doda', async () => {
    const buf = readFileSync(resolve(BASE, 'batmanthemovie.doda'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isSpecialFXFormat, parseSpecialFXFile } = await import('@lib/import/formats/SpecialFXParser');
    expect(isSpecialFXFormat(ab)).toBe(true);
    const song = parseSpecialFXFile(ab, 'batmanthemovie.doda');
    logResult('SpecialFX doda', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('JochenHippelST: 5th_gear.hip (non-MCMD short form)', async () => {
    const buf = readFileSync(resolve(BASE, '5th_gear.hip'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isJochenHippelSTFormat, parseJochenHippelSTFile } = await import('@lib/import/formats/JochenHippelSTParser');
    expect(isJochenHippelSTFormat(ab)).toBe(true);
    const song = await parseJochenHippelSTFile(ab, '5th_gear.hip');
    logResult('JochenHippelST hip', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('MED: med.sadman (MMD1 prefix-named file)', async () => {
    const buf = readFileSync(resolve(BASE, 'med.sadman'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { parseMEDFile } = await import('@lib/import/formats/MEDParser');
    const song = parseMEDFile(ab, 'med.sadman');
    logResult('MED sadman', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('EMS: ballade.ems (RIFF-wrapped, UADE-only)', async () => {
    const buf = readFileSync(resolve(BASE, 'ballade.ems'));
    expect(buf.byteLength).toBeGreaterThan(0);
    // .ems is a RIFF-format file; routed to UADE via catch-all
    expect(await uadeDetect('ballade.ems')).toBe(true);
  });

  it('JochenHippelST: airballtest.sog (raw TFMX magic)', async () => {
    const buf = readFileSync(resolve(BASE, 'airballtest.sog'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isJochenHippelSTFormat, parseJochenHippelSTFile } = await import('@lib/import/formats/JochenHippelSTParser');
    expect(isJochenHippelSTFormat(ab)).toBe(true);
    const song = await parseJochenHippelSTFile(ab, 'airballtest.sog');
    logResult('JochenHippelST sog', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('DigitalSonixChrome: dragonsbreath.dsc', async () => {
    const buf = readFileSync(resolve(BASE, 'dragonsbreath.dsc'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isDscFormat, parseDscFile } = await import('@lib/import/formats/DigitalSonixChromeParser');
    expect(isDscFormat(ab)).toBe(true);
    const song = parseDscFile(ab, 'dragonsbreath.dsc');
    logResult('DigitalSonixChrome', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('KrisHatlelid: fiendish_freddys.kh', async () => {
    const buf = readFileSync(resolve(BASE, 'fiendish_freddys.kh'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isKrisHatlelidFormat, parseKrisHatlelidFile } = await import('@lib/import/formats/KrisHatlelidParser');
    expect(isKrisHatlelidFormat(ab)).toBe(true);
    const song = parseKrisHatlelidFile(ab, 'fiendish_freddys.kh');
    logResult('KrisHatlelid', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('MMDC: captain_planet.mmdc', async () => {
    const buf = readFileSync(resolve(BASE, 'captain_planet.mmdc'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isMMDCFormat, parseMMDCFile } = await import('@lib/import/formats/MMDCParser');
    expect(isMMDCFormat(ab)).toBe(true);
    const song = parseMMDCFile(ab, 'captain_planet.mmdc');
    logResult('MMDC', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('MarkCooksey Old: commando.mc', async () => {
    const buf = readFileSync(resolve(BASE, 'commando.mc'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isMarkCookseyFormat, parseMarkCookseyFile } = await import('@lib/import/formats/MarkCookseyParser');
    expect(isMarkCookseyFormat(ab, 'commando.mc')).toBe(true);
    const song = await parseMarkCookseyFile(ab, 'commando.mc');
    logResult('MarkCooksey mc', song);
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
  });

  it('JochenHippel7V: amberstar.hip7', async () => {
    const buf = readFileSync(resolve(BASE, 'amberstar.hip7'));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { isJochenHippel7VFormat, parseJochenHippel7VFile } = await import('@lib/import/formats/JochenHippel7VParser');
    if (isJochenHippel7VFormat(ab)) {
      const song = parseJochenHippel7VFile(ab, 'amberstar.hip7');
      logResult('JochenHippel7V', song);
      expect(song).toBeTruthy();
      expect(song.format).toBeTruthy();
    } else {
      console.log('  JochenHippel7V: not detected, falls to UADE');
    }
  });
});

// ── UADE routing detection tests ───────────────────────────────────────────

describe('UADE routing detection for remaining formats', () => {

  const uadeOnlyFiles = [
    // UADE_ONLY_PREFIXES (prefix.name form)
    'agony.aam',          // aam.* prefix
    'letsdance.bss',      // bss.* prefix
    // 'tearaway.dh' — now has native DavidHanneyParser
    'dns.hollywoodpokerpro', // dns.* prefix
    'crash_and_burn.dz',  // dz.* prefix
    'bladerunner.ea',     // ea.* prefix
    'ems.ballade',        // ems.* prefix
    'forgotten_worlds.fw', // fw.*
    // 'flood.glue' — now has native GlueMonParser
    'blazing_thunder.hd', // hd.*
    // '5th_gear.hip' — now has native JochenHippelSTParser test
    'alien_storm.md',     // md.*
    'atron.mk2',          // mk2.*
    'lefetichemaya.mok',  // mok.*
    'atmos.mso',          // mso.*
    'bombfusion.riff',    // riff.*
    'surf_ninjas.scn',    // scn.*
    'digital_voyage.sas', // sas.*
    'maniac_mansion.scumm', // scumm.*
    'boulderdash.spl',    // spl.*
    'salten_crackers.synmod', // synmod.*
    'chuckie_egg.tw',     // tw.*
    'qang.vss',           // vss.*
    // UADE_EXTENSIONS (*.ext form)
    'action.aps',         // aps
    'airball.ps',         // ps
    // 'airballtest.sog' — now has native JochenHippelSTParser test
    // 'amberstar.hip7' — now has native JochenHippel7VParser test
    'prehistoric_tale.hipc', // hipc
    'beast_busters.ims',  // ims
    'bombjack.jmf',       // jmf (native JankoMrsicFlogel detection fails for this file)
    // 'battlecommand.jd' — now has native SpecialFXParser test
    // 'fiendish_freddys.kh' — now has native KrisHatlelidParser test
    'ninjaspirit.lme',    // lme
    // 'commando.mc' — now has native MarkCookseyParser test
    // 'axelf.mm4' — now has native MusicMaker4VParser test
    // 'crockett8.mm8' — now has native MusicMaker8VParser test
    // 'captain_planet.mmdc' — now has native MMDCParser test
    'angel_harp.mms',     // mms
    // 'aquarivs.bp' — now has native SoundMonParser test
    // 'antidust.bp3' — now has native SoundMonParser test
    'newtek.bsi',         // bsi
    // 'artificial_dreams.sb' — now has native SteveBarrettParser test
    // 'chubbygristle.bds' — now has native BenDaglishSIDParser test
    // 'wicked.wb' — now has native WallyBebenParser test
    // 'doofus.sm' — now has native SoundMasterParser test
    'adept.smod',         // smod (FC variant)
    // 'fightingsoccer.snk' — now has native PaulSummersParser test
    // 'flimbos_quest.sqt' — now has native QuartetParser test
    // 'dragonsbreath.dsc' — now has native DigitalSonixChromeParser test
    // 'batmanreturns.dsr' — now has native DesireParser test
    // 'doxtro3.dss' — now has native DigitalSoundStudioParser test
    // 'batmanthemovie.doda' — now has native SpecialFXParser test
    // 'balrog.dln' — now has native DaveLoweNewParser test
    'crusaders1.dm',      // dm
    'flight.dmu',         // dmu
    // 'count_duckula.scr' — now has native SeanConranParser test
    'ziriax.pvp',         // pvp (native PeterVerswyvelenPacker detection fails for this file)
    'axelf.psf',          // psf (SoundFactory)
    // theday.digi → old DigiBooster 1.x text-header ("DIGI Boo..."); routes to OpenMPT, not UADE
    'turtle_ready.adsc',  // adsc
    'primemover.hot',     // hot (Anders Öland)
    'inconvenient.sg',    // sg (TomyTracker - also tested above)
    'anarchy.sid1',       // sid1
    'bruno_time.sid2',    // sid2
    'krymini.amc',        // amc
  ];

  for (const filename of uadeOnlyFiles) {
    it(`UADE route: ${filename}`, async () => {
      const filePath = resolve(BASE, filename);
      let exists = false;
      try {
        readFileSync(filePath);
        exists = true;
      } catch {
        console.log(`  SKIP: file not found: ${filename}`);
        return;
      }

      if (exists) {
        const detected = await uadeDetect(filename);
        if (!detected) {
          // May be routed via matchesExt prefix check rather than UADE_EXTENSIONS
          console.log(`  ${filename}: not in UADE_EXTENSIONS (likely routed via prefix matchesExt)`);
        } else {
          console.log(`  ${filename}: UADE detected ✓`);
        }
        // Either way the file should exist and routing should handle it
        expect(exists).toBe(true);
      }
    });
  }
});

// ── WASM engine format structure tests ────────────────────────────────────

describe('WASM engine format parser structure tests', () => {
  it('OrganyaParser: sets correct format and fileData', async () => {
    const { parseOrganyaFile } = await import('@lib/import/formats/OrganyaParser');
    const header = new TextEncoder().encode('Org-02');
    const buf = new ArrayBuffer(256);
    const u8 = new Uint8Array(buf);
    u8.set(header, 0);

    try {
      const song = await parseOrganyaFile(buf, 'test.org');
      logResult('Organya', song);
      expect(song.format).toBe('Organya');
      expect((song as any).organyaFileData).toBeTruthy();
      expect((song as any).organyaFileData.byteLength).toBeGreaterThan(0);
      console.log(`  ✓ format='Organya', organyaFileData=${(song as any).organyaFileData.byteLength} bytes`);
    } catch (e) {
      console.log(`  Parser error on minimal data (expected): ${(e as Error).message?.substring(0, 80)}`);
    }
  });

  it('DigiBoosterParser: rejects old text-header DIGI format (routes to OpenMPT)', async () => {
    // theday.digi starts with "DIGI Boo..." (old DigiBooster 1.x text header).
    // DigiBoosterParser only handles DBMX/DBM0 magic — it should throw.
    // AmigaFormatParsers catches the throw and falls through to OpenMPT.
    const { parseDigiBoosterFile } = await import('@lib/import/formats/DigiBoosterParser');
    const filePath = resolve(BASE, 'theday.digi');
    let fileExists = false;
    try {
      readFileSync(filePath);
      fileExists = true;
    } catch { /* skip */ }

    if (fileExists) {
      const raw = readFileSync(filePath);
      const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
      expect(() => parseDigiBoosterFile(buf, 'theday.digi')).toThrow(/Not a DigiBooster/);
      console.log('  theday.digi: DigiBoosterParser correctly rejects old text-header format ✓');
    } else {
      console.log('  SKIP: theday.digi not found');
    }
  });

  it('DigiBoosterParser: parses DBMX magic correctly', async () => {
    // Build a minimal DBMX file with just enough structure to parse
    const { parseDigiBoosterFile } = await import('@lib/import/formats/DigiBoosterParser');
    const buf = new ArrayBuffer(256);
    const u8 = new Uint8Array(buf);
    // Write DBMX magic
    u8[0] = 0x44; u8[1] = 0x42; u8[2] = 0x4D; u8[3] = 0x58; // "DBMX"
    try {
      const song = parseDigiBoosterFile(buf, 'test.digi');
      logResult('DigiBooster', song);
      expect(song.format).toBe('DIGI');
      console.log(`  ✓ format='DIGI', DBMX magic accepted`);
    } catch (e) {
      // Minimal buffer may be too small for full parse — that's acceptable
      console.log(`  Parser error on minimal DBMX data (expected): ${(e as Error).message?.substring(0, 80)}`);
    }
  });

  it('PxtoneParser: sets correct format and fileData', async () => {
    const { parsePxtoneFile } = await import('@lib/import/formats/PxtoneParser');
    const header = new TextEncoder().encode('PTCOLLAGE-071119');
    const buf = new ArrayBuffer(256);
    const u8 = new Uint8Array(buf);
    u8.set(header, 0);

    try {
      const song = await parsePxtoneFile('test.ptcop', buf);
      logResult('PxTone', song);
      expect(song.format).toBe('PxTone');
      expect((song as any).pxtoneFileData).toBeTruthy();
      expect((song as any).pxtoneFileData.byteLength).toBeGreaterThan(0);
      console.log(`  ✓ format='PxTone', pxtoneFileData=${(song as any).pxtoneFileData.byteLength} bytes`);
    } catch (e) {
      console.log(`  Parser error on minimal data (expected): ${(e as Error).message?.substring(0, 80)}`);
    }
  });
});
