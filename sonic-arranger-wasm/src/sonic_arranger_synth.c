/**
 * sonic_arranger_synth.c — Sonic Arranger real-time wavetable synthesis WASM module
 *
 * Implements the format_synth_api.h interface for Sonic Arranger (.sa) formats.
 * Exported symbols use the "sa_" prefix.
 *
 * Instrument model:
 *   - 128-byte wavetable oscillator (int8 samples)
 *   - ADSR volume envelope (table-driven at 50Hz)
 *   - AMF (Amplitude/Frequency Modulation) table
 *   - Vibrato LFO (delayed sine, applied to period)
 *   - 3 arpeggio sub-tables with independent lengths/repeats
 *   - 18 synthesis effect modes (waveform manipulation per-tick)
 *   - Portamento (period slide toward target)
 *   - Amiga period-based pitch system
 *
 * Binary blob layout for sa_load_instrument():
 *   See struct definition comments and serialization section below.
 */

#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <emscripten.h>

/* ── Constants ─────────────────────────────────────────────────────────────── */

#define SA_WAVE_SIZE      128
#define SA_TABLE_SIZE     128
#define SA_ARP_ENTRIES    14
#define SA_MAX_WAVEFORMS  64
#define MAX_PLAYERS       8
#define TICKS_PER_SEC     50   /* Amiga PAL 50Hz */
#define AMIGA_PAL_CLOCK   3546895.0

/* ── Period table (109 entries) ────────────────────────────────────────────── */
/* Index 0 = unused. Indices 1-108: descending Amiga periods (9 octaves). */

static const uint16_t PERIOD_TABLE[109] = {
    0,
    13696,12928,12192,11520,10848,10240,9664,9120,8608,8128,7680,7248,
    6848, 6464, 6096, 5760, 5424, 5120,4832,4560,4304,4064,3840,3624,
    3424, 3232, 3048, 2880, 2712, 2560,2416,2280,2152,2032,1920,1812,
    1712, 1616, 1524, 1440, 1356, 1280,1208,1140,1076,1016, 960, 906,
     856,  808,  762,  720,  678,  640, 604, 570, 538, 508, 480, 453,
     428,  404,  381,  360,  339,  320, 302, 285, 269, 254, 240, 226,
     214,  202,  190,  180,  170,  160, 151, 143, 135, 127, 120, 113,
     107,  101,   95,   90,   85,   80,  76,  71,  67,  64,  60,  57,
      54,   51,   48,   45,   43,   40,  38,  36,  34,  32,  30,  28
};

/* ── Vibrato sine table (256 entries, -128 to +127) ───────────────────────── */

static const int8_t VIBRATO_TABLE[256] = {
       0,   3,   6,   9,  12,  15,  18,  21,  24,  27,  30,  33,  36,  39,  42,  45,
      48,  51,  54,  57,  59,  62,  65,  67,  70,  73,  75,  78,  80,  82,  85,  87,
      89,  91,  94,  96,  98, 100, 102, 103, 105, 107, 108, 110, 112, 113, 114, 116,
     117, 118, 119, 120, 121, 122, 123, 123, 124, 125, 125, 126, 126, 126, 127, 127,
     127, 127, 127, 126, 126, 126, 125, 125, 124, 123, 123, 122, 121, 120, 119, 118,
     117, 116, 114, 113, 112, 110, 108, 107, 105, 103, 102, 100,  98,  96,  94,  91,
      89,  87,  85,  82,  80,  78,  75,  73,  70,  67,  65,  62,  59,  57,  54,  51,
      48,  45,  42,  39,  36,  33,  30,  27,  24,  21,  18,  15,  12,   9,   6,   3,
       0,  -3,  -6,  -9, -12, -15, -18, -21, -24, -27, -30, -33, -36, -39, -42, -45,
     -48, -51, -54, -57, -59, -62, -65, -67, -70, -73, -75, -78, -80, -82, -85, -87,
     -89, -91, -94, -96, -98,-100,-102,-103,-105,-107,-108,-110,-112,-113,-114,-116,
    -117,-118,-119,-120,-121,-122,-123,-123,-124,-125,-125,-126,-126,-126,-127,-127,
    -128,-127,-127,-126,-126,-126,-125,-125,-124,-123,-123,-122,-121,-120,-119,-118,
    -117,-116,-114,-113,-112,-110,-108,-107,-105,-103,-102,-100, -98, -96, -94, -91,
     -89, -87, -85, -82, -80, -78, -75, -73, -70, -67, -65, -62, -59, -57, -54, -51,
     -48, -45, -42, -39, -36, -33, -30, -27, -24, -21, -18, -15, -12,  -9,  -6,  -3
};

/* ── Arpeggio sub-table ───────────────────────────────────────────────────── */

typedef struct {
    uint8_t length;
    uint8_t repeat;
    int8_t  values[SA_ARP_ENTRIES];
} SAArpTable;

/* ── Instrument structure ─────────────────────────────────────────────────── */

typedef struct {
    uint16_t volume;           /* 0-64 */
    int8_t   fineTuning;       /* signed fine tune */
    uint16_t waveformNumber;
    uint16_t waveformLength;   /* in words (byte length = waveformLength * 2) */

    uint16_t portamentoSpeed;
    uint16_t vibratoDelay;
    uint16_t vibratoSpeed;
    uint16_t vibratoLevel;

    uint16_t amfNumber;
    uint16_t amfDelay;
    uint16_t amfLength;
    uint16_t amfRepeat;

    uint16_t adsrNumber;
    uint16_t adsrDelay;
    uint16_t adsrLength;
    uint16_t adsrRepeat;

    uint16_t sustainPoint;
    uint16_t sustainDelay;

    uint16_t effect;
    uint16_t effectArg1;
    uint16_t effectArg2;
    uint16_t effectArg3;
    uint16_t effectDelay;

    SAArpTable arpTables[3];

    int8_t   waveformData[SA_WAVE_SIZE];
    uint8_t  adsrTable[SA_TABLE_SIZE];
    int8_t   amfTable[SA_TABLE_SIZE];

    int8_t   allWaveforms[SA_MAX_WAVEFORMS][SA_WAVE_SIZE];
    int      numWaveforms;
} SAInstrument;

/* ── Player state (per-voice) ─────────────────────────────────────────────── */

typedef struct {
    int          alive;
    int          sampleRate;
    int          samplesPerTick;

    SAInstrument ins;

    /* Oscillator */
    float        phase;
    float        phaseInc;
    int          baseNote;
    int          playing;

    /* Active waveform buffer (modified by synth effects) */
    int8_t       waveformBuffer[SA_WAVE_SIZE];

    /* Tick sub-sample counter */
    int          sampleCtr;

    /* ADSR state */
    uint16_t     adsrPosition;
    uint16_t     adsrDelayCounter;
    uint16_t     sustainDelayCounter;
    float        currentVolume;  /* 0.0 .. 64.0 */

    /* AMF state */
    uint16_t     amfPosition;
    uint16_t     amfDelayCounter;
    int16_t      amfValue;

    /* Synth effect state */
    uint16_t     synthEffectPosition;
    uint16_t     synthEffectWavePosition;
    uint16_t     effectDelayCounter;
    uint8_t      flag;
    int16_t      slideValue;
    int16_t      slideSpeed;

    /* Arpeggio */
    int          activeArpTable;
    uint8_t      arpPosition;

    /* Vibrato */
    uint16_t     vibratoDelayCtr;
    uint16_t     vibratoPosition;

    /* Period tracking */
    uint16_t     currentPeriod;
    uint16_t     targetPeriod;
    uint16_t     previousPeriod;
    uint16_t     portamentoPeriod;  /* persistent glide state (ref: PortamentoPeriod) */

    /* Volume slide */
    int16_t      volumeSlideSpeed;

    /* Speed counter — tracks tick within row; 0 = first tick of row */
    uint16_t     speedCounter;

    /* Master volume (0-64, default 64) — set by SetMasterVolume effect */
    uint16_t     masterVolume;

    /* Note-off release flag (ref: voiceInfo.Note == 0x80) */
    int          noteReleased;

    /* PRNG for noise effects */
    uint32_t     prngState;
} SAPlayer;

/* ── Context ──────────────────────────────────────────────────────────────── */

typedef struct {
    int       sampleRate;
    SAPlayer  players[MAX_PLAYERS];
} SAContext;

/* ── Helpers ──────────────────────────────────────────────────────────────── */

static inline uint16_t read_u16_le(const uint8_t *p) {
    return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}

static inline int8_t read_i8(const uint8_t *p) {
    return (int8_t)p[0];
}

static inline int clamp_i(int v, int lo, int hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

static inline int8_t clamp_i8(int v) {
    if (v < -128) return -128;
    if (v > 127) return 127;
    return (int8_t)v;
}

static uint32_t xorshift32(uint32_t *state) {
    uint32_t x = *state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    return x;
}

/**
 * Find the SA period table index whose period is closest to targetPeriod.
 * Used to map MIDI notes (via frequency calculation) back to the SA period table
 * so that arpeggio/effects work correctly with period-based offsets.
 */
static int findBestPeriodIndex(double targetPeriod) {
    int best = 1;
    double bestDiff = fabs(targetPeriod - (double)PERIOD_TABLE[1]);
    for (int i = 2; i <= 108; i++) {
        double diff = fabs(targetPeriod - (double)PERIOD_TABLE[i]);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = i;
        }
    }
    return best;
}

/* ── Per-tick pipeline helpers ────────────────────────────────────────────── */

/**
 * Arpeggio — ref: DoArpeggio (lines 1435-1500)
 *
 * activeArpTable semantics (matching reference voiceInfo.Arpeggio):
 *   0 = NO instrument arpeggio (falls through to XM-style 0xy if effect present)
 *   1,2,3 = use instrument arpeggio table 0,1,2 respectively
 */
static void doArpeggio(SAPlayer *p) {
    if (p->activeArpTable == 0) return;  /* 0 = no instrument arp */

    int tbl = p->activeArpTable - 1;  /* 1-indexed → 0-indexed */
    if (tbl < 0 || tbl > 2) return;

    SAArpTable *at = &p->ins.arpTables[tbl];

    int8_t arpVal = at->values[p->arpPosition];
    int noteIdx = p->baseNote + arpVal;
    if (noteIdx < 0 || noteIdx > 108) noteIdx = 0;  /* out of range → period 0 (silence) */
    p->currentPeriod = PERIOD_TABLE[noteIdx];

    p->arpPosition++;

    /* Ref: maxLength = min(Length + Repeat, 13); wraps to Length */
    int maxLength = at->length + at->repeat;
    if (maxLength > 13) maxLength = 13;
    if (p->arpPosition > maxLength) {
        p->arpPosition = at->length;
    }
}

/**
 * Portamento — ref: DoPortamento (lines 1510-1537)
 *
 * Reference uses a persistent PortamentoPeriod that starts at previousPeriod
 * and glides toward currentPeriod. When |diff| < speed, speed is set to 0
 * (arrived at target).
 */
static void doPortamento(SAPlayer *p) {
    if (p->ins.portamentoSpeed == 0) return;

    /* Lazy init from previousPeriod (ref: line 1514-1515) */
    if (p->portamentoPeriod == 0)
        p->portamentoPeriod = p->previousPeriod;

    int diff = (int)p->currentPeriod - (int)p->portamentoPeriod;
    if (diff < 0) diff = -diff;

    diff -= (int)p->ins.portamentoSpeed;
    if (diff < 0) {
        /* Close enough — stop portamento */
        p->portamentoPeriod = p->currentPeriod;
    } else {
        uint16_t newPeriod = p->portamentoPeriod;
        if (newPeriod >= p->currentPeriod)
            newPeriod -= p->ins.portamentoSpeed;
        else
            newPeriod += p->ins.portamentoSpeed;

        p->portamentoPeriod = newPeriod;
        p->currentPeriod = newPeriod;
    }
}

/**
 * Vibrato — ref: DoVibrato (lines 1546-1563)
 *
 * Reference formula: period += (vibVal * 4) / vibLevel
 * vibratoDelay == 255 means permanently disabled.
 * Higher vibLevel = LESS depth (it's a divisor).
 */
static void doVibrato(SAPlayer *p) {
    if (p->vibratoDelayCtr == 255) return;  /* permanently disabled */

    if (p->vibratoDelayCtr > 0) {
        p->vibratoDelayCtr--;
        return;
    }

    int vibVal = VIBRATO_TABLE[p->vibratoPosition & 0xFF];
    uint16_t vibLevel = p->ins.vibratoLevel;

    if (vibVal != 0 && vibLevel != 0) {
        int mod = (vibVal * 4) / (int)vibLevel;
        int newPeriod = (int)p->currentPeriod + mod;
        if (newPeriod < 113) newPeriod = 113;
        if (newPeriod > 13696) newPeriod = 13696;
        p->currentPeriod = (uint16_t)newPeriod;
    }

    p->vibratoPosition = (uint16_t)((p->vibratoPosition + p->ins.vibratoSpeed) & 0xFF);
}

static void doAmf(SAPlayer *p) {
    if (p->ins.amfLength + p->ins.amfRepeat == 0) return;

    int8_t amfVal = p->ins.amfTable[p->amfPosition];

    /* Apply AMF as period modulation (subtraction, matching reference) */
    int newPeriod = (int)p->currentPeriod - amfVal;
    if (newPeriod < 28) newPeriod = 28;
    if (newPeriod > 13696) newPeriod = 13696;
    p->currentPeriod = (uint16_t)newPeriod;

    /* Delay-reload pattern: decrement counter, advance position when it hits 0 */
    p->amfDelayCounter--;
    if (p->amfDelayCounter == 0) {
        p->amfDelayCounter = p->ins.amfDelay;

        p->amfPosition++;

        uint16_t totalLen = p->ins.amfLength + p->ins.amfRepeat;
        if (totalLen > SA_TABLE_SIZE) totalLen = SA_TABLE_SIZE;

        if (p->amfPosition >= totalLen) {
            p->amfPosition = p->ins.amfLength;
            if (p->ins.amfRepeat == 0 && p->amfPosition > 0)
                p->amfPosition--;
        }
    }
}

static void doSlide(SAPlayer *p) {
    /* Slide subtracts from period (positive slideValue = pitch up) */
    int newPeriod = (int)p->currentPeriod - p->slideValue;
    if (newPeriod < 113) newPeriod = 113;
    if (newPeriod > 13696) newPeriod = 13696;
    p->currentPeriod = (uint16_t)newPeriod;
    /* slideSpeed accumulates into slideValue ONLY on non-zero ticks (ref line 1612) */
    if (p->speedCounter != 0)
        p->slideValue += p->slideSpeed;
}

/**
 * Convert Amiga period to phase increment for waveform playback.
 *
 * On real Amiga hardware:
 *   DMA rate = PAL_CLOCK / period  (bytes per second)
 *   audible freq = DMA rate / waveform_byte_length
 *
 * In our render loop, phase wraps at byteLen, so:
 *   output freq = sampleRate * phaseInc / byteLen
 *
 * Setting phaseInc = DMA_rate / sampleRate gives:
 *   output freq = DMA_rate / byteLen = PAL_CLOCK / (period * byteLen)
 * which matches the real Amiga.
 */
static void computePhaseInc(SAPlayer *p) {
    if (p->currentPeriod == 0) {
        p->phaseInc = 0.0f;
        return;
    }
    double dmaRate = AMIGA_PAL_CLOCK / (double)p->currentPeriod;
    p->phaseInc = (float)(dmaRate / (double)p->sampleRate);
}

/* ── Synthesis effects (18 modes) ─────────────────────────────────────────── */

static void doSynthEffect(SAPlayer *p) {
    p->effectDelayCounter--;
    if (p->effectDelayCounter > 0) return;
    p->effectDelayCounter = p->ins.effectDelay;

    int8_t *buf = p->waveformBuffer;
    int byteLen = p->ins.waveformLength * 2;
    if (byteLen <= 0) byteLen = SA_WAVE_SIZE;
    if (byteLen > SA_WAVE_SIZE) byteLen = SA_WAVE_SIZE;

    /* effectArg2/effectArg3 define start/stop range for most effects */
    uint16_t start = p->ins.effectArg2;
    uint16_t stop = p->ins.effectArg3;
    uint16_t pos = p->synthEffectPosition;
    uint16_t wavePos = p->synthEffectWavePosition;

    switch (p->ins.effect) {
    case 0: /* None */
        break;

    case 1: { /* WaveNegator */
        if (pos <= stop) {
            buf[pos] = (int8_t)(-(int)buf[pos]);
        }
        pos++;
        if (pos >= stop) pos = start;
        break;
    }

    case 2: { /* FreeNegator — ref: DoSynthEffectFreeNegator */
        if ((p->flag & 0x04) == 0) {
            /* effectArg1=waveNumber, effectArg2=waveLength, effectArg3=waveRepeat */
            uint16_t waveformNumber = p->ins.effectArg1;
            uint16_t waveLength = p->ins.effectArg2;
            uint16_t waveRepeat = p->ins.effectArg3;

            if (waveformNumber >= p->ins.numWaveforms) waveformNumber = 0;
            const int8_t *waveform = p->ins.allWaveforms[waveformNumber];
            int16_t waveVal = (int16_t)(waveform[wavePos & (SA_WAVE_SIZE - 1)] & 0x7F);

            const int8_t *sourceWaveform = p->ins.waveformData;
            int16_t count = (int16_t)(p->ins.waveformLength * 2);
            if (count <= 0) count = SA_WAVE_SIZE;
            if (count > SA_WAVE_SIZE) count = SA_WAVE_SIZE;

            int bufferOffset = count;

            /* Copy from source where count >= waveVal */
            while ((count > 0) && (count >= waveVal)) {
                bufferOffset--;
                buf[bufferOffset] = sourceWaveform[bufferOffset];
                count--;
            }

            /* Negate from source for the rest */
            int16_t left = (int16_t)(waveVal - count);
            count += left;
            bufferOffset += left;

            while (count > 0) {
                bufferOffset--;
                buf[bufferOffset] = (int8_t)(-(int)sourceWaveform[bufferOffset]);
                count--;
            }

            wavePos++;
            if (wavePos > (waveLength + waveRepeat)) {
                wavePos = waveLength;
                if ((waveRepeat == 0) && (waveVal == 0))
                    p->flag |= 0x04;
            }
        }
        break;
    }

    case 3: { /* RotateVertical — ref: DoSynthEffectRotateVertical */
        int8_t delta = (int8_t)(p->ins.effectArg1 & 0xFF);
        int16_t count = (int16_t)(stop - start);
        int bufOff = (int)start;
        while (count >= 0) {
            buf[bufOff++] += delta;
            count--;
        }
        /* IncrementSynthEffectPosition */
        pos++;
        if (pos >= stop) pos = start;
        break;
    }

    case 4: { /* RotateHorizontal — ref: DoSynthEffectRotateHorizontal */
        int16_t count = (int16_t)(stop - start);
        int bufOff = (int)start;
        int8_t firstByte = buf[bufOff];
        do {
            buf[bufOff] = buf[bufOff + 1];
            bufOff++;
            count--;
        } while (count >= 0);
        buf[bufOff] = firstByte;
        /* IncrementSynthEffectPosition */
        pos++;
        if (pos >= stop) pos = start;
        break;
    }

    case 5: { /* AlienVoice — ref: DoSynthEffectAlienVoice */
        uint16_t waveformNumber = p->ins.effectArg1;
        if (waveformNumber >= p->ins.numWaveforms) waveformNumber = 0;
        const int8_t *srcWave = p->ins.allWaveforms[waveformNumber];
        int bufOff = (int)start;
        int16_t count = (int16_t)(stop - start);
        while (count >= 0) {
            buf[bufOff] += srcWave[bufOff];
            bufOff++;
            count--;
        }
        /* No IncrementSynthEffectPosition in reference */
        break;
    }

    case 6: { /* PolyNegator — ref: DoSynthEffectPolyNegator */
        buf[pos] = p->ins.waveformData[pos];
        if (pos >= stop)
            pos = (uint16_t)(start > 0 ? start - 1 : 0);
        buf[pos + 1] = (int8_t)(-(int)buf[pos + 1]);
        /* IncrementSynthEffectPosition */
        pos++;
        if (pos >= stop) pos = start;
        break;
    }

    case 7: { /* ShackWave1 — ref: DoSynthEffectShackWave1 */
        uint16_t waveformNumber = p->ins.effectArg1;
        if (waveformNumber >= p->ins.numWaveforms) waveformNumber = 0;
        const int8_t *srcWave = p->ins.allWaveforms[waveformNumber];
        int8_t delta = srcWave[start + pos];
        int bufOff = (int)start;
        int16_t count = (int16_t)(stop - start);
        while (count >= 0) {
            buf[bufOff++] += delta;
            count--;
        }
        /* IncrementSynthEffectPosition */
        pos++;
        if (pos >= stop) pos = start;
        break;
    }

    case 8: { /* ShackWave2 — ref: DoSynthEffectShackWave2 */
        /* ShackWaveHelper first */
        uint16_t waveformNumber = p->ins.effectArg1;
        if (waveformNumber >= p->ins.numWaveforms) waveformNumber = 0;
        const int8_t *srcWave = p->ins.allWaveforms[waveformNumber];
        int8_t delta = srcWave[start + pos];
        int bufOff = (int)start;
        int16_t count = (int16_t)(stop - start);
        while (count >= 0) {
            buf[bufOff++] += delta;
            count--;
        }
        /* Then negate at start+wavePos */
        buf[start + wavePos] = (int8_t)(-(int)buf[start + wavePos]);
        wavePos++;
        if (wavePos > (uint16_t)(stop - start))
            wavePos = 0;
        /* IncrementSynthEffectPosition */
        pos++;
        if (pos >= stop) pos = start;
        break;
    }

    case 9: { /* Metamorph — ref: DoSynthEffectMetamorph */
        if ((p->flag & 0x01) == 0) {
            uint16_t waveformNumber = p->ins.effectArg1;
            if (waveformNumber >= p->ins.numWaveforms) waveformNumber = 0;
            const int8_t *target = p->ins.allWaveforms[waveformNumber];
            int bufOff = (int)start;
            int16_t count = (int16_t)(stop - start);
            int setFlag = 0;
            while (count >= 0) {
                if (buf[bufOff] != target[bufOff]) {
                    setFlag = 1;
                    if (buf[bufOff] < target[bufOff])
                        buf[bufOff]++;
                    else
                        buf[bufOff]--;
                }
                bufOff++;
                count--;
            }
            if (!setFlag)
                p->flag |= 0x02;
        }
        break;
    }

    case 10: { /* Laser — ref: DoSynthEffectLaser */
        int8_t detune = (int8_t)(p->ins.effectArg2 & 0xFF);
        uint16_t repeats = p->ins.effectArg3;
        if (wavePos < repeats) {
            p->slideValue += detune;
            wavePos++;
        }
        /* IncrementSynthEffectPosition */
        pos++;
        if (pos >= stop) pos = start;
        break;
    }

    case 11: { /* WaveAlias — ref: DoSynthEffectWaveAlias */
        int8_t delta = (int8_t)(p->ins.effectArg1 & 0xFF);
        int16_t count = (int16_t)(stop - start);
        int bufOff = (int)start;
        while (count >= 0) {
            int8_t val = buf[bufOff];
            if (((bufOff + 1) >= byteLen) || (val > buf[bufOff + 1]))
                val -= delta;
            else
                val += delta;
            buf[bufOff++] = val;
            count--;
        }
        /* IncrementSynthEffectPosition */
        pos++;
        if (pos >= stop) pos = start;
        break;
    }

    case 12: { /* NoiseGenerator1 — ref: DoSynthEffectNoiseGenerator1 */
        buf[pos] ^= (int8_t)(xorshift32(&p->prngState) & 0xFF);
        /* IncrementSynthEffectPosition */
        pos++;
        if (pos >= stop) pos = start;
        break;
    }

    case 13: { /* LowPassFilter1 — ref: DoSynthEffectLowPassFilter1 */
        uint16_t deltaValue = p->ins.effectArg1;
        for (int i = (int)start; i <= (int)stop; i++) {
            int flag = 0;
            int8_t val1 = buf[i];
            int8_t val2 = (i == (int)stop) ? buf[start] : buf[i + 1];
            if (val1 <= val2) flag = 1;
            int diff = (int)val1 - (int)val2;
            if (diff < 0) diff = -diff;
            if (diff > (int)deltaValue) {
                if (flag)
                    buf[i] += 2;
                else
                    buf[i] -= 2;
            }
        }
        /* IncrementSynthEffectPosition */
        pos++;
        if (pos >= stop) pos = start;
        break;
    }

    case 14: { /* LowPassFilter2 — ref: DoSynthEffectLowPassFilter2 */
        uint16_t waveformNumber = p->ins.effectArg1;
        if (waveformNumber >= p->ins.numWaveforms) waveformNumber = 0;
        const int8_t *lpfWave = p->ins.allWaveforms[waveformNumber];
        int bufferIndex = (int)stop;
        for (int i = (int)start; i <= (int)stop; i++) {
            int flag = 0;
            int8_t val1 = buf[i];
            int8_t val2 = (i == (int)stop) ? buf[start] : buf[i + 1];
            if (val1 <= val2) flag = 1;
            int diff = (int)val1 - (int)val2;
            if (diff < 0) diff = -diff;
            uint8_t deltaValue = (uint8_t)(lpfWave[bufferIndex++] & 0x7F);
            bufferIndex &= 0x7F;
            if (diff > (int)deltaValue) {
                if (flag)
                    buf[i] += 2;
                else
                    buf[i] -= 2;
            }
        }
        /* IncrementSynthEffectPosition */
        pos++;
        if (pos >= stop) pos = start;
        break;
    }

    case 15: { /* Oszilator — ref: DoSynthEffectOszilator */
        if (p->flag & 0x02) {
            p->flag ^= 0x08;
            p->flag &= ~0x02;
        }
        const int8_t *sourceWaveform;
        if (p->flag & 0x08)
            sourceWaveform = p->ins.waveformData;
        else {
            uint16_t waveformNumber = p->ins.effectArg1;
            if (waveformNumber >= p->ins.numWaveforms) waveformNumber = 0;
            sourceWaveform = p->ins.allWaveforms[waveformNumber];
        }
        /* MetamorphAndOszilatorHelper */
        {
            int bufOff = (int)start;
            int16_t count = (int16_t)(stop - start);
            int setFlag = 0;
            while (count >= 0) {
                if (buf[bufOff] != sourceWaveform[bufOff]) {
                    setFlag = 1;
                    if (buf[bufOff] < sourceWaveform[bufOff])
                        buf[bufOff]++;
                    else
                        buf[bufOff]--;
                }
                bufOff++;
                count--;
            }
            if (!setFlag)
                p->flag |= 0x02;
        }
        break;
    }

    case 16: { /* NoiseGenerator2 — ref: DoSynthEffectNoiseGenerator2 */
        int16_t count = (int16_t)(stop - start);
        int bufOff = (int)start;
        do {
            int8_t val = buf[bufOff + count];
            val ^= 0x05;
            val = (int8_t)(((uint8_t)val << 2) | ((uint8_t)val >> 6));
            val += (int8_t)(xorshift32(&p->prngState) & 0xFF);
            buf[bufOff + count] = val;
            count--;
        } while (count >= 0);
        break;
    }

    case 17: { /* FmDrum — ref: DoSynthEffectFmDrum */
        uint8_t level = (uint8_t)(p->ins.effectArg1 & 0xFF);
        uint16_t factor = p->ins.effectArg2;
        uint16_t repeats = p->ins.effectArg3;
        if (wavePos >= repeats) {
            p->slideValue = p->ins.fineTuning;
            wavePos = 0;
        }
        uint16_t decrement = (uint16_t)((factor << 8) | level);
        p->slideValue = (int16_t)(p->slideValue - decrement);
        wavePos++;
        /* IncrementSynthEffectPosition */
        pos++;
        if (pos >= stop) pos = start;
        break;
    }

    default:
        break;
    }

    p->synthEffectPosition = pos;
    p->synthEffectWavePosition = wavePos;
}

/* ── ADSR table processing ────────────────────────────────────────────────── */

static void doAdsr(SAPlayer *p) {
    if (p->ins.adsrLength + p->ins.adsrRepeat == 0) {
        /* No ADSR table: vol = (currentVolume * masterVolume) / 64  (ref line 1626) */
        uint16_t vol = (uint16_t)((p->ins.volume * p->masterVolume) / 64);
        if (vol > 64) vol = 64;
        p->currentVolume = (float)vol;
        return;
    }

    /* Read current ADSR value and apply to volume (ref line 1632):
     * vol = (masterVolume * currentVolume * adsrVal) / 4096 */
    uint16_t tablePos = p->adsrPosition;
    if (tablePos >= SA_TABLE_SIZE) tablePos = SA_TABLE_SIZE - 1;
    uint16_t adsrVal = p->ins.adsrTable[tablePos];
    uint16_t vol = (uint16_t)((p->masterVolume * (uint32_t)p->ins.volume * adsrVal) / 4096);
    if (vol > 64) vol = 64;
    p->currentVolume = (float)vol;

    /* Sustain hold — only gates AFTER note-off (ref line 1638:
     * if (voiceInfo.Note == 0x80 && adsrPosition >= sustainPoint)).
     * While note is held (noteReleased==0), ADSR advances freely past sustainPoint. */
    if (p->noteReleased && p->ins.sustainPoint > 0 && p->adsrPosition >= p->ins.sustainPoint) {
        if (p->ins.sustainDelay == 0)
            return;
        if (p->sustainDelayCounter > 0) {
            p->sustainDelayCounter--;
            return;
        }
        p->sustainDelayCounter = p->ins.sustainDelay;
    }

    /* Delay-reload pattern: decrement counter, advance position when it hits 0 */
    p->adsrDelayCounter--;
    if (p->adsrDelayCounter == 0) {
        p->adsrDelayCounter = p->ins.adsrDelay;

        p->adsrPosition++;

        uint16_t totalLen = p->ins.adsrLength + p->ins.adsrRepeat;
        if (totalLen > SA_TABLE_SIZE) totalLen = SA_TABLE_SIZE;

        if (p->adsrPosition >= totalLen) {
            p->adsrPosition = p->ins.adsrLength;

            if (p->ins.adsrRepeat == 0 && p->adsrPosition > 0)
                p->adsrPosition--;

            if (p->ins.adsrRepeat == 0 && p->currentVolume == 0.0f)
                p->flag |= 0x01;
        }
    }
}

/* ── Volume slide ─────────────────────────────────────────────────────────── */

static void doVolumeSlide(SAPlayer *p) {
    if (p->volumeSlideSpeed == 0) return;
    float newVol = p->currentVolume + (float)p->volumeSlideSpeed;
    if (newVol < 0.0f) newVol = 0.0f;
    if (newVol > 64.0f) newVol = 64.0f;
    p->currentVolume = newVol;
}

/* ── Master per-tick update ───────────────────────────────────────────────── */

static void sa_player_tick(SAPlayer *p) {
    if (!p->playing) return;
    if (p->flag & 0x01) return; /* muted (e.g., FmDrum finished) */

    doArpeggio(p);
    doPortamento(p);
    doVibrato(p);
    doAmf(p);
    doSlide(p);
    computePhaseInc(p);
    doSynthEffect(p);
    doAdsr(p);
    doVolumeSlide(p);

    /* speedCounter auto-increments each tick; reset to 0 via setParam(8,0) by replayer.
     * Used by doSlide to gate slide accumulation (ref line 1612). */
    p->speedCounter++;
}

/* ── WASM exports ─────────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void *sa_init(int sampleRate) {
    SAContext *ctx = (SAContext *)calloc(1, sizeof(SAContext));
    if (!ctx) return NULL;
    ctx->sampleRate = sampleRate;
    return ctx;
}

EMSCRIPTEN_KEEPALIVE
void sa_dispose(void *ctxPtr) {
    if (!ctxPtr) return;
    free(ctxPtr);
}

EMSCRIPTEN_KEEPALIVE
int sa_create_player(void *ctxPtr) {
    if (!ctxPtr) return -1;
    SAContext *ctx = (SAContext *)ctxPtr;
    for (int i = 0; i < MAX_PLAYERS; i++) {
        if (!ctx->players[i].alive) {
            memset(&ctx->players[i], 0, sizeof(SAPlayer));
            ctx->players[i].alive = 1;
            ctx->players[i].sampleRate = ctx->sampleRate;
            ctx->players[i].samplesPerTick = ctx->sampleRate / TICKS_PER_SEC;
            ctx->players[i].baseNote = -1;
            ctx->players[i].masterVolume = 64;  /* default master volume */
            ctx->players[i].prngState = 0x12345678;
            return i;
        }
    }
    return -1;
}

EMSCRIPTEN_KEEPALIVE
void sa_destroy_player(void *ctxPtr, int handle) {
    if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
    SAContext *ctx = (SAContext *)ctxPtr;
    memset(&ctx->players[handle], 0, sizeof(SAPlayer));
}

EMSCRIPTEN_KEEPALIVE
int sa_load_instrument(void *ctxPtr, int handle, const uint8_t *data, int len) {
    if (!ctxPtr || !data) return -1;
    if (handle < 0 || handle >= MAX_PLAYERS) return -1;

    /* Minimum size: header(45) + 3 arp tables(48) + wave(128) + adsr(128) + amf(128) + numWaveforms(2) = 479 */
    if (len < 479) return -2;

    SAContext *ctx = (SAContext *)ctxPtr;
    SAPlayer *p = &ctx->players[handle];
    memset(&p->ins, 0, sizeof(SAInstrument));

    /* Parse header fields (little-endian) */
    p->ins.volume          = read_u16_le(data + 0);
    p->ins.fineTuning      = read_i8(data + 2);
    p->ins.waveformNumber  = read_u16_le(data + 3);
    p->ins.waveformLength  = read_u16_le(data + 5);
    p->ins.portamentoSpeed = read_u16_le(data + 7);
    p->ins.vibratoDelay    = read_u16_le(data + 9);
    p->ins.vibratoSpeed    = read_u16_le(data + 11);
    p->ins.vibratoLevel    = read_u16_le(data + 13);
    p->ins.amfNumber       = read_u16_le(data + 15);
    p->ins.amfDelay        = read_u16_le(data + 17);
    p->ins.amfLength       = read_u16_le(data + 19);
    p->ins.amfRepeat       = read_u16_le(data + 21);
    p->ins.adsrNumber      = read_u16_le(data + 23);
    p->ins.adsrDelay       = read_u16_le(data + 25);
    p->ins.adsrLength      = read_u16_le(data + 27);
    p->ins.adsrRepeat      = read_u16_le(data + 29);
    p->ins.sustainPoint    = read_u16_le(data + 31);
    p->ins.sustainDelay    = read_u16_le(data + 33);
    p->ins.effect          = read_u16_le(data + 35);
    p->ins.effectArg1      = read_u16_le(data + 37);
    p->ins.effectArg2      = read_u16_le(data + 39);
    p->ins.effectArg3      = read_u16_le(data + 41);
    p->ins.effectDelay     = read_u16_le(data + 43);

    /* Parse 3 arpeggio sub-tables: each 16 bytes (length u8, repeat u8, values int8[14]) */
    for (int t = 0; t < 3; t++) {
        int base = 45 + t * 16;
        p->ins.arpTables[t].length = data[base];
        p->ins.arpTables[t].repeat = data[base + 1];
        for (int v = 0; v < SA_ARP_ENTRIES; v++) {
            p->ins.arpTables[t].values[v] = (int8_t)data[base + 2 + v];
        }
    }

    /* Waveform data: 128 bytes at offset 93 */
    memcpy(p->ins.waveformData, data + 93, SA_WAVE_SIZE);

    /* ADSR table: 128 bytes at offset 221 */
    memcpy(p->ins.adsrTable, data + 221, SA_TABLE_SIZE);

    /* AMF table: 128 bytes at offset 349 */
    memcpy(p->ins.amfTable, data + 349, SA_TABLE_SIZE);

    /* Number of waveforms: u16 LE at offset 477 */
    p->ins.numWaveforms = read_u16_le(data + 477);
    if (p->ins.numWaveforms > SA_MAX_WAVEFORMS)
        p->ins.numWaveforms = SA_MAX_WAVEFORMS;

    /* All waveforms: each 128 bytes starting at offset 479 */
    int expectedLen = 479 + p->ins.numWaveforms * SA_WAVE_SIZE;
    if (len < expectedLen) {
        /* Load as many as we can */
        int canLoad = (len - 479) / SA_WAVE_SIZE;
        if (canLoad < 0) canLoad = 0;
        p->ins.numWaveforms = canLoad;
    }

    for (int w = 0; w < p->ins.numWaveforms; w++) {
        memcpy(p->ins.allWaveforms[w], data + 479 + w * SA_WAVE_SIZE, SA_WAVE_SIZE);
    }

    /* Clamp waveformLength: ensure byte length does not exceed buffer */
    if (p->ins.waveformLength == 0) p->ins.waveformLength = SA_WAVE_SIZE / 2;
    if (p->ins.waveformLength * 2 > SA_WAVE_SIZE) p->ins.waveformLength = SA_WAVE_SIZE / 2;

    return 0;
}

EMSCRIPTEN_KEEPALIVE
void sa_note_on(void *ctxPtr, int handle, int note, int velocity) {
    if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
    SAContext *ctx = (SAContext *)ctxPtr;
    SAPlayer *p = &ctx->players[handle];
    if (!p->alive) return;

    (void)velocity; /* velocity not directly used in SA; could scale volume */

    /* Store previous period for portamento reference */
    p->previousPeriod = p->currentPeriod;

    /* Convert MIDI note to SA period table index.
     *
     * SA note index = MIDI + 25 (derived from saNote2XM offset of -36 and XM→MIDI offset of +11).
     * The period table is used directly — waveform length is NOT factored into the period.
     * On real Amiga hardware, shorter waveforms naturally sound higher in pitch because:
     *   audible_freq = PAL_CLOCK / (period * waveform_bytes)
     * The SA player always uses the same period for a given note regardless of waveform size.
     */
    int saIndex = note + 25;
    if (saIndex < 1) saIndex = 1;
    if (saIndex > 108) saIndex = 108;

    /* Store SA index (not MIDI note) — arpeggio adds offsets to this index */
    p->baseNote = saIndex;
    p->targetPeriod = PERIOD_TABLE[saIndex];
    p->currentPeriod = PERIOD_TABLE[saIndex];

    /* Copy instrument waveform to working buffer */
    memcpy(p->waveformBuffer, p->ins.waveformData, SA_WAVE_SIZE);

    /* Reset oscillator */
    p->phase = 0.0f;
    p->sampleCtr = 0;

    /* Reset ADSR */
    p->adsrPosition = 0;
    p->adsrDelayCounter = p->ins.adsrDelay;
    p->sustainDelayCounter = 0;
    p->currentVolume = 0.0f;

    /* Reset AMF */
    p->amfPosition = 0;
    p->amfDelayCounter = p->ins.amfDelay;
    p->amfValue = 0;

    /* Reset vibrato */
    p->vibratoDelayCtr = p->ins.vibratoDelay;
    p->vibratoPosition = 0;

    /* Reset arpeggio — activeArpTable set via setParam from replayer */
    p->arpPosition = 0;

    /* Reset portamento */
    p->portamentoPeriod = 0;

    /* Reset synth effects — position starts at effectArg2 per reference */
    p->synthEffectPosition = p->ins.effectArg2;
    p->synthEffectWavePosition = 0;
    p->effectDelayCounter = p->ins.effectDelay;
    p->flag = 0;
    p->slideValue = p->ins.fineTuning;  /* fineTuning is initial slide value */
    p->slideSpeed = 0;

    /* Reset volume slide */
    p->volumeSlideSpeed = 0;

    /* Reset PRNG to deterministic seed per note */
    p->prngState = 0x12345678 ^ (uint32_t)note;

    /* Clear release flag — note is active */
    p->noteReleased = 0;

    /* Reset speed counter — note triggers happen on tick 0 of a row */
    p->speedCounter = 0;

    /* Compute initial phase increment */
    computePhaseInc(p);

    p->playing = 1;
}

EMSCRIPTEN_KEEPALIVE
void sa_note_off(void *ctxPtr, int handle) {
    if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
    SAContext *ctx = (SAContext *)ctxPtr;
    SAPlayer *p = &ctx->players[handle];
    /* Set release flag — ADSR will gate at sustain point (ref: voiceInfo.Note = 0x80).
     * Sound continues playing through ADSR release; silence happens when ADSR
     * reaches volume 0 with repeat=0 (flag |= 0x01). */
    p->noteReleased = 1;
}

EMSCRIPTEN_KEEPALIVE
void sa_force_quiet(void *ctxPtr, int handle) {
    if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
    SAContext *ctx = (SAContext *)ctxPtr;
    SAPlayer *p = &ctx->players[handle];
    /* Immediate silence — ref: ForceQuiet() sets volume=0, mutes channel */
    p->playing = 0;
    p->currentVolume = 0.0f;
}

EMSCRIPTEN_KEEPALIVE
void sa_render(void *ctxPtr, int handle, float *outL, float *outR, int numSamples) {
    if (!ctxPtr || !outL || !outR || handle < 0 || handle >= MAX_PLAYERS) {
        if (outL) memset(outL, 0, numSamples * sizeof(float));
        if (outR) memset(outR, 0, numSamples * sizeof(float));
        return;
    }

    SAContext *ctx = (SAContext *)ctxPtr;
    SAPlayer *p = &ctx->players[handle];

    memset(outL, 0, numSamples * sizeof(float));
    memset(outR, 0, numSamples * sizeof(float));

    if (!p->playing || !p->alive) return;

    const float volNorm = 1.0f / (64.0f * 128.0f);
    const int spTick = p->samplesPerTick > 0 ? p->samplesPerTick : (p->sampleRate / 50);
    int byteLen = p->ins.waveformLength * 2;
    if (byteLen <= 0) byteLen = SA_WAVE_SIZE;
    if (byteLen > SA_WAVE_SIZE) byteLen = SA_WAVE_SIZE;

    for (int i = 0; i < numSamples; i++) {
        if (!p->playing) break;

        /* Tick update at Amiga 50Hz rate */
        p->sampleCtr++;
        if (p->sampleCtr >= spTick) {
            p->sampleCtr = 0;
            sa_player_tick(p);
            if (!p->playing) break;
        }

        /* Read waveform sample */
        int idx = (int)p->phase;
        if (idx < 0) idx = 0;
        if (idx >= byteLen) idx = byteLen - 1;
        float sample = (float)p->waveformBuffer[idx] * p->currentVolume * volNorm;

        /* Apply fine tuning as slight pitch offset */
        /* Fine tuning is already baked into the period in a real SA player;
           here we apply it as a fractional period adjustment */

        outL[i] = sample;
        outR[i] = sample;

        /* Advance phase */
        p->phase += p->phaseInc;
        while (p->phase >= (float)byteLen) {
            p->phase -= (float)byteLen;
        }
        if (p->phase < 0.0f) p->phase = 0.0f;
    }
}

EMSCRIPTEN_KEEPALIVE
void sa_set_param(void *ctxPtr, int handle, int paramId, float value) {
    if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
    SAContext *ctx = (SAContext *)ctxPtr;
    SAPlayer *p = &ctx->players[handle];

    switch (paramId) {
    case 0: /* Volume (0.0 - 1.0 -> 0-64) */
        p->ins.volume = (uint16_t)(value * 64.0f);
        if (p->ins.volume > 64) p->ins.volume = 64;
        break;
    case 1: /* Vibrato speed */
        p->ins.vibratoSpeed = (uint16_t)(value * 255.0f);
        break;
    case 2: /* Vibrato level/depth */
        p->ins.vibratoLevel = (uint16_t)(value * 255.0f);
        break;
    case 3: /* Vibrato delay */
        p->ins.vibratoDelay = (uint16_t)(value * 255.0f);
        break;
    case 4: /* Portamento speed */
        p->ins.portamentoSpeed = (uint16_t)(value * 255.0f);
        break;
    case 5: /* Active arpeggio table (0=none, 1-3=table 0-2) */
        p->activeArpTable = clamp_i((int)value, 0, 3);
        break;
    case 6: /* Volume slide speed (-64..+64 mapped from -1..+1) */
        p->volumeSlideSpeed = (int16_t)(value * 64.0f);
        break;
    case 7: /* Slide value (pitch slide, -128..+128 mapped from -1..+1) */
        p->slideValue = (int16_t)(value * 128.0f);
        break;
    case 8: /* Speed counter — tick within current row (integer 0..N) */
        p->speedCounter = (uint16_t)value;
        break;
    case 9: /* Master volume (0-64, passed as float 0.0-64.0) */
        p->masterVolume = (uint16_t)value;
        if (p->masterVolume > 64) p->masterVolume = 64;
        break;
    case 10: /* Slide speed (direct set, integer) */
        p->slideSpeed = (int16_t)value;
        break;
    default:
        break;
    }
}

EMSCRIPTEN_KEEPALIVE
float sa_get_param(void *ctxPtr, int handle, int paramId) {
    if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return -1.0f;
    SAContext *ctx = (SAContext *)ctxPtr;
    SAPlayer *p = &ctx->players[handle];

    switch (paramId) {
    case 0: return (float)p->ins.volume / 64.0f;
    case 1: return (float)p->ins.vibratoSpeed / 255.0f;
    case 2: return (float)p->ins.vibratoLevel / 255.0f;
    case 3: return (float)p->ins.vibratoDelay / 255.0f;
    case 4: return (float)p->ins.portamentoSpeed / 255.0f;
    case 5: return (float)p->activeArpTable;
    case 6: return (float)p->volumeSlideSpeed / 64.0f;
    case 7: return (float)p->slideValue / 128.0f;
    default: return -1.0f;
    }
}
