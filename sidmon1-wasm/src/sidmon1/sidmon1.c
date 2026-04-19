// sidmon1.c — SidMon 1.0 replayer
// 1:1 C port of FlodJS S1Player.js by Christian Corti (Neoart Costa Rica).
// Original format (c) 1988 Reinier van Vliet.
//
// Reference: /Users/spot/Code/Reference Code/FlodJS/S1Player.js
//
// Supports every variant FlodJS handles:
//   - Wavetable-only songs (waveform <= 15, cycled through waveLists)
//   - Sample-based songs (waveform > 15, PCM via sample headers table)
//   - Embedded-drum variant (patternsPtrEnd == 1, 3 drum samples baked into the
//     player binary at a 4dfa-tagged offset)
//   - Version tags 0x0FFA, 0x1170, 0x11C6, 0x11DC, 0x11E0, 0x125A, 0x1444
//
// Memory model (matches FlodJS mixer.memory):
//   byte 0..31                      = waveform 0 (zeroed, reserved)
//   byte 32*w..32*w+31              = waveform w (for 1..totWaveforms)
//   byte 32*(totWaveforms+1)..      = PCM sample data (appended)
// Paula channel pointers are offsets into this memory.

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "paula_soft.h"
#include "sidmon1.h"

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

#define NUM_VOICES         4
#define MAX_INSTRUMENTS    64   // FlodJS clamps totInstruments to 63, +1 for samples[0]
#define WAVE_SIZE          32

// Version tags (raw `j` value that selects behavior variants)
#define SIDMON_0FFA  0x0FFA
#define SIDMON_1170  0x1170
#define SIDMON_11C6  0x11C6
#define SIDMON_11DC  0x11DC
#define SIDMON_11E0  0x11E0
#define SIDMON_125A  0x125A
#define SIDMON_1444  0x1444

// Embedded drum-sample lengths (FlodJS EMBEDDED const, used when patternsPtrEnd == 1)
static const int EMBEDDED_LENS[3] = { 1166, 408, 908 };

// ══════════════════════════════════════════════════════════════════════════════
// SidMon 1.0 period table (verbatim from S1Player.js, 790 entries after PERIODS[0]=0)
// Indexed as PERIODS[finetune + arpeggio[step] + note]
// ══════════════════════════════════════════════════════════════════════════════

static const uint16_t PERIODS[791] = {
  0,
  5760,5424,5120,4832,4560,4304,4064,3840,3616,3424,3232,3048,
  2880,2712,2560,2416,2280,2152,2032,1920,1808,1712,1616,1524,
  1440,1356,1280,1208,1140,1076,1016, 960, 904, 856, 808, 762,
   720, 678, 640, 604, 570, 538, 508, 480, 452, 428, 404, 381,
   360, 339, 320, 302, 285, 269, 254, 240, 226, 214, 202, 190,
   180, 170, 160, 151, 143, 135, 127,
   0,0,0,0,0,0,0,
  4028,3806,3584,3394,3204,3013,2855,2696,2538,2395,2268,2141,
  2014,1903,1792,1697,1602,1507,1428,1348,1269,1198,1134,1071,
  1007, 952, 896, 849, 801, 754, 714, 674, 635, 599, 567, 536,
   504, 476, 448, 425, 401, 377, 357, 337, 310, 300, 284, 268,
   252, 238, 224, 213, 201, 189, 179, 169, 159, 150, 142, 134,
   0,0,0,0,0,0,0,
  3993,3773,3552,3364,3175,2987,2830,2672,2515,2374,2248,2122,
  1997,1887,1776,1682,1588,1494,1415,1336,1258,1187,1124,1061,
   999, 944, 888, 841, 794, 747, 708, 668, 629, 594, 562, 531,
   500, 472, 444, 421, 397, 374, 354, 334, 315, 297, 281, 266,
   250, 236, 222, 211, 199, 187, 177, 167, 158, 149, 141, 133,
   0,0,0,0,0,0,0,
  3957,3739,3521,3334,3147,2960,2804,2648,2493,2353,2228,2103,
  1979,1870,1761,1667,1574,1480,1402,1324,1247,1177,1114,1052,
   990, 935, 881, 834, 787, 740, 701, 662, 624, 589, 557, 526,
   495, 468, 441, 417, 394, 370, 351, 331, 312, 295, 279, 263,
   248, 234, 221, 209, 197, 185, 176, 166, 156, 148, 140, 132,
   0,0,0,0,0,0,0,
  3921,3705,3489,3304,3119,2933,2779,2625,2470,2331,2208,2084,
  1961,1853,1745,1652,1560,1467,1390,1313,1235,1166,1104,1042,
   981, 927, 873, 826, 780, 734, 695, 657, 618, 583, 552, 521,
   491, 464, 437, 413, 390, 367, 348, 329, 309, 292, 276, 261,
   246, 232, 219, 207, 195, 184, 174, 165, 155, 146, 138, 131,
   0,0,0,0,0,0,0,
  3886,3671,3457,3274,3090,2907,2754,2601,2448,2310,2188,2065,
  1943,1836,1729,1637,1545,1454,1377,1301,1224,1155,1094,1033,
   972, 918, 865, 819, 773, 727, 689, 651, 612, 578, 547, 517,
   486, 459, 433, 410, 387, 364, 345, 326, 306, 289, 274, 259,
   243, 230, 217, 205, 194, 182, 173, 163, 153, 145, 137, 130,
   0,0,0,0,0,0,0,
  3851,3638,3426,3244,3062,2880,2729,2577,2426,2289,2168,2047,
  1926,1819,1713,1622,1531,1440,1365,1289,1213,1145,1084,1024,
   963, 910, 857, 811, 766, 720, 683, 645, 607, 573, 542, 512,
   482, 455, 429, 406, 383, 360, 342, 323, 304, 287, 271, 256,
   241, 228, 215, 203, 192, 180, 171, 162, 152, 144, 136, 128,
  6848,6464,6096,5760,5424,5120,4832,4560,4304,4064,3840,3616,
  3424,3232,3048,2880,2712,2560,2416,2280,2152,2032,1920,1808,
  1712,1616,1524,1440,1356,1280,1208,1140,1076,1016, 960, 904,
   856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 452,
   428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
   214, 202, 190, 180, 170, 160, 151, 143, 135, 127,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0
};

// ══════════════════════════════════════════════════════════════════════════════
// Types (mirror FlodJS S1Sample / AmigaRow / AmigaStep / S1Voice / S1Player)
// ══════════════════════════════════════════════════════════════════════════════

// Combined instrument + PCM sample. Every synth instrument is a "sample" in
// FlodJS terms; when sample.waveform > 15 the PCM fields are filled in.
typedef struct {
    // Synth parameters (apply when waveform <= 15)
    uint32_t waveform;        // waveList index, or >15 for PCM sample index
    uint8_t  arpeggio[16];
    uint8_t  attackSpeed;
    uint8_t  attackMax;
    uint8_t  decaySpeed;
    uint8_t  decayMin;
    uint8_t  sustain;
    uint8_t  releaseSpeed;
    uint8_t  releaseMin;
    uint8_t  phaseShift;
    uint8_t  phaseSpeed;
    uint16_t finetune;        // pre-multiplied by 67 (0..1005), or raw byte for SIDMON_1444
    int8_t   pitchFall;

    // PCM fields (apply when waveform > 15)
    uint32_t pointer;         // byte offset into paulaMemory
    uint32_t loop;             // loop offset relative to pointer (0 = no loop)
    uint32_t length;           // total sample length in bytes
    uint32_t repeat;           // loop length (bytes)
    uint32_t loopPtr;          // absolute loop pointer in paulaMemory (0 = no loop)
    uint8_t  volume;           // fixed volume (0 = use envelope)
    char     name[24];         // 20-byte name + null terminator
} SM1Sample;

typedef struct {
    uint32_t pattern;          // index into patternsPtr
    int8_t   transpose;
} SM1Track;                     // = AmigaStep in FlodJS

typedef struct {
    uint8_t note;
    uint8_t sample;
    uint8_t effect;
    uint8_t param;
    uint8_t speed;
} SM1Row;                       // = S1Row in FlodJS

typedef struct {
    int index;                  // channel index (0..3)
    int step;                   // current track index
    int row;                    // current pattern row index (absolute)
    int sample;                 // current instrument (samples[] index)
    int samplePtr;              // Paula loop pointer (-1 = none)
    int sampleLen;              // Paula loop length in bytes
    int note;
    int noteTimer;
    int period;
    int volume;
    int bendTo;
    int bendSpeed;
    int arpeggioCtr;
    int envelopeCtr;            // 0=attack, 2=decay, 4=sustain, 6=release, 8=done
    int pitchCtr;
    int pitchFallCtr;
    int sustainCtr;
    int phaseTimer;
    int phaseSpeed;
    int wavePos;                // 0..16, position within current waveList
    int waveList;               // current waveList index (= sample.waveform for wavetable)
    int waveTimer;              // ticks remaining on current waveform
    int waitCtr;                // DMA retrigger state machine (0..3)
} SM1Voice;

typedef struct {
    // Raw module data (owned copy)
    uint8_t *mod_data;
    int      mod_len;

    // Version
    int      version;           // 1 = loaded, 0 = failed
    uint32_t versionTag;        // SIDMON_* value (raw j from detection)

    // Paula memory (waveforms + PCM samples laid out as described above)
    uint8_t *paulaMemory;
    int      paulaMemorySize;   // allocated size
    int      paulaMemoryUsed;   // bump pointer

    // Tracks
    SM1Track *tracks;
    int       numTracks;
    uint32_t  tracksPtr[NUM_VOICES];  // per-voice starting track index

    // Pattern rows
    SM1Row   *patterns;
    int       numPatternRows;

    // Pattern pointers (start row index per pattern)
    uint32_t *patternsPtr;
    int       numPatternsPtrs;

    // Samples (combined instruments + PCM), index 0 is empty placeholder
    SM1Sample *samples;
    int        numSamples;      // total entries allocated (= len or len+3)

    // WaveLists (16 bytes per list, indexed by sample.waveform)
    uint8_t *waveLists;
    int      waveListsLen;

    // Header block (11 uint32 BE values at position + waveEnd)
    uint32_t speedDef;
    uint32_t patternDef;
    uint32_t trackLen;
    uint32_t mix1Source1, mix1Source2;
    uint32_t mix2Source1, mix2Source2;
    uint32_t mix1Dest, mix2Dest;
    uint32_t mix1Speed, mix2Speed;
    int      doFilter;
    int      doReset;

    int      totWaveforms;
    int      totInstruments;
    int      totSamples;        // used when waveform > 15 (for header table size)
    int      sampleHeadersFileOffset;  // absolute offset to sample headers (for waveform>15 resolution)

    // Player state
    int tick;
    int speed;
    int trackPos;
    int trackEnd;
    int patternPos;
    int patternEnd;
    int patternLen;
    int mix1Ctr, mix1Pos;
    int mix2Ctr, mix2Pos;
    int audPtr, audLen, audPer, audVol;

    // Voices
    SM1Voice voices[NUM_VOICES];

    // Lifecycle
    int loaded;
    int finished;
} SM1State;

static SM1State ps;

// ══════════════════════════════════════════════════════════════════════════════
// Big-endian readers
// ══════════════════════════════════════════════════════════════════════════════

static inline uint16_t rd16(const uint8_t *p) {
    return ((uint16_t)p[0] << 8) | p[1];
}

static inline uint32_t rd32(const uint8_t *p) {
    return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) |
           ((uint32_t)p[2] << 8) | p[3];
}

static inline int8_t rds8(const uint8_t *p) {
    uint8_t v = *p;
    return v < 128 ? (int8_t)v : (int8_t)((int16_t)v - 256);
}

// Read uint32 from module data at given absolute file offset (bounds-safe)
static uint32_t readU32(int fileOff) {
    if (fileOff < 0 || fileOff + 4 > ps.mod_len) return 0;
    return rd32(ps.mod_data + fileOff);
}

// Read uint16 from module data (bounds-safe)
static uint16_t readU16(int fileOff) {
    if (fileOff < 0 || fileOff + 2 > ps.mod_len) return 0;
    return rd16(ps.mod_data + fileOff);
}

// ══════════════════════════════════════════════════════════════════════════════
// Paula memory allocator (= FlodJS mixer.memory + store())
// ══════════════════════════════════════════════════════════════════════════════

// Append `len` bytes from module_offset to paulaMemory. Returns the starting
// byte offset (stored in sample.pointer), or -1 on failure.
static int memStore(int module_offset, int len) {
    if (module_offset < 0 || len <= 0) return -1;
    if (module_offset + len > ps.mod_len) {
        int clipped = ps.mod_len - module_offset;
        if (clipped <= 0) return -1;
        len = clipped;
    }
    if (ps.paulaMemoryUsed + len > ps.paulaMemorySize) {
        int newSize = ps.paulaMemorySize * 2;
        while (newSize < ps.paulaMemoryUsed + len) newSize *= 2;
        uint8_t *newMem = (uint8_t *)realloc(ps.paulaMemory, newSize);
        if (!newMem) return -1;
        ps.paulaMemory = newMem;
        ps.paulaMemorySize = newSize;
    }
    int start = ps.paulaMemoryUsed;
    memcpy(ps.paulaMemory + start, ps.mod_data + module_offset, len);
    ps.paulaMemoryUsed += len;
    return start;
}

// Write zero bytes at a specific memory offset (for the waveform-0 guard)
static void memZero(int offset, int len) {
    if (offset < 0 || offset + len > ps.paulaMemorySize) return;
    memset(ps.paulaMemory + offset, 0, len);
}

// ══════════════════════════════════════════════════════════════════════════════
// Voice initialization (= S1Voice.initialize)
// ══════════════════════════════════════════════════════════════════════════════

static void voice_initialize(SM1Voice *v) {
    v->step         =  0;
    v->row          =  0;
    v->sample       =  0;
    v->samplePtr    = -1;
    v->sampleLen    =  0;
    v->note         =  0;
    v->noteTimer    =  0;
    v->period       =  0x9999;
    v->volume       =  0;
    v->bendTo       =  0;
    v->bendSpeed    =  0;
    v->arpeggioCtr  =  0;
    v->envelopeCtr  =  0;
    v->pitchCtr     =  0;
    v->pitchFallCtr =  0;
    v->sustainCtr   =  0;
    v->phaseTimer   =  0;
    v->phaseSpeed   =  0;
    v->wavePos      =  0;
    v->waveList     =  0;
    v->waveTimer    =  0;
    v->waitCtr      =  0;
}

// ══════════════════════════════════════════════════════════════════════════════
// Teardown helpers
// ══════════════════════════════════════════════════════════════════════════════

static void free_dynamic(void) {
    if (ps.mod_data)     { free(ps.mod_data);     ps.mod_data = NULL; }
    if (ps.paulaMemory)  { free(ps.paulaMemory);  ps.paulaMemory = NULL; }
    if (ps.tracks)       { free(ps.tracks);       ps.tracks = NULL; }
    if (ps.patterns)     { free(ps.patterns);     ps.patterns = NULL; }
    if (ps.patternsPtr)  { free(ps.patternsPtr);  ps.patternsPtr = NULL; }
    if (ps.samples)      { free(ps.samples);      ps.samples = NULL; }
    if (ps.waveLists)    { free(ps.waveLists);    ps.waveLists = NULL; }
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API: init/stop
// ══════════════════════════════════════════════════════════════════════════════

void sm1r_init(void) {
    free_dynamic();
    memset(&ps, 0, sizeof(ps));
    paula_reset();
    for (int i = 0; i < NUM_VOICES; i++) ps.voices[i].index = i;
}

void sm1r_stop(void) {
    for (int i = 0; i < NUM_VOICES; i++) {
        paula_set_volume(i, 0);
        paula_dma_write(1 << i);
    }
    paula_reset();
    free_dynamic();
    memset(&ps, 0, sizeof(ps));
    for (int i = 0; i < NUM_VOICES; i++) ps.voices[i].index = i;
}

int sm1r_is_finished(void) {
    return ps.finished;
}

int sm1r_get_num_instruments(void) {
    // Expose samples[1..numSamples-1] as 0-based instruments
    if (!ps.loaded) return 0;
    return ps.numSamples > 0 ? ps.numSamples - 1 : 0;
}

// ══════════════════════════════════════════════════════════════════════════════
// Load (= S1Player.loader)
// ══════════════════════════════════════════════════════════════════════════════

int sm1r_load(const uint8_t *data, int len) {
    if (!data || len < 64) return 0;

    sm1r_init();

    // Take ownership of the module data
    ps.mod_data = (uint8_t *)malloc(len);
    if (!ps.mod_data) return 0;
    memcpy(ps.mod_data, data, len);
    ps.mod_len = len;

    const uint8_t *buf = ps.mod_data;

    // ── Step 1: find the SID-MON magic string via 41fa/d1e8/ffd4 pattern ──
    int position = -1;
    uint32_t verJ = 0;

    for (int i = 0; i < len - 10; i++) {
        if (buf[i] != 0x41 || buf[i + 1] != 0xfa) continue;
        uint32_t j = rd16(buf + i + 2);
        if (rd16(buf + i + 4) != 0xd1e8) continue;
        if (rd16(buf + i + 6) != 0xffd4) continue;

        // Match. Derive version tag and position.
        if (j == 0x0FEC)      verJ = SIDMON_0FFA;
        else if (j == 0x1466) verJ = SIDMON_1444;
        else                  verJ = j;

        // FlodJS: position = j + stream.position - 6, where stream.position is 8
        //   (we've consumed 4 uint16s = 8 bytes starting at i).
        position = (int)(j + i + 8 - 6);
        break;
    }

    if (position < 0 || position + 32 > len || position < 44) {
        free_dynamic();
        return 0;
    }

    // Verify magic
    if (memcmp(buf + position, " SID-MON BY R.v.VLIET  (c) 1988 ", 32) != 0) {
        free_dynamic();
        return 0;
    }

    ps.versionTag = verJ;

    // ── Allocate Paula memory. mod_len*2 + 64KB is always plenty. ──
    ps.paulaMemorySize = len * 2 + 65536;
    ps.paulaMemory = (uint8_t *)calloc(1, ps.paulaMemorySize);
    if (!ps.paulaMemory) { free_dynamic(); return 0; }
    ps.paulaMemoryUsed = 0;

    // ── Step 2: tracksPtr[1..3] ──
    uint32_t trackBase = readU32(position - 44);
    ps.tracksPtr[0] = 0;
    for (int v = 1; v < NUM_VOICES; v++) {
        uint32_t tpOff = readU32(position - 44 + v * 4);
        ps.tracksPtr[v] = (tpOff - trackBase) / 6;
    }

    // ── Step 3: parse patternsPtr (may shrink totPatterns on zero entry) ──
    uint32_t patternsPtrBase = readU32(position - 8);
    uint32_t patternsPtrEnd  = readU32(position - 4);
    uint32_t ppLen = patternsPtrEnd;
    if (patternsPtrEnd < patternsPtrBase) ppLen = (uint32_t)(len - position);

    int totPatterns = (int)((ppLen - patternsPtrBase) >> 2);
    if (totPatterns < 1) totPatterns = 1;
    if (totPatterns > 4096) totPatterns = 4096;

    ps.patternsPtr = (uint32_t *)calloc(totPatterns, sizeof(uint32_t));
    if (!ps.patternsPtr) { free_dynamic(); return 0; }

    int ppReadPos = position + (int)patternsPtrBase + 4;  // skip first entry
    for (int i = 1; i < totPatterns; i++) {
        uint32_t raw = readU32(ppReadPos);
        ppReadPos += 4;
        uint32_t start = raw / 5;
        if (start == 0) {
            totPatterns = i;
            break;
        }
        ps.patternsPtr[i] = start;
    }
    ps.numPatternsPtrs = totPatterns;

    // ── Step 4: tracks ──
    int numTracksRaw = (int)((readU32(position - 28) - trackBase) / 6);
    if (numTracksRaw < 0) numTracksRaw = 0;
    if (numTracksRaw > 16384) numTracksRaw = 16384;
    ps.tracks = (SM1Track *)calloc(numTracksRaw > 0 ? numTracksRaw : 1, sizeof(SM1Track));
    if (!ps.tracks) { free_dynamic(); return 0; }

    int trackReadPos = position + (int)trackBase;
    for (int i = 0; i < numTracksRaw; i++) {
        uint32_t pat = readU32(trackReadPos);
        int8_t   tr  = rds8(buf + trackReadPos + 5);
        trackReadPos += 6;

        if ((int)pat >= totPatterns) pat = 0;
        if (tr < -99 || tr > 99) tr = 0;
        ps.tracks[i].pattern   = pat;
        ps.tracks[i].transpose = tr;
    }
    ps.numTracks = numTracksRaw;

    // ── Step 5: waveforms into paulaMemory ──
    uint32_t waveStart     = readU32(position - 24);
    uint32_t waveEnd       = readU32(position - 20);   // = start of header block
    int      totWaveBytes  = (int)(waveEnd - waveStart);
    if (totWaveBytes < 0) totWaveBytes = 0;
    int      totWaveforms  = totWaveBytes >> 5;
    ps.totWaveforms = totWaveforms;

    // Reserve waveform-0 region (32 bytes of zeros) then load waveforms 1..N.
    // FlodJS zeros memory[0..31] then stores totWaveBytes bytes on top,
    // overwriting them. We do the same by calling memStore starting at
    // paulaMemoryUsed=0 (which is the effective bump position).
    memZero(0, 32);
    int waveStored = memStore(position + (int)waveStart, totWaveBytes);
    (void)waveStored;  // will be 0, matching FlodJS memory[0] layout

    // ── Step 6: waveLists ──
    uint32_t waveListsStart = readU32(position - 16);
    uint32_t waveListsEnd   = readU32(position - 12);  // = patternDataStart
    int waveListsBytes = (int)(waveListsEnd - waveListsStart);
    int prefillBytes   = (totWaveforms + 2) << 4;       // (totWaveforms + 2) * 16
    int listSize = (waveListsBytes + 16) > prefillBytes ? (waveListsBytes + 16) : prefillBytes;
    if (listSize < 32) listSize = 32;
    ps.waveLists = (uint8_t *)calloc(listSize, 1);
    if (!ps.waveLists) { free_dynamic(); return 0; }
    ps.waveListsLen = listSize;

    // Prefill default waveList entries: each 16-byte block = [N, 0xff, 0xff, 0x10, 0,0,0,0,0,0,0,0,0,0,0,0]
    // Default: play waveform N for 0xff ticks, then jump past end (wavePos = 0x10 = 16 = terminate).
    {
        int i = 0;
        while (i < prefillBytes) {
            i++;
            ps.waveLists[i - 1] = (uint8_t)(i >> 4);    // N
            ps.waveLists[i++]   = 0xff;
            ps.waveLists[i++]   = 0xff;
            ps.waveLists[i++]   = 0x10;
            i += 12;
        }
    }
    // Overlay file-provided waveLists data starting at byte 16 (= entry 1, skipping waveform-0 slot)
    {
        int readPos = position + (int)waveListsStart;
        int endPos  = 16 + waveListsBytes;
        if (endPos > listSize) endPos = listSize;
        for (int i = 16; i < endPos; i++) {
            if (readPos >= len) break;
            ps.waveLists[i] = buf[readPos++];
        }
    }

    // ── Step 7: header block (11 uint32 BE at position + waveEnd) ──
    int hdrOff = position + (int)waveEnd;
    ps.mix1Source1 = readU32(hdrOff +  0);
    ps.mix2Source1 = readU32(hdrOff +  4);
    ps.mix1Source2 = readU32(hdrOff +  8);
    ps.mix2Source2 = readU32(hdrOff + 12);
    ps.mix1Dest    = readU32(hdrOff + 16);
    ps.mix2Dest    = readU32(hdrOff + 20);
    ps.patternDef  = readU32(hdrOff + 24);
    ps.trackLen    = readU32(hdrOff + 28);
    ps.speedDef    = readU32(hdrOff + 32);
    ps.mix1Speed   = readU32(hdrOff + 36);
    ps.mix2Speed   = readU32(hdrOff + 40);

    if ((int)ps.mix1Source1 > totWaveforms) ps.mix1Source1 = 0;
    if ((int)ps.mix2Source1 > totWaveforms) ps.mix2Source1 = 0;
    if ((int)ps.mix1Source2 > totWaveforms) ps.mix1Source2 = 0;
    if ((int)ps.mix2Source2 > totWaveforms) ps.mix2Source2 = 0;
    if ((int)ps.mix1Dest    > totWaveforms) ps.mix1Speed = 0;
    if ((int)ps.mix2Dest    > totWaveforms) ps.mix2Speed = 0;
    if (ps.speedDef == 0) ps.speedDef = 4;

    // ── Step 8: instruments + samples ──
    uint32_t instrBase = readU32(position - 28);
    int totInstruments = (int)((readU32(position - 24) - instrBase) >> 5);
    if (totInstruments > 63) totInstruments = 63;
    if (totInstruments < 0) totInstruments = 0;
    ps.totInstruments = totInstruments;

    int sampleCount = totInstruments + 1;  // samples[0] reserved, instruments at [1..totInstruments]

    uint32_t sampleStart = readU32(position - 4);
    int embeddedMode = (sampleStart == 1);
    int headersFileOffset = -1;
    int pcmBaseFileOffset = -1;
    int totSamples = 0;
    int embeddedPosStart = -1;

    if (embeddedMode) {
        // EMBEDDED: three hardcoded drum samples in the player binary at
        // either file offset 0x71c or 0x6fc. Each is preceded by a 4dfa tag
        // + u16 relative offset.
        int probe = 0x71c;
        uint16_t tag = readU16(probe);
        if (tag != 0x4dfa) {
            probe = 0x6fc;
            tag = readU16(probe);
            if (tag != 0x4dfa) {
                // Not a recognized embedded file — bail.
                free_dynamic();
                return 0;
            }
        }
        // Advance past the 4dfa + the relative offset it specifies
        uint16_t rel = readU16(probe + 2);
        embeddedPosStart = probe + 2 + 2 + rel;  // +2 for tag, +2 for read ushort, +rel
        // FlodJS: `stream.position += stream.readUshort();` — readUshort already
        // advances by 2, and += rel advances further. So final pos = probe+2 (after tag) + 2 (after rel) + rel.
        // But the readUshort in FlodJS reads from the position after the tag (probe+2), so after the
        // read, stream.position = probe+4. Then += rel moves to probe+4+rel. That's what we compute.
        sampleCount += 3;
    }

    ps.samples = (SM1Sample *)calloc(sampleCount, sizeof(SM1Sample));
    if (!ps.samples) { free_dynamic(); return 0; }
    ps.numSamples = sampleCount;

    if (!embeddedMode) {
        // SAMPLE TABLE at position + sampleStart
        int tableBase = position + (int)sampleStart;
        uint32_t data0 = readU32(tableBase);
        totSamples = (int)((data0 >> 5) + 15);
        headersFileOffset = tableBase + 4;
        pcmBaseFileOffset = headersFileOffset + (int)data0;
    }
    ps.totSamples = totSamples;
    ps.sampleHeadersFileOffset = headersFileOffset;

    // Parse instrument records at position + instrBase
    int instReadPos = position + (int)instrBase;
    for (int i = 1; i < sampleCount; i++) {
        // Only instruments [1..totInstruments] come from file; embedded drum
        // samples [totInstruments+1..totInstruments+3] are added afterward.
        if (i > totInstruments) break;

        if (instReadPos + 32 > len) break;
        SM1Sample *s = &ps.samples[i];

        s->waveform    = readU32(instReadPos);
        for (int k = 0; k < 16; k++) s->arpeggio[k] = buf[instReadPos + 4 + k];
        s->attackSpeed  = buf[instReadPos + 20];
        s->attackMax    = buf[instReadPos + 21];
        s->decaySpeed   = buf[instReadPos + 22];
        s->decayMin     = buf[instReadPos + 23];
        s->sustain      = buf[instReadPos + 24];
        // byte 25 = unused (readByte in FlodJS)
        s->releaseSpeed = buf[instReadPos + 26];
        s->releaseMin   = buf[instReadPos + 27];
        s->phaseShift   = buf[instReadPos + 28];
        s->phaseSpeed   = buf[instReadPos + 29];

        uint8_t ft = buf[instReadPos + 30];
        int8_t  pf = rds8(buf + instReadPos + 31);

        if (ps.versionTag == SIDMON_1444) {
            s->pitchFall = (int8_t)ft;  // finetune byte reused as pitch fall
            s->finetune  = 0;
        } else {
            if (ft > 15) ft = 0;
            s->finetune  = (uint16_t)(ft * 67);
            s->pitchFall = pf;
        }

        if (s->phaseShift > totWaveforms) {
            s->phaseShift = 0;
            s->phaseSpeed = 0;
        }

        // Resolve waveform > 15 → PCM sample reference via headers table
        if (s->waveform > 15) {
            if (totSamples > 15 && (int)s->waveform > totSamples) {
                s->waveform = 0;
            } else if (!embeddedMode && headersFileOffset >= 0) {
                int hdr = headersFileOffset + (int)((s->waveform - 16) << 5);
                if (hdr + 32 > len) {
                    // skip — leave fields zero
                } else {
                    uint32_t sPointer = readU32(hdr);
                    uint32_t sLoop    = readU32(hdr + 4);
                    uint32_t sLength  = readU32(hdr + 8);
                    for (int k = 0; k < 20; k++) s->name[k] = (char)buf[hdr + 12 + k];
                    s->name[20] = 0;

                    int repeat;
                    int loopVal;
                    if (sLoop == 0 || sLoop == 99999 || sLoop == 199999 || sLoop >= sLength) {
                        loopVal = 0;
                        repeat  = (ps.versionTag == SIDMON_0FFA) ? 2 : 4;
                    } else {
                        repeat  = (int)(sLength - sLoop);
                        loopVal = (int)(sLoop - sPointer);
                    }

                    int finalLen = (int)(sLength - sPointer);
                    if (finalLen < loopVal + repeat) finalLen = loopVal + repeat;
                    if (finalLen < 0) finalLen = 0;

                    int srcOffset = pcmBaseFileOffset + (int)sPointer;
                    int memOff = memStore(srcOffset, finalLen);
                    if (memOff < 0) {
                        s->waveform = 0;
                    } else {
                        s->pointer = (uint32_t)memOff;
                        s->loop    = (uint32_t)loopVal;
                        s->length  = (uint32_t)finalLen;
                        s->repeat  = (uint32_t)repeat;
                        if (repeat < 6 || loopVal == 0) s->loopPtr = 0;
                        else                             s->loopPtr = (uint32_t)(memOff + loopVal);
                    }
                }
            }
        } else if ((int)s->waveform > totWaveforms) {
            s->waveform = 0;
        }

        instReadPos += 32;
    }

    // ── Step 8b: embedded drum samples ──
    if (embeddedMode && embeddedPosStart >= 0) {
        int pos = embeddedPosStart;
        for (int i = 0; i < 3; i++) {
            SM1Sample *s = &ps.samples[totInstruments + 1 + i];
            int sampleLen = EMBEDDED_LENS[i];
            int memOff = memStore(pos, sampleLen);
            s->waveform = 16 + i;
            s->length   = (uint32_t)sampleLen;
            s->pointer  = (memOff >= 0) ? (uint32_t)memOff : 0;
            s->loop     = 0;
            s->loopPtr  = 0;
            s->repeat   = 4;
            s->volume   = 64;
            pos += sampleLen;
        }
    }

    // ── Step 9: pattern rows ──
    uint32_t patternDataStart = readU32(position - 12);
    uint32_t patternDataEnd   = readU32(position - 8);  // = patternsPtrBase
    int numRows = (int)((patternDataEnd - patternDataStart) / 5);
    if (numRows < 0) numRows = 0;
    if (numRows > 65536) numRows = 65536;
    ps.patterns = (SM1Row *)calloc(numRows > 0 ? numRows : 1, sizeof(SM1Row));
    if (!ps.patterns) { free_dynamic(); return 0; }
    ps.numPatternRows = numRows;

    int rowReadPos = position + (int)patternDataStart;
    for (int i = 0; i < numRows; i++) {
        if (rowReadPos + 5 > len) { ps.numPatternRows = i; break; }
        uint8_t note   = buf[rowReadPos + 0];
        uint8_t sample = buf[rowReadPos + 1];
        uint8_t effect = buf[rowReadPos + 2];
        uint8_t param  = buf[rowReadPos + 3];
        uint8_t speed  = buf[rowReadPos + 4];
        rowReadPos += 5;

        if (ps.versionTag == SIDMON_1444) {
            if (note > 0 && note < 255) note = (uint8_t)((note + 469) & 0xff);
            if (effect > 0 && effect < 255) effect = (uint8_t)((effect + 469) & 0xff);
            if (sample > 59) sample = (uint8_t)(totInstruments + (sample - 60));
        } else if ((int)sample > totInstruments) {
            sample = 0;
        }
        ps.patterns[i].note   = note;
        ps.patterns[i].sample = sample;
        ps.patterns[i].effect = effect;
        ps.patterns[i].param  = param;
        ps.patterns[i].speed  = speed;
    }

    // ── Step 10: version-dependent flags ──
    if (ps.versionTag == SIDMON_1170 || ps.versionTag == SIDMON_11C6 ||
        ps.versionTag == SIDMON_1444) {
        if (ps.versionTag == SIDMON_1170) {
            ps.mix1Speed = ps.mix2Speed = 0;
        }
        ps.doReset = 0;
        ps.doFilter = 0;
    } else {
        ps.doReset = 1;
        ps.doFilter = 1;
    }

    // ── Step 11: initialize player state (= S1Player.initialize) ──
    ps.speed       = (int)ps.speedDef;
    ps.tick        = (int)ps.speedDef;
    ps.trackPos    =  1;
    ps.trackEnd    =  0;
    ps.patternPos  = -1;
    ps.patternEnd  =  0;
    ps.patternLen  = (int)ps.patternDef;
    ps.mix1Ctr     =  0;
    ps.mix1Pos     =  0;
    ps.mix2Ctr     =  0;
    ps.mix2Pos     =  0;

    for (int v = 0; v < NUM_VOICES; v++) {
        SM1Voice *voice = &ps.voices[v];
        voice_initialize(voice);
        voice->index = v;

        int tpIdx = (int)ps.tracksPtr[v];
        if (tpIdx < 0 || tpIdx >= ps.numTracks) tpIdx = 0;
        voice->step = tpIdx;

        if (ps.numTracks > 0) {
            SM1Track *tk = &ps.tracks[voice->step];
            int patIdx = (int)tk->pattern;
            if (patIdx < 0 || patIdx >= ps.numPatternsPtrs) patIdx = 0;
            voice->row = (int)ps.patternsPtr[patIdx];
            if (voice->row < 0 || voice->row >= ps.numPatternRows) voice->row = 0;
            voice->sample = ps.patterns[voice->row].sample;
        }

        // Prime Paula channel (matches FlodJS initialize: length=32, period=0x9999, enabled=1)
        paula_dma_write(1 << v);
        paula_set_sample_ptr(v, (const int8_t *)ps.paulaMemory);  // offset 0 (silent waveform 0)
        paula_set_length(v, 32 / 2);
        paula_set_period(v, 0x9999);
        paula_set_volume(v, 0);
        paula_dma_write(0x8000 | (1 << v));
    }

    ps.version  = 1;
    ps.loaded   = 1;
    ps.finished = 0;

    return 1;
}

// ══════════════════════════════════════════════════════════════════════════════
// Per-voice tick: update envelope, arpeggio, bend, phase, pitch fall, wavelist.
// Called inside sm1r_tick (= S1Player.process inner voice loop).
// ══════════════════════════════════════════════════════════════════════════════

static void voice_process(SM1Voice *voice) {
    int ch = voice->index;

    ps.audPtr = -1;
    ps.audLen = 0;
    ps.audPer = 0;
    ps.audVol = 0;

    // ── New-row processing when tick == 0 ──
    if (ps.tick == 0) {
        if (ps.patternEnd) {
            if (ps.trackEnd) {
                voice->step = (int)ps.tracksPtr[voice->index];
            } else {
                voice->step++;
            }
            if (voice->step < 0) voice->step = 0;
            if (voice->step >= ps.numTracks) voice->step = ps.numTracks - 1;

            SM1Track *step = &ps.tracks[voice->step];
            int patIdx = (int)step->pattern;
            if (patIdx < 0 || patIdx >= ps.numPatternsPtrs) patIdx = 0;
            voice->row = (int)ps.patternsPtr[patIdx];
            if (voice->row < 0 || voice->row >= ps.numPatternRows) voice->row = 0;

            if (ps.doReset) voice->noteTimer = 0;
        }

        if (voice->noteTimer == 0) {
            if (voice->row < 0 || voice->row >= ps.numPatternRows) voice->row = 0;
            SM1Row *row = &ps.patterns[voice->row];

            if (row->sample == 0) {
                if (row->note) {
                    voice->noteTimer = row->speed;

                    if (voice->waitCtr) {
                        SM1Sample *sample = &ps.samples[voice->sample];
                        ps.audPtr = (int)sample->pointer;
                        ps.audLen = (int)sample->length;
                        voice->samplePtr = (int)sample->loopPtr;
                        voice->sampleLen = (int)sample->repeat;
                        voice->waitCtr = 1;
                        paula_dma_write(1 << ch);  // chan.enabled = 0
                    }
                }
            } else {
                SM1Sample *sample = &ps.samples[row->sample];
                if (voice->waitCtr) {
                    paula_dma_write(1 << ch);      // chan.enabled = 0
                    voice->waitCtr = 0;
                }

                if ((int)sample->waveform > 15) {
                    // Sample mode: point Paula at PCM data
                    ps.audPtr = (int)sample->pointer;
                    ps.audLen = (int)sample->length;
                    voice->samplePtr = (int)sample->loopPtr;
                    voice->sampleLen = (int)sample->repeat;
                    voice->waitCtr = 1;
                } else {
                    // Wavetable mode: drive wave list
                    voice->wavePos = 0;
                    voice->waveList = (int)sample->waveform;
                    int idx = voice->waveList << 4;
                    if (idx + 1 < ps.waveListsLen) {
                        ps.audPtr = (int)ps.waveLists[idx] << 5;
                        ps.audLen = 32;
                        voice->waveTimer = ps.waveLists[idx + 1];
                    }
                }

                voice->noteTimer   = row->speed;
                voice->sample      = row->sample;
                voice->envelopeCtr = 0;
                voice->pitchCtr    = 0;
                voice->pitchFallCtr = 0;
            }

            if (row->note) {
                voice->noteTimer = row->speed;

                if (row->note != 0xff) {
                    SM1Sample *sample = &ps.samples[voice->sample];
                    SM1Track  *step   = &ps.tracks[voice->step];

                    voice->note = (int)row->note + step->transpose;

                    int pidx = 1 + (int)sample->finetune + voice->note;
                    if (pidx < 0) pidx = 0;
                    if (pidx > 790) pidx = 790;
                    voice->period = PERIODS[pidx];
                    ps.audPer     = voice->period;

                    voice->phaseSpeed   = sample->phaseSpeed;
                    voice->bendSpeed    = 0;
                    voice->volume       = 0;
                    voice->envelopeCtr  = 0;
                    voice->pitchCtr     = 0;
                    voice->pitchFallCtr = 0;

                    switch (row->effect) {
                        case 0:
                            if (row->param == 0) break;
                            sample->attackSpeed = row->param;
                            sample->attackMax   = row->param;
                            voice->waveTimer    = 0;
                            break;
                        case 2:
                            ps.speed          = row->param;
                            voice->waveTimer  = 0;
                            break;
                        case 3:
                            ps.patternLen     = row->param;
                            voice->waveTimer  = 0;
                            break;
                        default:
                            voice->bendTo     = (int)row->effect + step->transpose;
                            voice->bendSpeed  = row->param;
                            break;
                    }
                }
            }
            voice->row++;
        } else {
            voice->noteTimer--;
        }
    }

    // ── Envelope ──
    SM1Sample *sample = &ps.samples[voice->sample];
    ps.audVol = voice->volume;

    switch (voice->envelopeCtr) {
        case 8:
            break;
        case 0:  // attack
            ps.audVol += sample->attackSpeed;
            if (ps.audVol > sample->attackMax) {
                ps.audVol = sample->attackMax;
                voice->envelopeCtr += 2;
            }
            break;
        case 2:  // decay
            ps.audVol -= sample->decaySpeed;
            if (ps.audVol <= sample->decayMin || ps.audVol < -256) {
                ps.audVol = sample->decayMin;
                voice->envelopeCtr += 2;
                voice->sustainCtr = sample->sustain;
            }
            break;
        case 4:  // sustain
            voice->sustainCtr--;
            if (voice->sustainCtr == 0 || voice->sustainCtr == -256) {
                voice->envelopeCtr += 2;
            }
            break;
        case 6:  // release
            ps.audVol -= sample->releaseSpeed;
            if (ps.audVol <= sample->releaseMin || ps.audVol < -256) {
                ps.audVol = sample->releaseMin;
                voice->envelopeCtr = 8;
            }
            break;
    }

    voice->volume = ps.audVol;

    // ── Arpeggio + new period ──
    voice->arpeggioCtr = (voice->arpeggioCtr + 1) & 15;
    int pidx = (int)sample->finetune + (int)sample->arpeggio[voice->arpeggioCtr] + voice->note;
    if (pidx < 0) pidx = 0;
    if (pidx > 790) pidx = 790;
    voice->period = PERIODS[pidx];
    ps.audPer     = voice->period;

    // ── Pitch bend ──
    if (voice->bendSpeed) {
        int tgtIdx = (int)sample->finetune + voice->bendTo;
        if (tgtIdx < 0) tgtIdx = 0;
        if (tgtIdx > 790) tgtIdx = 790;
        int value = PERIODS[tgtIdx];

        int stepBend = (~voice->bendSpeed) + 1;
        if (stepBend < -128) stepBend &= 255;
        voice->pitchCtr += stepBend;
        voice->period   += voice->pitchCtr;

        if ((stepBend < 0 && voice->period <= value) ||
            (stepBend > 0 && voice->period >= value)) {
            voice->note      = voice->bendTo;
            voice->period    = value;
            voice->bendSpeed = 0;
            voice->pitchCtr  = 0;
        }
    }

    // ── Phase shift (waveform memory LFO) ──
    if (sample->phaseShift) {
        if (voice->phaseSpeed) {
            voice->phaseSpeed--;
        } else {
            voice->phaseTimer = (voice->phaseTimer + 1) & 31;
            int idx = ((int)sample->phaseShift << 5) + voice->phaseTimer;
            if (idx >= 0 && idx < ps.paulaMemorySize) {
                int8_t mv = (int8_t)ps.paulaMemory[idx];
                voice->period += (int)(mv) >> 2;
            }
        }
    }

    // ── Pitch fall ──
    voice->pitchFallCtr -= sample->pitchFall;
    if (voice->pitchFallCtr < -256) voice->pitchFallCtr += 256;
    voice->period += voice->pitchFallCtr;

    // ── Wave-list cycling (only when not playing a PCM sample) ──
    if (voice->waitCtr == 0) {
        if (voice->waveTimer) {
            voice->waveTimer--;
        } else if (voice->wavePos < 16) {
            int idx = (voice->waveList << 4) + voice->wavePos;
            if (idx + 1 < ps.waveListsLen) {
                int value = ps.waveLists[idx];
                if (value == 0xff) {
                    voice->wavePos = ps.waveLists[idx + 1] & 254;
                } else {
                    ps.audPtr = value << 5;
                    voice->waveTimer = ps.waveLists[idx + 1];
                    voice->wavePos += 2;
                }
            } else {
                voice->wavePos = 16;
            }
        }
    }

    // ── Apply to Paula channel ──
    if (ps.audPtr > -1) {
        int off = ps.audPtr;
        if (off < 0) off = 0;
        if (off >= ps.paulaMemorySize) off = 0;
        paula_set_sample_ptr(ch, (const int8_t *)(ps.paulaMemory + off));
    }
    if (ps.audPer != 0) {
        int p = voice->period;
        if (p < 113)  p = 113;
        if (p > 6848) p = 6848;
        paula_set_period(ch, (uint16_t)p);
    }
    if (ps.audLen != 0) {
        int wlen = ps.audLen / 2;
        if (wlen < 1) wlen = 1;
        if (wlen > 32768) wlen = 32768;
        paula_set_length(ch, (uint16_t)wlen);
    }

    // Volume routing: PCM samples use fixed volume, wavetables use envelope >> 2
    int paulaVol;
    if (sample->volume) paulaVol = (int)sample->volume;
    else                paulaVol = ps.audVol >> 2;
    if (paulaVol < 0)  paulaVol = 0;
    if (paulaVol > 64) paulaVol = 64;
    paula_set_volume(ch, (uint8_t)paulaVol);

    // chan.enabled = 1 (re-enable DMA every tick; Paula will loop if already running)
    paula_dma_write(0x8000 | (1 << ch));
}

// ══════════════════════════════════════════════════════════════════════════════
// Mix1 / Mix2 wavetable blending (= S1Player.process post-voice block)
// ══════════════════════════════════════════════════════════════════════════════

static void apply_mix(uint32_t speed, int *ctr, int *pos,
                      uint32_t destBlk, uint32_t src1Blk, uint32_t src2Blk)
{
    if (!speed) return;
    if (*ctr == 0) {
        *ctr = (int)speed;
        *pos = (*pos + 1) & 31;
        int index = *pos;
        int dst  = ((int)destBlk << 5) + 31;
        int src1 = ((int)src1Blk << 5) + 31;
        int src2 = ((int)src2Blk << 5);

        for (int i = 31; i > -1; i--) {
            if (dst >= 0 && dst < ps.paulaMemorySize &&
                src1 >= 0 && src1 < ps.paulaMemorySize &&
                (src2 + index) >= 0 && (src2 + index) < ps.paulaMemorySize) {
                int v1 = (int8_t)ps.paulaMemory[src1];
                int v2 = (int8_t)ps.paulaMemory[src2 + index];
                ps.paulaMemory[dst] = (uint8_t)(int8_t)((v1 + v2) >> 1);
            }
            dst--;
            src1--;
            index = (index - 1) & 31;
        }
    }
    (*ctr)--;
}

// ══════════════════════════════════════════════════════════════════════════════
// Public tick (= S1Player.process)
// ══════════════════════════════════════════════════════════════════════════════

void sm1r_tick(void) {
    if (!ps.loaded) return;

    for (int v = 0; v < NUM_VOICES; v++) {
        voice_process(&ps.voices[v]);
    }

    ps.trackEnd = 0;
    ps.patternEnd = 0;

    if (++ps.tick > ps.speed) {
        ps.tick = 0;
        if (++ps.patternPos == ps.patternLen) {
            ps.patternPos = 0;
            ps.patternEnd = 1;
            if (++ps.trackPos == (int)ps.trackLen) {
                ps.trackPos = 1;
                ps.trackEnd = 1;
                ps.finished = 1;
            }
        }
    }

    // Wavetable mix (must run after voice processing so source waveforms are set)
    apply_mix(ps.mix1Speed, &ps.mix1Ctr, &ps.mix1Pos,
              ps.mix1Dest, ps.mix1Source1, ps.mix1Source2);
    apply_mix(ps.mix2Speed, &ps.mix2Ctr, &ps.mix2Pos,
              ps.mix2Dest, ps.mix2Source1, ps.mix2Source2);

    if (ps.doFilter) {
        int idx = ps.mix1Pos + 32;
        if (idx >= 0 && idx < ps.paulaMemorySize) {
            int8_t v = (int8_t)ps.paulaMemory[idx];
            ps.paulaMemory[idx] = (uint8_t)(int8_t)((~v) + 1);
        }
    }

    // DMA retrigger with loop pointer (= last block of FlodJS process)
    for (int v = 0; v < NUM_VOICES; v++) {
        SM1Voice *voice = &ps.voices[v];
        if (voice->waitCtr == 1) {
            voice->waitCtr++;
        } else if (voice->waitCtr == 2) {
            voice->waitCtr++;
            int off = voice->samplePtr;
            if (off >= 0 && off < ps.paulaMemorySize) {
                paula_set_sample_ptr(v, (const int8_t *)(ps.paulaMemory + off));
            }
            int wlen = voice->sampleLen / 2;
            if (wlen < 1) wlen = 1;
            if (wlen > 32768) wlen = 32768;
            paula_set_length(v, (uint16_t)wlen);
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Instrument parameter get/set (exposes samples[1..numSamples-1] 0-based)
// ══════════════════════════════════════════════════════════════════════════════

int sm1r_get_instrument_param(int inst, int param_id) {
    if (!ps.loaded || inst < 0 || inst + 1 >= ps.numSamples) return 0;
    SM1Sample *s = &ps.samples[inst + 1];

    switch (param_id) {
        case SM1R_PARAM_ATTACK_SPEED:  return (int)s->attackSpeed;
        case SM1R_PARAM_ATTACK_MAX:    return (int)s->attackMax;
        case SM1R_PARAM_DECAY_SPEED:   return (int)s->decaySpeed;
        case SM1R_PARAM_DECAY_MIN:     return (int)s->decayMin;
        case SM1R_PARAM_SUSTAIN:       return (int)s->sustain;
        case SM1R_PARAM_RELEASE_SPEED: return (int)s->releaseSpeed;
        case SM1R_PARAM_RELEASE_MIN:   return (int)s->releaseMin;
        case SM1R_PARAM_PHASE_SHIFT:   return (int)s->phaseShift;
        case SM1R_PARAM_PHASE_SPEED:   return (int)s->phaseSpeed;
        case SM1R_PARAM_FINETUNE:      return (int)s->finetune;
        case SM1R_PARAM_PITCH_FALL:    return (int)s->pitchFall;
        case SM1R_PARAM_WAVEFORM:      return (int)s->waveform;
        default: return 0;
    }
}

void sm1r_set_instrument_param(int inst, int param_id, int value) {
    if (!ps.loaded || inst < 0 || inst + 1 >= ps.numSamples) return;
    SM1Sample *s = &ps.samples[inst + 1];

    switch (param_id) {
        case SM1R_PARAM_ATTACK_SPEED:  s->attackSpeed  = (uint8_t)value; break;
        case SM1R_PARAM_ATTACK_MAX:    s->attackMax    = (uint8_t)value; break;
        case SM1R_PARAM_DECAY_SPEED:   s->decaySpeed   = (uint8_t)value; break;
        case SM1R_PARAM_DECAY_MIN:     s->decayMin     = (uint8_t)value; break;
        case SM1R_PARAM_SUSTAIN:       s->sustain      = (uint8_t)value; break;
        case SM1R_PARAM_RELEASE_SPEED: s->releaseSpeed = (uint8_t)value; break;
        case SM1R_PARAM_RELEASE_MIN:   s->releaseMin   = (uint8_t)value; break;
        case SM1R_PARAM_PHASE_SHIFT:   s->phaseShift   = (uint8_t)value; break;
        case SM1R_PARAM_PHASE_SPEED:   s->phaseSpeed   = (uint8_t)value; break;
        case SM1R_PARAM_FINETUNE:      s->finetune     = (uint16_t)value; break;
        case SM1R_PARAM_PITCH_FALL:    s->pitchFall    = (int8_t)value;  break;
        case SM1R_PARAM_WAVEFORM:      s->waveform     = (uint32_t)value; break;
        default: break;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Note preview (trigger voice 0 with a given instrument+note)
// ══════════════════════════════════════════════════════════════════════════════

void sm1r_note_on(int instrument, int note, int velocity) {
    (void)velocity;
    if (!ps.loaded || instrument < 0 || instrument + 1 >= ps.numSamples) return;
    if (note < 1 || note > 66) return;

    SM1Voice *v = &ps.voices[0];
    SM1Sample *sample = &ps.samples[instrument + 1];

    voice_initialize(v);
    v->index   = 0;
    v->sample  = instrument + 1;
    v->note    = note;
    v->period  = PERIODS[1 + sample->finetune + note];
    v->phaseSpeed = sample->phaseSpeed;

    paula_dma_write(1 << 0);

    if ((int)sample->waveform > 15) {
        // Point Paula directly at PCM sample data
        int off = (int)sample->pointer;
        if (off < 0 || off >= ps.paulaMemorySize) return;
        paula_set_sample_ptr(0, (const int8_t *)(ps.paulaMemory + off));
        int wlen = (int)sample->length / 2;
        if (wlen < 1) wlen = 1;
        if (wlen > 32768) wlen = 32768;
        paula_set_length(0, (uint16_t)wlen);
        v->samplePtr = (int)sample->loopPtr;
        v->sampleLen = (int)sample->repeat;
        v->waitCtr = 1;
    } else {
        // Play default wavetable (waveform index = sample.waveform)
        int wfIdx = (int)sample->waveform;
        int off = wfIdx * 32;
        if (off < 0 || off >= ps.paulaMemorySize) off = 0;
        paula_set_sample_ptr(0, (const int8_t *)(ps.paulaMemory + off));
        paula_set_length(0, 32 / 2);
        v->wavePos  = 0;
        v->waveList = wfIdx;
        v->waveTimer = 0;
    }

    int p = v->period;
    if (p < 113) p = 113;
    if (p > 6848) p = 6848;
    paula_set_period(0, (uint16_t)p);

    int vol = sample->volume ? sample->volume : 64;
    paula_set_volume(0, (uint8_t)vol);

    paula_dma_write(0x8000 | (1 << 0));
}

void sm1r_note_off(void) {
    paula_set_volume(0, 0);
    paula_dma_write(1 << 0);
    ps.voices[0].envelopeCtr = 8;
}
