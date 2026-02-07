/**
 * furnace_preempt.h - Preemptive header for Furnace WASM compilation
 *
 * Force-included via -include before ALL Furnace source files.
 * Defines include guards to preempt headers we can't use in WASM,
 * and provides minimal stubs for the DivEngine, DivSong, etc.
 *
 * The strategy: define _ENGINE_H, _SONG_H, etc. BEFORE the real
 * Furnace source files try to include them. Since the guards are
 * already defined, the real headers are skipped, and our minimal
 * stubs below provide the interface the dispatches actually need.
 *
 * Headers we KEEP (real Furnace code):
 *   dispatch.h, chipUtils.h, macroInt.h, instrument.h, defines.h,
 *   blip_buf.h, wavetable.h, fixedQueue.h
 *
 * Headers we REPLACE (stubs below):
 *   engine.h, song.h, ta-log.h, pch.h, ta-utils.h, config.h,
 *   safeWriter.h, dataErrors.h, effect.h, export.h, sysDef.h,
 *   cmdStream.h, filePlayer.h, audio/taAudio.h, sample.h, furIcons.h
 */

#ifndef _FURNACE_PREEMPT_H
#define _FURNACE_PREEMPT_H

// ============================================================
// Standard library includes (replaces pch.h)
// C and C++ compatible - this header is force-included for
// both C and C++ source files
// ============================================================
#ifdef __cplusplus
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdint>
#include <cmath>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <functional>
#include <initializer_list>
#else
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <math.h>
#endif

// ============================================================
// Common utility macros (used by many platform dispatches)
// ============================================================
#ifndef MIN
#define MIN(a,b) (((a)<(b))?(a):(b))
#endif
#ifndef MAX
#define MAX(a,b) (((a)>(b))?(a):(b))
#endif
#ifndef CLAMP
#define CLAMP(x,low,high) (((x)<(low))?(low):(((x)>(high))?(high):(x)))
#endif

// ============================================================
// Preempt headers we DON'T want to load
// ============================================================
#define FUR_PCH_H          // pch.h
#define _TA_UTILS_H        // ta-utils.h
#define _TA_LOG_H          // ta-log.h
#define _ENGINE_H          // engine.h
#define _SONG_H            // song.h
#define _DIVCONFIG_H       // config.h
#define _SAFEWRITER_H      // safeWriter.h
#define _DATA_ERRORS_H     // dataErrors.h
#define _EFFECT_H          // effect.h
#define _EXPORT_H          // export.h
#define _SYS_DEF_H         // sysDef.h
#define _CMD_STREAM_H      // cmdStream.h
#define _FILEPLAYER_H      // filePlayer.h
#define _TAAUDIO_H         // audio/taAudio.h
#define _SAMPLE_H          // sample.h
#define _FUR_ICONS_H       // furIcons.h
#define ICONS_FONTAWESOME_4_H  // IconsFontAwesome4.h

// ============================================================
// Icon stubs - used only in GUI, not audio
// ============================================================
#define ICON_FUR_NOISE ""
#define ICON_FUR_SAW ""
#define ICON_FUR_TRIANGLE ""
#define ICON_FUR_SQUARE ""
#define ICON_FUR_PULSE ""
#define ICON_FUR_ADSR_A ""
#define ICON_FUR_ADSR_D ""
#define ICON_FUR_ADSR_S ""
#define ICON_FUR_ADSR_R ""
#define ICON_FUR_DEC_LINEAR ""
#define ICON_FUR_DEC_EXP ""
#define ICON_FUR_INC_LINEAR ""
#define ICON_FUR_INC_BENT ""
#define ICON_FUR_VOL_DIRECT ""
#define ICON_FUR_WAVE ""
#define ICON_FA_EXCLAMATION_TRIANGLE ""
#define ICON_FA_VOLUME_UP ""
#define ICON_FA_VOLUME_DOWN ""
#define ICON_FA_LOCK ""
#define ICON_FA_BELL_SLASH_O ""

// Everything below is C++ only
#ifdef __cplusplus

// ============================================================
// ta-utils.h stub: String typedef
// ============================================================
typedef std::string String;

#ifdef _WIN32
#define DIR_SEPARATOR '\\'
#define DIR_SEPARATOR_STR "\\"
#else
#define DIR_SEPARATOR '/'
#define DIR_SEPARATOR_STR "/"
#endif

// ============================================================
// ta-log.h stub: No-op logging macros
// ============================================================
#define logD(...)
#define logV(...)
#define logI(...)
#define logW(...)
#define logE(...)

// ============================================================
// Translation stub - used for UI strings
// ============================================================
#define _(x) (x)

// ============================================================
// fmt library stub - for sprintf
// ============================================================
namespace fmt {
  template<typename... Args>
  inline std::string sprintf(const char* format, Args...) {
    return std::string(format);
  }
}

// ============================================================
// safeWriter.h / dataErrors.h stubs
// These are referenced by instrument.h but never called by dispatches
// ============================================================
enum DivDataErrors {
  DIV_DATA_SUCCESS=0,
  DIV_DATA_INVALID_DATA,
  DIV_DATA_INVALID_HEADER,
  DIV_DATA_OLD_VERSION
};

class SafeWriter {
public:
  void writeC(signed char val) {}
  void writeS(short val) {}
  void writeS_BE(short val) {}
  void writeI(int val) {}
  void writeI_BE(int val) {}
  void writeL(int64_t val) {}
  void writeF(float val) {}
  void writeD(double val) {}
  void writeString(String val, bool pascal=false) {}
  unsigned char* getFinalBuf() { return nullptr; }
  size_t size() { return 0; }
};

class SafeReader {
  size_t len, curSeek;
  const unsigned char* buf;
public:
  bool seek(ssize_t where, int whence) { return false; }
  size_t tell() { return curSeek; }
  size_t size() { return len; }
  int read(void* target, size_t count) { return 0; }
  signed char readC() { return 0; }
  short readS() { return 0; }
  short readS_BE() { return 0; }
  int readI() { return 0; }
  int readI_BE() { return 0; }
  int64_t readL() { return 0; }
  float readF() { return 0; }
  double readD() { return 0; }
  String readString() { return ""; }
  String readString(size_t len) { return ""; }
  SafeReader(): len(0), curSeek(0), buf(nullptr) {}
  SafeReader(const void* b, size_t l): len(l), curSeek(0), buf((const unsigned char*)b) {}
};

// ============================================================
// DivConfig stub (from config.h)
// ============================================================
class DivConfig {
  std::map<String,String> conf;
public:
  bool getBool(String key, bool fallback) const {
    auto it = conf.find(key);
    if (it == conf.end()) return fallback;
    return it->second == "true" || it->second == "1";
  }
  int getInt(String key, int fallback) const {
    auto it = conf.find(key);
    if (it == conf.end()) return fallback;
    try { return std::stoi(it->second); } catch (...) { return fallback; }
  }
  float getFloat(String key, float fallback) const {
    auto it = conf.find(key);
    if (it == conf.end()) return fallback;
    try { return std::stof(it->second); } catch (...) { return fallback; }
  }
  double getDouble(String key, double fallback) const {
    auto it = conf.find(key);
    if (it == conf.end()) return fallback;
    try { return std::stod(it->second); } catch (...) { return fallback; }
  }
  String getString(String key, String fallback) const {
    auto it = conf.find(key);
    if (it == conf.end()) return fallback;
    return it->second;
  }
  bool has(String key) const {
    return conf.find(key) != conf.end();
  }
  void set(String key, bool value) { conf[key] = value ? "true" : "false"; }
  void set(String key, int value) { conf[key] = std::to_string(value); }
  void set(String key, float value) { conf[key] = std::to_string(value); }
  void set(String key, double value) { conf[key] = std::to_string(value); }
  void set(String key, const char* value) { conf[key] = value; }
  void set(String key, String value) { conf[key] = value; }
  void set(String key, const std::vector<int>& value) {}
  std::vector<int> getIntList(String key, std::initializer_list<int> fallback) const {
    return std::vector<int>(fallback);
  }
  std::vector<String> getStringList(String key, std::initializer_list<String> fallback) const {
    return std::vector<String>(fallback);
  }
  const std::map<String,String>& configMap() { return conf; }
  bool loadFromMemory(const char* buf) { return false; }
  bool loadFromBase64(const char* buf) { return false; }
  bool loadFromFile(const char* path, bool createOnFail=true, bool redundancy=false) { return false; }
  String toString() { return ""; }
  String toBase64() { return ""; }
  bool save(const char* path, bool redundancy=false) { return false; }
  void remove(String key) { conf.erase(key); }
  void clear() { conf.clear(); }
};

// ============================================================
// DivCompatFlags stub (from song.h)
// All flags default to false/0 for new-style behavior
// ============================================================
struct DivCompatFlags {
  bool limitSlides;
  unsigned char linearPitch;
  unsigned char pitchSlideSpeed;
  unsigned char loopModality;
  unsigned char delayBehavior;
  unsigned char jumpTreatment;
  bool properNoiseLayout;
  bool waveDutyIsVol;
  bool resetMacroOnPorta;
  bool legacyVolumeSlides;
  bool compatibleArpeggio;
  bool noteOffResetsSlides;
  bool targetResetsSlides;
  bool arpNonPorta;
  bool algMacroBehavior;
  bool brokenShortcutSlides;
  bool ignoreDuplicateSlides;
  bool stopPortaOnNoteOff;
  bool continuousVibrato;
  bool brokenDACMode;
  bool oneTickCut;
  bool newInsTriggersInPorta;
  bool arp0Reset;
  bool brokenSpeedSel;
  bool noSlidesOnFirstTick;
  bool rowResetsArpPos;
  bool ignoreJumpAtEnd;
  bool buggyPortaAfterSlide;
  bool gbInsAffectsEnvelope;
  bool sharedExtStat;
  bool ignoreDACModeOutsideIntendedChannel;
  bool e1e2AlsoTakePriority;
  bool newSegaPCM;
  bool fbPortaPause;
  bool snDutyReset;
  bool pitchMacroIsLinear;
  bool oldOctaveBoundary;
  bool noOPN2Vol;
  bool newVolumeScaling;
  bool volMacroLinger;
  bool brokenOutVol;
  bool brokenOutVol2;
  bool e1e2StopOnSameNote;
  bool brokenPortaArp;
  bool snNoLowPeriods;
  bool disableSampleMacro;
  bool oldArpStrategy;
  bool brokenPortaLegato;
  bool brokenFMOff;
  bool preNoteNoEffect;
  bool oldDPCM;
  bool resetArpPhaseOnNewNote;
  bool ceilVolumeScaling;
  bool oldAlwaysSetVolume;
  bool oldSampleOffset;
  bool oldCenterRate;
  bool noVolSlideReset;

  void setDefaults() { memset(this, 0, sizeof(DivCompatFlags)); }
  bool areDefaults() { DivCompatFlags d; d.setDefaults(); return memcmp(this, &d, sizeof(DivCompatFlags)) == 0; }
  bool readData(SafeReader& reader) { return true; }
  void putData(SafeWriter* w) {}
  bool operator==(const DivCompatFlags& other) { return memcmp(this, &other, sizeof(DivCompatFlags)) == 0; }

  DivCompatFlags() { setDefaults(); }
};

// ============================================================
// Sample-related enums and structs (from sample.h)
// ============================================================
#ifndef DIV_MAX_CHIPS
#define DIV_MAX_CHIPS 32
#endif
#ifndef DIV_MAX_SAMPLE_TYPE
#define DIV_MAX_SAMPLE_TYPE 4
#endif

enum DivSampleLoopMode: unsigned char {
  DIV_SAMPLE_LOOP_FORWARD=0,
  DIV_SAMPLE_LOOP_BACKWARD,
  DIV_SAMPLE_LOOP_PINGPONG,
  DIV_SAMPLE_LOOP_MAX
};

enum DivSampleDepth: unsigned char {
  DIV_SAMPLE_DEPTH_1BIT=0,
  DIV_SAMPLE_DEPTH_1BIT_DPCM=1,
  DIV_SAMPLE_DEPTH_YMZ_ADPCM=3,
  DIV_SAMPLE_DEPTH_QSOUND_ADPCM=4,
  DIV_SAMPLE_DEPTH_ADPCM_A=5,
  DIV_SAMPLE_DEPTH_ADPCM_B=6,
  DIV_SAMPLE_DEPTH_ADPCM_K=7,
  DIV_SAMPLE_DEPTH_8BIT=8,
  DIV_SAMPLE_DEPTH_BRR=9,
  DIV_SAMPLE_DEPTH_VOX=10,
  DIV_SAMPLE_DEPTH_MULAW=11,
  DIV_SAMPLE_DEPTH_C219=12,
  DIV_SAMPLE_DEPTH_IMA_ADPCM=13,
  DIV_SAMPLE_DEPTH_12BIT=14,
  DIV_SAMPLE_DEPTH_4BIT=15,
  DIV_SAMPLE_DEPTH_16BIT=16,
  DIV_SAMPLE_DEPTH_MAX
};

// ============================================================
// DivSample struct (from sample.h) - Full definition needed
// ============================================================
struct DivSample {
  String name;
  int centerRate, loopStart, loopEnd;
  int legacyRate;
  DivSampleDepth depth;
  bool loop, brrEmphasis, brrNoFilter, dither;
  DivSampleLoopMode loopMode;

  bool renderOn[DIV_MAX_SAMPLE_TYPE][DIV_MAX_CHIPS];

  // Sample data pointers
  signed char* data8;
  short* data16;
  unsigned char* data1;
  unsigned char* dataDPCM;
  unsigned char* dataZ;
  unsigned char* dataQSoundA;
  unsigned char* dataA;
  unsigned char* dataB;
  unsigned char* dataK;
  unsigned char* dataBRR;
  unsigned char* dataVOX;
  unsigned char* dataMuLaw;
  unsigned char* dataC219;
  unsigned char* dataIMA;
  unsigned char* data12;
  unsigned char* data4;

  unsigned int length8, length16, length1, lengthDPCM, lengthZ, lengthQSoundA;
  unsigned int lengthA, lengthB, lengthK, lengthBRR, lengthVOX, lengthMuLaw;
  unsigned int lengthC219, lengthIMA, length12, length4;

  unsigned int samples;

  bool isLoopable() {
    return loop && loopStart >= 0 && loopEnd > loopStart;
  }

  // Convert a sample-count offset to a byte offset for a given depth
  int sampleOffsetToBytes(int offset, DivSampleDepth d) {
    switch (d) {
      case DIV_SAMPLE_DEPTH_1BIT: return (offset + 7) / 8;
      case DIV_SAMPLE_DEPTH_1BIT_DPCM: return (offset + 7) / 8;
      case DIV_SAMPLE_DEPTH_8BIT: return offset;
      case DIV_SAMPLE_DEPTH_16BIT: return offset * 2;
      case DIV_SAMPLE_DEPTH_BRR: return (offset / 16) * 9;
      case DIV_SAMPLE_DEPTH_VOX: return (offset + 1) / 2;
      case DIV_SAMPLE_DEPTH_MULAW: return offset;
      case DIV_SAMPLE_DEPTH_C219: return offset * 2;
      case DIV_SAMPLE_DEPTH_IMA_ADPCM: return (offset + 1) / 2;
      case DIV_SAMPLE_DEPTH_YMZ_ADPCM: return (offset + 1) / 2;
      case DIV_SAMPLE_DEPTH_QSOUND_ADPCM: return (offset + 1) / 2;
      case DIV_SAMPLE_DEPTH_ADPCM_A: return (offset + 1) / 2;
      case DIV_SAMPLE_DEPTH_ADPCM_B: return (offset + 1) / 2;
      case DIV_SAMPLE_DEPTH_ADPCM_K: return (offset + 1) / 2;
      case DIV_SAMPLE_DEPTH_12BIT: return ((offset * 3 + 1) / 2);
      case DIV_SAMPLE_DEPTH_4BIT: return (offset + 1) / 2;
      default: return offset;
    }
  }

  // Match real Furnace: getSampleOffset(offset, length, depth)
  // When offset==length or length==0: returns byte offset of position
  // Otherwise: returns isLoopable() ? byte_offset : byte_length
  int getSampleOffset(int offset, int length, DivSampleDepth d=DIV_SAMPLE_DEPTH_MAX) {
    if (d == DIV_SAMPLE_DEPTH_MAX) d = depth;
    if (length == 0 || offset == length) {
      return sampleOffsetToBytes(offset, d);
    }
    int off = sampleOffsetToBytes(offset, d);
    int len = sampleOffsetToBytes(length, d);
    return isLoopable() ? off : len;
  }

  int getLoopStartPosition(DivSampleDepth d=DIV_SAMPLE_DEPTH_MAX) {
    return getSampleOffset(loopStart, 0, d);
  }

  int getLoopEndPosition(DivSampleDepth d=DIV_SAMPLE_DEPTH_MAX) {
    return getSampleOffset(loopEnd, samples, d);
  }

  int getEndPosition(DivSampleDepth d=DIV_SAMPLE_DEPTH_MAX) {
    if (d == DIV_SAMPLE_DEPTH_MAX) d = depth;
    switch (d) {
      case DIV_SAMPLE_DEPTH_8BIT: return length8;
      case DIV_SAMPLE_DEPTH_16BIT: return length16;
      case DIV_SAMPLE_DEPTH_1BIT: return length1;
      case DIV_SAMPLE_DEPTH_1BIT_DPCM: return lengthDPCM;
      case DIV_SAMPLE_DEPTH_ADPCM_A: return lengthA;
      case DIV_SAMPLE_DEPTH_ADPCM_B: return lengthB;
      case DIV_SAMPLE_DEPTH_ADPCM_K: return lengthK;
      case DIV_SAMPLE_DEPTH_BRR: return lengthBRR;
      case DIV_SAMPLE_DEPTH_VOX: return lengthVOX;
      case DIV_SAMPLE_DEPTH_MULAW: return lengthMuLaw;
      case DIV_SAMPLE_DEPTH_C219: return lengthC219;
      case DIV_SAMPLE_DEPTH_IMA_ADPCM: return lengthIMA;
      default: return samples;
    }
  }

  unsigned int getCurBufLen() {
    // Return length based on depth
    if (depth == DIV_SAMPLE_DEPTH_8BIT) return length8;
    if (depth == DIV_SAMPLE_DEPTH_16BIT) return length16;
    return samples * 2; // default to 16-bit length
  }

  void* getCurBuf() {
    // Return appropriate buffer based on depth
    if (depth == DIV_SAMPLE_DEPTH_8BIT) return data8;
    if (depth == DIV_SAMPLE_DEPTH_16BIT) return data16;
    if (depth == DIV_SAMPLE_DEPTH_1BIT) return data1;
    if (depth == DIV_SAMPLE_DEPTH_1BIT_DPCM) return dataDPCM;
    if (depth == DIV_SAMPLE_DEPTH_BRR) return dataBRR;
    if (depth == DIV_SAMPLE_DEPTH_ADPCM_A) return dataA;
    if (depth == DIV_SAMPLE_DEPTH_ADPCM_B) return dataB;
    if (depth == DIV_SAMPLE_DEPTH_ADPCM_K) return dataK;
    if (depth == DIV_SAMPLE_DEPTH_VOX) return dataVOX;
    if (depth == DIV_SAMPLE_DEPTH_MULAW) return dataMuLaw;
    if (depth == DIV_SAMPLE_DEPTH_C219) return dataC219;
    if (depth == DIV_SAMPLE_DEPTH_IMA_ADPCM) return dataIMA;
    return data16; // default
  }

  void putSampleData(SafeWriter* w) {}
  DivDataErrors readSampleData(SafeReader& reader, short version) { return DIV_DATA_SUCCESS; }

  DivSample():
    name(""),
    centerRate(8363),
    loopStart(-1),
    loopEnd(-1),
    legacyRate(-1),
    depth(DIV_SAMPLE_DEPTH_16BIT),
    loop(false),
    brrEmphasis(true),
    brrNoFilter(false),
    dither(false),
    loopMode(DIV_SAMPLE_LOOP_FORWARD),
    data8(nullptr),
    data16(nullptr),
    data1(nullptr),
    dataDPCM(nullptr),
    dataZ(nullptr),
    dataQSoundA(nullptr),
    dataA(nullptr),
    dataB(nullptr),
    dataK(nullptr),
    dataBRR(nullptr),
    dataVOX(nullptr),
    dataMuLaw(nullptr),
    dataC219(nullptr),
    dataIMA(nullptr),
    data12(nullptr),
    data4(nullptr),
    length8(0), length16(0), length1(0), lengthDPCM(0), lengthZ(0), lengthQSoundA(0),
    lengthA(0), lengthB(0), lengthK(0), lengthBRR(0), lengthVOX(0), lengthMuLaw(0),
    lengthC219(0), lengthIMA(0), length12(0), length4(0),
    samples(0) {
    // Must initialize ALL renderOn flags to true (matching real Furnace behavior)
    // Each chip's renderSamples() checks s->renderOn[0][sysID] and skips if false
    for (int i = 0; i < DIV_MAX_CHIPS; i++) {
      for (int j = 0; j < DIV_MAX_SAMPLE_TYPE; j++) {
        renderOn[j][i] = true;
      }
    }
  }
};

// ============================================================
// DivSong stub (from song.h) - with sampleLen, insLen, waveLen
// ============================================================
class DivInstrument;
struct DivWavetable;

struct DivSong {
  DivCompatFlags compatFlags;
  float tuning;
  int insLen, waveLen, sampleLen;

  std::vector<DivInstrument*> ins;
  std::vector<DivWavetable*> wave;
  std::vector<DivSample*> sample;

  DivSong(): tuning(440.0f), insLen(0), waveLen(0), sampleLen(0) {}
};

// ============================================================
// DivEngine stub - methods dispatches actually call
// ============================================================
class DivEngine {
public:
  DivSong song;
  int tickMult;

  // Frequency calculation - matches Furnace engine.cpp exactly
  double calcBaseFreq(double clock, double divider, int note, bool period) {
    if (song.compatFlags.linearPitch) {
      return (note << 7);
    }
    double base = (period ? (song.tuning * 0.0625) : song.tuning) * pow(2.0, (float)(note + 3) / 12.0);
    return period ?
           (clock / base) / divider :
           base * (divider / clock);
  }

  int calcFreq(int base, int pitch, int arp, bool arpFixed, bool period=false, int octave=0, int pitch2=0, double clock=1.0, double divider=1.0, int blockBits=0, int fixedBlock=0) {
    if (song.compatFlags.linearPitch) {
      int nbase = base + pitch + pitch2;
      if (!song.compatFlags.oldArpStrategy) {
        if (arpFixed) {
          nbase = (arp << 7) + pitch + pitch2;
        } else {
          nbase += arp << 7;
        }
      }
      double fbase = (period ? (song.tuning * 0.0625) : song.tuning) * pow(2.0, (float)(nbase + 384) / (128.0 * 12.0));
      int bf = period ?
               (int)round((clock / fbase) / divider) :
               (int)round(fbase * (divider / clock));
      if (blockBits > 0) {
        return bf;
      } else {
        return bf;
      }
    }
    return period ?
             base - pitch - pitch2 :
             base + ((pitch * octave) >> 1) + pitch2;
  }

  int calcArp(int note, int arp, int offset=0) {
    if (arp < 0) {
      if (!(arp & 0x40000000)) return (arp | 0x40000000) + offset;
    } else {
      if (arp & 0x40000000) return (arp & (~0x40000000)) + offset;
    }
    return note + arp;
  }

  // F-num/block calculation for FM chips - matches Furnace engine.cpp
  int calcBaseFreqFNumBlock(double clock, double divider, int note, int bits, int fixedBlock) {
    if (song.compatFlags.linearPitch) {
      return (note << 7);
    }
    int bf = (int)calcBaseFreq(clock, divider, note, false);

    if (fixedBlock > 0) {
      // CONVERT_FNUM_FIXEDBLOCK
      int block = fixedBlock - 1;
      bf >>= block;
      if (bf < 0) bf = 0;
      if (bf > ((1 << bits) - 1)) {
        bf = (1 << bits) - 1;
      }
      return bf | (block << bits);
    } else {
      // CONVERT_FNUM_BLOCK
      double tuning = song.tuning;
      if (tuning < 400.0) tuning = 400.0;
      if (tuning > 500.0) tuning = 500.0;
      int boundaryBottom = (int)(tuning * pow(2.0, 0.25) * (divider / clock));
      int boundaryTop = (int)(2.0 * tuning * pow(2.0, 0.25) * (divider / clock));
      while (boundaryTop > ((1 << bits) - 1)) {
        boundaryTop >>= 1;
        boundaryBottom >>= 1;
      }
      int block = note / 12;
      if (block < 0) block = 0;
      if (block > 7) block = 7;
      bf >>= block;
      if (bf < 0) bf = 0;
      while (bf > 0 && bf < boundaryBottom && block > 0) {
        bf <<= 1;
        block--;
      }
      if (bf > boundaryTop) {
        while (block < 7 && bf > boundaryTop) {
          bf >>= 1;
          block++;
        }
        if (bf > ((1 << bits) - 1)) {
          bf = (1 << bits) - 1;
        }
      }
      return bf | (block << bits);
    }
  }

  // Center rate - used for sample playback rate calculation
  double getCenterRate() {
    return song.compatFlags.oldCenterRate ? 8363.0 : 8372.0;
  }

  // Pan conversion methods (used by NDS and other platforms)
  int convertPanSplitToLinearLR(int l, int r, int range) {
    // Simple conversion: return average biased left or right
    if (l == r) return range / 2;
    return (l > r) ? (range * l / (l + r)) : (range - range * r / (l + r));
  }

  unsigned short convertPanLinearToSplit(int pan, int bits, int range) {
    // Convert linear pan to split format: (L<<bits)|R
    int l = (pan * ((1 << bits) - 1)) / range;
    int r = ((range - pan) * ((1 << bits) - 1)) / range;
    return (unsigned short)((l << bits) | r);
  }

  // Instrument/sample access - implemented in DivEngineStub.cpp
  DivInstrument* getIns(int index, int fallbackType=0);
  DivWavetable* getWave(int index);
  DivSample* getSample(int index);

  // Timing
  float getCurHz() { return curHz; }
  size_t getBufferPos() { return 0; }

  // Configuration access
  int getConfInt(const char* key, int fallback) { return fallback; }
  bool getConfBool(const char* key, bool fallback) { return fallback; }
  float getConfFloat(const char* key, float fallback) { return fallback; }
  String getConfString(const char* key, const char* fallback) { return fallback; }

  // Export state - sid3.cpp checks this for half-clock mode
  bool isExporting() { return false; }

  // Internal state
  float curHz;

  DivEngine(): tickMult(1), curHz(60.0f) {}
};

// ============================================================
// furIcons.h stub - empty, just defines the guard
// ============================================================
// No actual icons needed for audio rendering

// ============================================================
// Threading stubs (single-threaded WASM)
// ============================================================
#define BUSY_BEGIN
#define BUSY_BEGIN_SOFT
#define BUSY_END

#endif // __cplusplus

#endif // _FURNACE_PREEMPT_H
