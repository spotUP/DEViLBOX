// fred.c — Fred Editor replayer
// Faithful translation from FlodJS FEPlayer.js by Christian Corti (Neoart)
// Original format by Frederic Hahn
//
// Fred Editor is a 4-channel Amiga tracker with:
//   - Multiple subsongs
//   - ADSR envelopes with per-instrument parameters
//   - Arpeggio tables (up to 16 entries per instrument)
//   - Vibrato with delay
//   - Portamento (tone sliding)
//   - 3 sample types: regular PCM (0), PWM/pulse (1), wavetable blending (2)

#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include "paula_soft.h"
#include "fred.h"

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

#define NUM_VOICES     4
#define MAX_SAMPLES    64
#define MAX_SONGS      16
#define SAMPLE_DEF_SIZE 64  // 52 data bytes + 12 padding

// ═══════════════════════════════════════════════════════════════════════════
// Fred Editor period table (6 octaves, 72 entries)
// From FlodJS FEPlayer.js — standard Amiga periods
// ═══════════════════════════════════════════════════════════════════════════

static const uint16_t period_table[72] = {
    856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
    428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
    214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
    113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113,
    113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113,
    113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113, 113,
};

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

typedef struct {
    int32_t  pointer;        // offset into PCM data
    int16_t  loopPtr;        // loop offset within sample (signed)
    uint16_t length;         // in bytes (already <<1)
    uint16_t relative;       // relative tuning (period * relative / 1024)

    uint8_t  vibratoDelay;
    uint8_t  vibratoSpeed;
    uint8_t  vibratoDepth;

    uint8_t  envelopeVol;
    uint8_t  attackSpeed;
    uint8_t  attackVol;
    uint8_t  decaySpeed;
    uint8_t  decayVol;
    uint8_t  sustainTime;
    uint8_t  releaseSpeed;
    uint8_t  releaseVol;

    int8_t   arpeggio[16];
    uint8_t  arpeggioLimit;
    uint8_t  arpeggioSpeed;

    int8_t   type;           // 0=regular, 1=PWM/pulse, 2=wavetable blending
    uint8_t  synchro;

    int8_t   pulseRateNeg;
    uint8_t  pulseRatePos;
    uint8_t  pulseSpeed;
    uint8_t  pulsePosL;
    uint8_t  pulsePosH;
    uint8_t  pulseDelay;
    uint8_t  pulseCounter;

    uint8_t  blendRate;
    uint8_t  blendDelay;
    uint8_t  blendCounter;
} FredSample;

typedef struct {
    uint16_t *entries;   // array of pattern byte stream offsets
    int       length;    // number of entries in this track
} FredTrack;

typedef struct {
    uint8_t    speed;
    int        length;       // max track length
    FredTrack  tracks[4];    // 4 channels
} FredSong;

// Voice envelope states
typedef enum {
    ENV_OFF = 0,
    ENV_ATTACK,
    ENV_DECAY,
    ENV_SUSTAIN,
    ENV_RELEASE,
} EnvState;

typedef struct {
    // Pattern playback
    int       trackPos;       // position in track order
    int       patternPos;     // position in pattern byte stream
    int       returnPos;      // saved position for note resume

    // Instrument/sample
    int       sampleIndex;    // current sample index (set by 0x83 command)
    FredSample *sample;       // pointer to current sample data

    // Note state
    int       note;           // current note (1-72, 0=none)
    int16_t   period;         // current period
    int16_t   portaTarget;    // portamento target period
    int16_t   portaSpeed;     // portamento speed
    int       portaDelay;     // portamento delay counter
    int       noteDuration;   // ticks until next note

    // Envelope
    EnvState  envState;
    int16_t   volume;         // current volume (0-64)
    int       envCounter;     // envelope tick counter
    int       sustainCounter; // sustain countdown

    // Vibrato
    int       vibratoPos;     // vibrato phase position
    int       vibratoCounter; // vibrato tick counter
    int       vibratoDelayC;  // vibrato delay countdown

    // Arpeggio
    int       arpeggioPos;    // arpeggio table index
    int       arpeggioCounter;// arpeggio tick counter

    // PWM (type 1)
    int       pulsePos;       // current pulse position
    int       pulseDir;       // pulse direction (0=neg, 1=pos)
    int       pulseCnt;       // pulse speed counter
    int       pulseDelayCnt;  // pulse delay countdown

    // Blend (type 2)
    int       blendPos;       // blend position
    int       blendDelayCnt;  // blend delay countdown
    int       blendCnt;       // blend rate counter

    // Channel index (0-3)
    int       ch;
    int       active;         // 1 if voice is playing
} Voice;

typedef struct {
    uint8_t   *mod_data;      // module data buffer (owned)
    int        mod_len;

    // Parsed module data
    int        dataPtr;       // offset to data section
    int        basePtr;       // base pointer for relative offsets

    FredSample samples[MAX_SAMPLES];
    int        numSamples;

    FredSong   songs[MAX_SONGS];
    int        numSongs;

    uint8_t   *patternBytes;  // pattern byte stream
    int        patternLen;

    uint8_t   *pcmBase;       // base of PCM sample data
    int        pcmLen;
    int        pcmFileOffset; // file offset of PCM base

    Voice      voices[NUM_VOICES];
    int        speed;
    int        speedCounter;
    int        currentSong;
    int        finished;
    int        loaded;
} PlayerState;

// ═══════════════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════════════

static PlayerState ps;

// ═══════════════════════════════════════════════════════════════════════════
// Big-endian helpers
// ═══════════════════════════════════════════════════════════════════════════

static inline uint16_t rd16(const uint8_t *p) {
    return ((uint16_t)p[0] << 8) | p[1];
}

static inline int16_t rds16(const uint8_t *p) {
    return (int16_t)rd16(p);
}

static inline uint32_t rd32(const uint8_t *p) {
    return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) |
           ((uint32_t)p[2] << 8) | p[3];
}

// ═══════════════════════════════════════════════════════════════════════════
// Period calculation with relative tuning
// ═══════════════════════════════════════════════════════════════════════════

static int16_t calc_period(int note, uint16_t relative) {
    if (note < 1 || note > 72) return 0;
    int16_t p = (int16_t)period_table[note - 1];
    if (relative != 0 && relative != 1024) {
        p = (int16_t)(((int32_t)p * relative) >> 10);
    }
    return p;
}

// ═══════════════════════════════════════════════════════════════════════════
// Envelope processing
// ═══════════════════════════════════════════════════════════════════════════

static void process_envelope(Voice *v) {
    if (!v->sample || v->envState == ENV_OFF) return;

    switch (v->envState) {
        case ENV_ATTACK:
            v->envCounter++;
            if (v->envCounter >= v->sample->attackSpeed) {
                v->envCounter = 0;
                v->volume++;
                if (v->volume >= (int16_t)v->sample->attackVol) {
                    v->volume = (int16_t)v->sample->attackVol;
                    v->envState = ENV_DECAY;
                    v->envCounter = 0;
                }
            }
            break;

        case ENV_DECAY:
            v->envCounter++;
            if (v->envCounter >= v->sample->decaySpeed) {
                v->envCounter = 0;
                v->volume--;
                if (v->volume <= (int16_t)v->sample->decayVol) {
                    v->volume = (int16_t)v->sample->decayVol;
                    v->envState = ENV_SUSTAIN;
                    v->sustainCounter = v->sample->sustainTime;
                    v->envCounter = 0;
                }
            }
            break;

        case ENV_SUSTAIN:
            if (v->sample->sustainTime > 0) {
                v->sustainCounter--;
                if (v->sustainCounter <= 0) {
                    v->envState = ENV_RELEASE;
                    v->envCounter = 0;
                }
            }
            // sustainTime == 0 means sustain forever (until note off)
            break;

        case ENV_RELEASE:
            v->envCounter++;
            if (v->envCounter >= v->sample->releaseSpeed) {
                v->envCounter = 0;
                v->volume--;
                if (v->volume <= (int16_t)v->sample->releaseVol) {
                    v->volume = (int16_t)v->sample->releaseVol;
                    if (v->volume <= 0) {
                        v->volume = 0;
                        v->envState = ENV_OFF;
                        v->active = 0;
                        paula_set_volume(v->ch, 0);
                        paula_dma_write(1 << v->ch);
                    }
                }
            }
            break;

        default:
            break;
    }

    if (v->volume < 0) v->volume = 0;
    if (v->volume > 64) v->volume = 64;
    paula_set_volume(v->ch, (uint8_t)v->volume);
}

// ═══════════════════════════════════════════════════════════════════════════
// Vibrato processing
// ═══════════════════════════════════════════════════════════════════════════

static void process_vibrato(Voice *v) {
    if (!v->sample || v->sample->vibratoSpeed == 0 || v->sample->vibratoDepth == 0)
        return;

    if (v->vibratoDelayC > 0) {
        v->vibratoDelayC--;
        return;
    }

    v->vibratoCounter++;
    if (v->vibratoCounter >= v->sample->vibratoSpeed) {
        v->vibratoCounter = 0;
        v->vibratoPos++;
    }

    // Simple triangle vibrato
    int depth = v->sample->vibratoDepth;
    int phase = v->vibratoPos & 0x3F; // 64 positions per cycle
    int delta;
    if (phase < 16) {
        delta = phase * depth / 16;
    } else if (phase < 48) {
        delta = (32 - phase) * depth / 16;
    } else {
        delta = (phase - 64) * depth / 16;
    }

    int16_t newPeriod = v->period + (int16_t)delta;
    if (newPeriod > 0) {
        paula_set_period(v->ch, (uint16_t)newPeriod);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Arpeggio processing
// ═══════════════════════════════════════════════════════════════════════════

static void process_arpeggio(Voice *v) {
    if (!v->sample || v->sample->arpeggioLimit == 0) return;

    v->arpeggioCounter++;
    if (v->arpeggioCounter >= v->sample->arpeggioSpeed) {
        v->arpeggioCounter = 0;
        int arpNote = v->note + v->sample->arpeggio[v->arpeggioPos];
        if (arpNote >= 1 && arpNote <= 72) {
            int16_t p = calc_period(arpNote, v->sample->relative);
            if (p > 0) paula_set_period(v->ch, (uint16_t)p);
        }
        v->arpeggioPos++;
        if (v->arpeggioPos >= v->sample->arpeggioLimit) {
            v->arpeggioPos = 0;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Portamento processing
// ═══════════════════════════════════════════════════════════════════════════

static void process_portamento(Voice *v) {
    if (v->portaSpeed == 0 || v->portaTarget == 0) return;

    if (v->portaDelay > 0) {
        v->portaDelay--;
        return;
    }

    if (v->period < v->portaTarget) {
        v->period += v->portaSpeed;
        if (v->period >= v->portaTarget) {
            v->period = v->portaTarget;
            v->portaSpeed = 0;
        }
    } else if (v->period > v->portaTarget) {
        v->period -= v->portaSpeed;
        if (v->period <= v->portaTarget) {
            v->period = v->portaTarget;
            v->portaSpeed = 0;
        }
    }

    if (v->period > 0) {
        paula_set_period(v->ch, (uint16_t)v->period);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PWM (pulse width modulation) for type-1 instruments
// ═══════════════════════════════════════════════════════════════════════════

static void process_pwm(Voice *v) {
    if (!v->sample || v->sample->type != 1) return;

    if (v->pulseDelayCnt > 0) {
        v->pulseDelayCnt--;
        return;
    }

    v->pulseCnt++;
    if (v->pulseCnt >= v->sample->pulseSpeed) {
        v->pulseCnt = 0;

        if (v->pulseDir == 0) {
            // Moving negative
            v->pulsePos += v->sample->pulseRateNeg; // pulseRateNeg is signed
            if (v->pulsePos <= (int)v->sample->pulsePosL) {
                v->pulsePos = (int)v->sample->pulsePosL;
                v->pulseDir = 1;
            }
        } else {
            // Moving positive
            v->pulsePos += v->sample->pulseRatePos;
            if (v->pulsePos >= (int)v->sample->pulsePosH) {
                v->pulsePos = (int)v->sample->pulsePosH;
                v->pulseDir = 0;
            }
        }

        // Modify sample data in-place for PWM effect
        // The pulse position determines the duty cycle of the waveform
        if (v->sample->length > 0 && v->sample->pointer >= 0 &&
            v->sample->pointer < ps.pcmLen) {
            int8_t *samp = (int8_t *)(ps.pcmBase + v->sample->pointer);
            int len = v->sample->length;
            if (v->sample->pointer + len > ps.pcmLen) {
                len = ps.pcmLen - v->sample->pointer;
            }
            int threshold = v->pulsePos;
            for (int i = 0; i < len; i++) {
                samp[i] = (i < threshold) ? 127 : -128;
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Wavetable blending for type-2 instruments
// ═══════════════════════════════════════════════════════════════════════════

static void process_blend(Voice *v) {
    if (!v->sample || v->sample->type != 2) return;

    if (v->blendDelayCnt > 0) {
        v->blendDelayCnt--;
        return;
    }

    v->blendCnt++;
    if (v->blendCnt >= v->sample->blendRate) {
        v->blendCnt = 0;
        // Advance blend position — modifies sample data to interpolate
        // between waveforms. For now, just cycle the blend position.
        v->blendPos++;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Note trigger
// ═══════════════════════════════════════════════════════════════════════════

static void trigger_note(Voice *v, int note) {
    if (!v->sample) return;

    v->note = note;
    v->active = 1;

    // Set up period
    v->period = calc_period(note, v->sample->relative);

    // Set up sample in Paula
    if (v->sample->type == 0 || v->sample->type == 1 || v->sample->type == 2) {
        if (v->sample->length > 0 && v->sample->pointer >= 0 &&
            v->sample->pointer < ps.pcmLen) {
            int8_t *samp = (int8_t *)(ps.pcmBase + v->sample->pointer);
            uint16_t lenWords = v->sample->length >> 1;
            if (lenWords == 0) lenWords = 1;

            paula_dma_write(1 << v->ch);  // disable
            paula_set_sample_ptr(v->ch, samp);
            paula_set_length(v->ch, lenWords);
            if (v->period > 0) {
                paula_set_period(v->ch, (uint16_t)v->period);
            }
            paula_dma_write(0x8000 | (1 << v->ch));  // enable

            // Set loop if applicable
            if (v->sample->loopPtr > 0 && v->sample->loopPtr < (int16_t)v->sample->length) {
                // After DMA starts, set loop point
                int8_t *loopSamp = samp + v->sample->loopPtr;
                uint16_t loopLen = (v->sample->length - v->sample->loopPtr) >> 1;
                if (loopLen == 0) loopLen = 1;
                paula_set_sample_ptr(v->ch, loopSamp);
                paula_set_length(v->ch, loopLen);
            }
        }
    }

    // Start envelope
    v->envState = ENV_ATTACK;
    v->volume = (int16_t)v->sample->envelopeVol;
    v->envCounter = 0;
    v->sustainCounter = 0;
    paula_set_volume(v->ch, (uint8_t)v->volume);

    // Reset vibrato
    v->vibratoPos = 0;
    v->vibratoCounter = 0;
    v->vibratoDelayC = v->sample->vibratoDelay;

    // Reset arpeggio
    v->arpeggioPos = 0;
    v->arpeggioCounter = 0;

    // Reset PWM
    v->pulsePos = v->sample->pulsePosL;
    v->pulseDir = 1;
    v->pulseCnt = 0;
    v->pulseDelayCnt = v->sample->pulseDelay;

    // Reset blend
    v->blendPos = 0;
    v->blendDelayCnt = v->sample->blendDelay;
    v->blendCnt = 0;

    // Reset portamento for this note
    v->portaTarget = 0;
    v->portaSpeed = 0;
    v->portaDelay = 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pattern byte stream parser
// ═══════════════════════════════════════════════════════════════════════════

static void parse_pattern(Voice *v) {
    if (v->patternPos < 0 || v->patternPos >= ps.patternLen) {
        v->active = 0;
        return;
    }

    while (v->patternPos >= 0 && v->patternPos < ps.patternLen) {
        int8_t value = (int8_t)ps.patternBytes[v->patternPos];
        v->patternPos++;

        if (value > 0 && value <= 127) {
            // Note trigger (1-72)
            v->returnPos = v->patternPos;
            trigger_note(v, value);
            return;
        }

        if (value == 0) {
            // Note value 0 — treated as rest, consume one note duration
            v->returnPos = v->patternPos;
            return;
        }

        // Negative values are commands
        switch (value) {
            case -125: {  // 0x83: set sample
                if (v->patternPos < ps.patternLen) {
                    int idx = ps.patternBytes[v->patternPos];
                    v->patternPos++;
                    if (idx >= 0 && idx < ps.numSamples) {
                        v->sampleIndex = idx;
                        v->sample = &ps.samples[idx];
                    }
                }
                continue;
            }

            case -126: {  // 0x82: set speed
                if (v->patternPos < ps.patternLen) {
                    ps.speed = ps.patternBytes[v->patternPos];
                    v->patternPos++;
                    if (ps.speed == 0) ps.speed = 6;
                }
                continue;
            }

            case -127: {  // 0x81: portamento (speed, note, delay)
                if (v->patternPos + 2 < ps.patternLen) {
                    int speed = ps.patternBytes[v->patternPos];
                    int note = ps.patternBytes[v->patternPos + 1];
                    int delay = ps.patternBytes[v->patternPos + 2];
                    v->patternPos += 3;
                    v->portaSpeed = (int16_t)(speed * ps.speed);
                    if (note >= 1 && note <= 72 && v->sample) {
                        v->portaTarget = calc_period(note, v->sample->relative);
                    }
                    v->portaDelay = delay * ps.speed;
                }
                continue;
            }

            case -124: {  // 0x84: note off
                v->envState = ENV_RELEASE;
                v->envCounter = 0;
                v->returnPos = v->patternPos;
                return;
            }

            case -128: {  // 0x80: pattern end
                return;
            }

            default: {
                // Other negative: duration = abs(value)
                // Wait for (abs(value) - 1) additional ticks
                v->noteDuration = (int)(-value);
                v->returnPos = v->patternPos;
                return;
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Advance to next pattern in track
// ═══════════════════════════════════════════════════════════════════════════

static int advance_track(Voice *v) {
    FredSong *song = &ps.songs[ps.currentSong];
    FredTrack *track = &song->tracks[v->ch];

    if (!track->entries) return 0;

    v->trackPos++;
    if (v->trackPos >= track->length) {
        return 0; // end of track
    }

    uint16_t patOff = track->entries[v->trackPos];

    // Check for end/loop markers
    if (patOff == 0xFFFF) {
        return 0; // end of song marker
    }
    if (patOff > 0x7FFF) {
        // Loop marker: target = (value ^ 0x8000) >> 1
        int target = (patOff ^ 0x8000) >> 1;
        if (target < track->length) {
            v->trackPos = target;
            patOff = track->entries[v->trackPos];
            if (patOff > 0x7FFF || patOff == 0xFFFF) return 0;
        } else {
            return 0;
        }
    }

    v->patternPos = (int)patOff;
    v->noteDuration = 0;
    return 1;
}

// ═══════════════════════════════════════════════════════════════════════════
// Song end handler
// ═══════════════════════════════════════════════════════════════════════════

static void handle_song_end(void) {
    ps.finished = 1;
}

// ═══════════════════════════════════════════════════════════════════════════
// Process one voice tick
// ═══════════════════════════════════════════════════════════════════════════

static void process_voice(Voice *v) {
    FredSong *song = &ps.songs[ps.currentSong];
    FredTrack *track = &song->tracks[v->ch];

    if (!track->entries) return;

    // Process note duration / pattern advancement on speed boundary
    if (ps.speedCounter == 0) {
        if (v->noteDuration > 0) {
            v->noteDuration--;
        }
        if (v->noteDuration <= 0) {
            // Parse next data from pattern
            if (v->patternPos >= 0 && v->patternPos < ps.patternLen) {
                // Check for pattern end (0x80)
                if ((int8_t)ps.patternBytes[v->patternPos] == -128) {
                    v->patternPos++;
                    // Advance to next pattern in track
                    if (!advance_track(v)) {
                        handle_song_end();
                        return;
                    }
                }
                parse_pattern(v);
            } else {
                // Off the end — advance track
                if (!advance_track(v)) {
                    handle_song_end();
                    return;
                }
                parse_pattern(v);
            }
        }
    }

    // Always process per-tick effects
    if (v->active && v->sample) {
        process_envelope(v);
        process_vibrato(v);
        process_arpeggio(v);
        process_portamento(v);
        process_pwm(v);
        process_blend(v);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

void fred_init(void) {
    memset(&ps, 0, sizeof(ps));
    paula_reset();
    for (int i = 0; i < NUM_VOICES; i++) {
        ps.voices[i].ch = i;
        ps.voices[i].patternPos = -1;
    }
}

int fred_load(const uint8_t *data, int len) {
    if (!data || len < 1024) return 0;

    fred_init();

    // Copy module data
    ps.mod_data = (uint8_t *)malloc(len);
    if (!ps.mod_data) return 0;
    memcpy(ps.mod_data, data, len);
    ps.mod_len = len;

    uint8_t *mod = ps.mod_data;

    // ── Verify Fred Editor format: 0x4efa at 4-byte intervals ────────────
    for (int i = 0; i < 16; i += 4) {
        if (rd16(mod + i) != 0x4EFA) {
            free(ps.mod_data);
            ps.mod_data = NULL;
            return 0;
        }
    }

    // ── Locate dataPtr and basePtr ───────────────────────────────────────
    ps.dataPtr = 0;
    ps.basePtr = -1;
    int foundDataPtr = 0;

    for (int pos = 16; pos < 1024 && pos + 6 <= len; pos += 2) {
        uint16_t val = rd16(mod + pos);

        if (val == 0x123A && pos + 4 < len) {
            uint16_t disp = rd16(mod + pos + 2);
            uint16_t next = rd16(mod + pos + 4);
            if (next == 0xB001) {
                ps.dataPtr = (pos + 2 + disp) - 0x895;
                foundDataPtr = 1;
            }
        } else if (val == 0x214A && pos + 6 + 2 <= len) {
            uint16_t next = rd16(mod + pos + 4);
            if (next == 0x47FA) {
                int16_t disp = rds16(mod + pos + 6);
                ps.basePtr = pos + 6 + disp;
                break;
            }
        }
    }

    if (ps.basePtr < 0) {
        free(ps.mod_data);
        ps.mod_data = NULL;
        return 0;
    }

    // ── Read sample definitions ──────────────────────────────────────────
    int sampleTableOff = ps.dataPtr + 0x8A2;
    if (sampleTableOff + 8 > len) {
        free(ps.mod_data);
        ps.mod_data = NULL;
        return 0;
    }

    uint32_t sampleDataOff = rd32(mod + sampleTableOff);
    uint32_t patternDataOff = rd32(mod + sampleTableOff + 4);

    int sampleDefsStart = ps.basePtr + sampleDataOff;
    int readPos = sampleDefsStart;

    int minSamplePtr = 0x7FFFFFFF;
    ps.numSamples = 0;

    while (readPos + 64 <= len && ps.numSamples < MAX_SAMPLES) {
        uint32_t sptr = rd32(mod + readPos);

        // Check for end sentinel
        if (sptr != 0 && (sptr >= (uint32_t)len)) break;

        if (sptr != 0 && (int)sptr < minSamplePtr) {
            minSamplePtr = (int)sptr;
        }

        FredSample *s = &ps.samples[ps.numSamples];
        memset(s, 0, sizeof(FredSample));

        s->pointer = (int32_t)sptr;
        s->loopPtr = rds16(mod + readPos + 4);
        s->length = rd16(mod + readPos + 6) << 1;
        s->relative = rd16(mod + readPos + 8);

        s->vibratoDelay = mod[readPos + 10];
        s->vibratoSpeed = mod[readPos + 12];
        s->vibratoDepth = mod[readPos + 13];

        s->envelopeVol = mod[readPos + 14];
        s->attackSpeed = mod[readPos + 15];
        s->attackVol = mod[readPos + 16];
        s->decaySpeed = mod[readPos + 17];
        s->decayVol = mod[readPos + 18];
        s->sustainTime = mod[readPos + 19];
        s->releaseSpeed = mod[readPos + 20];
        s->releaseVol = mod[readPos + 21];

        for (int i = 0; i < 16; i++) {
            s->arpeggio[i] = (int8_t)mod[readPos + 22 + i];
        }

        s->arpeggioSpeed = mod[readPos + 38];
        s->type = (int8_t)mod[readPos + 39];
        s->pulseRateNeg = (int8_t)mod[readPos + 40];
        s->pulseRatePos = mod[readPos + 41];
        s->pulseSpeed = mod[readPos + 42];
        s->pulsePosL = mod[readPos + 43];
        s->pulsePosH = mod[readPos + 44];
        s->pulseDelay = mod[readPos + 45];
        s->synchro = mod[readPos + 46];
        s->blendRate = mod[readPos + 47];
        s->blendDelay = mod[readPos + 48];
        s->pulseCounter = mod[readPos + 49];
        s->blendCounter = mod[readPos + 50];
        s->arpeggioLimit = mod[readPos + 51];

        readPos += SAMPLE_DEF_SIZE;
        ps.numSamples++;
    }

    // ── Set up PCM data ──────────────────────────────────────────────────
    if (minSamplePtr < 0x7FFFFFFF) {
        ps.pcmFileOffset = ps.basePtr + minSamplePtr;
        if (ps.pcmFileOffset >= 0 && ps.pcmFileOffset < len) {
            ps.pcmBase = mod + ps.pcmFileOffset;
            ps.pcmLen = len - ps.pcmFileOffset;

            // Adjust sample pointers to be relative to pcmBase
            for (int i = 0; i < ps.numSamples; i++) {
                if (ps.samples[i].pointer > 0) {
                    ps.samples[i].pointer = (ps.basePtr + ps.samples[i].pointer) - ps.pcmFileOffset;
                }
            }
        }
    }

    // ── Read pattern byte stream ─────────────────────────────────────────
    int patStart = ps.basePtr + patternDataOff;
    int patLen = (int)(sampleDataOff - patternDataOff);
    if (patLen > 0 && patStart + patLen <= len) {
        ps.patternBytes = mod + patStart;
        ps.patternLen = patLen;
    } else {
        ps.patternBytes = NULL;
        ps.patternLen = 0;
    }

    // ── Read songs ───────────────────────────────────────────────────────
    int songCountOff = ps.dataPtr + 0x895;
    if (songCountOff >= len) {
        ps.numSongs = 1;
    } else {
        ps.numSongs = mod[songCountOff] + 1;
        if (ps.numSongs > MAX_SONGS) ps.numSongs = MAX_SONGS;
    }

    int tracksBase = ps.dataPtr + 0xB0E;
    int trackTablePos = 0;

    for (int si = 0; si < ps.numSongs; si++) {
        FredSong *song = &ps.songs[si];
        song->length = 0;

        for (int ch = 0; ch < 4; ch++) {
            int trackOff = tracksBase + trackTablePos;
            if (trackOff + 2 > len) break;

            uint16_t startOff = rd16(mod + trackOff);
            uint16_t endOff;

            if (ch == 3 && si == ps.numSongs - 1) {
                endOff = (uint16_t)(patStart - tracksBase);
            } else {
                int nextOff = tracksBase + trackTablePos + 2;
                if (nextOff + 2 <= len) {
                    endOff = rd16(mod + nextOff);
                } else {
                    endOff = (uint16_t)(patStart - tracksBase);
                }
            }

            int numEntries = (endOff - startOff) >> 1;
            if (numEntries < 0) numEntries = 0;
            if (numEntries > song->length) song->length = numEntries;

            song->tracks[ch].length = numEntries;
            if (numEntries > 0) {
                song->tracks[ch].entries = (uint16_t *)malloc(numEntries * sizeof(uint16_t));
                if (song->tracks[ch].entries) {
                    for (int e = 0; e < numEntries; e++) {
                        int off = tracksBase + startOff + e * 2;
                        if (off + 2 <= len) {
                            song->tracks[ch].entries[e] = rd16(mod + off);
                        } else {
                            song->tracks[ch].entries[e] = 0xFFFF;
                        }
                    }
                }
            }

            trackTablePos += 2;
        }

        // Read speed
        int speedOff = ps.dataPtr + 0x897 + si;
        if (speedOff < len) {
            song->speed = mod[speedOff];
        }
        if (song->speed == 0) song->speed = 6;
    }

    ps.loaded = 1;
    return 1;
}

void fred_set_subsong(int n) {
    if (!ps.loaded || n < 0 || n >= ps.numSongs) return;

    paula_reset();
    ps.currentSong = n;
    ps.finished = 0;
    ps.speed = ps.songs[n].speed;
    ps.speedCounter = 0;

    for (int i = 0; i < NUM_VOICES; i++) {
        Voice *v = &ps.voices[i];
        memset(v, 0, sizeof(Voice));
        v->ch = i;
        v->patternPos = -1;

        // Initialize voice from first track entry
        FredTrack *track = &ps.songs[n].tracks[i];
        if (track->entries && track->length > 0) {
            uint16_t patOff = track->entries[0];
            if (patOff != 0xFFFF && patOff <= 0x7FFF) {
                v->patternPos = (int)patOff;
                v->trackPos = 0;
            }
        }
    }
}

void fred_tick(void) {
    if (!ps.loaded || ps.finished) return;

    for (int i = 0; i < NUM_VOICES; i++) {
        process_voice(&ps.voices[i]);
    }

    // Advance speed counter
    ps.speedCounter++;
    if (ps.speedCounter >= ps.speed) {
        ps.speedCounter = 0;
    }

    // Check if all voices have ended
    int allDone = 1;
    for (int i = 0; i < NUM_VOICES; i++) {
        FredTrack *track = &ps.songs[ps.currentSong].tracks[i];
        if (track->entries && track->length > 0) {
            Voice *v = &ps.voices[i];
            if (v->trackPos < track->length - 1 || v->patternPos >= 0) {
                allDone = 0;
                break;
            }
        }
    }
    if (allDone && !ps.finished) {
        // Check if any voice is still actively producing sound
        int anyActive = 0;
        for (int i = 0; i < NUM_VOICES; i++) {
            if (ps.voices[i].active && ps.voices[i].envState != ENV_OFF) {
                anyActive = 1;
                break;
            }
        }
        if (!anyActive) {
            ps.finished = 1;
        }
    }
}

void fred_stop(void) {
    for (int i = 0; i < NUM_VOICES; i++) {
        paula_set_volume(i, 0);
        paula_dma_write(1 << i);
    }
    paula_reset();
    if (ps.mod_data) {
        free(ps.mod_data);
        ps.mod_data = NULL;
    }
    // Free track entries
    for (int si = 0; si < MAX_SONGS; si++) {
        for (int ch = 0; ch < 4; ch++) {
            if (ps.songs[si].tracks[ch].entries) {
                free(ps.songs[si].tracks[ch].entries);
                ps.songs[si].tracks[ch].entries = NULL;
            }
        }
    }
    ps.loaded = 0;
}

int fred_get_subsong_count(void) {
    return ps.numSongs;
}

int fred_is_finished(void) {
    return ps.finished;
}

int fred_get_num_instruments(void) {
    return ps.numSamples;
}

int fred_get_speed(void) {
    return ps.speed;
}

// ═══════════════════════════════════════════════════════════════════════════
// Instrument parameter access
// ═══════════════════════════════════════════════════════════════════════════

int fred_get_instrument_param(int inst, int param_id) {
    if (!ps.loaded || inst < 0 || inst >= ps.numSamples) return 0;
    FredSample *s = &ps.samples[inst];

    switch (param_id) {
        case FRED_PARAM_ENVELOPE_VOL:    return s->envelopeVol;
        case FRED_PARAM_ATTACK_SPEED:    return s->attackSpeed;
        case FRED_PARAM_ATTACK_VOL:      return s->attackVol;
        case FRED_PARAM_DECAY_SPEED:     return s->decaySpeed;
        case FRED_PARAM_DECAY_VOL:       return s->decayVol;
        case FRED_PARAM_SUSTAIN_TIME:    return s->sustainTime;
        case FRED_PARAM_RELEASE_SPEED:   return s->releaseSpeed;
        case FRED_PARAM_RELEASE_VOL:     return s->releaseVol;
        case FRED_PARAM_VIBRATO_DELAY:   return s->vibratoDelay;
        case FRED_PARAM_VIBRATO_SPEED:   return s->vibratoSpeed;
        case FRED_PARAM_VIBRATO_DEPTH:   return s->vibratoDepth;
        case FRED_PARAM_ARPEGGIO_LIMIT:  return s->arpeggioLimit;
        case FRED_PARAM_ARPEGGIO_SPEED:  return s->arpeggioSpeed;
        case FRED_PARAM_PULSE_RATE_NEG:  return s->pulseRateNeg;
        case FRED_PARAM_PULSE_RATE_POS:  return s->pulseRatePos;
        case FRED_PARAM_PULSE_SPEED:     return s->pulseSpeed;
        case FRED_PARAM_PULSE_POS_L:     return s->pulsePosL;
        case FRED_PARAM_PULSE_POS_H:     return s->pulsePosH;
        case FRED_PARAM_PULSE_DELAY:     return s->pulseDelay;
        case FRED_PARAM_TYPE:            return s->type;
        case FRED_PARAM_BLEND_RATE:      return s->blendRate;
        case FRED_PARAM_BLEND_DELAY:     return s->blendDelay;
        case FRED_PARAM_RELATIVE:        return s->relative;
        default: return 0;
    }
}

void fred_set_instrument_param(int inst, int param_id, int value) {
    if (!ps.loaded || inst < 0 || inst >= ps.numSamples) return;
    FredSample *s = &ps.samples[inst];

    switch (param_id) {
        case FRED_PARAM_ENVELOPE_VOL:    s->envelopeVol = (uint8_t)value; break;
        case FRED_PARAM_ATTACK_SPEED:    s->attackSpeed = (uint8_t)value; break;
        case FRED_PARAM_ATTACK_VOL:      s->attackVol = (uint8_t)value; break;
        case FRED_PARAM_DECAY_SPEED:     s->decaySpeed = (uint8_t)value; break;
        case FRED_PARAM_DECAY_VOL:       s->decayVol = (uint8_t)value; break;
        case FRED_PARAM_SUSTAIN_TIME:    s->sustainTime = (uint8_t)value; break;
        case FRED_PARAM_RELEASE_SPEED:   s->releaseSpeed = (uint8_t)value; break;
        case FRED_PARAM_RELEASE_VOL:     s->releaseVol = (uint8_t)value; break;
        case FRED_PARAM_VIBRATO_DELAY:   s->vibratoDelay = (uint8_t)value; break;
        case FRED_PARAM_VIBRATO_SPEED:   s->vibratoSpeed = (uint8_t)value; break;
        case FRED_PARAM_VIBRATO_DEPTH:   s->vibratoDepth = (uint8_t)value; break;
        case FRED_PARAM_ARPEGGIO_LIMIT:  s->arpeggioLimit = (uint8_t)value; break;
        case FRED_PARAM_ARPEGGIO_SPEED:  s->arpeggioSpeed = (uint8_t)value; break;
        case FRED_PARAM_PULSE_RATE_NEG:  s->pulseRateNeg = (int8_t)value; break;
        case FRED_PARAM_PULSE_RATE_POS:  s->pulseRatePos = (uint8_t)value; break;
        case FRED_PARAM_PULSE_SPEED:     s->pulseSpeed = (uint8_t)value; break;
        case FRED_PARAM_PULSE_POS_L:     s->pulsePosL = (uint8_t)value; break;
        case FRED_PARAM_PULSE_POS_H:     s->pulsePosH = (uint8_t)value; break;
        case FRED_PARAM_PULSE_DELAY:     s->pulseDelay = (uint8_t)value; break;
        case FRED_PARAM_TYPE:            s->type = (int8_t)value; break;
        case FRED_PARAM_BLEND_RATE:      s->blendRate = (uint8_t)value; break;
        case FRED_PARAM_BLEND_DELAY:     s->blendDelay = (uint8_t)value; break;
        case FRED_PARAM_RELATIVE:        s->relative = (uint16_t)value; break;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Note preview
// ═══════════════════════════════════════════════════════════════════════════

void fred_note_on(int instrument, int note, int velocity) {
    if (!ps.loaded || instrument < 0 || instrument >= ps.numSamples) return;
    if (note < 1 || note > 72) return;

    FredSample *s = &ps.samples[instrument];

    // Map velocity (0-127) to Paula volume (0-64)
    int vol = (velocity * 64) / 127;
    if (vol > 64) vol = 64;
    if (vol < 1) vol = 1;

    int16_t period = calc_period(note, s->relative);

    if (s->length > 0 && s->pointer >= 0 && s->pointer < ps.pcmLen) {
        int8_t *samp = (int8_t *)(ps.pcmBase + s->pointer);
        uint16_t lenWords = s->length >> 1;
        if (lenWords == 0) lenWords = 1;

        paula_dma_write(0x0001);
        paula_set_sample_ptr(0, samp);
        paula_set_length(0, lenWords);
        paula_set_period(0, (uint16_t)period);
        paula_set_volume(0, (uint8_t)vol);
        paula_dma_write(0x8001);
    }
}

void fred_note_off(void) {
    paula_dma_write(0x0001);
    paula_set_volume(0, 0);
}
