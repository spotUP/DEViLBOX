/**
 * engine_stubs.cpp — Stub implementations of DivEngine methods
 *
 * The file ops module only needs loadFur/saveFur. All runtime methods
 * (dispatch init, rendering, playback) are stubbed since active=false.
 */

#include "engine.h"

// ============================================================
// DivEngine runtime stubs — never called since active=false
// ============================================================
void DivEngine::quitDispatch() {}
void DivEngine::initDispatch(bool isRender) {}
void DivEngine::renderSamples(int whichSample) {}
void DivEngine::renderSamplesP(int whichSample) {}
void DivEngine::reset() {}
void DivEngine::changeSong(size_t songIndex) {
  curSubSongIndex = songIndex;
}
void DivEngine::changeSongP(size_t index) {
  changeSong(index);
}

// ============================================================
// Loader stubs — only loadFur and loadDMF are real; others stub out
// since load() in fileOpsCommon.cpp dispatches by magic bytes
// ============================================================
bool DivEngine::loadFTM(unsigned char* file, size_t len, bool dnm, bool dnm2, bool eft) {
  lastError="FTM loading not supported in WASM build";
  delete[] file;
  return false;
}
bool DivEngine::loadFC(unsigned char* file, size_t len) {
  lastError="FC loading not supported in WASM build";
  delete[] file;
  return false;
}
bool DivEngine::loadTFMv1(unsigned char* file, size_t len) {
  lastError="TFM loading not supported in WASM build";
  delete[] file;
  return false;
}
bool DivEngine::loadTFMv2(unsigned char* file, size_t len) {
  lastError="TFM loading not supported in WASM build";
  delete[] file;
  return false;
}
bool DivEngine::loadIT(unsigned char* file, size_t len) {
  lastError="IT loading not supported in WASM build";
  delete[] file;
  return false;
}
bool DivEngine::loadS3M(unsigned char* file, size_t len) {
  lastError="S3M loading not supported in WASM build";
  delete[] file;
  return false;
}
bool DivEngine::loadXM(unsigned char* file, size_t len) {
  lastError="XM loading not supported in WASM build";
  delete[] file;
  return false;
}
bool DivEngine::loadMod(unsigned char* file, size_t len) {
  lastError="MOD loading not supported in WASM build";
  delete[] file;
  return false;
}

// ============================================================
// Sample rate conversion — used by DMF loader
// ============================================================
static const int sampleRates[6]={
  4000, 8000, 11025, 16000, 22050, 32000
};

int DivEngine::fileToDivRate(int frate) {
  if (frate<0) frate=0;
  if (frate>5) frate=5;
  return sampleRates[frate];
}

int DivEngine::divToFileRate(int drate) {
  if (drate>26000) return 5;
  else if (drate>18000) return 4;
  else if (drate>14000) return 3;
  else if (drate>9500) return 2;
  else if (drate>6000) return 1;
  return 0;
}

// ============================================================
// Error/warning access
// ============================================================
String DivEngine::getLastError() {
  return lastError;
}

String DivEngine::getWarnings() {
  return warnings;
}

// ============================================================
// Instrument/sample/wave access — simple vector lookup
// ============================================================
DivInstrument* DivEngine::getIns(int index, DivInstrumentType fallbackType) {
  if (index >= 0 && index < (int)song.ins.size() && song.ins[index] != NULL) {
    return song.ins[index];
  }
  static DivInstrument defaultIns;
  return &defaultIns;
}

DivWavetable* DivEngine::getWave(int index) {
  if (index >= 0 && index < (int)song.wave.size() && song.wave[index] != NULL) {
    return song.wave[index];
  }
  static DivWavetable defaultWave;
  return &defaultWave;
}

DivSample* DivEngine::getSample(int index) {
  if (index >= 0 && index < (int)song.sample.size() && song.sample[index] != NULL) {
    return song.sample[index];
  }
  static DivSample defaultSample;
  return &defaultSample;
}

// ============================================================
// Config access — return defaults
// ============================================================
int DivEngine::getConfInt(String key, int fallback) {
  return conf.getInt(key, fallback);
}

// ============================================================
// Note conversion — used by loadFur pattern parsing
// ============================================================
short DivEngine::splitNoteToNote(short note, short octave) {
  if (note==100) {
    return DIV_NOTE_OFF;
  } else if (note==101) {
    return DIV_NOTE_REL;
  } else if (note==102) {
    return DIV_MACRO_REL;
  } else if (note==0 && octave!=0) {
    return DIV_NOTE_NULL_PAT;
  } else if (note==0 && octave==0) {
    return -1;
  } else {
    int seek=(note+(signed char)octave*12)+60;
    if (seek<0 || seek>=180) {
      return DIV_NOTE_NULL_PAT;
    } else {
      return seek;
    }
  }
  return -1;
}

// ============================================================
// ROM export defs — static member definition
// ============================================================
DivROMExportDef* DivEngine::romExportDefs[DIV_ROM_MAX];

// ============================================================
// DivEffectContainer stubs
// ============================================================
void DivEffectContainer::preAcquire(size_t count) {}
void DivEffectContainer::acquire(size_t count) {}
bool DivEffectContainer::init(DivEffectType effectType, DivEngine* eng, double rate, unsigned short version, const unsigned char* data, size_t len) { return false; }
void DivEffectContainer::quit() {}

// ============================================================
// cmdName array — referenced by engine.h
// ============================================================
const char* cmdName[] = {
  "NOTE_ON", "NOTE_OFF", "NOTE_OFF_ENV", "ENV_RELEASE", "INSTRUMENT",
  "VOLUME", "GET_VOLUME", "GET_VOLMAX", "NOTE_PORTA", "PITCH",
  "PANNING", "LEGATO", "PRE_PORTA", "HINT_VIBRATO", "HINT_VIBRATO_RANGE",
  "HINT_VIBRATO_SHAPE", "HINT_PITCH", "HINT_ARPEGGIO", "HINT_VOLUME",
  "HINT_VOL_SLIDE", "HINT_PORTA", "HINT_LEGATO",
  "SAMPLE_MODE", "SAMPLE_FREQ", "SAMPLE_BANK", "SAMPLE_POS", "SAMPLE_DIR",
  "FM_HARD_RESET", "FM_LFO", "FM_LFO_WAVE", "FM_TL", "FM_AM",
  "FM_AR", "FM_DR", "FM_MULT", "FM_RR", "FM_SL",
  "FM_D2R", "FM_RS", "FM_DT", "FM_DT2", "FM_SSG",
  "FM_FB", "FM_ALG", "FM_FMS", "FM_AMS", "FM_EXTCH",
  "FM_AM_DEPTH", "FM_PM_DEPTH",
  NULL
};
