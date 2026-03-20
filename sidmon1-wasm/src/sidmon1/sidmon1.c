// sidmon1.c — SidMon 1.0 replayer
// Faithful C translation of FlodJS S1Player.js by Christian Corti (Neoart)
// Original format (c) 1988 Reinier van Vliet
//
// The replayer drives 4 Paula channels with:
//   - 32-byte wavetable oscillator per voice (from waveform memory)
//   - ADSR envelope: attack → decay → sustain countdown → release
//   - 16-step arpeggio table per instrument
//   - Phase shift (waveform blending via phaseWave)
//   - Pitch fall (signed accumulator)
//   - Track/pattern indirection (tracks point to patterns)
//
// Reference: FlodJS S1Player.js, NostalgicPlayer SidMon10Worker.cs

#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include "paula_soft.h"
#include "sidmon1.h"

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

#define NUM_VOICES        4
#define WAVE_SIZE         32    // 32 bytes per waveform
#define MAX_INSTRUMENTS   64
#define MAX_WAVEFORMS     256
#define MAX_PATTERNS      256
#define MAX_TRACKS        512
#define MAX_PAT_ROWS      4096
#define ROWS_PER_PATTERN  16

// ══════════════════════════════════════════════════════════════════════════════
// SidMon 1.0 period table (791 entries, verbatim from S1Player.js)
// Index 0 = 0 (sentinel), entries 1..790 are real periods.
// Accessed as PERIODS[1 + finetune + arpeggio[step] + note]
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
// Types
// ══════════════════════════════════════════════════════════════════════════════

// ADSR envelope states
#define ENV_ATTACK   0
#define ENV_DECAY    1
#define ENV_SUSTAIN  2
#define ENV_RELEASE  3
#define ENV_DONE     4

typedef struct {
    // Waveform index (uint32 from file — indexes into waveform memory)
    uint32_t waveform;
    // Arpeggio table: 16 bytes
    uint8_t  arpeggio[16];
    // ADSR parameters
    uint8_t  attackSpeed;
    uint8_t  attackMax;
    uint8_t  decaySpeed;
    uint8_t  decayMin;
    uint8_t  sustain;      // sustain countdown ticks
    uint8_t  releaseSpeed;
    uint8_t  releaseMin;
    // Phase shift
    uint8_t  phaseShift;   // waveform index for phase wave (0 = disabled)
    uint8_t  phaseSpeed;
    // Pitch
    uint16_t finetune;     // pre-multiplied by 67 (0-1005)
    int8_t   pitchFall;
} SM1Instrument;

typedef struct {
    uint32_t pattern;    // pattern index (into patternPtrs)
    int8_t   transpose;  // transpose in semitones
} SM1Track;

// Pattern row: 5 bytes
typedef struct {
    uint8_t note;        // 0 = no note
    uint8_t sample;      // instrument number (1-based), 0 = no instrument
    uint8_t effect;
    uint8_t param;
    uint8_t speed;
} SM1PatRow;

typedef struct {
    // Current instrument for this voice
    int           instNum;       // 0-based instrument index (-1 = none)
    SM1Instrument *inst;         // pointer to current instrument

    // ADSR state
    int           envState;
    int           volume;        // 0..64
    int           sustainCtr;    // sustain countdown

    // Arpeggio
    int           arpIdx;        // 0-15, incremented each tick

    // Phase modulation
    int           phaseTimer;    // 0-31
    int           phaseSpeedCtr;

    // Pitch fall
    int           pitchFallAccum;

    // Current computed period
    int           period;

    // Note
    int           note;          // base note from pattern (1-based SidMon note)
    int           playing;       // is voice active?

    // Wavetable: point to the 32-byte waveform in waveformData
    int8_t       *wavePtr;       // current waveform data (32 bytes)
    int8_t       *phaseWavePtr;  // phase waveform data (32 bytes, or NULL)

    // Pattern/track state
    int           trackIdx;      // current index into tracks array for this voice
    int           trackLen;      // total tracks for this voice
    int           patRow;        // current row within pattern (0..15)
    int           patPtr;        // index into patRows for current pattern start
    int           transpose;

    // Speed state
    int           speedCtr;      // countdown within a row
    int           speed;         // ticks per row for this voice
} SM1Voice;

typedef struct {
    uint8_t      *mod_data;
    int           mod_len;

    // Parsed data
    SM1Instrument instruments[MAX_INSTRUMENTS];
    int           numInstruments;

    int8_t        waveformData[MAX_WAVEFORMS][WAVE_SIZE];
    int           numWaveforms;

    SM1PatRow     patRows[MAX_PAT_ROWS];
    int           numPatRows;

    int           patternPtrs[MAX_PATTERNS]; // pattern index → first row in patRows
    int           numPatterns;

    SM1Track      tracks[MAX_TRACKS];
    int           numTracks;

    // Per-voice track start indices
    int           voiceTrackStart[NUM_VOICES];

    // Voices
    SM1Voice      voices[NUM_VOICES];

    // Global state
    int           globalSpeed;
    int           finished;
    int           loaded;
} SM1State;

// ══════════════════════════════════════════════════════════════════════════════
// State
// ══════════════════════════════════════════════════════════════════════════════

static SM1State ps;

// ══════════════════════════════════════════════════════════════════════════════
// Big-endian helpers
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
    return v < 128 ? (int8_t)v : (int8_t)(v - 256);
}

// ══════════════════════════════════════════════════════════════════════════════
// Period lookup (clamped)
// ══════════════════════════════════════════════════════════════════════════════

static int lookupPeriod(int index) {
    if (index < 1 || index > 790) return 0;
    return (int)PERIODS[index];
}

// ══════════════════════════════════════════════════════════════════════════════
// Voice: trigger note
// ══════════════════════════════════════════════════════════════════════════════

static void voice_trigger(SM1Voice *v, int instIdx, int note) {
    if (instIdx < 0 || instIdx >= ps.numInstruments) return;

    SM1Instrument *inst = &ps.instruments[instIdx];
    v->inst = inst;
    v->instNum = instIdx;
    v->note = note;
    v->playing = 1;

    // Reset ADSR
    v->envState = ENV_ATTACK;
    v->volume = 0;
    v->sustainCtr = 0;

    // Reset arpeggio (pre-increment, so start at -1)
    v->arpIdx = -1;

    // Reset phase modulation
    v->phaseTimer = 0;
    v->phaseSpeedCtr = (int)inst->phaseSpeed;

    // Reset pitch fall
    v->pitchFallAccum = 0;

    // Set waveform pointer
    int waveIdx = (int)inst->waveform;
    if (waveIdx >= 0 && waveIdx < ps.numWaveforms) {
        v->wavePtr = ps.waveformData[waveIdx];
    } else if (ps.numWaveforms > 0) {
        v->wavePtr = ps.waveformData[0]; // fallback
    }

    // Set phase wave pointer
    if (inst->phaseShift > 0 && inst->phaseShift < ps.numWaveforms) {
        v->phaseWavePtr = ps.waveformData[inst->phaseShift];
    } else {
        v->phaseWavePtr = NULL;
    }

    // Compute initial period
    int pidx = 1 + (int)inst->finetune + (int)inst->arpeggio[0] + note;
    int period = lookupPeriod(pidx);
    if (period <= 0) period = 428;
    v->period = period;

    // Set up Paula channel
    int ch = (int)(v - ps.voices);  // voice index = channel index

    // Disable DMA first
    paula_dma_write(1 << ch);

    // Point to the 32-byte waveform for wavetable playback
    paula_set_sample_ptr(ch, v->wavePtr);
    paula_set_length(ch, WAVE_SIZE / 2);  // length in words
    paula_set_period(ch, (uint16_t)period);
    paula_set_volume(ch, 0);

    // Enable DMA
    paula_dma_write(0x8000 | (1 << ch));
}

// ══════════════════════════════════════════════════════════════════════════════
// Voice: tick update (ADSR, arpeggio, phase, pitch fall)
// ══════════════════════════════════════════════════════════════════════════════

static void voice_tick(SM1Voice *v) {
    if (!v->playing || !v->inst) return;

    SM1Instrument *inst = v->inst;
    int ch = (int)(v - ps.voices);

    // ── ADSR envelope ───
    switch (v->envState) {
        case ENV_ATTACK:
            v->volume += (int)inst->attackSpeed;
            if (v->volume >= (int)inst->attackMax) {
                v->volume = (int)inst->attackMax;
                v->envState = ENV_DECAY;
            }
            break;

        case ENV_DECAY:
            v->volume -= (int)inst->decaySpeed;
            if (v->volume <= (int)inst->decayMin) {
                v->volume = (int)inst->decayMin;
                v->envState = ENV_SUSTAIN;
                v->sustainCtr = (int)inst->sustain;
            }
            break;

        case ENV_SUSTAIN:
            if (v->sustainCtr > 0) {
                v->sustainCtr--;
            } else {
                v->envState = ENV_RELEASE;
            }
            break;

        case ENV_RELEASE:
            v->volume -= (int)inst->releaseSpeed;
            if (v->volume <= (int)inst->releaseMin) {
                v->volume = (int)inst->releaseMin;
                v->envState = ENV_DONE;
            }
            break;

        case ENV_DONE:
        default:
            break;
    }

    // Clamp volume
    if (v->volume < 0) v->volume = 0;
    if (v->volume > 64) v->volume = 64;

    // Set Paula volume
    paula_set_volume(ch, (uint8_t)v->volume);

    // ── Arpeggio cycling (pre-increment, wraps 0-15) ───
    v->arpIdx = (v->arpIdx + 1) & 15;

    int pidx = 1 + (int)inst->finetune + (int)inst->arpeggio[v->arpIdx] + v->note;
    int period = lookupPeriod(pidx);

    // ── Phase shift (period LFO) ───
    if (inst->phaseShift > 0 && v->phaseWavePtr) {
        if (v->phaseSpeedCtr > 0) {
            v->phaseSpeedCtr--;
        } else {
            v->phaseSpeedCtr = (int)inst->phaseSpeed;
            v->phaseTimer = (v->phaseTimer + 1) & 31;
        }
        // Apply phaseWave modulation: memory[index] >> 2 (from S1Player.js)
        period += (int)v->phaseWavePtr[v->phaseTimer] >> 2;
    }

    // ── Pitch fall ───
    v->pitchFallAccum -= (int)inst->pitchFall;
    if (v->pitchFallAccum < -256) v->pitchFallAccum += 256;
    period += v->pitchFallAccum;

    // Clamp period
    if (period < 113) period = 113;
    if (period > 6848) period = 6848;

    v->period = period;

    // Set Paula period
    paula_set_period(ch, (uint16_t)period);

    // Update waveform pointer for phase modulation blending
    // In S1Player.js: if phaseShift, the waveform pointer cycles between
    // mainWave and phaseWave based on the phase timer
    if (inst->phaseShift > 0 && v->phaseWavePtr) {
        // S1Player uses memory[index] where index is the phaseWave data
        // The phaseShift waveform is used as a lookup for period modulation
        // The actual sample data being played is still mainWave
        // (Paula continues looping the 32-byte waveform set at trigger time)
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Pattern processing: advance one row
// ══════════════════════════════════════════════════════════════════════════════

static void process_row(SM1Voice *v) {
    int ch = (int)(v - ps.voices);

    // Get current pattern row
    int rowIdx = v->patPtr + v->patRow;
    if (rowIdx < 0 || rowIdx >= ps.numPatRows) {
        // End of data
        return;
    }

    SM1PatRow *row = &ps.patRows[rowIdx];

    // Speed change
    if (row->speed > 0) {
        v->speed = (int)row->speed;
    }

    // Note trigger
    if (row->note > 0 && row->note < 255 && row->sample > 0) {
        int instIdx = (int)row->sample - 1;  // 1-based → 0-based
        int note = (int)row->note + v->transpose;
        if (note < 1) note = 1;
        if (note > 66) note = 66;
        voice_trigger(v, instIdx, note);
    }

    // Advance row
    v->patRow++;
    if (v->patRow >= ROWS_PER_PATTERN) {
        // Advance to next track entry
        v->patRow = 0;
        v->trackIdx++;

        if (v->trackIdx >= v->trackLen) {
            // Voice reached end of its track list → song end
            v->playing = 0;
            paula_set_volume(ch, 0);
            // Check if all voices are done
            int allDone = 1;
            for (int i = 0; i < NUM_VOICES; i++) {
                if (ps.voices[i].trackIdx < ps.voices[i].trackLen) {
                    allDone = 0;
                    break;
                }
            }
            if (allDone) {
                ps.finished = 1;
            }
            return;
        }

        // Load next track entry
        SM1Track *track = &ps.tracks[v->trackIdx];
        v->transpose = track->transpose;
        int patIdx = (int)track->pattern;
        if (patIdx >= 0 && patIdx < ps.numPatterns) {
            v->patPtr = ps.patternPtrs[patIdx];
        }
    }

    v->speedCtr = v->speed;
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

void sm1r_init(void) {
    memset(&ps, 0, sizeof(ps));
    paula_reset();
    for (int i = 0; i < NUM_VOICES; i++) {
        ps.voices[i].instNum = -1;
    }
}

int sm1r_load(const uint8_t *data, int len) {
    if (!data || len < 64) return 0;

    sm1r_init();

    // Copy module data
    ps.mod_data = (uint8_t *)malloc(len);
    if (!ps.mod_data) return 0;
    memcpy(ps.mod_data, data, len);
    ps.mod_len = len;

    const uint8_t *buf = ps.mod_data;

    // ── Locate position marker (S1Player.js loader logic) ──
    int position = -1;
    int j = 0;

    for (int i = 0; i < len - 10; i++) {
        if (buf[i] == 0x41 && buf[i + 1] == 0xfa) {
            j = (int)rd16(buf + i + 2);
            if (i + 6 >= len) continue;
            if (rd16(buf + i + 4) != 0xd1e8) continue;
            if (rd16(buf + i + 6) != 0xffd4) continue;

            // position = j + (i + 8) - 6 = j + i + 2
            position = j + i + 2;
            break;
        }
    }

    if (position < 0 || position + 32 > len) return 0;

    // Verify SID-MON string
    if (memcmp(buf + position, " SID-MON BY R.v.VLIET  (c) 1988 ", 32) != 0) {
        return 0;
    }

    // ── Read section offsets ──
    if (position < 44) return 0;

    uint32_t instrBase  = rd32(buf + position - 28);
    uint32_t instrEnd   = rd32(buf + position - 24);
    int totInstruments  = (int)((instrEnd - instrBase) >> 5);
    if (totInstruments > MAX_INSTRUMENTS) totInstruments = MAX_INSTRUMENTS;

    // Waveform section
    uint32_t waveStart = rd32(buf + position - 24);
    uint32_t waveEnd   = rd32(buf + position - 20);
    int totWaveforms   = (int)((waveEnd - waveStart) >> 5);
    if (totWaveforms > MAX_WAVEFORMS) totWaveforms = MAX_WAVEFORMS;

    // Pattern data section
    uint32_t patStart = rd32(buf + position - 12);
    uint32_t patEnd   = rd32(buf + position - 8);
    int numPatRows    = (int)((patEnd - patStart) / 5);
    if (numPatRows > MAX_PAT_ROWS) numPatRows = MAX_PAT_ROWS;

    // Track section
    uint32_t trackBase = rd32(buf + position - 44);
    uint32_t trackEnd  = rd32(buf + position - 28);
    int numTracks      = (int)((trackEnd - trackBase) / 6);
    if (numTracks > MAX_TRACKS) numTracks = MAX_TRACKS;

    // Pattern pointer section
    uint32_t ppBase = rd32(buf + position - 8);
    uint32_t ppEnd  = rd32(buf + position - 4);

    // ── Read waveform data ──
    int waveformDataOffset = position + (int)waveStart;
    ps.numWaveforms = totWaveforms;
    for (int w = 0; w < totWaveforms; w++) {
        int woff = waveformDataOffset + w * WAVE_SIZE;
        if (woff + WAVE_SIZE <= len) {
            for (int b = 0; b < WAVE_SIZE; b++) {
                ps.waveformData[w][b] = rds8(buf + woff + b);
            }
        }
    }

    // ── Parse instruments ──
    int instrDataOffset = position + (int)instrBase;
    ps.numInstruments = totInstruments;

    for (int i = 0; i < totInstruments; i++) {
        int base = instrDataOffset + i * 32;
        if (base + 32 > len) break;

        SM1Instrument *inst = &ps.instruments[i];
        inst->waveform    = rd32(buf + base);

        for (int k = 0; k < 16; k++) {
            inst->arpeggio[k] = buf[base + 4 + k];
        }

        inst->attackSpeed  = buf[base + 20];
        inst->attackMax    = buf[base + 21];
        inst->decaySpeed   = buf[base + 22];
        inst->decayMin     = buf[base + 23];
        inst->sustain      = buf[base + 24];
        // skip byte at base + 25
        inst->releaseSpeed = buf[base + 26];
        inst->releaseMin   = buf[base + 27];
        inst->phaseShift   = buf[base + 28];
        inst->phaseSpeed   = buf[base + 29];

        uint8_t ft = buf[base + 30];
        if (ft > 15) ft = 0;
        inst->finetune     = (uint16_t)(ft * 67);
        inst->pitchFall    = rds8(buf + base + 31);

        // Validate phaseShift
        if (inst->phaseShift > totWaveforms) {
            inst->phaseShift = 0;
        }
    }

    // ── Parse pattern rows ──
    int patDataOffset = position + (int)patStart;
    ps.numPatRows = numPatRows;

    for (int i = 0; i < numPatRows; i++) {
        int base = patDataOffset + i * 5;
        if (base + 5 > len) { ps.numPatRows = i; break; }

        ps.patRows[i].note   = buf[base];
        ps.patRows[i].sample = buf[base + 1];
        ps.patRows[i].effect = buf[base + 2];
        ps.patRows[i].param  = buf[base + 3];
        ps.patRows[i].speed  = buf[base + 4];
    }

    // ── Parse tracks ──
    int trackDataOffset = position + (int)trackBase;
    ps.numTracks = numTracks;

    for (int i = 0; i < numTracks; i++) {
        int base = trackDataOffset + i * 6;
        if (base + 6 > len) { ps.numTracks = i; break; }

        ps.tracks[i].pattern   = rd32(buf + base);
        ps.tracks[i].transpose = rds8(buf + base + 5);
        // Clamp transpose
        if (ps.tracks[i].transpose < -99 || ps.tracks[i].transpose > 99) {
            ps.tracks[i].transpose = 0;
        }
    }

    // ── Parse pattern pointers ──
    int patternsBase = position + (int)(ppBase > 0 ? ppBase : 0);
    int patternsCount = (int)((ppEnd > ppBase) ? (ppEnd - ppBase) >> 2 : 1);
    if (patternsCount > MAX_PATTERNS) patternsCount = MAX_PATTERNS;
    ps.numPatterns = 0;

    for (int i = 0; i < patternsCount; i++) {
        int poff = patternsBase + 4 + i * 4;  // +4 for first entry skip
        if (poff + 4 > len) break;
        int ptr = (int)(rd32(buf + poff) / 5);
        if (ptr == 0 && i > 0) break;
        if (ptr < 0 || ptr >= ps.numPatRows) ptr = 0;
        ps.patternPtrs[ps.numPatterns++] = ptr;
    }

    if (ps.numPatterns == 0) {
        ps.patternPtrs[0] = 0;
        ps.numPatterns = 1;
    }

    // ── Compute per-voice track start indices ──
    // S1Player: tracksPtr[0]=0, tracksPtr[v] = ((offset - trackBase) / 6)
    ps.voiceTrackStart[0] = 0;
    for (int v = 1; v < NUM_VOICES && position - 44 + v * 4 + 4 <= len; v++) {
        int tpOff = position - 44 + v * 4;
        uint32_t raw = rd32(buf + tpOff);
        ps.voiceTrackStart[v] = (int)((raw - trackBase) / 6);
        if (ps.voiceTrackStart[v] < 0) ps.voiceTrackStart[v] = 0;
        if (ps.voiceTrackStart[v] >= ps.numTracks) ps.voiceTrackStart[v] = 0;
    }

    // ── Compute per-voice track length ──
    // Each voice's tracks run from voiceTrackStart[v] to voiceTrackStart[v+1]-1
    // (or to numTracks for the last voice)
    for (int v = 0; v < NUM_VOICES; v++) {
        int start = ps.voiceTrackStart[v];
        int end;
        if (v < NUM_VOICES - 1) {
            end = ps.voiceTrackStart[v + 1];
        } else {
            end = ps.numTracks;
        }
        // If tracks are interleaved (all 4 voices share same track array),
        // use step-by-4 pattern. SidMon 1 interleaves: voice0=0,4,8..
        // Actually, looking at the parser more carefully, the tracks are laid out
        // as groups of 4 (one per voice per step), like: step0_ch0, step0_ch1, step0_ch2, step0_ch3, step1_ch0...
        // So each voice's tracks are at indices: v, v+4, v+8, ...
        // BUT the voiceTrackStart offsets already account for this.
        // The S1Player reads tracks per voice separately.
        ps.voices[v].trackIdx = start;
        ps.voices[v].trackLen = end;
    }

    // ── Initialize voices ──
    ps.globalSpeed = 6;  // default speed

    for (int v = 0; v < NUM_VOICES; v++) {
        SM1Voice *voice = &ps.voices[v];
        voice->speed = ps.globalSpeed;
        voice->speedCtr = 1;  // trigger first row immediately
        voice->patRow = 0;

        // Load first track entry
        if (voice->trackIdx < voice->trackLen && voice->trackIdx < ps.numTracks) {
            SM1Track *track = &ps.tracks[voice->trackIdx];
            voice->transpose = track->transpose;
            int patIdx = (int)track->pattern;
            if (patIdx >= 0 && patIdx < ps.numPatterns) {
                voice->patPtr = ps.patternPtrs[patIdx];
            }
        }
    }

    ps.loaded = 1;
    ps.finished = 0;
    return 1;
}

void sm1r_tick(void) {
    if (!ps.loaded || ps.finished) return;

    for (int v = 0; v < NUM_VOICES; v++) {
        SM1Voice *voice = &ps.voices[v];

        // Tick-level updates (ADSR, arpeggio, phase, pitch fall)
        voice_tick(voice);

        // Row processing
        voice->speedCtr--;
        if (voice->speedCtr <= 0) {
            process_row(voice);
        }
    }
}

void sm1r_stop(void) {
    for (int i = 0; i < NUM_VOICES; i++) {
        paula_set_volume(i, 0);
        paula_dma_write(1 << i);
    }
    paula_reset();
    if (ps.mod_data) {
        free(ps.mod_data);
        ps.mod_data = NULL;
    }
    ps.loaded = 0;
}

int sm1r_is_finished(void) {
    return ps.finished;
}

int sm1r_get_num_instruments(void) {
    return ps.numInstruments;
}

// ══════════════════════════════════════════════════════════════════════════════
// Instrument parameter access
// ══════════════════════════════════════════════════════════════════════════════

int sm1r_get_instrument_param(int inst, int param_id) {
    if (!ps.loaded || inst < 0 || inst >= ps.numInstruments) return 0;
    SM1Instrument *ins = &ps.instruments[inst];

    switch (param_id) {
        case SM1R_PARAM_ATTACK_SPEED:  return (int)ins->attackSpeed;
        case SM1R_PARAM_ATTACK_MAX:    return (int)ins->attackMax;
        case SM1R_PARAM_DECAY_SPEED:   return (int)ins->decaySpeed;
        case SM1R_PARAM_DECAY_MIN:     return (int)ins->decayMin;
        case SM1R_PARAM_SUSTAIN:       return (int)ins->sustain;
        case SM1R_PARAM_RELEASE_SPEED: return (int)ins->releaseSpeed;
        case SM1R_PARAM_RELEASE_MIN:   return (int)ins->releaseMin;
        case SM1R_PARAM_PHASE_SHIFT:   return (int)ins->phaseShift;
        case SM1R_PARAM_PHASE_SPEED:   return (int)ins->phaseSpeed;
        case SM1R_PARAM_FINETUNE:      return (int)ins->finetune;
        case SM1R_PARAM_PITCH_FALL:    return (int)ins->pitchFall;
        case SM1R_PARAM_WAVEFORM:      return (int)ins->waveform;
        default: return 0;
    }
}

void sm1r_set_instrument_param(int inst, int param_id, int value) {
    if (!ps.loaded || inst < 0 || inst >= ps.numInstruments) return;
    SM1Instrument *ins = &ps.instruments[inst];

    switch (param_id) {
        case SM1R_PARAM_ATTACK_SPEED:  ins->attackSpeed  = (uint8_t)value; break;
        case SM1R_PARAM_ATTACK_MAX:    ins->attackMax    = (uint8_t)value; break;
        case SM1R_PARAM_DECAY_SPEED:   ins->decaySpeed   = (uint8_t)value; break;
        case SM1R_PARAM_DECAY_MIN:     ins->decayMin     = (uint8_t)value; break;
        case SM1R_PARAM_SUSTAIN:       ins->sustain      = (uint8_t)value; break;
        case SM1R_PARAM_RELEASE_SPEED: ins->releaseSpeed = (uint8_t)value; break;
        case SM1R_PARAM_RELEASE_MIN:   ins->releaseMin   = (uint8_t)value; break;
        case SM1R_PARAM_PHASE_SHIFT:   ins->phaseShift   = (uint8_t)value; break;
        case SM1R_PARAM_PHASE_SPEED:   ins->phaseSpeed   = (uint8_t)value; break;
        case SM1R_PARAM_FINETUNE:      ins->finetune     = (uint16_t)value; break;
        case SM1R_PARAM_PITCH_FALL:    ins->pitchFall    = (int8_t)value; break;
        case SM1R_PARAM_WAVEFORM:      ins->waveform     = (uint32_t)value; break;
        default: break;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Note preview
// ══════════════════════════════════════════════════════════════════════════════

void sm1r_note_on(int instrument, int note, int velocity) {
    if (!ps.loaded || instrument < 0 || instrument >= ps.numInstruments) return;
    if (note < 1 || note > 66) return;

    (void)velocity;

    // Use voice 0 for preview
    SM1Voice *v = &ps.voices[0];
    voice_trigger(v, instrument, note);
}

void sm1r_note_off(void) {
    paula_set_volume(0, 0);
    paula_dma_write(0x0001);
    ps.voices[0].playing = 0;
}
