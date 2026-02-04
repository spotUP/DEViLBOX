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
 *   blip_buf.h, wavetable.h, sample.h, fixedQueue.h
 *
 * Headers we REPLACE (stubs below):
 *   engine.h, song.h, ta-log.h, pch.h, ta-utils.h, config.h,
 *   safeWriter.h, dataErrors.h, effect.h, export.h, sysDef.h,
 *   cmdStream.h, filePlayer.h, audio/taAudio.h
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
// Common utility macros (used by waveSynth.cpp, etc.)
// ============================================================
#ifndef MIN
#define MIN(a,b) (((a)<(b))?(a):(b))
#endif
#ifndef MAX
#define MAX(a,b) (((a)>(b))?(a):(b))
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
// DivSong stub (minimal - only what dispatches access)
// ============================================================
struct DivSong {
  DivCompatFlags compatFlags;
  float tuning;

  DivSong(): tuning(440.0f) {}
};

// ============================================================
// Forward declarations for types dispatches reference
// ============================================================
class DivInstrument;
struct DivWavetable;
struct DivSample;

// ============================================================
// DivEngine stub - only methods dispatches actually call
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
        // F-num/block conversion not needed for GB
        return bf;
      } else {
        return bf;
      }
    }
    // Non-linear pitch
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

  // Instrument storage
  DivInstrument* getIns(int index, int fallbackType=0);
  DivWavetable* getWave(int index);
  DivSample* getSample(int index);

  // Timing
  float getCurHz() { return curHz; }

  // Internal state
  float curHz;

  DivEngine(): tickMult(1), curHz(60.0f) {}
};

// ============================================================
// Threading stubs (single-threaded WASM)
// ============================================================
#define BUSY_BEGIN
#define BUSY_BEGIN_SOFT
#define BUSY_END

#endif // __cplusplus

#endif // _FURNACE_PREEMPT_H
