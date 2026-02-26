/*
 * engine_stubs.cpp — Minimal DivEngine/DivSong stubs for WASM insEdit
 *
 * Provides just enough implementation to satisfy the linker for insEdit.cpp.
 * The real engine runs in JS/TypeScript; these stubs hold one instrument
 * and provide no-op or minimal implementations of called methods.
 */

#include "../engine/engine.h"
#include "../engine/macroInt.h"
#include "../ta-log.h"
#include <functional>
#include <cstring>

// ── ta-log globals and stubs ─────────────────────────────────────────────

int logLevel = 2;
std::atomic<unsigned short> logPosition(0);
LogEntry logEntries[TA_LOG_SIZE];

int writeLog(int level, const char* msg, fmt::printf_args args) {
  (void)level;
  (void)msg;
  (void)args;
  return 0;
}

void initLog(FILE* where) {
  (void)where;
}

void changeLogOutput(FILE* where) {
  (void)where;
}

bool startLogFile(const char* path) {
  (void)path;
  return false;
}

bool finishLogFile() {
  return false;
}

// ── DivEngine static member definitions ──────────────────────────────────

DivSysDef* DivEngine::sysDefs[DIV_MAX_CHIP_DEFS];
DivSystem DivEngine::sysFileMapFur[DIV_MAX_CHIP_DEFS];
DivSystem DivEngine::sysFileMapDMF[DIV_MAX_CHIP_DEFS];
DivROMExportDef* DivEngine::romExportDefs[DIV_ROM_MAX];

// ── DivEngine method stubs ───────────────────────────────────────────────

DivInstrument* DivEngine::getIns(int index, DivInstrumentType fallbackType) {
  if (index == -2 && tempIns != NULL) {
    return tempIns;
  }
  if (index < 0 || index >= song.insLen) {
    switch (fallbackType) {
      case DIV_INS_OPLL:
        return &song.nullInsOPLL;
      case DIV_INS_OPL:
        return &song.nullInsOPL;
      case DIV_INS_OPL_DRUMS:
        return &song.nullInsOPLDrums;
      case DIV_INS_ESFM:
        return &song.nullInsESFM;
      default:
        break;
    }
    return &song.nullIns;
  }
  return song.ins[index];
}

DivWavetable* DivEngine::getWave(int index) {
  if (index < 0 || index >= song.waveLen) {
    if (song.waveLen > 0) {
      return song.wave[0];
    } else {
      return &song.nullWave;
    }
  }
  return song.wave[index];
}

DivSample* DivEngine::getSample(int index) {
  if (index < 0 || index >= song.sampleLen) return &song.nullSample;
  return song.sample[index];
}

void DivEngine::notifyInsChange(int ins) {
  (void)ins;
  // no-op: no dispatch in WASM stub
}

void DivEngine::notifyWaveChange(int wave) {
  (void)wave;
  // no-op
}

void DivEngine::notifySampleChange(int sample) {
  (void)sample;
  // no-op
}

int DivEngine::getTotalChannelCount() {
  return song.chans;
}

std::vector<DivInstrumentType>& DivEngine::getPossibleInsTypes() {
  return song.possibleInsTypes;
}

float DivEngine::getCurHz() {
  return 60.0f;
}

int DivEngine::addWave() {
  if (song.wave.size() >= 32768) return -1;
  DivWavetable* wave = new DivWavetable;
  int waveCount = (int)song.wave.size();
  song.wave.push_back(wave);
  song.waveLen = waveCount + 1;
  return waveCount;
}

DivChannelState* DivEngine::getChanState(int ch) {
  if (ch < 0 || ch >= song.chans) return NULL;
  return &chan[ch];
}

DivMacroInt* DivEngine::getMacroInt(int chan) {
  (void)chan;
  static DivMacroInt nullMacroInt;
  return &nullMacroInt;
}

void DivEngine::lockEngine(const std::function<void()>& what) {
  what();
}

void DivEngine::synchronized(const std::function<void()>& what) {
  what();
}

void DivEngine::synchronizedSoft(const std::function<void()>& what) {
  what();
}

void DivEngine::lockSave(const std::function<void()>& what) {
  what();
}

void DivEngine::changeSong(size_t songIndex) {
  if (songIndex >= song.subsong.size()) return;
  curSubSong = song.subsong[songIndex];
  curPat = song.subsong[songIndex]->pat;
  curOrders = &song.subsong[songIndex]->orders;
  curSubSongIndex = songIndex;
  curOrder = 0;
  curRow = 0;
  prevOrder = 0;
  prevRow = 0;
}

// ── DivInstrument stubs ──────────────────────────────────────────────────

bool DivInstrument::recordUndoStepIfChanged(size_t processTime, const DivInstrument* old) {
  (void)processTime;
  (void)old;
  return false;
}

int DivInstrument::undo() {
  return 0;
}

int DivInstrument::redo() {
  return 0;
}

// ── MemPatch stubs ───────────────────────────────────────────────────────

bool MemPatch::calcDiff(const void* pre, const void* post, size_t size) {
  (void)pre;
  (void)post;
  (void)size;
  return false;
}

void MemPatch::applyAndReverse(void* target, size_t inputSize) {
  (void)target;
  (void)inputSize;
}

// ── DivInstrumentUndoStep stubs ──────────────────────────────────────────

void DivInstrumentUndoStep::applyAndReverse(DivInstrument* target) {
  (void)target;
}

bool DivInstrumentUndoStep::makeUndoPatch(size_t processTime_, const DivInstrument* pre, const DivInstrument* post) {
  (void)processTime_;
  (void)pre;
  (void)post;
  return false;
}

// ── DivInstrument copy/assignment/destructor stubs ───────────────────────

DivInstrument::DivInstrument(const DivInstrument& ins) {
  memset((unsigned char*)(DivInstrumentPOD*)this, 0, sizeof(DivInstrumentPOD));
  new ((DivInstrumentPOD*)this) DivInstrumentPOD;
  *((DivInstrumentPOD*)this) = (const DivInstrumentPOD&)ins;
  name = ins.name;
}

DivInstrument& DivInstrument::operator=(const DivInstrument& ins) {
  if (this == &ins) return *this;
  *((DivInstrumentPOD*)this) = (const DivInstrumentPOD&)ins;
  name = ins.name;
  return *this;
}

DivInstrument::~DivInstrument() {
  while (!undoHist.empty()) {
    delete undoHist.back();
    undoHist.pop_back();
  }
  while (!redoHist.empty()) {
    delete redoHist.back();
    redoHist.pop_back();
  }
}

// ── DivConfig stubs ──────────────────────────────────────────────────────

bool DivConfig::loadFromMemory(const char* buf) {
  (void)buf;
  return true;
}

bool DivConfig::loadFromBase64(const char* buf) {
  (void)buf;
  return true;
}

bool DivConfig::loadFromFile(const char* path, bool createOnFail, bool redundancy) {
  (void)path;
  (void)createOnFail;
  (void)redundancy;
  return true;
}

String DivConfig::toString() {
  return "";
}

String DivConfig::toBase64() {
  return "";
}

bool DivConfig::save(const char* path, bool redundancy) {
  (void)path;
  (void)redundancy;
  return true;
}

const std::map<String,String>& DivConfig::configMap() {
  return conf;
}

bool DivConfig::getBool(String key, bool fallback) const {
  auto it = conf.find(key);
  if (it == conf.end()) return fallback;
  return (it->second == "true" || it->second == "1");
}

int DivConfig::getInt(String key, int fallback) const {
  auto it = conf.find(key);
  if (it == conf.end()) return fallback;
  try {
    return std::stoi(it->second);
  } catch (...) {
    return fallback;
  }
}

float DivConfig::getFloat(String key, float fallback) const {
  auto it = conf.find(key);
  if (it == conf.end()) return fallback;
  try {
    return std::stof(it->second);
  } catch (...) {
    return fallback;
  }
}

double DivConfig::getDouble(String key, double fallback) const {
  auto it = conf.find(key);
  if (it == conf.end()) return fallback;
  try {
    return std::stod(it->second);
  } catch (...) {
    return fallback;
  }
}

String DivConfig::getString(String key, String fallback) const {
  auto it = conf.find(key);
  if (it == conf.end()) return fallback;
  return it->second;
}

std::vector<int> DivConfig::getIntList(String key, std::initializer_list<int> fallback) const {
  (void)key;
  return std::vector<int>(fallback);
}

std::vector<String> DivConfig::getStringList(String key, std::initializer_list<String> fallback) const {
  (void)key;
  return std::vector<String>(fallback);
}

bool DivConfig::has(String key) const {
  return conf.find(key) != conf.end();
}

void DivConfig::set(String key, bool value) {
  conf[key] = value ? "true" : "false";
}

void DivConfig::set(String key, int value) {
  conf[key] = std::to_string(value);
}

void DivConfig::set(String key, float value) {
  conf[key] = std::to_string(value);
}

void DivConfig::set(String key, double value) {
  conf[key] = std::to_string(value);
}

void DivConfig::set(String key, const char* value) {
  conf[key] = value;
}

void DivConfig::set(String key, String value) {
  conf[key] = value;
}

void DivConfig::set(String key, const std::vector<int>& value) {
  (void)key;
  (void)value;
}

void DivConfig::set(String key, const std::vector<String>& value) {
  (void)key;
  (void)value;
}

bool DivConfig::remove(String key) {
  return conf.erase(key) > 0;
}

void DivConfig::clear() {
  conf.clear();
}

// ── DivSong stubs ────────────────────────────────────────────────────────

void DivSong::findSubSongs() {}

void DivSong::clearSongData() {}

void DivSong::clearInstruments() {
  for (DivInstrument* i : ins) {
    delete i;
  }
  ins.clear();
  insLen = 0;
}

void DivSong::clearWavetables() {
  for (DivWavetable* w : wave) {
    delete w;
  }
  wave.clear();
  waveLen = 0;
}

void DivSong::clearSamples() {
  for (DivSample* s : sample) {
    delete s;
  }
  sample.clear();
  sampleLen = 0;
}

void DivSong::initDefaultSystemChans() {
  for (int i = 0; i < DIV_MAX_CHIPS; i++) {
    systemChans[i] = 0;
  }
}

void DivSong::recalcChans() {
  chans = 0;
  for (int i = 0; i < systemLen; i++) {
    chans += systemChans[i];
  }
  if (chans < 1) chans = 1;
  if (chans > DIV_MAX_CHANS) chans = DIV_MAX_CHANS;
}

void DivSong::unload() {
  clearInstruments();
  clearWavetables();
  clearSamples();
  for (DivSubSong* s : subsong) {
    delete s;
  }
  subsong.clear();
}

// ── DivGroovePattern stubs ───────────────────────────────────────────────

bool DivGroovePattern::readData(SafeReader& reader) {
  (void)reader;
  return false;
}

void DivGroovePattern::putData(SafeWriter* w) {
  (void)w;
}

void DivGroovePattern::checkBounds() {
  if (len < 1) len = 1;
  if (len > 16) len = 16;
  for (int i = 0; i < 16; i++) {
    if (val[i] < 1) val[i] = 1;
    if (val[i] > 255) val[i] = 255;
  }
}

// ── DivSubSong stubs ────────────────────────────────────────────────────

bool DivSubSong::readData(SafeReader& reader, int version, int chans) {
  (void)reader;
  (void)version;
  (void)chans;
  return false;
}

void DivSubSong::putData(SafeWriter* w, int chans) {
  (void)w;
  (void)chans;
}

void DivSubSong::clearData() {}
void DivSubSong::removeUnusedPatterns() {}
void DivSubSong::optimizePatterns() {}
void DivSubSong::rearrangePatterns() {}
void DivSubSong::sortOrders() {}
void DivSubSong::makePatUnique() {}

void DivSubSong::calcTimestamps(int chans, std::vector<DivGroovePattern>& grooves, int jumpTreatment, int ignoreJumpAtEnd, int brokenSpeedSel, int delayBehavior, int firstPat) {
  (void)chans;
  (void)grooves;
  (void)jumpTreatment;
  (void)ignoreJumpAtEnd;
  (void)brokenSpeedSel;
  (void)delayBehavior;
  (void)firstPat;
}

// ── DivSongTimestamps stubs ─────────────────────────────────────────────

TimeMicros DivSongTimestamps::getTimes(int order, int row) {
  if (order < 0 || order >= DIV_MAX_PATTERNS) return TimeMicros(-1, 0);
  if (row < 0 || row >= DIV_MAX_ROWS) return TimeMicros(-1, 0);
  TimeMicros* t = orders[order];
  if (t == NULL) return TimeMicros(-1, 0);
  return t[row];
}

DivSongTimestamps::DivSongTimestamps():
  totalTime(0, 0),
  totalTicks(0),
  totalRows(0),
  isLoopDefined(false),
  isLoopable(true) {
  memset(orders, 0, DIV_MAX_PATTERNS * sizeof(void*));
  memset(maxRow, 0, DIV_MAX_PATTERNS);
}

DivSongTimestamps::~DivSongTimestamps() {
  for (int i = 0; i < DIV_MAX_PATTERNS; i++) {
    if (orders[i] != NULL) {
      delete[] orders[i];
      orders[i] = NULL;
    }
  }
}

// ── TimeMicros stubs ─────────────────────────────────────────────────────

String TimeMicros::toString(signed char prec, TATimeFormats hms) {
  (void)prec;
  (void)hms;
  return "0:00";
}

TimeMicros TimeMicros::fromString(const String& s) {
  (void)s;
  return TimeMicros(0, 0);
}

// ── DivMacroStruct stubs ─────────────────────────────────────────────────

void DivMacroStruct::doMacro(DivInstrumentMacro& source, bool released, bool tick) {
  (void)source;
  (void)released;
  (void)tick;
}

void DivMacroStruct::prepare(DivInstrumentMacro& source, DivEngine* e) {
  (void)source;
  (void)e;
}

// ── DivMacroInt stubs ────────────────────────────────────────────────────

void DivMacroInt::mask(unsigned char id, bool enabled) {
  (void)id;
  (void)enabled;
}

void DivMacroInt::release() {}

void DivMacroInt::restart(unsigned char id) {
  (void)id;
}

void DivMacroInt::next() {}

void DivMacroInt::setEngine(DivEngine* eng) {
  (void)eng;
}

void DivMacroInt::init(DivInstrument* which) {
  (void)which;
}

void DivMacroInt::notifyInsDeletion(DivInstrument* which) {
  (void)which;
}

DivMacroStruct* DivMacroInt::structByType(unsigned char which) {
  (void)which;
  return NULL;
}

// ── DivDispatchContainer stubs ───────────────────────────────────────────

void DivDispatchContainer::setRates(double gotRate) { (void)gotRate; }
void DivDispatchContainer::setQuality(bool lowQual, bool dcHiPass) { (void)lowQual; (void)dcHiPass; }
void DivDispatchContainer::grow(size_t size) { (void)size; }
void DivDispatchContainer::acquire(size_t count) { (void)count; }
void DivDispatchContainer::flush(size_t offset, size_t count) { (void)offset; (void)count; }
void DivDispatchContainer::fillBuf(size_t runtotal, size_t offset, size_t size) { (void)runtotal; (void)offset; (void)size; }
void DivDispatchContainer::clear() {}
void DivDispatchContainer::init(DivSystem sys, DivEngine* eng, int chanCount, double gotRate, const DivConfig& flags, bool isRender) {
  (void)sys; (void)eng; (void)chanCount; (void)gotRate; (void)flags; (void)isRender;
}
void DivDispatchContainer::quit() {}

// ── DivEffectContainer stubs ─────────────────────────────────────────────

void DivEffectContainer::preAcquire(size_t count) { (void)count; }
void DivEffectContainer::acquire(size_t count) { (void)count; }
bool DivEffectContainer::init(DivEffectType effectType, DivEngine* eng, double rate, unsigned short version, const unsigned char* data, size_t len) {
  (void)effectType; (void)eng; (void)rate; (void)version; (void)data; (void)len;
  return false;
}
void DivEffectContainer::quit() {}

// ── cmdName stub ─────────────────────────────────────────────────────────

// ── DivEngine::isRunning stub ─────────────────────────────────────────────

bool DivEngine::isRunning() {
  return active;
}

// ── fileutils stubs ───────────────────────────────────────────────────────

#include "../fileutils.h"

bool moveFiles(const char* src, const char* dest) {
  (void)src; (void)dest;
  return false;
}

bool deleteFile(const char* path) {
  (void)path;
  return false;
}

int fileExists(const char* path) {
  (void)path;
  return 0;
}

// ── ESFM_write_reg stub ──────────────────────────────────────────────────

extern "C" {
#include "../extern/ESFMu/esfm.h"
void ESFM_write_reg(esfm_chip *chip, uint16_t address, uint8_t data) {
  (void)chip; (void)address; (void)data;
}

void ESFM_init(esfm_chip *chip, uint8_t fast) {
  (void)chip; (void)fast;
}
}

// ── DivWaveSynth stubs ───────────────────────────────────────────────────

#include "../engine/waveSynth.h"

void DivWaveSynth::init(DivInstrument* which, int w, int h, bool insChanged) {
  (void)which; (void)w; (void)h; (void)insChanged;
}

bool DivWaveSynth::tick(bool skipSubDiv) {
  (void)skipSubDiv;
  return false;
}

void DivWaveSynth::setWidth(int val) { (void)val; }
void DivWaveSynth::setEngine(DivEngine* engine, int waveFloor) { (void)engine; (void)waveFloor; }
bool DivWaveSynth::activeChanged() { return false; }

// ── ESFM_write_reg_buffered_fast stub ──────────────────────────────────

extern "C" {
void ESFM_write_reg_buffered_fast(esfm_chip *chip, uint16_t address, uint8_t data) {
  (void)chip; (void)address; (void)data;
}
}

// ── DivSample destructor ──────────────────────────────────────────────

#include "../engine/sample.h"

DivSampleHistory::~DivSampleHistory() {
  if (data!=NULL) delete[] data;
}

DivSample::~DivSample() {
  while (!undoHist.empty()) {
    DivSampleHistory* h=undoHist.back();
    delete h;
    undoHist.pop_back();
  }
  while (!redoHist.empty()) {
    DivSampleHistory* h=redoHist.back();
    delete h;
    redoHist.pop_back();
  }
  if (data8) delete[] data8;
  if (data16) delete[] data16;
  if (data1) delete[] data1;
  if (dataDPCM) delete[] dataDPCM;
  if (dataZ) delete[] dataZ;
  if (dataQSoundA) delete[] dataQSoundA;
  if (dataA) delete[] dataA;
  if (dataB) delete[] dataB;
  if (dataK) delete[] dataK;
  if (dataBRR) delete[] dataBRR;
  if (dataVOX) delete[] dataVOX;
  if (dataMuLaw) delete[] dataMuLaw;
  if (dataC219) delete[] dataC219;
  if (dataIMA) delete[] dataIMA;
  if (data12) delete[] data12;
  if (data4) delete[] data4;
}

// ── DivCompatFlags stubs ──────────────────────────────────────────────

void DivCompatFlags::setDefaults() {
  limitSlides=false;
  linearPitch=1;
  pitchSlideSpeed=4;
  loopModality=2;
  delayBehavior=2;
  jumpTreatment=0;
  properNoiseLayout=true;
  waveDutyIsVol=false;
  resetMacroOnPorta=false;
  legacyVolumeSlides=false;
  compatibleArpeggio=false;
  noteOffResetsSlides=true;
  targetResetsSlides=true;
  arpNonPorta=false;
  algMacroBehavior=false;
  brokenShortcutSlides=false;
  ignoreDuplicateSlides=false;
  stopPortaOnNoteOff=false;
  continuousVibrato=false;
  brokenDACMode=false;
  oneTickCut=false;
  newInsTriggersInPorta=true;
  arp0Reset=true;
  brokenSpeedSel=false;
  noSlidesOnFirstTick=false;
  rowResetsArpPos=false;
  ignoreJumpAtEnd=false;
  buggyPortaAfterSlide=false;
  gbInsAffectsEnvelope=true;
  sharedExtStat=true;
  ignoreDACModeOutsideIntendedChannel=false;
  e1e2AlsoTakePriority=false;
  newSegaPCM=true;
  fbPortaPause=false;
  snDutyReset=false;
  pitchMacroIsLinear=true;
  oldOctaveBoundary=false;
  noOPN2Vol=false;
  newVolumeScaling=true;
  volMacroLinger=true;
  brokenOutVol=false;
  brokenOutVol2=false;
  e1e2StopOnSameNote=false;
  brokenPortaArp=false;
  snNoLowPeriods=false;
  disableSampleMacro=false;
  oldArpStrategy=false;
  brokenPortaLegato=false;
  brokenFMOff=false;
  preNoteNoEffect=false;
  oldDPCM=false;
  resetArpPhaseOnNewNote=false;
  ceilVolumeScaling=false;
  oldAlwaysSetVolume=false;
  oldSampleOffset=false;
  oldCenterRate=true;
  noVolSlideReset=false;
}

bool DivCompatFlags::areDefaults() {
  DivCompatFlags defaultFlags;
  return (*this==defaultFlags);
}

bool DivCompatFlags::readData(SafeReader& reader) {
  (void)reader;
  return false;
}

void DivCompatFlags::putData(SafeWriter* w) {
  (void)w;
}

// ── DivChannelData stubs ──────────────────────────────────────────────

DivChannelData::DivChannelData():
  effectCols(1) {
  memset(data,0,DIV_MAX_PATTERNS*sizeof(void*));
}

DivPattern* DivChannelData::getPattern(int index, bool create) {
  if (index<0 || index>=DIV_MAX_PATTERNS) return NULL;
  if (create && data[index]==NULL) {
    data[index]=new DivPattern;
  }
  return data[index];
}

std::vector<std::pair<int,int>> DivChannelData::optimize() {
  return std::vector<std::pair<int,int>>();
}

std::vector<std::pair<int,int>> DivChannelData::rearrange() {
  return std::vector<std::pair<int,int>>();
}

void DivChannelData::wipePatterns() {
  for (int i=0; i<DIV_MAX_PATTERNS; i++) {
    if (data[i]!=NULL) {
      delete data[i];
      data[i]=NULL;
    }
  }
}

// ── DivPattern stubs ──────────────────────────────────────────────────

DivPattern::DivPattern() {
  memset(newData,0,sizeof(newData));
  for (int i=0; i<DIV_MAX_ROWS; i++) {
    newData[i][0]=0;
    newData[i][1]=0;
    newData[i][2]=-1;
    newData[i][3]=-1;
  }
}

bool DivPattern::isEmpty() {
  return true; // stub
}

void DivPattern::clear() {
  memset(newData,0,sizeof(newData));
  for (int i=0; i<DIV_MAX_ROWS; i++) {
    newData[i][0]=0;
    newData[i][1]=0;
    newData[i][2]=-1;
    newData[i][3]=-1;
  }
}

void DivPattern::copyOn(DivPattern* dest) {
  if (dest==NULL) return;
  dest->name=name;
  memcpy(dest->newData,newData,sizeof(newData));
}

// ── cmdName stub ─────────────────────────────────────────────────────────

const char* cmdName[] = {
  "NOTE_ON",
  "NOTE_OFF",
  "NOTE_OFF_ENV",
  "ENV_RELEASE",
  "INSTRUMENT",
  "VOLUME",
  "GET_VOLUME",
  "GET_VOLMAX",
  "NOTE_PORTA",
  "PITCH",
  "PANNING",
  "LEGATO",
  "PRE_PORTA",
  "PRE_NOTE",
  "HINT_VIBRATO",
  "HINT_VIBRATO_RANGE",
  "HINT_VIBRATO_SHAPE",
  "HINT_PITCH",
  "HINT_ARPEGGIO",
  "HINT_VOLUME",
  "HINT_PORTA",
  "HINT_VOL_SLIDE",
  "HINT_LEGATO",
  "SAMPLE_MODE",
  "SAMPLE_FREQ",
  "SAMPLE_BANK",
  "SAMPLE_POS",
  "SAMPLE_DIR",
  NULL
};
