/**
 * instrument_io.cpp — Read-side instrument serialization for WASM insEdit
 *
 * Extracted from Furnace reference: instrument.cpp (lines 1725-3698)
 * Contains:
 *   - All readFeature*() methods (NA, FM, MA, 64, GB, SM, Ox, LD, SN, N1, FD, WS, MP, SU, ES, X1, NE, EF, PN, S2, S3)
 *   - readInsDataNew() — feature-based format dispatcher (INS2/FINS)
 *   - readInsDataOld() — legacy format reader (INST)
 *   - readInsData() — entry point that detects format by magic bytes
 *   - convertC64SpecialMacro() — compatibility helper
 *   - Operator ==, macroByType, defaultIns — needed by instrument.h implementations
 *   - DivInstrumentMacro::compile stub
 *
 * Stubbed out:
 *   - readFeatureSL/WL/LS/LW — sample/wave list loading (requires DivSong mutations not supported in WASM)
 *   - putInsData2, writeFeature*, save, saveDMP — write-side serialization
 *
 * Copyright (C) 2021-2026 tildearrow and contributors (GPL-2.0-or-later)
 */

#include "dataErrors.h"
#include "engine.h"
#include "instrument.h"
#include "../ta-log.h"
#include "../fileutils.h"

const DivInstrument defaultIns;

/// instrument compilation (stub — we don't need write support)

void DivInstrumentMacro::compile(SafeWriter* w, DivCompiledMacroFormat format, int min, int max) {
  (void)w; (void)format; (void)min; (void)max;
}

/// operator== comparisons

#define _C(x) x==other.x

bool DivInstrumentFM::operator==(const DivInstrumentFM& other) {
  return (
    _C(alg) &&
    _C(fb) &&
    _C(fms) &&
    _C(ams) &&
    _C(fms2) &&
    _C(ams2) &&
    _C(ops) &&
    _C(opllPreset) &&
    _C(block) &&
    _C(fixedDrums) &&
    _C(kickFreq) &&
    _C(snareHatFreq) &&
    _C(tomTopFreq) &&
    _C(op[0]) &&
    _C(op[1]) &&
    _C(op[2]) &&
    _C(op[3])
  );
}

bool DivInstrumentFM::Operator::operator==(const DivInstrumentFM::Operator& other) {
  return (
    _C(enable) &&
    _C(am) &&
    _C(ar) &&
    _C(dr) &&
    _C(mult) &&
    _C(rr) &&
    _C(sl) &&
    _C(tl) &&
    _C(dt2) &&
    _C(rs) &&
    _C(dt) &&
    _C(d2r) &&
    _C(ssgEnv) &&
    _C(dam) &&
    _C(dvb) &&
    _C(egt) &&
    _C(ksl) &&
    _C(sus) &&
    _C(vib) &&
    _C(ws) &&
    _C(ksr) &&
    _C(kvs)
  );
}

bool DivInstrumentGB::operator==(const DivInstrumentGB& other) {
  return (
    _C(envVol) &&
    _C(envDir) &&
    _C(envLen) &&
    _C(soundLen) &&
    _C(hwSeqLen) &&
    _C(softEnv) &&
    _C(alwaysInit) &&
    _C(doubleWave)
  );
}

bool DivInstrumentC64::operator==(const DivInstrumentC64& other) {
  return (
    _C(triOn) &&
    _C(sawOn) &&
    _C(pulseOn) &&
    _C(noiseOn) &&
    _C(a) &&
    _C(d) &&
    _C(s) &&
    _C(r) &&
    _C(duty) &&
    _C(ringMod) &&
    _C(oscSync) &&
    _C(toFilter) &&
    _C(initFilter) &&
    _C(dutyIsAbs) &&
    _C(filterIsAbs) &&
    _C(noTest) &&
    _C(resetDuty) &&
    _C(res) &&
    _C(cut) &&
    _C(hp) &&
    _C(lp) &&
    _C(bp) &&
    _C(ch3off)
  );
}

bool DivInstrumentAmiga::operator==(const DivInstrumentAmiga& other) {
  return (
    _C(initSample) &&
    _C(useNoteMap) &&
    _C(useSample) &&
    _C(useWave) &&
    _C(waveLen)
  );
}

bool DivInstrumentX1_010::operator==(const DivInstrumentX1_010& other) {
  return _C(bankSlot);
}

bool DivInstrumentN163::operator==(const DivInstrumentN163& other) {
  return (
    _C(wave) &&
    _C(wavePos) &&
    _C(waveLen) &&
    _C(waveMode) &&
    _C(perChanPos) &&
    _C(wavePosCh[0]) &&
    _C(wavePosCh[1]) &&
    _C(wavePosCh[2]) &&
    _C(wavePosCh[3]) &&
    _C(wavePosCh[4]) &&
    _C(wavePosCh[5]) &&
    _C(wavePosCh[6]) &&
    _C(wavePosCh[7]) &&
    _C(waveLenCh[0]) &&
    _C(waveLenCh[1]) &&
    _C(waveLenCh[2]) &&
    _C(waveLenCh[3]) &&
    _C(waveLenCh[4]) &&
    _C(waveLenCh[5]) &&
    _C(waveLenCh[6]) &&
    _C(waveLenCh[7])
  );
}

bool DivInstrumentFDS::operator==(const DivInstrumentFDS& other) {
  return (
    (memcmp(modTable,other.modTable,32)==0) &&
    _C(modSpeed) &&
    _C(modDepth) &&
    _C(initModTableWithFirstWave)
  );
}

bool DivInstrumentMultiPCM::operator==(const DivInstrumentMultiPCM& other) {
  return (
    _C(ar) &&
    _C(d1r) &&
    _C(dl) &&
    _C(d2r) &&
    _C(rr) &&
    _C(rc) &&
    _C(lfo) &&
    _C(vib) &&
    _C(am) &&
    _C(damp) &&
    _C(pseudoReverb) &&
    _C(lfoReset) &&
    _C(levelDirect)
  );
}

bool DivInstrumentWaveSynth::operator==(const DivInstrumentWaveSynth& other) {
  return (
    _C(wave1) &&
    _C(wave2) &&
    _C(rateDivider) &&
    _C(effect) &&
    _C(oneShot) &&
    _C(enabled) &&
    _C(global) &&
    _C(speed) &&
    _C(param1) &&
    _C(param2) &&
    _C(param3) &&
    _C(param4)
  );
}

bool DivInstrumentSoundUnit::operator==(const DivInstrumentSoundUnit& other) {
  return (
    _C(switchRoles) &&
    _C(hwSeqLen)
  );
}

bool DivInstrumentES5506::operator==(const DivInstrumentES5506& other) {
  return (
    _C(filter.mode) &&
    _C(filter.k1) &&
    _C(filter.k2) &&
    _C(envelope.ecount) &&
    _C(envelope.lVRamp) &&
    _C(envelope.rVRamp) &&
    _C(envelope.k1Ramp) &&
    _C(envelope.k2Ramp) &&
    _C(envelope.k1Slow) &&
    _C(envelope.k2Slow)
  );
}

bool DivInstrumentSNES::operator==(const DivInstrumentSNES& other) {
  return (
    _C(useEnv) &&
    _C(sus) &&
    _C(gainMode) &&
    _C(gain) &&
    _C(a) &&
    _C(d) &&
    _C(s) &&
    _C(r) &&
    _C(d2)
  );
}

bool DivInstrumentESFM::operator==(const DivInstrumentESFM& other) {
  return (
    _C(noise) &&
    _C(op[0]) &&
    _C(op[1]) &&
    _C(op[2]) &&
    _C(op[3])
  );
}

bool DivInstrumentESFM::Operator::operator==(const DivInstrumentESFM::Operator& other) {
  return (
    _C(delay) &&
    _C(outLvl) &&
    _C(modIn) &&
    _C(left) &&
    _C(right) &&
    _C(fixed) &&
    _C(ct) &&
    _C(dt)
  );
}

bool DivInstrumentSID3::operator==(const DivInstrumentSID3& other) {
  return (
    _C(triOn) &&
    _C(sawOn) &&
    _C(pulseOn) &&
    _C(noiseOn) &&
    _C(a) &&
    _C(d) &&
    _C(s) &&
    _C(r) &&
    _C(sr) &&
    _C(duty) &&
    _C(ringMod) &&
    _C(oscSync) &&
    _C(phase_mod) &&
    _C(phase_mod_source) &&
    _C(ring_mod_source) &&
    _C(sync_source) &&
    _C(specialWaveOn) &&
    _C(oneBitNoise) &&
    _C(separateNoisePitch) &&
    _C(special_wave) &&
    _C(doWavetable) &&
    _C(dutyIsAbs) &&
    _C(resetDuty) &&
    _C(phaseInv) &&
    _C(feedback) &&
    _C(mixMode) &&
    _C(filt[0]) &&
    _C(filt[1]) &&
    _C(filt[2]) &&
    _C(filt[3])
  );
}

bool DivInstrumentSID3::Filter::operator==(const DivInstrumentSID3::Filter& other) {
  return (
    _C(cutoff) &&
    _C(resonance) &&
    _C(output_volume) &&
    _C(distortion_level) &&
    _C(mode) &&
    _C(enabled) &&
    _C(init) &&
    _C(filter_matrix) &&
    _C(absoluteCutoff) &&
    _C(bindCutoffToNote) &&
    _C(bindCutoffToNoteStrength) &&
    _C(bindCutoffToNoteCenter) &&
    _C(bindCutoffToNoteDir) &&
    _C(bindCutoffOnNote) &&
    _C(bindResonanceToNote) &&
    _C(bindResonanceToNoteStrength) &&
    _C(bindResonanceToNoteCenter) &&
    _C(bindResonanceToNoteDir) &&
    _C(bindResonanceOnNote)
  );
}

bool DivInstrumentPowerNoise::operator==(const DivInstrumentPowerNoise& other) {
  return _C(octave);
}

bool DivInstrumentSID2::operator==(const DivInstrumentSID2& other) {
  return (
    _C(volume) &&
    _C(mixMode) &&
    _C(noiseMode)
  );
}

#undef _C

#define CONSIDER(x,t) \
  case t: \
    return &x; \
    break;

DivInstrumentMacro* DivInstrumentSTD::macroByType(DivMacroType type) {
  switch (type) {
    CONSIDER(volMacro,DIV_MACRO_VOL)
    CONSIDER(arpMacro,DIV_MACRO_ARP)
    CONSIDER(dutyMacro,DIV_MACRO_DUTY)
    CONSIDER(waveMacro,DIV_MACRO_WAVE)
    CONSIDER(pitchMacro,DIV_MACRO_PITCH)
    CONSIDER(ex1Macro,DIV_MACRO_EX1)
    CONSIDER(ex2Macro,DIV_MACRO_EX2)
    CONSIDER(ex3Macro,DIV_MACRO_EX3)
    CONSIDER(algMacro,DIV_MACRO_ALG)
    CONSIDER(fbMacro,DIV_MACRO_FB)
    CONSIDER(fmsMacro,DIV_MACRO_FMS)
    CONSIDER(amsMacro,DIV_MACRO_AMS)
    CONSIDER(panLMacro,DIV_MACRO_PAN_LEFT)
    CONSIDER(panRMacro,DIV_MACRO_PAN_RIGHT)
    CONSIDER(phaseResetMacro,DIV_MACRO_PHASE_RESET)
    CONSIDER(ex4Macro,DIV_MACRO_EX4)
    CONSIDER(ex5Macro,DIV_MACRO_EX5)
    CONSIDER(ex6Macro,DIV_MACRO_EX6)
    CONSIDER(ex7Macro,DIV_MACRO_EX7)
    CONSIDER(ex8Macro,DIV_MACRO_EX8)
    CONSIDER(ex9Macro,DIV_MACRO_EX9)
    CONSIDER(ex10Macro,DIV_MACRO_EX10)
  }

  return NULL;
}

#undef CONSIDER

// ── Feature reading ─────────────────────────────────────────────────────

#define READ_FEAT_BEGIN \
  unsigned short featLen=reader.readS(); \
  size_t endOfFeat=reader.tell()+featLen;

#define READ_FEAT_END \
  if (reader.tell()<endOfFeat) reader.seek(endOfFeat,SEEK_SET);

void DivInstrument::readFeatureNA(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  name=reader.readString();

  READ_FEAT_END;
}

void DivInstrument::readFeatureFM(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  unsigned char opCount=reader.readC();

  fm.op[0].enable=(opCount&16);
  fm.op[1].enable=(opCount&32);
  fm.op[2].enable=(opCount&64);
  fm.op[3].enable=(opCount&128);

  opCount&=15;

  unsigned char next=reader.readC();
  fm.alg=(next>>4)&7;
  fm.fb=next&7;

  next=reader.readC();
  fm.fms2=(next>>5)&7;
  fm.ams=(next>>3)&3;
  fm.fms=next&7;

  next=reader.readC();
  fm.ams2=(next>>6)&3;
  fm.ops=(next&32)?4:2;
  fm.opllPreset=next&31;

  if (version>=224) {
    next=reader.readC();
    fm.block=next&15;
  }

  // read operators
  for (int i=0; i<opCount; i++) {
    DivInstrumentFM::Operator& op=fm.op[i];

    next=reader.readC();
    op.ksr=(next&128)?1:0;
    op.dt=(next>>4)&7;
    op.mult=next&15;

    next=reader.readC();
    op.sus=(next&128)?1:0;
    op.tl=next&127;

    next=reader.readC();
    op.rs=(next>>6)&3;
    op.vib=(next&32)?1:0;
    op.ar=next&31;

    next=reader.readC();
    op.am=(next&128)?1:0;
    op.ksl=(next>>5)&3;
    op.dr=next&31;

    next=reader.readC();
    op.egt=(next&128)?1:0;
    op.kvs=(next>>5)&3;
    op.d2r=next&31;

    next=reader.readC();
    op.sl=(next>>4)&15;
    op.rr=next&15;

    next=reader.readC();
    op.dvb=(next>>4)&15;
    op.ssgEnv=next&15;

    next=reader.readC();
    op.dam=(next>>5)&7;
    op.dt2=(next>>3)&3;
    op.ws=next&7;
  }

  READ_FEAT_END;
}

void DivInstrument::readFeatureMA(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  unsigned short macroHeaderLen=reader.readS();

  if (macroHeaderLen==0) {
    logW("invalid macro header length!");
    READ_FEAT_END;
    return;
  }

  DivInstrumentMacro* target=&std.volMacro;

  while (reader.tell()<endOfFeat) {
    size_t endOfMacroHeader=reader.tell()+macroHeaderLen;
    unsigned char macroCode=reader.readC();

    // end of macro list
    if (macroCode==255) break;

    switch (macroCode) {
      case 0:  target=&std.volMacro; break;
      case 1:  target=&std.arpMacro; break;
      case 2:  target=&std.dutyMacro; break;
      case 3:  target=&std.waveMacro; break;
      case 4:  target=&std.pitchMacro; break;
      case 5:  target=&std.ex1Macro; break;
      case 6:  target=&std.ex2Macro; break;
      case 7:  target=&std.ex3Macro; break;
      case 8:  target=&std.algMacro; break;
      case 9:  target=&std.fbMacro; break;
      case 10: target=&std.fmsMacro; break;
      case 11: target=&std.amsMacro; break;
      case 12: target=&std.panLMacro; break;
      case 13: target=&std.panRMacro; break;
      case 14: target=&std.phaseResetMacro; break;
      case 15: target=&std.ex4Macro; break;
      case 16: target=&std.ex5Macro; break;
      case 17: target=&std.ex6Macro; break;
      case 18: target=&std.ex7Macro; break;
      case 19: target=&std.ex8Macro; break;
      case 20: target=&std.ex9Macro; break;
      case 21: target=&std.ex10Macro; break;
      default:
        logW("invalid macro code %d!", macroCode);
        break;
    }

    target->len=reader.readC();
    target->loop=reader.readC();
    target->rel=reader.readC();
    target->mode=reader.readC();

    unsigned char wordSize=reader.readC();
    target->open=wordSize&15;
    wordSize>>=6;

    target->delay=reader.readC();
    target->speed=reader.readC();

    reader.seek(endOfMacroHeader,SEEK_SET);

    // read macro
    switch (wordSize) {
      case 0:
        for (int i=0; i<target->len; i++) {
          target->val[i]=(unsigned char)reader.readC();
        }
        break;
      case 1:
        for (int i=0; i<target->len; i++) {
          target->val[i]=(signed char)reader.readC();
        }
        break;
      case 2:
        for (int i=0; i<target->len; i++) {
          target->val[i]=reader.readS();
        }
        break;
      default:
        for (int i=0; i<target->len; i++) {
          target->val[i]=reader.readI();
        }
        break;
    }
  }

  if (version<193) {
    if (type==DIV_INS_AY || type==DIV_INS_AY8930) {
      for (int j=0; j<std.waveMacro.len; j++) {
        std.waveMacro.val[j]++;
      }
    }
  }

  READ_FEAT_END;
}

void DivInstrument::readFeature64(SafeReader& reader, bool& volIsCutoff, short version) {
  READ_FEAT_BEGIN;

  unsigned char next=reader.readC();
  c64.dutyIsAbs=next&128;
  c64.initFilter=next&64;
  volIsCutoff=next&32;
  c64.toFilter=next&16;
  c64.noiseOn=next&8;
  c64.pulseOn=next&4;
  c64.sawOn=next&2;
  c64.triOn=next&1;

  next=reader.readC();
  c64.oscSync=(next&128)?1:0;
  c64.ringMod=(next&64)?1:0;
  c64.noTest=next&32;
  c64.filterIsAbs=next&16;
  c64.ch3off=next&8;
  c64.bp=next&4;
  c64.hp=next&2;
  c64.lp=next&1;

  next=reader.readC();
  c64.a=(next>>4)&15;
  c64.d=next&15;

  next=reader.readC();
  c64.s=(next>>4)&15;
  c64.r=next&15;

  c64.duty=reader.readS()&4095;

  unsigned short cr=reader.readS();
  c64.cut=cr&4095;
  c64.res=cr>>12;

  if (version>=199) {
    next=(unsigned char)reader.readC();
    c64.res|=(next&15)<<4;

    if (version>=222) {
      c64.resetDuty=next&0x10;
    }
  }

  READ_FEAT_END;
}

void DivInstrument::readFeatureGB(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  unsigned char next=reader.readC();
  gb.envLen=(next>>5)&7;
  gb.envDir=(next&16)?1:0;
  gb.envVol=next&15;

  gb.soundLen=reader.readC();

  next=reader.readC();
  if (version>=196) gb.doubleWave=next&4;
  gb.alwaysInit=next&2;
  gb.softEnv=next&1;

  gb.hwSeqLen=reader.readC();
  for (int i=0; i<gb.hwSeqLen; i++) {
    gb.hwSeq[i].cmd=reader.readC();
    gb.hwSeq[i].data=reader.readS();
  }

  READ_FEAT_END;
}

void DivInstrument::readFeatureSM(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  amiga.initSample=reader.readS();

  unsigned char next=reader.readC();
  amiga.useWave=next&4;
  amiga.useSample=next&2;
  amiga.useNoteMap=next&1;

  amiga.waveLen=(unsigned char)reader.readC();

  if (amiga.useNoteMap) {
    for (int note=0; note<120; note++) {
      amiga.noteMap[note].freq=reader.readS();
      amiga.noteMap[note].map=reader.readS();
    }

    if (version<152) {
      for (int note=0; note<120; note++) {
        amiga.noteMap[note].freq=note;
      }
    }
  }

  READ_FEAT_END;
}

void DivInstrument::readFeatureOx(SafeReader& reader, int op, short version) {
  READ_FEAT_BEGIN;

  unsigned short macroHeaderLen=reader.readS();

  if (macroHeaderLen==0) {
    logW("invalid macro header length!");
    READ_FEAT_END;
    return;
  }

  DivInstrumentMacro* target=&std.opMacros[op].amMacro;

  while (reader.tell()<endOfFeat) {
    size_t endOfMacroHeader=reader.tell()+macroHeaderLen;
    unsigned char macroCode=reader.readC();

    // end of macro list
    if (macroCode==255) break;

    switch (macroCode) {
      case 0:  target=&std.opMacros[op].amMacro; break;
      case 1:  target=&std.opMacros[op].arMacro; break;
      case 2:  target=&std.opMacros[op].drMacro; break;
      case 3:  target=&std.opMacros[op].multMacro; break;
      case 4:  target=&std.opMacros[op].rrMacro; break;
      case 5:  target=&std.opMacros[op].slMacro; break;
      case 6:  target=&std.opMacros[op].tlMacro; break;
      case 7:  target=&std.opMacros[op].dt2Macro; break;
      case 8:  target=&std.opMacros[op].rsMacro; break;
      case 9:  target=&std.opMacros[op].dtMacro; break;
      case 10: target=&std.opMacros[op].d2rMacro; break;
      case 11: target=&std.opMacros[op].ssgMacro; break;
      case 12: target=&std.opMacros[op].damMacro; break;
      case 13: target=&std.opMacros[op].dvbMacro; break;
      case 14: target=&std.opMacros[op].egtMacro; break;
      case 15: target=&std.opMacros[op].kslMacro; break;
      case 16: target=&std.opMacros[op].susMacro; break;
      case 17: target=&std.opMacros[op].vibMacro; break;
      case 18: target=&std.opMacros[op].wsMacro; break;
      case 19: target=&std.opMacros[op].ksrMacro; break;
    }

    target->len=reader.readC();
    target->loop=reader.readC();
    target->rel=reader.readC();
    target->mode=reader.readC();

    unsigned char wordSize=reader.readC();
    target->open=wordSize&7;
    wordSize>>=6;

    target->delay=reader.readC();
    target->speed=reader.readC();

    reader.seek(endOfMacroHeader,SEEK_SET);

    // read macro
    switch (wordSize) {
      case 0:
        for (int i=0; i<target->len; i++) {
          target->val[i]=(unsigned char)reader.readC();
        }
        break;
      case 1:
        for (int i=0; i<target->len; i++) {
          target->val[i]=(signed char)reader.readC();
        }
        break;
      case 2:
        for (int i=0; i<target->len; i++) {
          target->val[i]=reader.readS();
        }
        break;
      default:
        for (int i=0; i<target->len; i++) {
          target->val[i]=reader.readI();
        }
        break;
    }

    // <167 TL macro compat
    if (macroCode==6 && version<167) {
      if (target->open&6) {
        for (int j=0; j<2; j++) {
          target->val[j]^=0x7f;
        }
      } else {
        for (int j=0; j<target->len; j++) {
          target->val[j]^=0x7f;
        }
      }
    }
  }

  READ_FEAT_END;
}

void DivInstrument::readFeatureLD(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  fm.fixedDrums=reader.readC();
  fm.kickFreq=reader.readS();
  fm.snareHatFreq=reader.readS();
  fm.tomTopFreq=reader.readS();

  READ_FEAT_END;
}

void DivInstrument::readFeatureSN(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  unsigned char next=reader.readC();
  snes.d=(next>>4)&7;
  snes.a=next&15;

  next=reader.readC();
  snes.s=(next>>5)&7;
  snes.r=next&31;

  next=reader.readC();
  snes.useEnv=next&16;
  snes.sus=(next&8)?1:0;
  snes.gainMode=(DivInstrumentSNES::GainMode)(next&7);

  if (snes.gainMode==1 || snes.gainMode==2 || snes.gainMode==3) snes.gainMode=DivInstrumentSNES::GAIN_MODE_DIRECT;

  snes.gain=reader.readC();

  if (version>=131) {
    next=reader.readC();
    snes.sus=(next>>5)&3;
    snes.d2=next&31;
  }

  READ_FEAT_END;
}

void DivInstrument::readFeatureN1(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  n163.wave=reader.readI();
  n163.wavePos=(unsigned char)reader.readC();
  n163.waveLen=(unsigned char)reader.readC();
  n163.waveMode=(unsigned char)reader.readC();

  if (version>=164) {
    n163.perChanPos=reader.readC();
    if (n163.perChanPos) {
      for (int i=0; i<8; i++) {
        n163.wavePosCh[i]=(unsigned char)reader.readC();
      }
      for (int i=0; i<8; i++) {
        n163.waveLenCh[i]=(unsigned char)reader.readC();
      }
    }
  }

  READ_FEAT_END;
}

void DivInstrument::readFeatureFD(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  fds.modSpeed=reader.readI();
  fds.modDepth=reader.readI();
  fds.initModTableWithFirstWave=reader.readC();
  reader.read(fds.modTable,32);

  READ_FEAT_END;
}

void DivInstrument::readFeatureWS(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  ws.wave1=reader.readI();
  ws.wave2=reader.readI();
  ws.rateDivider=reader.readC();
  ws.effect=reader.readC();
  ws.enabled=reader.readC();
  ws.global=reader.readC();
  ws.speed=reader.readC();
  ws.param1=reader.readC();
  ws.param2=reader.readC();
  ws.param3=reader.readC();
  ws.param4=reader.readC();

  READ_FEAT_END;
}

// ── Sample/Wave list loaders — STUBBED (no DivSong sample mutations in WASM) ──

void DivInstrument::readFeatureSL(SafeReader& reader, DivSong* song, short version) {
  READ_FEAT_BEGIN;
  // Skip sample list data — WASM doesn't load samples into DivSong
  READ_FEAT_END;
}

void DivInstrument::readFeatureWL(SafeReader& reader, DivSong* song, short version) {
  READ_FEAT_BEGIN;
  // Skip wave list data — WASM doesn't load wavetables into DivSong
  READ_FEAT_END;
}

void DivInstrument::readFeatureLS(SafeReader& reader, DivSong* song, short version) {
  READ_FEAT_BEGIN;
  // Skip sample list data (new format)
  READ_FEAT_END;
}

void DivInstrument::readFeatureLW(SafeReader& reader, DivSong* song, short version) {
  READ_FEAT_BEGIN;
  // Skip wave list data (new format)
  READ_FEAT_END;
}

void DivInstrument::readFeatureMP(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  multipcm.ar=reader.readC();
  multipcm.d1r=reader.readC();
  multipcm.dl=reader.readC();
  multipcm.d2r=reader.readC();
  multipcm.rr=reader.readC();
  multipcm.rc=reader.readC();
  multipcm.lfo=reader.readC();
  multipcm.vib=reader.readC();
  multipcm.am=reader.readC();

  if (version>=221) {
    unsigned char next=reader.readC();
    multipcm.damp=next&1;
    multipcm.pseudoReverb=next&2;
    multipcm.lfoReset=next&4;
    multipcm.levelDirect=next&8;
  }

  READ_FEAT_END;
}

void DivInstrument::readFeatureSU(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  su.switchRoles=reader.readC();

  if (version>=185) {
    su.hwSeqLen=reader.readC();
    for (int i=0; i<su.hwSeqLen; i++) {
      su.hwSeq[i].cmd=reader.readC();
      su.hwSeq[i].bound=reader.readC();
      su.hwSeq[i].val=reader.readC();
      su.hwSeq[i].speed=reader.readS();
    }
  }

  READ_FEAT_END;
}

void DivInstrument::readFeatureES(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  es5506.filter.mode=(DivInstrumentES5506::Filter::FilterMode)reader.readC();
  es5506.filter.k1=reader.readS();
  es5506.filter.k2=reader.readS();
  es5506.envelope.ecount=reader.readS();
  es5506.envelope.lVRamp=reader.readC();
  es5506.envelope.rVRamp=reader.readC();
  es5506.envelope.k1Ramp=reader.readC();
  es5506.envelope.k2Ramp=reader.readC();
  es5506.envelope.k1Slow=reader.readC();
  es5506.envelope.k2Slow=reader.readC();

  READ_FEAT_END;
}

void DivInstrument::readFeatureX1(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  x1_010.bankSlot=reader.readI();

  READ_FEAT_END;
}

void DivInstrument::readFeatureNE(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  amiga.useNoteMap=reader.readC();

  if (amiga.useNoteMap) {
    for (int note=0; note<120; note++) {
      amiga.noteMap[note].dpcmFreq=reader.readC();
      amiga.noteMap[note].dpcmDelta=reader.readC();
    }
  }

  READ_FEAT_END;
}

void DivInstrument::readFeatureEF(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  unsigned char next=reader.readC();
  esfm.noise=next&3;

  for (int i=0; i<4; i++) {
    DivInstrumentESFM::Operator& op=esfm.op[i];

    next=reader.readC();
    op.delay=(next>>5)&7;
    op.outLvl=(next>>2)&7;
    op.right=(next>>1)&1;
    op.left=next&1;

    next=reader.readC();
    op.modIn=next&7;
    op.fixed=(next>>3)&1;

    op.ct=reader.readC();
    op.dt=reader.readC();
  }

  READ_FEAT_END;
}

void DivInstrument::readFeaturePN(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  powernoise.octave=reader.readC();

  READ_FEAT_END;
}

void DivInstrument::readFeatureS2(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  unsigned char next=reader.readC();

  sid2.volume=next&0xf;
  sid2.mixMode=(next>>4)&3;
  sid2.noiseMode=next>>6;

  READ_FEAT_END;
}

void DivInstrument::readFeatureS3(SafeReader& reader, short version) {
  READ_FEAT_BEGIN;

  unsigned char next=reader.readC();

  sid3.dutyIsAbs=next&0x80;
  sid3.noiseOn=next&8;
  sid3.pulseOn=next&4;
  sid3.sawOn=next&2;
  sid3.triOn=next&1;

  sid3.a=reader.readC();
  sid3.d=reader.readC();
  sid3.s=reader.readC();
  sid3.sr=reader.readC();
  sid3.r=reader.readC();

  sid3.mixMode=reader.readC();

  sid3.duty=reader.readS();

  next=reader.readC();

  sid3.phase_mod=next&0x80;
  sid3.specialWaveOn=next&0x40;
  sid3.oneBitNoise=next&0x20;
  sid3.separateNoisePitch=next&0x10;
  sid3.doWavetable=next&8;
  sid3.resetDuty=next&4;
  sid3.oscSync=next&2;
  sid3.ringMod=next&1;

  sid3.phase_mod_source=reader.readC();
  sid3.ring_mod_source=reader.readC();
  sid3.sync_source=reader.readC();
  sid3.special_wave=reader.readC();
  sid3.phaseInv=reader.readC();
  sid3.feedback=reader.readC();

  unsigned char numFilters=reader.readC();

  for (int i=0; i<numFilters; i++) {
    if (i>=4) break;

    next=reader.readC();

    sid3.filt[i].enabled=next&0x80;
    sid3.filt[i].init=next&0x40;
    sid3.filt[i].absoluteCutoff=next&0x20;
    sid3.filt[i].bindCutoffToNote=next&0x10;
    sid3.filt[i].bindCutoffToNoteDir=next&8;
    sid3.filt[i].bindCutoffOnNote=next&4;
    sid3.filt[i].bindResonanceToNote=next&2;
    sid3.filt[i].bindResonanceToNoteDir=next&1;

    next=reader.readC();

    sid3.filt[i].bindResonanceOnNote=next&0x80;

    sid3.filt[i].cutoff=reader.readS();

    sid3.filt[i].resonance=reader.readC();
    sid3.filt[i].output_volume=reader.readC();
    sid3.filt[i].distortion_level=reader.readC();
    sid3.filt[i].mode=reader.readC();
    sid3.filt[i].filter_matrix=reader.readC();

    sid3.filt[i].bindCutoffToNoteStrength=reader.readC();
    sid3.filt[i].bindCutoffToNoteCenter=reader.readC();
    sid3.filt[i].bindResonanceToNoteStrength=reader.readC();
    sid3.filt[i].bindResonanceToNoteCenter=reader.readC();
  }

  READ_FEAT_END;
}

// ── readInsDataNew — feature-based format (INS2/FINS) ─────────────────

DivDataErrors DivInstrument::readInsDataNew(SafeReader& reader, short version, bool fui, DivSong* song) {
  unsigned char featCode[2];
  bool volIsCutoff=false;

  int dataLen=reader.size()-4;
  if (!fui) {
    dataLen=reader.readI();
  }
  dataLen+=reader.tell();

  reader.readS(); // format version. ignored.

  type=(DivInstrumentType)reader.readS();

  // feature reading loop
  while ((int)reader.tell()<dataLen) {
    // read feature code
    reader.read(featCode,2);

    if (memcmp(featCode,"EN",2)==0) { // end of instrument
      break;
    } else if (memcmp(featCode,"NA",2)==0) { // name
      readFeatureNA(reader,version);
    } else if (memcmp(featCode,"FM",2)==0) { // FM
      readFeatureFM(reader,version);
    } else if (memcmp(featCode,"MA",2)==0) { // macros
      readFeatureMA(reader,version);
    } else if (memcmp(featCode,"64",2)==0) { // C64
      readFeature64(reader,volIsCutoff,version);
    } else if (memcmp(featCode,"GB",2)==0) { // Game Boy
      readFeatureGB(reader,version);
    } else if (memcmp(featCode,"SM",2)==0) { // sample
      readFeatureSM(reader,version);
    } else if (memcmp(featCode,"O1",2)==0) { // op1 macros
      readFeatureOx(reader,0,version);
    } else if (memcmp(featCode,"O2",2)==0) { // op2 macros
      readFeatureOx(reader,1,version);
    } else if (memcmp(featCode,"O3",2)==0) { // op3 macros
      readFeatureOx(reader,2,version);
    } else if (memcmp(featCode,"O4",2)==0) { // op4 macros
      readFeatureOx(reader,3,version);
    } else if (memcmp(featCode,"LD",2)==0) { // OPL drums
      readFeatureLD(reader,version);
    } else if (memcmp(featCode,"SN",2)==0) { // SNES
      readFeatureSN(reader,version);
    } else if (memcmp(featCode,"N1",2)==0) { // Namco 163
      readFeatureN1(reader,version);
    } else if (memcmp(featCode,"FD",2)==0) { // FDS/VB
      readFeatureFD(reader,version);
    } else if (memcmp(featCode,"WS",2)==0) { // WaveSynth
      readFeatureWS(reader,version);
    } else if (memcmp(featCode,"SL",2)==0 && fui && song!=NULL) { // sample list (old)
      readFeatureSL(reader,song,version);
    } else if (memcmp(featCode,"WL",2)==0 && fui && song!=NULL) { // wave list (old)
      readFeatureWL(reader,song,version);
    } else if (memcmp(featCode,"LS",2)==0 && fui && song!=NULL) { // sample list (new)
      readFeatureLS(reader,song,version);
    } else if (memcmp(featCode,"LW",2)==0 && fui && song!=NULL) { // wave list (new)
      readFeatureLW(reader,song,version);
    } else if (memcmp(featCode,"MP",2)==0) { // MultiPCM
      readFeatureMP(reader,version);
    } else if (memcmp(featCode,"SU",2)==0) { // Sound Unit
      readFeatureSU(reader,version);
    } else if (memcmp(featCode,"ES",2)==0) { // ES5506
      readFeatureES(reader,version);
    } else if (memcmp(featCode,"X1",2)==0) { // X1-010
      readFeatureX1(reader,version);
    } else if (memcmp(featCode,"NE",2)==0) { // NES (DPCM)
      readFeatureNE(reader,version);
    } else if (memcmp(featCode,"EF",2)==0) { // ESFM
      readFeatureEF(reader,version);
    } else if (memcmp(featCode,"PN",2)==0) { // PowerNoise
      readFeaturePN(reader,version);
    } else if (memcmp(featCode,"S2",2)==0) { // SID2
      readFeatureS2(reader,version);
    } else if (memcmp(featCode,"S3",2)==0) { // SID3
      readFeatureS3(reader,version);
    } else {
      if (song==NULL && (memcmp(featCode,"SL",2)==0 || (memcmp(featCode,"WL",2)==0) || (memcmp(featCode,"LS",2)==0) || (memcmp(featCode,"LW",2)==0))) {
        // nothing — sample/wave lists without song context are skipped silently
      } else {
        logW("unknown feature code %c%c!",featCode[0],featCode[1]);
      }
      // skip feature
      unsigned short skip=reader.readS();
      reader.seek(skip,SEEK_CUR);
    }
  }

  // <187 C64 cutoff macro compatibility
  if (type==DIV_INS_C64 && volIsCutoff && version<187) {
    memcpy(&std.algMacro,&std.volMacro,sizeof(DivInstrumentMacro));
    std.algMacro.macroType=DIV_MACRO_ALG;
    std.volMacro=DivInstrumentMacro(DIV_MACRO_VOL,true);

    if (!c64.filterIsAbs) {
      for (int i=0; i<std.algMacro.len; i++) {
        std.algMacro.val[i]=-std.algMacro.val[i];
      }
    }
  }

  // <187 special/test/gate merge
  if (type==DIV_INS_C64 && version<187) {
    convertC64SpecialMacro();
  }

  return DIV_DATA_SUCCESS;
}

// ── readInsDataOld — legacy format (INST) ────────────────────────────

#define READ_MACRO_VALS(x,y) \
  for (int macroValPos=0; macroValPos<y; macroValPos++) x[macroValPos]=reader.readI();

DivDataErrors DivInstrument::readInsDataOld(SafeReader &reader, short version) {
  bool volIsCutoff=false;
  reader.readI(); // length. ignored.

  reader.readS(); // format version. ignored.
  type=(DivInstrumentType)reader.readC();
  reader.readC();
  name=reader.readString();

  // FM
  fm.alg=reader.readC();
  fm.fb=reader.readC();
  fm.fms=reader.readC();
  fm.ams=reader.readC();
  fm.ops=reader.readC();
  if (version>=60) {
    fm.opllPreset=reader.readC();
  } else {
    reader.readC();
  }
  reader.readC();
  reader.readC();

  for (int j=0; j<4; j++) {
    DivInstrumentFM::Operator& op=fm.op[j];
    op.am=reader.readC();
    op.ar=reader.readC();
    op.dr=reader.readC();
    op.mult=reader.readC();
    op.rr=reader.readC();
    op.sl=reader.readC();
    op.tl=reader.readC();
    op.dt2=reader.readC();
    op.rs=reader.readC();
    op.dt=reader.readC();
    op.d2r=reader.readC();
    op.ssgEnv=reader.readC();

    op.dam=reader.readC();
    op.dvb=reader.readC();
    op.egt=reader.readC();
    op.ksl=reader.readC();
    op.sus=reader.readC();
    op.vib=reader.readC();
    op.ws=reader.readC();
    op.ksr=reader.readC();

    if (version>=114) {
      op.enable=reader.readC();
    } else {
      reader.readC();
    }

    if (version>=115) {
      op.kvs=reader.readC();
    } else {
      op.kvs=2;
      reader.readC();
    }

    // reserved
    for (int k=0; k<10; k++) reader.readC();
  }

  // GB
  gb.envVol=reader.readC();
  gb.envDir=reader.readC();
  gb.envLen=reader.readC();
  gb.soundLen=reader.readC();

  // C64
  c64.triOn=reader.readC();
  c64.sawOn=reader.readC();
  c64.pulseOn=reader.readC();
  c64.noiseOn=reader.readC();
  c64.a=reader.readC();
  c64.d=reader.readC();
  c64.s=reader.readC();
  c64.r=reader.readC();
  c64.duty=reader.readS();
  c64.ringMod=reader.readC();
  c64.oscSync=reader.readC();
  c64.toFilter=reader.readC();
  c64.initFilter=reader.readC();
  volIsCutoff=reader.readC();
  c64.res=reader.readC();
  c64.lp=reader.readC();
  c64.bp=reader.readC();
  c64.hp=reader.readC();
  c64.ch3off=reader.readC();
  c64.cut=reader.readS();
  c64.dutyIsAbs=reader.readC();
  c64.filterIsAbs=reader.readC();

  // Amiga
  amiga.initSample=reader.readS();
  if (version>=82) {
    amiga.useWave=reader.readC();
    amiga.waveLen=(unsigned char)reader.readC();
  } else {
    reader.readC();
    reader.readC();
  }
  // reserved
  for (int k=0; k<12; k++) reader.readC();

  // standard
  std.volMacro.len=reader.readI();
  std.arpMacro.len=reader.readI();
  std.dutyMacro.len=reader.readI();
  std.waveMacro.len=reader.readI();
  if (version>=17) {
    std.pitchMacro.len=reader.readI();
    std.ex1Macro.len=reader.readI();
    std.ex2Macro.len=reader.readI();
    std.ex3Macro.len=reader.readI();
  }
  std.volMacro.loop=reader.readI();
  std.arpMacro.loop=reader.readI();
  std.dutyMacro.loop=reader.readI();
  std.waveMacro.loop=reader.readI();
  if (version>=17) {
    std.pitchMacro.loop=reader.readI();
    std.ex1Macro.loop=reader.readI();
    std.ex2Macro.loop=reader.readI();
    std.ex3Macro.loop=reader.readI();
  }
  std.arpMacro.mode=reader.readC();

  // macros
  std.volMacro.open=reader.readC();
  std.arpMacro.open=reader.readC();
  std.dutyMacro.open=reader.readC();
  std.waveMacro.open=reader.readC();
  if (version>=17) {
    std.pitchMacro.open=reader.readC();
    std.ex1Macro.open=reader.readC();
    std.ex2Macro.open=reader.readC();
    std.ex3Macro.open=reader.readC();
  }

  READ_MACRO_VALS(std.volMacro.val,std.volMacro.len);
  READ_MACRO_VALS(std.arpMacro.val,std.arpMacro.len);
  READ_MACRO_VALS(std.dutyMacro.val,std.dutyMacro.len);
  READ_MACRO_VALS(std.waveMacro.val,std.waveMacro.len);
  if (version>=17) {
    READ_MACRO_VALS(std.pitchMacro.val,std.pitchMacro.len);
    READ_MACRO_VALS(std.ex1Macro.val,std.ex1Macro.len);
    READ_MACRO_VALS(std.ex2Macro.val,std.ex2Macro.len);
    READ_MACRO_VALS(std.ex3Macro.val,std.ex3Macro.len);
  }

  // FM macros
  if (version>=29) {
    std.algMacro.len=reader.readI();
    std.fbMacro.len=reader.readI();
    std.fmsMacro.len=reader.readI();
    std.amsMacro.len=reader.readI();
    std.algMacro.loop=reader.readI();
    std.fbMacro.loop=reader.readI();
    std.fmsMacro.loop=reader.readI();
    std.amsMacro.loop=reader.readI();
    std.algMacro.open=reader.readC();
    std.fbMacro.open=reader.readC();
    std.fmsMacro.open=reader.readC();
    std.amsMacro.open=reader.readC();
    READ_MACRO_VALS(std.algMacro.val,std.algMacro.len);
    READ_MACRO_VALS(std.fbMacro.val,std.fbMacro.len);
    READ_MACRO_VALS(std.fmsMacro.val,std.fmsMacro.len);
    READ_MACRO_VALS(std.amsMacro.val,std.amsMacro.len);
  }

  // FM operator macros
  if (version>=44) {
    for (int i=0; i<4; i++) {
      DivInstrumentSTD::OpMacro& m=std.opMacros[i];
      m.amMacro.len=reader.readI();
      m.arMacro.len=reader.readI();
      m.drMacro.len=reader.readI();
      m.multMacro.len=reader.readI();
      m.rrMacro.len=reader.readI();
      m.slMacro.len=reader.readI();
      m.tlMacro.len=reader.readI();
      m.dt2Macro.len=reader.readI();
      m.rsMacro.len=reader.readI();
      m.dtMacro.len=reader.readI();
      m.d2rMacro.len=reader.readI();
      m.ssgMacro.len=reader.readI();

      m.amMacro.loop=reader.readI();
      m.arMacro.loop=reader.readI();
      m.drMacro.loop=reader.readI();
      m.multMacro.loop=reader.readI();
      m.rrMacro.loop=reader.readI();
      m.slMacro.loop=reader.readI();
      m.tlMacro.loop=reader.readI();
      m.dt2Macro.loop=reader.readI();
      m.rsMacro.loop=reader.readI();
      m.dtMacro.loop=reader.readI();
      m.d2rMacro.loop=reader.readI();
      m.ssgMacro.loop=reader.readI();

      m.amMacro.open=reader.readC();
      m.arMacro.open=reader.readC();
      m.drMacro.open=reader.readC();
      m.multMacro.open=reader.readC();
      m.rrMacro.open=reader.readC();
      m.slMacro.open=reader.readC();
      m.tlMacro.open=reader.readC();
      m.dt2Macro.open=reader.readC();
      m.rsMacro.open=reader.readC();
      m.dtMacro.open=reader.readC();
      m.d2rMacro.open=reader.readC();
      m.ssgMacro.open=reader.readC();
    }

    for (int i=0; i<4; i++) {
      DivInstrumentSTD::OpMacro& m=std.opMacros[i];
      READ_MACRO_VALS(m.amMacro.val,m.amMacro.len);
      READ_MACRO_VALS(m.arMacro.val,m.arMacro.len);
      READ_MACRO_VALS(m.drMacro.val,m.drMacro.len);
      READ_MACRO_VALS(m.multMacro.val,m.multMacro.len);
      READ_MACRO_VALS(m.rrMacro.val,m.rrMacro.len);
      READ_MACRO_VALS(m.slMacro.val,m.slMacro.len);
      READ_MACRO_VALS(m.tlMacro.val,m.tlMacro.len);
      READ_MACRO_VALS(m.dt2Macro.val,m.dt2Macro.len);
      READ_MACRO_VALS(m.rsMacro.val,m.rsMacro.len);
      READ_MACRO_VALS(m.dtMacro.val,m.dtMacro.len);
      READ_MACRO_VALS(m.d2rMacro.val,m.d2rMacro.len);
      READ_MACRO_VALS(m.ssgMacro.val,m.ssgMacro.len);
    }

    // TL macro compat
    for (int i=0; i<4; i++) {
      DivInstrumentSTD::OpMacro& m=std.opMacros[i];
      for (int j=0; j<m.tlMacro.len; j++) {
        m.tlMacro.val[j]^=0x7f;
      }
    }
  }

  // release points
  if (version>=44) {
    std.volMacro.rel=reader.readI();
    std.arpMacro.rel=reader.readI();
    std.dutyMacro.rel=reader.readI();
    std.waveMacro.rel=reader.readI();
    std.pitchMacro.rel=reader.readI();
    std.ex1Macro.rel=reader.readI();
    std.ex2Macro.rel=reader.readI();
    std.ex3Macro.rel=reader.readI();
    std.algMacro.rel=reader.readI();
    std.fbMacro.rel=reader.readI();
    std.fmsMacro.rel=reader.readI();
    std.amsMacro.rel=reader.readI();

    for (int i=0; i<4; i++) {
      DivInstrumentSTD::OpMacro& m=std.opMacros[i];
      m.amMacro.rel=reader.readI();
      m.arMacro.rel=reader.readI();
      m.drMacro.rel=reader.readI();
      m.multMacro.rel=reader.readI();
      m.rrMacro.rel=reader.readI();
      m.slMacro.rel=reader.readI();
      m.tlMacro.rel=reader.readI();
      m.dt2Macro.rel=reader.readI();
      m.rsMacro.rel=reader.readI();
      m.dtMacro.rel=reader.readI();
      m.d2rMacro.rel=reader.readI();
      m.ssgMacro.rel=reader.readI();
    }
  }

  // extended op macros
  if (version>=61) {
    for (int i=0; i<4; i++) {
      DivInstrumentSTD::OpMacro& m=std.opMacros[i];
      m.damMacro.len=reader.readI();
      m.dvbMacro.len=reader.readI();
      m.egtMacro.len=reader.readI();
      m.kslMacro.len=reader.readI();
      m.susMacro.len=reader.readI();
      m.vibMacro.len=reader.readI();
      m.wsMacro.len=reader.readI();
      m.ksrMacro.len=reader.readI();

      m.damMacro.loop=reader.readI();
      m.dvbMacro.loop=reader.readI();
      m.egtMacro.loop=reader.readI();
      m.kslMacro.loop=reader.readI();
      m.susMacro.loop=reader.readI();
      m.vibMacro.loop=reader.readI();
      m.wsMacro.loop=reader.readI();
      m.ksrMacro.loop=reader.readI();

      m.damMacro.rel=reader.readI();
      m.dvbMacro.rel=reader.readI();
      m.egtMacro.rel=reader.readI();
      m.kslMacro.rel=reader.readI();
      m.susMacro.rel=reader.readI();
      m.vibMacro.rel=reader.readI();
      m.wsMacro.rel=reader.readI();
      m.ksrMacro.rel=reader.readI();

      m.damMacro.open=reader.readC();
      m.dvbMacro.open=reader.readC();
      m.egtMacro.open=reader.readC();
      m.kslMacro.open=reader.readC();
      m.susMacro.open=reader.readC();
      m.vibMacro.open=reader.readC();
      m.wsMacro.open=reader.readC();
      m.ksrMacro.open=reader.readC();
    }

    for (int i=0; i<4; i++) {
      DivInstrumentSTD::OpMacro& m=std.opMacros[i];
      READ_MACRO_VALS(m.damMacro.val,m.damMacro.len);
      READ_MACRO_VALS(m.dvbMacro.val,m.dvbMacro.len);
      READ_MACRO_VALS(m.egtMacro.val,m.egtMacro.len);
      READ_MACRO_VALS(m.kslMacro.val,m.kslMacro.len);
      READ_MACRO_VALS(m.susMacro.val,m.susMacro.len);
      READ_MACRO_VALS(m.vibMacro.val,m.vibMacro.len);
      READ_MACRO_VALS(m.wsMacro.val,m.wsMacro.len);
      READ_MACRO_VALS(m.ksrMacro.val,m.ksrMacro.len);
    }
  }

  // OPL drums
  if (version>=63) {
    fm.fixedDrums=reader.readC();
    reader.readC(); // reserved
    fm.kickFreq=reader.readS();
    fm.snareHatFreq=reader.readS();
    fm.tomTopFreq=reader.readS();
  }

  // sample map
  if (version>=67) {
    amiga.useNoteMap=reader.readC();
    if (amiga.useNoteMap) {
      for (int note=0; note<120; note++) {
        amiga.noteMap[note].freq=reader.readI();
      }
      for (int note=0; note<120; note++) {
        amiga.noteMap[note].map=reader.readS();
      }
    }
  }

  // N163
  if (version>=73) {
    n163.wave=reader.readI();
    n163.wavePos=(unsigned char)reader.readC();
    n163.waveLen=(unsigned char)reader.readC();
    n163.waveMode=(unsigned char)reader.readC();
    reader.readC(); // reserved
  }

  // more macros
  if (version>=76) {
    std.panLMacro.len=reader.readI();
    std.panRMacro.len=reader.readI();
    std.phaseResetMacro.len=reader.readI();
    std.ex4Macro.len=reader.readI();
    std.ex5Macro.len=reader.readI();
    std.ex6Macro.len=reader.readI();
    std.ex7Macro.len=reader.readI();
    std.ex8Macro.len=reader.readI();

    std.panLMacro.loop=reader.readI();
    std.panRMacro.loop=reader.readI();
    std.phaseResetMacro.loop=reader.readI();
    std.ex4Macro.loop=reader.readI();
    std.ex5Macro.loop=reader.readI();
    std.ex6Macro.loop=reader.readI();
    std.ex7Macro.loop=reader.readI();
    std.ex8Macro.loop=reader.readI();

    std.panLMacro.rel=reader.readI();
    std.panRMacro.rel=reader.readI();
    std.phaseResetMacro.rel=reader.readI();
    std.ex4Macro.rel=reader.readI();
    std.ex5Macro.rel=reader.readI();
    std.ex6Macro.rel=reader.readI();
    std.ex7Macro.rel=reader.readI();
    std.ex8Macro.rel=reader.readI();

    std.panLMacro.open=reader.readC();
    std.panRMacro.open=reader.readC();
    std.phaseResetMacro.open=reader.readC();
    std.ex4Macro.open=reader.readC();
    std.ex5Macro.open=reader.readC();
    std.ex6Macro.open=reader.readC();
    std.ex7Macro.open=reader.readC();
    std.ex8Macro.open=reader.readC();

    READ_MACRO_VALS(std.panLMacro.val,std.panLMacro.len);
    READ_MACRO_VALS(std.panRMacro.val,std.panRMacro.len);
    READ_MACRO_VALS(std.phaseResetMacro.val,std.phaseResetMacro.len);
    READ_MACRO_VALS(std.ex4Macro.val,std.ex4Macro.len);
    READ_MACRO_VALS(std.ex5Macro.val,std.ex5Macro.len);
    READ_MACRO_VALS(std.ex6Macro.val,std.ex6Macro.len);
    READ_MACRO_VALS(std.ex7Macro.val,std.ex7Macro.len);
    READ_MACRO_VALS(std.ex8Macro.val,std.ex8Macro.len);
  }

  // FDS
  if (version>=76) {
    fds.modSpeed=reader.readI();
    fds.modDepth=reader.readI();
    fds.initModTableWithFirstWave=reader.readC();
    reader.readC(); // reserved
    reader.readC();
    reader.readC();
    reader.read(fds.modTable,32);
  }

  // OPZ
  if (version>=77) {
    fm.fms2=reader.readC();
    fm.ams2=reader.readC();
  }

  // wave synth
  if (version>=79) {
    ws.wave1=reader.readI();
    ws.wave2=reader.readI();
    ws.rateDivider=reader.readC();
    ws.effect=reader.readC();
    ws.enabled=reader.readC();
    ws.global=reader.readC();
    ws.speed=reader.readC();
    ws.param1=reader.readC();
    ws.param2=reader.readC();
    ws.param3=reader.readC();
    ws.param4=reader.readC();
  }

  // N163 per-channel
  if (version>=83) {
    n163.perChanPos=reader.readC();
    if (n163.perChanPos) {
      for (int i=0; i<8; i++) {
        n163.wavePosCh[i]=(unsigned char)reader.readC();
      }
      for (int i=0; i<8; i++) {
        n163.waveLenCh[i]=(unsigned char)reader.readC();
      }
    }
  }

  // more macro modes
  if (version>=90) {
    std.volMacro.mode=reader.readC();
    std.dutyMacro.mode=reader.readC();
    std.waveMacro.mode=reader.readC();
    std.pitchMacro.mode=reader.readC();
    std.ex1Macro.mode=reader.readC();
    std.ex2Macro.mode=reader.readC();
    std.ex3Macro.mode=reader.readC();
    std.algMacro.mode=reader.readC();
    std.fbMacro.mode=reader.readC();
    std.fmsMacro.mode=reader.readC();
    std.amsMacro.mode=reader.readC();
    std.panLMacro.mode=reader.readC();
    std.panRMacro.mode=reader.readC();
    std.phaseResetMacro.mode=reader.readC();
    std.ex4Macro.mode=reader.readC();
    std.ex5Macro.mode=reader.readC();
    std.ex6Macro.mode=reader.readC();
    std.ex7Macro.mode=reader.readC();
    std.ex8Macro.mode=reader.readC();
  }

  // C64 extra
  if (version>=100) {
    c64.noTest=reader.readC();
  }

  // MultiPCM
  if (version>=101) {
    multipcm.ar=reader.readC();
    multipcm.d1r=reader.readC();
    multipcm.dl=reader.readC();
    multipcm.d2r=reader.readC();
    multipcm.rr=reader.readC();
    multipcm.rc=reader.readC();
    multipcm.lfo=reader.readC();
    multipcm.vib=reader.readC();
    multipcm.am=reader.readC();
  }

  // SU
  if (version>=103) {
    su.switchRoles=reader.readC();
  }

  // ES5506
  if (version>=105) {
    es5506.filter.mode=(DivInstrumentES5506::Filter::FilterMode)reader.readC();
    es5506.filter.k1=reader.readS();
    es5506.filter.k2=reader.readS();
    es5506.envelope.ecount=reader.readS();
    es5506.envelope.lVRamp=reader.readC();
    es5506.envelope.rVRamp=reader.readC();
    es5506.envelope.k1Ramp=reader.readC();
    es5506.envelope.k2Ramp=reader.readC();
    es5506.envelope.k1Slow=reader.readC();
    es5506.envelope.k2Slow=reader.readC();
  }

  // SNES
  if (version>=109) {
    unsigned char next=reader.readC();
    snes.useEnv=next&16;
    snes.gainMode=(DivInstrumentSNES::GainMode)(next&7);
    if (snes.gainMode==1 || snes.gainMode==2 || snes.gainMode==3) snes.gainMode=DivInstrumentSNES::GAIN_MODE_DIRECT;
    snes.gain=reader.readC();
    next=reader.readC();
    snes.a=next&15;
    snes.d=(next>>4)&7;
    next=reader.readC();
    snes.s=(next>>5)&7;
    snes.r=next&31;
    snes.sus=(next&128)?3:0;
    if (version>=131) {
      snes.d2=reader.readC()&31;
    }
  }

  // macro speed/delay
  if (version>=111) {
    std.volMacro.speed=reader.readC();
    std.arpMacro.speed=reader.readC();
    std.dutyMacro.speed=reader.readC();
    std.waveMacro.speed=reader.readC();
    std.pitchMacro.speed=reader.readC();
    std.ex1Macro.speed=reader.readC();
    std.ex2Macro.speed=reader.readC();
    std.ex3Macro.speed=reader.readC();
    std.algMacro.speed=reader.readC();
    std.fbMacro.speed=reader.readC();
    std.fmsMacro.speed=reader.readC();
    std.amsMacro.speed=reader.readC();
    std.panLMacro.speed=reader.readC();
    std.panRMacro.speed=reader.readC();
    std.phaseResetMacro.speed=reader.readC();
    std.ex4Macro.speed=reader.readC();
    std.ex5Macro.speed=reader.readC();
    std.ex6Macro.speed=reader.readC();
    std.ex7Macro.speed=reader.readC();
    std.ex8Macro.speed=reader.readC();

    std.volMacro.delay=reader.readC();
    std.arpMacro.delay=reader.readC();
    std.dutyMacro.delay=reader.readC();
    std.waveMacro.delay=reader.readC();
    std.pitchMacro.delay=reader.readC();
    std.ex1Macro.delay=reader.readC();
    std.ex2Macro.delay=reader.readC();
    std.ex3Macro.delay=reader.readC();
    std.algMacro.delay=reader.readC();
    std.fbMacro.delay=reader.readC();
    std.fmsMacro.delay=reader.readC();
    std.amsMacro.delay=reader.readC();
    std.panLMacro.delay=reader.readC();
    std.panRMacro.delay=reader.readC();
    std.phaseResetMacro.delay=reader.readC();
    std.ex4Macro.delay=reader.readC();
    std.ex5Macro.delay=reader.readC();
    std.ex6Macro.delay=reader.readC();
    std.ex7Macro.delay=reader.readC();
    std.ex8Macro.delay=reader.readC();

    for (int i=0; i<4; i++) {
      DivInstrumentSTD::OpMacro& m=std.opMacros[i];
      m.amMacro.speed=reader.readC();
      m.arMacro.speed=reader.readC();
      m.drMacro.speed=reader.readC();
      m.multMacro.speed=reader.readC();
      m.rrMacro.speed=reader.readC();
      m.slMacro.speed=reader.readC();
      m.tlMacro.speed=reader.readC();
      m.dt2Macro.speed=reader.readC();
      m.rsMacro.speed=reader.readC();
      m.dtMacro.speed=reader.readC();
      m.d2rMacro.speed=reader.readC();
      m.ssgMacro.speed=reader.readC();
      m.damMacro.speed=reader.readC();
      m.dvbMacro.speed=reader.readC();
      m.egtMacro.speed=reader.readC();
      m.kslMacro.speed=reader.readC();
      m.susMacro.speed=reader.readC();
      m.vibMacro.speed=reader.readC();
      m.wsMacro.speed=reader.readC();
      m.ksrMacro.speed=reader.readC();

      m.amMacro.delay=reader.readC();
      m.arMacro.delay=reader.readC();
      m.drMacro.delay=reader.readC();
      m.multMacro.delay=reader.readC();
      m.rrMacro.delay=reader.readC();
      m.slMacro.delay=reader.readC();
      m.tlMacro.delay=reader.readC();
      m.dt2Macro.delay=reader.readC();
      m.rsMacro.delay=reader.readC();
      m.dtMacro.delay=reader.readC();
      m.d2rMacro.delay=reader.readC();
      m.ssgMacro.delay=reader.readC();
      m.damMacro.delay=reader.readC();
      m.dvbMacro.delay=reader.readC();
      m.egtMacro.delay=reader.readC();
      m.kslMacro.delay=reader.readC();
      m.susMacro.delay=reader.readC();
      m.vibMacro.delay=reader.readC();
      m.wsMacro.delay=reader.readC();
      m.ksrMacro.delay=reader.readC();
    }
  }

  // old C64 compat
  if (type==DIV_INS_C64 && version<187) {
    if (volIsCutoff && !c64.filterIsAbs) {
      memcpy(&std.algMacro,&std.volMacro,sizeof(DivInstrumentMacro));
      std.algMacro.macroType=DIV_MACRO_ALG;
      std.volMacro=DivInstrumentMacro(DIV_MACRO_VOL,true);
      for (int i=0; i<std.algMacro.len; i++) {
        std.algMacro.val[i]=-std.algMacro.val[i];
      }
    } else if (volIsCutoff) {
      memcpy(&std.algMacro,&std.volMacro,sizeof(DivInstrumentMacro));
      std.algMacro.macroType=DIV_MACRO_ALG;
      std.volMacro=DivInstrumentMacro(DIV_MACRO_VOL,true);
    }
    convertC64SpecialMacro();
  }

  return DIV_DATA_SUCCESS;
}

// ── readInsData — entry point ────────────────────────────────────────

DivDataErrors DivInstrument::readInsData(SafeReader& reader, short version, DivSong* song) {
  // 0: old (INST)
  // 1: new (INS2, length)
  // 2: new (FINS, no length)
  int type=-1;

  char magic[4];
  reader.read(magic,4);
  if (memcmp(magic,"INST",4)==0) {
    type=0;
  } else if (memcmp(magic,"INS2",4)==0) {
    type=1;
  } else if (memcmp(magic,"IN2B",4)==0) { // DIV_FUR_VARIANT_B
    type=1;
  } else if (memcmp(magic,"FINS",4)==0) {
    type=2;
  } else if (memcmp(magic,"FINB",4)==0) { // DIV_FUR_VARIANT_B
    type=2;
  } else {
    logE("invalid instrument header!");
    return DIV_DATA_INVALID_HEADER;
  }

  if (type==1 || type==2) {
    return readInsDataNew(reader,version,type==2,song);
  }
  return readInsDataOld(reader,version);
}

// ── convertC64SpecialMacro — compatibility helper ────────────────────

void DivInstrument::convertC64SpecialMacro() {
  // merge special and test/gate macros into new special macro
  int maxLen=MAX(std.ex3Macro.len,std.ex4Macro.len);

  // skip if ex4 is not a sequence macro
  if (std.ex4Macro.open&6) return;

  // move ex4 macro up and fill in gate
  for (int i=0; i<std.ex4Macro.len; i++) {
    std.ex4Macro.val[i]=(std.ex4Macro.val[i]&1)?9:1;
  }

  // merge ex3 into ex4 if viable to
  if (std.ex3Macro.len>0 && !(std.ex3Macro.open&6)) {
    if (std.ex4Macro.len>0 && std.ex4Macro.len<maxLen) {
      for (int i=std.ex4Macro.len; i<maxLen; i++) {
        std.ex4Macro.val[i]=std.ex3Macro.val[std.ex4Macro.len-1];
      }
    } else {
      for (int i=0; i<maxLen; i++) {
        std.ex4Macro.val[i]=1;
      }
    }
    for (int i=0; i<maxLen; i++) {
      if (i>=std.ex3Macro.len) {
        std.ex4Macro.val[i]|=(std.ex3Macro.val[std.ex3Macro.len-1]&3)<<1;
      } else {
        std.ex4Macro.val[i]|=(std.ex3Macro.val[i]&3)<<1;
      }
    }
  }
  std.ex4Macro.len=maxLen;

  std.ex3Macro=DivInstrumentMacro(DIV_MACRO_EX3);
}

// ── Write-side stubs (not needed for WASM insEdit) ───────────────────

void DivInstrument::putInsData2(SafeWriter* w, bool fui, const DivSong* song, bool insName) {
  (void)w; (void)fui; (void)song; (void)insName;
}

bool DivInstrument::save(const char* path, DivSong* song, bool writeInsName) {
  (void)path; (void)song; (void)writeInsName;
  return false;
}

bool DivInstrument::saveDMP(const char* path) {
  (void)path;
  return false;
}
