// steveturner.c — Steve Turner format replayer
// Faithful translation from 68k ASM: Steve Turner_v4.asm (Wanted Team / DeliTracker)
// Original player (c) 1989-90 Steve Turner, adapted by Mr.Larmer/Wanted Team

#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include "paula_soft.h"
#include "steveturner.h"

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

#define NUM_VOICES   4
#define INST_SIZE    0x30   // 48 bytes per instrument

// Instrument structure byte offsets (from instrument base pointer)
#define I_PRIO       0x1E
#define I_SAMPLE     0x1F
#define I_DELAY      0x20
#define I_ENV1_DUR   0x21
#define I_ENV1_DELTA 0x22
#define I_ENV2_DUR   0x23
#define I_ENV2_DELTA 0x24
#define I_SHIFT      0x25
#define I_OSC_CNT    0x26   // word (big-endian)
#define I_OSC_DELTA  0x28
#define I_OSC_LOOP   0x29
#define I_DECAY      0x2A
#define I_NUM_VIB    0x2B
#define I_VIB_DLY    0x2C
#define I_VIB_SPD    0x2D
#define I_VIB_MAX    0x2E
#define I_CHAIN      0x2F

// Max vibrato table entries per voice
#define MAX_VIB      5

// ═══════════════════════════════════════════════════════════════════════════
// Function state machine IDs (replacing 68k function pointers)
// ═══════════════════════════════════════════════════════════════════════════

typedef enum {
    FN_NOP = 0,
    // Pattern parse states
    FN_PARSE_PATTERN,     // lbC0007A4
    FN_WAIT_DURATION,     // lbC0008BC
    // Envelope states
    FN_ENV1,              // lbC000942
    FN_ENV2,              // lbC000952
    FN_ENV3,              // lbC0009AA
    FN_ENV4,              // lbC0009CE
    FN_ENV5,              // lbC0009F0
    FN_ENV6,              // lbC000A1C
    FN_ENV7,              // lbC000A3E
    // Vibrato states
    FN_VIB_START,         // lbC000B22
    FN_VIB_TICK,          // lbC000B3C
    FN_VIB_ADVANCE,       // lbC000B52
    // Pitch slide
    FN_SLIDE,             // lbC000C3E
} FuncState;

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

typedef struct {
    int16_t  cur;          // current period value
    int16_t  init_val;     // initial/reset value
    int16_t  inc;          // increment per inner step
    uint8_t  cnt;          // inner loop duration (from instrument)
} VibEntry;

typedef struct {
    // Vibrato waveform entries
    VibEntry vib[MAX_VIB];

    // Secondary trigger (delayed retrigger mechanism)
    uint8_t  sec_countdown;   // $1E: countdown to fire (0 → check; reset: wraps)
    uint8_t  sec_prio;        // $1F: priority
    int16_t  sec_offset;      // $20-$21: instrument offset (-1 = inactive)

    // Current instrument state
    uint8_t  inst_num;        // $22
    uint8_t  inst_prio;       // $23: priority of active instrument
    uint16_t inst_offset;     // $24-$25

    // Envelope state
    FuncState env_func;       // $26
    int16_t  env_counter;     // $2A-$2B: segment countdown (word)
    int8_t   env_delta;       // $2C: volume delta per tick
    uint8_t  env_loop_sub;    // $2D: oscillation direction toggle counter

    // Volume
    int16_t  volume;          // $2E-$2F: current volume (0-255)

    // Instrument data pointer
    uint8_t *inst_ptr;        // $30 (A3 in ASM)

    // Function state IDs
    FuncState func34;         // $34 (always NOP in this player)
    FuncState vib_func;       // $38
    FuncState slide_func;     // $3C

    // Vibrato state
    int      vib_entry;       // current voice vibrato entry index
    int      vib_inst_entry;  // current instrument vibrato entry index
    uint8_t  vib_phase;       // $44: phase counter
    uint8_t  vib_sub;         // $45: inner loop counter
    uint8_t  vib_outer;       // $46: outer loop counter
    uint8_t  vib_dur;         // $47: duration counter
    uint8_t  vib_delay;       // $48: initial delay
    uint8_t  vib_speed_cnt;   // $49: speed counter
    int8_t   vib_depth;       // $4A: current depth (signed)

    // Pattern state
    FuncState pat_func;       // $4C
    uint8_t *pat_pos;         // $50: pattern order pointer
    uint8_t *pat_return;      // $54: data stream return pointer

    // Note state
    uint8_t  note_dur_set;    // $58: note duration (from command)
    uint8_t  note_dur;        // $59: duration countdown

    // Pitch slide state
    int16_t  slide_target;    // $5A: target period
    uint8_t  slide_shift;     // $5C: slide rate (shift amount)

    // Instrument selection (from D0-EF commands)
    uint8_t  cur_prio;        // $5D
    uint16_t cur_inst_ofs;    // $5E

    // Init state
    uint8_t  env_init;        // $60: delay flag from instrument

    // Loop count (envelope repetition)
    uint16_t loop_count;      // $18

    // Channel index (0-3) for paula_soft
    int      ch;
} Voice;

typedef struct {
    uint8_t *mod_data;        // module data buffer (owned)
    int      mod_len;

    // Module pointers (derived from header)
    uint8_t *seq_base;        // $1242: sequence table base
    uint8_t *ofs_base;        // $1246: pattern offset table
    uint8_t *inst_base;       // $124A: instrument data base
    uint8_t *samp_base;       // $124E: sample pointer table

    // Playback state
    int16_t  master_vol;      // $1256: current volume (0-255)
    int16_t  fade_target;     // $1258: volume fade target
    int16_t  fade_speed;      // $125A: fade speed (signed)
    uint16_t next_subsong;    // $125C: pending subsong trigger
    uint8_t  song_restart;    // $125E: restart byte
    uint8_t  priority;        // $125F: current priority level
    uint8_t  speed_override;  // $1261: speed override
    uint8_t  speed;           // $1262: speed value
    uint8_t  speed_counter;   // $1263: tick countdown

    Voice    voices[NUM_VOICES];

    int      num_subsongs;
    int      num_instruments;
    int      finished;
    int      loaded;
} PlayerState;

// ═══════════════════════════════════════════════════════════════════════════
// Frequency table (lbW000000 — 84 period values for PAL Amiga)
// ═══════════════════════════════════════════════════════════════════════════

static const uint16_t freq_table[] = {
    0xEEE4, 0xE17B, 0xD4D4, 0xC8E1, 0xBD9C, 0xB2F6, 0xA8EC, 0x9F71,
    0x967D, 0x8E0B, 0x8612, 0x7E8C, 0x7772, 0x70BE, 0x6A6A, 0x6471,
    0x5ECE, 0x597B, 0x5476, 0x4FB9, 0x4B3F, 0x4706, 0x4309, 0x3F46,
    0x3BB9, 0x385F, 0x3535, 0x3239, 0x2F67, 0x2CBE, 0x2A3B, 0x27DD,
    0x25A0, 0x2383, 0x2185, 0x1FA3, 0x1DDD, 0x1C30, 0x1A9B, 0x191D,
    0x17B4, 0x165F, 0x151E, 0x13EF, 0x12D0, 0x11C2, 0x10C3, 0x0FD2,
    0x0EEF, 0x0E18, 0x0D4E, 0x0C8F, 0x0BDA, 0x0B30, 0x0A8F, 0x09F8,
    0x0968, 0x08E1, 0x0862, 0x07E9, 0x0778, 0x070C, 0x06A7, 0x0648,
    0x05ED, 0x0598, 0x0548, 0x04FC, 0x04B4, 0x0471, 0x0431, 0x03F5,
    0x03BC, 0x0386, 0x0354, 0x0324, 0x02F7, 0x02CC, 0x02A4, 0x027E,
    0x025A, 0x0239, 0x0219, 0x01FB,
};
#define FREQ_TABLE_SIZE (int)(sizeof(freq_table) / sizeof(freq_table[0]))

// Silence sample for loop-to-silence (4 bytes)
static const int8_t silence_sample[4] = {0, 0, 0, 0};

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

// Instrument vibrato entry access (10 bytes per entry in instrument data)
static inline int16_t ivib_word(const uint8_t *inst, int entry, int off) {
    return rds16(inst + entry * 10 + off);
}
static inline uint8_t ivib_byte(const uint8_t *inst, int entry, int off) {
    return inst[entry * 10 + off];
}

// ═══════════════════════════════════════════════════════════════════════════
// Forward declarations
// ═══════════════════════════════════════════════════════════════════════════

static void reset_voice(Voice *v);
static void trigger_note(Voice *v, uint16_t inst_offset, uint8_t prio);
static void init_vibrato(Voice *v);
static void parse_data_stream(Voice *v, uint8_t *ptr);

// ═══════════════════════════════════════════════════════════════════════════
// Voice reset (lbC0005F0)
// ═══════════════════════════════════════════════════════════════════════════

static void reset_voice(Voice *v) {
    int ch = v->ch;

    // Clear trigger/secondary to inactive ($0000FFFF pattern)
    v->sec_countdown = 0;
    v->sec_prio = 0;
    v->sec_offset = -1;
    v->inst_num = 0;
    v->inst_prio = 0;
    v->inst_offset = 0xFFFF;

    // All function states to NOP
    v->pat_func = FN_NOP;
    v->env_func = FN_NOP;
    v->func34 = FN_NOP;
    v->vib_func = FN_NOP;
    v->slide_func = FN_NOP;

    v->slide_shift = 0;

    // Disable DMA for this channel
    paula_dma_write(1 << ch);

    v->ch = ch;
}

// Stop all voices (lbC0005C2)
static void stop_all(void) {
    ps.song_restart = 0;
    ps.priority = 0;
    ps.next_subsong = 0;

    for (int i = 0; i < NUM_VOICES; i++) {
        reset_voice(&ps.voices[i]);
    }
    for (int i = 0; i < NUM_VOICES; i++) {
        paula_set_volume(i, 0);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Volume/envelope processing
// ═══════════════════════════════════════════════════════════════════════════

// lbC000AA6 — Apply envelope delta, clamp to [0, master_vol], write to Paula
static void apply_envelope(Voice *v) {
    int16_t vol = v->volume + (int16_t)v->env_delta;
    if (vol < 0) vol = 0;
    else if (vol > ps.master_vol) vol = ps.master_vol;
    v->volume = vol;

    // Paula volume = vol >> 2 (range 0-63)
    paula_set_volume(v->ch, (uint8_t)(vol >> 2));
}

// ═══════════════════════════════════════════════════════════════════════════
// Envelope state machine
// ═══════════════════════════════════════════════════════════════════════════

// Phase 1 (lbC000942): DMA control
static void env_phase1(Voice *v) {
    paula_dma_write(1 << v->ch);                    // disable
    v->env_func = FN_ENV2;
}

// Phase 2 (lbC000952): Volume init + DMA enable
static void env_phase2(Voice *v) {
    // Clear volume
    paula_set_volume(v->ch, 0);

    // Enable DMA
    paula_dma_write(0x8000 | (1 << v->ch));

    // Read init delay
    uint8_t *inst = v->inst_ptr;
    uint8_t delay = inst[I_DELAY];
    v->loop_count = delay;
    v->env_init = delay;

    if (delay == 0) {
        // No delay: set volume immediately
        v->volume = ps.master_vol;
        paula_set_volume(v->ch, (uint8_t)(ps.master_vol >> 2));
        v->loop_count = 1;
    } else {
        v->volume = 0;
    }

    // Set first envelope segment params
    // clr.w $2A + move.b inst[0x21] to $2B = counter is inst[0x21]
    v->env_counter = (int16_t)inst[I_ENV1_DUR];
    v->env_delta = (int8_t)inst[I_ENV1_DELTA];
    v->env_func = FN_ENV3;
}

// Phase 3 (lbC0009AA): Set loop-to-silence sample + first envelope tick
// In the ASM, lbC0009AA falls through to lbC0009CE (env_phase4 body).
// Both the silence setup AND the first apply_envelope happen in the SAME tick.
static void env_phase3(Voice *v) {
    if (v->env_init == 0) {
        // Set DMA to loop silence (1 word)
        paula_set_length(v->ch, 1);
        paula_set_sample_ptr(v->ch, silence_sample);
    }
    v->env_func = FN_ENV4;
    // ASM fall-through to lbC0009CE: apply envelope + decrement counter
    apply_envelope(v);
    v->env_counter--;
    if (v->env_counter == 0) {
        uint8_t *inst = v->inst_ptr;
        v->env_counter = (int16_t)inst[I_ENV2_DUR];
        v->env_delta = (int8_t)inst[I_ENV2_DELTA];
        v->env_func = FN_ENV5;
    }
}

// Phase 4 (lbC0009CE): First envelope segment
static void env_phase4(Voice *v) {
    apply_envelope(v);
    v->env_counter--;
    if (v->env_counter == 0) {
        // Transition to second segment
        uint8_t *inst = v->inst_ptr;
        v->env_counter = (int16_t)inst[I_ENV2_DUR];
        v->env_delta = (int8_t)inst[I_ENV2_DELTA];
        v->env_func = FN_ENV5;
    }
}

// Phase 5 (lbC0009F0): Second envelope segment
static void env_phase5(Voice *v) {
    apply_envelope(v);
    v->env_counter--;
    if (v->env_counter == 0) {
        // Transition to oscillation segment
        uint8_t *inst = v->inst_ptr;
        v->env_counter = rds16(inst + I_OSC_CNT);
        v->env_delta = (int8_t)inst[I_OSC_DELTA];
        v->env_func = FN_ENV6;
        // Init loop sub-counter + negate direction
        v->env_loop_sub = inst[I_OSC_LOOP];
        v->env_delta = -(v->env_delta);
    }
}

// Phase 6 (lbC000A1C): Oscillation segment
static void env_phase6(Voice *v) {
    apply_envelope(v);
    v->env_counter--;
    if (v->env_counter == 0) {
        // Done oscillating → decay
        uint8_t *inst = v->inst_ptr;
        v->env_delta = (int8_t)inst[I_DECAY];
        v->env_func = FN_ENV7;
        return;
    }
    v->env_loop_sub--;
    if (v->env_loop_sub == 0) {
        // Toggle direction (lbC000A10)
        uint8_t *inst = v->inst_ptr;
        v->env_loop_sub = inst[I_OSC_LOOP];
        v->env_delta = -(v->env_delta);
    }
}

// Phase 7 (lbC000A3E): Decay/release
static void env_phase7(Voice *v) {
    apply_envelope(v);

    if (v->volume != 0) return;  // still decaying

    // Volume reached 0 — check loop
    v->loop_count--;
    if (v->loop_count != 0) {
        // Restart from phase 2 inner path (lbC00098C)
        v->volume = 0;
        v->env_counter = (int16_t)v->inst_ptr[I_ENV1_DUR];
        v->env_delta = (int8_t)v->inst_ptr[I_ENV1_DELTA];
        v->env_func = FN_ENV3;
        return;
    }

    // Check instrument chain
    uint8_t chain = v->inst_ptr[I_CHAIN];
    if (chain != 0) {
        uint16_t offset = ((uint16_t)(chain - 1)) * INST_SIZE;
        uint8_t prio = ps.inst_base[offset + I_PRIO];
        trigger_note(v, offset, prio);
        return;
    }

    // Note off — silence channel
    paula_set_volume(v->ch, 0);
    paula_dma_write(1 << v->ch);

    v->env_func = FN_NOP;
    v->vib_func = FN_NOP;
    v->slide_func = FN_NOP;
    v->func34 = FN_NOP;
    v->inst_offset = 0xFFFF;
}

// ═══════════════════════════════════════════════════════════════════════════
// Vibrato state machine
// ═══════════════════════════════════════════════════════════════════════════

// Apply vibrato modulation + output period to Paula (lbC000BC4)
static void apply_vibrato(Voice *v) {
    uint8_t *inst = v->inst_ptr;
    uint8_t vib_speed = inst[I_VIB_SPD];

    if (vib_speed == 0) goto output;

    if (v->vib_delay > 0) {
        v->vib_delay--;
        goto output;
    }

    {
        int8_t depth = v->vib_depth;
        int vi = v->vib_entry;
        if (vi >= 0 && vi < MAX_VIB) {
            v->vib[vi].cur += (int16_t)depth;
        }

        v->vib_speed_cnt--;
        if (v->vib_speed_cnt == 0) {
            v->vib_speed_cnt = vib_speed;
            int8_t d = -depth;
            if (d >= 0) {
                // Was negative, now positive — check growth
                if (d < (int8_t)inst[I_VIB_MAX]) {
                    d++;
                }
            }
            v->vib_depth = d;
        }
    }

output:
    {
        int vi = v->vib_entry;
        if (vi < 0 || vi >= MAX_VIB) return;
        int16_t period = v->vib[vi].cur;
        uint8_t shift = inst[I_SHIFT];
        uint16_t out_period = (uint16_t)period >> shift;
        if (out_period > 0) {
            paula_set_period(v->ch, out_period);
        }
    }
}

// Initialize vibrato (lbC000AD0)
static void init_vibrato(Voice *v) {
    uint8_t *inst = v->inst_ptr;

    v->vib_delay = inst[I_VIB_DLY];
    v->vib_depth = 0;
    v->vib_phase = 1;
    v->vib_entry = 0;
    v->vib_inst_entry = 0;
    v->vib_speed_cnt = inst[I_VIB_SPD];
    if (v->vib_speed_cnt == 0) v->vib_speed_cnt = 1;

    memset(v->vib, 0, sizeof(v->vib));

    // Copy vibrato entries from instrument to voice
    uint8_t num_entries = inst[I_NUM_VIB];
    if (num_entries > MAX_VIB) num_entries = MAX_VIB;

    for (int i = 0; i < num_entries; i++) {
        int16_t init_val = ivib_word(inst, i, 0);
        v->vib[i].cur = init_val;
        v->vib[i].init_val = init_val;
        v->vib[i].inc = ivib_word(inst, i, 2);
        v->vib[i].cnt = ivib_byte(inst, i, 5);
    }

    if (num_entries > 0) {
        v->vib_func = FN_VIB_START;
    }
}

// Vibrato start (lbC000B22)
static void vib_start(Voice *v) {
    uint8_t *inst = v->inst_ptr;
    int ie = v->vib_inst_entry;
    int ve = v->vib_entry;

    v->vib_outer = ivib_byte(inst, ie, 4);
    v->vib_sub = (ve < MAX_VIB) ? v->vib[ve].cnt : 1;
    v->vib_dur = ivib_byte(inst, ie, 6);

    v->vib_func = FN_VIB_TICK;
}

// Vibrato tick (lbC000B3C)
static void vib_tick(Voice *v) {
    apply_vibrato(v);
    v->vib_dur--;
    if (v->vib_dur == 0) {
        v->vib_func = FN_VIB_ADVANCE;
    }
}

// Vibrato advance (lbC000B52)
static void vib_advance(Voice *v) {
    uint8_t *inst = v->inst_ptr;
    int ve = v->vib_entry;
    int ie = v->vib_inst_entry;

    if (ve >= MAX_VIB) { v->vib_func = FN_NOP; return; }

    // Advance increment by delta from instrument
    int8_t delta = (int8_t)ivib_byte(inst, ie, 7);
    v->vib[ve].inc += (int16_t)delta;

    // Add increment to current value
    v->vib[ve].cur += v->vib[ve].inc;

    // Decrement inner counter
    v->vib_sub--;
    if (v->vib_sub != 0) {
        // Continue with new duration
        v->vib_dur = ivib_byte(inst, ie, 6);
        v->vib_func = FN_VIB_TICK;
        return;
    }

    // Inner loop done — check flags
    uint8_t flags = ivib_byte(inst, ie, 8);
    if (flags & 1) {
        v->vib[ve].cur = v->vib[ve].init_val;
    }
    if (flags & 2) {
        v->vib[ve].inc = -v->vib[ve].inc;
    }
    if (flags & 4) {
        if (v->vib[ve].cnt > 8) {
            v->vib[ve].cnt--;
        }
    }

    // Decrement outer counter
    v->vib_outer--;
    if (v->vib_outer != 0) {
        v->vib_sub = v->vib[ve].cnt;
        v->vib_dur = ivib_byte(inst, ie, 6);
        v->vib_func = FN_VIB_TICK;
        return;
    }

    // Advance to next entry or loop back
    uint8_t num_entries = inst[I_NUM_VIB];
    v->vib_phase++;
    if (v->vib_phase > num_entries) {
        v->vib_phase = 1;
        v->vib_entry = 0;
        v->vib_inst_entry = 0;
    } else {
        v->vib_entry++;
        v->vib_inst_entry++;
    }

    v->vib_func = FN_VIB_START;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pitch slide
// ═══════════════════════════════════════════════════════════════════════════

// Start slide (lbC000C0E)
static void start_slide(Voice *v, uint16_t target_period) {
    if (v->slide_shift != 0) {
        // Slide enabled: save old as current, set new target
        v->vib[0].cur = v->slide_target;
        v->slide_target = (int16_t)target_period;
        v->vib[0].init_val = (int16_t)target_period;
        v->slide_func = FN_SLIDE;
    } else {
        // No slide: set period immediately
        v->slide_target = (int16_t)target_period;
        v->vib[0].cur = (int16_t)target_period;
        v->vib[0].init_val = (int16_t)target_period;
        v->slide_func = FN_NOP;
    }
}

// Pitch slide tick (lbC000C3E)
static void slide_tick(Voice *v) {
    int16_t target = v->slide_target;
    int16_t current = v->vib[0].cur;
    int16_t diff = target - current;

    diff >>= v->slide_shift;

    if (diff == 0) {
        v->vib[0].cur = target;
        v->slide_func = FN_NOP;
    } else {
        v->vib[0].cur += diff;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Note trigger (lbC0008D6)
// ═══════════════════════════════════════════════════════════════════════════

static void trigger_note(Voice *v, uint16_t inst_offset, uint8_t prio) {
    v->inst_offset = inst_offset;
    v->inst_prio = prio;
    v->inst_num = (uint8_t)(inst_offset / INST_SIZE + 1);

    uint8_t *inst = ps.inst_base + inst_offset;
    v->inst_ptr = inst;

    // Set up envelope
    v->env_func = FN_ENV1;
    v->vib_func = FN_NOP;
    v->slide_func = FN_NOP;
    v->func34 = FN_NOP;

    int8_t sample_idx = (int8_t)inst[I_SAMPLE];
    if (sample_idx >= 0) {
        // PCM sample playback
        // Sample pointer table: 32-bit offsets relative to samp_base
        uint32_t samp_off = rd32(ps.samp_base + sample_idx * 4);
        uint8_t *samp = ps.samp_base + samp_off;

        // First word: sample length in bytes
        uint16_t len_bytes = rd16(samp);
        uint16_t len_words = len_bytes >> 1;
        samp += 2;  // skip length, point to PCM data

        paula_set_length(v->ch, len_words);
        paula_set_sample_ptr(v->ch, (const int8_t *)samp);
    }
    // Negative sample_idx = synth waveforms (disabled: lbC000C5E is just RTS)

    // Initialize vibrato
    init_vibrato(v);
}

// ═══════════════════════════════════════════════════════════════════════════
// Pattern parsing
// ═══════════════════════════════════════════════════════════════════════════

static void handle_song_end(void);

// Parse data stream at pointer (lbC000806)
static void parse_data_stream(Voice *v, uint8_t *ptr) {
    // Safety: validate pointer is within module data
    uint8_t *mod_end = ps.mod_data + ps.mod_len;

    while (ptr >= ps.mod_data && ptr < mod_end) {
        uint8_t byte = *ptr++;

        if (byte < 0x80) {
            // 0x00-0x7F: Note number
            v->pat_return = ptr;

            uint8_t prio = v->cur_prio;
            if (prio >= v->inst_prio) {
                // Trigger note with current instrument
                trigger_note(v, v->cur_inst_ofs, prio);

                // Set up pitch slide to note period
                if (byte < FREQ_TABLE_SIZE) {
                    start_slide(v, freq_table[byte]);
                }
            }
            goto finalize;
        }

        if (byte < 0xB0) {
            // 0x80-0xAF: Set duration
            v->note_dur_set = byte - 0x7F;
            continue;
        }

        if (byte < 0xD0) {
            // 0xB0-0xCF: Instrument select + trigger
            v->pat_return = ptr;

            uint8_t inst_num = byte - 0xB0;
            uint16_t inst_ofs = (uint16_t)inst_num * INST_SIZE;
            uint8_t prio = ps.inst_base[inst_ofs + I_PRIO];

            if (prio >= v->inst_prio) {
                trigger_note(v, inst_ofs, prio);
            }
            goto finalize;
        }

        if (byte < 0xF0) {
            // 0xD0-0xEF: Instrument select (no trigger)
            uint8_t inst_num = byte - 0xD0;
            uint16_t inst_ofs = (uint16_t)inst_num * INST_SIZE;
            v->cur_inst_ofs = inst_ofs;
            v->cur_prio = ps.inst_base[inst_ofs + I_PRIO];
            continue;
        }

        if (byte < 0xF9) {
            // 0xF0-0xF8: Pitch effect (slide rate)
            v->slide_shift = byte - 0xF0;
            continue;
        }

        if (byte == 0xFE) {
            // Pause marker: save position, start wait
            v->pat_return = ptr;
            goto finalize;
        }

        // 0xFF or 0xF9-0xFD: back to pattern order stream
        // Fall through to parse_pattern_byte logic
        {
            // Read next byte from pattern order (pat_pos)
            uint8_t order_byte = *(v->pat_pos);
            if (order_byte == 0xFF) {
                v->pat_pos++;
                handle_song_end();
                v->pat_func = FN_NOP;
                return;
            }
            if (order_byte == 0xFE) {
                v->pat_pos++;
                v->pat_func = FN_NOP;
                return;
            }
            v->pat_pos++;
            // Look up in offset table
            uint16_t ofs = rd16(ps.ofs_base + order_byte * 2);
            ptr = ps.ofs_base + ofs;
            continue;
        }
    }
    // Safety: ran off end of data
    v->pat_func = FN_NOP;
    return;

finalize:
    v->note_dur = v->note_dur_set;
    v->pat_func = FN_WAIT_DURATION;
}

// lbC0007A4 — Read next byte from pattern order stream
static void parse_pattern_byte(Voice *v) {
    if (!v->pat_pos) { v->pat_func = FN_NOP; return; }

    uint8_t byte = *(v->pat_pos++);

    if (byte == 0xFE) {
        // End of pattern for this voice
        v->pat_func = FN_NOP;
        return;
    }
    if (byte == 0xFF) {
        handle_song_end();
        v->pat_func = FN_NOP;
        return;
    }

    // Look up in offset table
    uint16_t ofs = rd16(ps.ofs_base + byte * 2);
    uint8_t *stream = ps.ofs_base + ofs;
    parse_data_stream(v, stream);
}

// Continue from return position (lbC000802)
static void continue_from_return(Voice *v) {
    if (v->pat_return) {
        parse_data_stream(v, v->pat_return);
    } else {
        v->pat_func = FN_NOP;
    }
}

// Wait for note duration (lbC0008BC)
static void wait_duration(Voice *v) {
    if (ps.speed_counter == 0) {
        // Row boundary: decrement duration
        if (v->note_dur > 0) v->note_dur--;
        if (v->note_dur == 0) {
            continue_from_return(v);
            return;
        }
    } else {
        // Mid-row: check if already expired
        if (v->note_dur == 0) {
            continue_from_return(v);
            return;
        }
    }
}

// Song end handler (lbC0007C6)
static void handle_song_end(void) {
    // Set all voice pattern functions to NOP
    for (int i = 0; i < NUM_VOICES; i++) {
        ps.voices[i].pat_func = FN_NOP;
    }
    ps.priority = 0;

    uint8_t restart = ps.song_restart;
    if (restart != 0) {
        // Loop: queue restart subsong, DON'T set finished
        ps.next_subsong = restart;
    } else {
        ps.finished = 1;
    }
    ps.song_restart = 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Subsong trigger (lbC000746)
// ═══════════════════════════════════════════════════════════════════════════

static void trigger_subsong(uint8_t subsong_byte) {
    uint8_t subsong_num = subsong_byte & 0x7F;
    if (subsong_num == 0) return;

    // Subsong entries are 12 bytes each at seq_base, 1-based
    uint8_t *entry = ps.seq_base + (subsong_num - 1) * 12;

    uint8_t prio = entry[0];
    if (prio < ps.priority) return;  // lower priority, can't override

    ps.song_restart = subsong_byte;
    ps.priority = prio;
    ps.speed = entry[1];
    ps.speed_counter = entry[1];

    // Skip bytes 2 and 3 (padding)
    uint8_t *channel_data = entry + 4;

    for (int i = 0; i < NUM_VOICES; i++) {
        uint16_t pat_offset = rd16(channel_data + i * 2);
        if (pat_offset == 0) continue;

        Voice *v = &ps.voices[i];
        // Initialize voice with pattern data
        v->pat_pos = ps.seq_base + pat_offset;
        reset_voice(v);
        v->pat_func = FN_PARSE_PATTERN;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Function state dispatcher
// ═══════════════════════════════════════════════════════════════════════════

static void dispatch_pat(Voice *v) {
    switch (v->pat_func) {
        case FN_NOP: break;
        case FN_PARSE_PATTERN: parse_pattern_byte(v); break;
        case FN_WAIT_DURATION: wait_duration(v); break;
        default: break;
    }
}

static void dispatch_env(Voice *v) {
    switch (v->env_func) {
        case FN_NOP: break;
        case FN_ENV1: env_phase1(v); break;
        case FN_ENV2: env_phase2(v); break;
        case FN_ENV3: env_phase3(v); break;
        case FN_ENV4: env_phase4(v); break;
        case FN_ENV5: env_phase5(v); break;
        case FN_ENV6: env_phase6(v); break;
        case FN_ENV7: env_phase7(v); break;
        default: break;
    }
}

static void dispatch_vib(Voice *v) {
    switch (v->vib_func) {
        case FN_NOP: break;
        case FN_VIB_START: vib_start(v); break;
        case FN_VIB_TICK:  vib_tick(v); break;
        case FN_VIB_ADVANCE: vib_advance(v); break;
        default: break;
    }
}

static void dispatch_slide(Voice *v) {
    switch (v->slide_func) {
        case FN_NOP: break;
        case FN_SLIDE: slide_tick(v); break;
        default: break;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main tick processing
// ═══════════════════════════════════════════════════════════════════════════

// Process all voices (lbC0006BE)
static void process_voices(void) {
    // Decrement speed counter
    if (ps.speed_counter > 0) ps.speed_counter--;

    for (int i = 0; i < NUM_VOICES; i++) {
        Voice *v = &ps.voices[i];

        // Secondary trigger countdown (lbC0006D4)
        v->sec_countdown--;
        if (v->sec_countdown == 0) {
            if (v->sec_offset >= 0) {
                uint8_t prio = v->sec_prio;
                if (prio >= v->inst_prio) {
                    trigger_note(v, (uint16_t)v->sec_offset, prio);
                }
            }
            // Clear secondary
            v->sec_countdown = 0;
            v->sec_prio = 0;
            v->sec_offset = -1;
        }

        // Dispatch per-voice functions (same order as ASM)
        dispatch_pat(v);    // $4C
        dispatch_env(v);    // $26
        dispatch_vib(v);    // $38
        dispatch_slide(v);  // $3C
        // func34 is always NOP in this player
    }

    // Reload speed counter if it reached 0
    if (ps.speed_counter == 0) {
        if (ps.speed_override != 0) {
            ps.speed_counter = ps.speed_override;
        } else {
            ps.speed_counter = ps.speed;
        }
    }
}

// Update tempo/fade (lbC000626)
static void update_tempo(void) {
    // Volume fade
    int16_t diff = ps.fade_target - ps.master_vol;
    if (diff != 0) {
        int16_t speed = ps.fade_speed;
        if (speed < 0) {
            // Fade down
            int16_t abs_diff = -diff;
            if (abs_diff > -speed) abs_diff = -speed;
            ps.master_vol -= abs_diff;
            if (ps.master_vol <= 0) {
                ps.master_vol = 0;
                stop_all();
            }
        } else {
            // Fade up
            int16_t step = diff;
            if (step > speed) step = speed;
            ps.master_vol += step;
        }
    }

    // Pending subsong trigger
    if (ps.next_subsong != 0) {
        trigger_subsong((uint8_t)ps.next_subsong);
        ps.next_subsong = 0;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

void st_init(void) {
    memset(&ps, 0, sizeof(ps));
    paula_reset();

    // Initialize voice channel indices
    for (int i = 0; i < NUM_VOICES; i++) {
        ps.voices[i].ch = i;
    }
}

int st_load(const uint8_t *data, int len) {
    if (!data || len < 0x30) return 0;

    st_init();

    // Copy module data (we need to keep it around)
    ps.mod_data = (uint8_t *)malloc(len);
    if (!ps.mod_data) return 0;
    memcpy(ps.mod_data, data, len);
    ps.mod_len = len;

    uint8_t *mod = ps.mod_data;

    // Validate Steve Turner magic: check for $2B7C at offsets 0, 8, 16, 24
    if (rd16(mod) != 0x2B7C) return 0;
    if (rd16(mod + 8) != 0x2B7C) return 0;
    if (rd16(mod + 0x10) != 0x2B7C) return 0;
    if (rd16(mod + 0x18) != 0x2B7C) return 0;

    // Derive pointers (matching InitPlayer logic)
    uint32_t base_off = rd32(mod + 2);

    // Instrument base: module + 0x2E
    ps.inst_base = mod + 0x2E;

    // Sequence table: module + module[0x0A] - module[2] + 0x2E
    ps.seq_base = mod + rd32(mod + 0x0A) - base_off + 0x2E;

    // Pattern offset table: module + module[0x12] - module[2] + 0x2E
    ps.ofs_base = mod + rd32(mod + 0x12) - base_off + 0x2E;

    // Sample pointer table: module + module[0x1A] - module[2] + 0x2E
    ps.samp_base = mod + rd32(mod + 0x1A) - base_off + 0x2E;

    // Count subsongs
    uint8_t *seq_scan = ps.seq_base;
    ps.num_subsongs = 0;
    uint8_t *end = mod + len;
    while (seq_scan + 12 <= end) {
        uint16_t check = rd16(seq_scan);
        if ((check & 0xFFF0) != 0) break;
        seq_scan += 12;
        ps.num_subsongs++;
    }
    if (ps.num_subsongs == 0) ps.num_subsongs = 1;

    // Count instruments
    if (ps.samp_base > ps.inst_base) {
        ps.num_instruments = (int)(ps.samp_base - ps.inst_base) / INST_SIZE;
    } else {
        ps.num_instruments = 16;  // fallback
    }

    ps.loaded = 1;
    return 1;
}

void st_set_subsong(int n) {
    if (!ps.loaded || n < 1 || n > ps.num_subsongs) return;

    paula_reset();

    // Initialize voice channel indices
    for (int i = 0; i < NUM_VOICES; i++) {
        ps.voices[i].ch = i;
        reset_voice(&ps.voices[i]);
    }

    // Set fade to full volume
    ps.master_vol = 0;
    ps.fade_target = 255;
    ps.fade_speed = 255;
    ps.finished = 0;

    // Queue subsong trigger — update_tempo will call trigger_subsong
    ps.next_subsong = (uint16_t)n;

    // Trigger the subsong (sets up pattern pointers and voice states)
    update_tempo();
}

void st_tick(void) {
    if (!ps.loaded || ps.finished) return;
    process_voices();
    update_tempo();
}

void st_stop(void) {
    stop_all();
    paula_reset();
    if (ps.mod_data) {
        free(ps.mod_data);
        ps.mod_data = NULL;
    }
    ps.loaded = 0;
}

int st_get_subsong_count(void) {
    return ps.num_subsongs;
}

int st_is_finished(void) {
    return ps.finished;
}

int st_get_num_instruments(void) {
    return ps.num_instruments;
}

// ═══════════════════════════════════════════════════════════════════════════
// Synth parameter access
// ═══════════════════════════════════════════════════════════════════════════

// Map param_id to instrument byte offset
static int param_offset(int param_id) {
    switch (param_id) {
        case ST_PARAM_PRIO:       return I_PRIO;
        case ST_PARAM_SAMPLE:     return I_SAMPLE;
        case ST_PARAM_DELAY:      return I_DELAY;
        case ST_PARAM_ENV1_DUR:   return I_ENV1_DUR;
        case ST_PARAM_ENV1_DELTA: return I_ENV1_DELTA;
        case ST_PARAM_ENV2_DUR:   return I_ENV2_DUR;
        case ST_PARAM_ENV2_DELTA: return I_ENV2_DELTA;
        case ST_PARAM_SHIFT:      return I_SHIFT;
        case ST_PARAM_OSC_COUNT:  return I_OSC_CNT;
        case ST_PARAM_OSC_DELTA:  return I_OSC_DELTA;
        case ST_PARAM_OSC_LOOP:   return I_OSC_LOOP;
        case ST_PARAM_DECAY:      return I_DECAY;
        case ST_PARAM_NUM_VIB:    return I_NUM_VIB;
        case ST_PARAM_VIB_DELAY:  return I_VIB_DLY;
        case ST_PARAM_VIB_SPEED:  return I_VIB_SPD;
        case ST_PARAM_VIB_MAX:    return I_VIB_MAX;
        case ST_PARAM_CHAIN:      return I_CHAIN;
        default: return -1;
    }
}

int st_get_instrument_param(int inst, int param_id) {
    if (!ps.loaded || inst < 0 || inst >= ps.num_instruments) return 0;
    int off = param_offset(param_id);
    if (off < 0) return 0;

    uint8_t *idata = ps.inst_base + inst * INST_SIZE;

    // OSC_COUNT is a 16-bit word
    if (param_id == ST_PARAM_OSC_COUNT) {
        return (int)rd16(idata + off);
    }
    return (int)idata[off];
}

void st_set_instrument_param(int inst, int param_id, int value) {
    if (!ps.loaded || inst < 0 || inst >= ps.num_instruments) return;
    int off = param_offset(param_id);
    if (off < 0) return;

    uint8_t *idata = ps.inst_base + inst * INST_SIZE;

    if (param_id == ST_PARAM_OSC_COUNT) {
        // 16-bit word, big-endian
        idata[off] = (uint8_t)(value >> 8);
        idata[off + 1] = (uint8_t)(value & 0xFF);
    } else {
        idata[off] = (uint8_t)value;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Note preview
// ═══════════════════════════════════════════════════════════════════════════

void st_note_on(int instrument, int note, int velocity) {
    if (!ps.loaded || instrument < 0 || instrument >= ps.num_instruments) return;
    if (note < 0 || note >= FREQ_TABLE_SIZE) return;

    uint8_t *inst = ps.inst_base + instrument * INST_SIZE;

    // Get sample from instrument
    int8_t sample_idx = (int8_t)inst[I_SAMPLE];
    if (sample_idx < 0) return; // no sample (synth waveform — not supported for preview)

    uint32_t samp_off = rd32(ps.samp_base + sample_idx * 4);
    uint8_t *samp = ps.samp_base + samp_off;
    uint16_t len_bytes = rd16(samp);
    uint16_t len_words = len_bytes >> 1;
    if (len_words == 0) return;
    samp += 2; // skip length word

    // Get period from frequency table, apply instrument pitch shift
    uint16_t period = freq_table[note];
    uint8_t shift = inst[I_SHIFT];
    // The instrument stores periods pre-shifted in vibrato table.
    // For preview, use the raw freq_table period (no shift needed —
    // the shift is for the vibrato system's internal representation).

    // Map velocity (0-127) to Paula volume (0-64)
    int vol = (velocity * 64) / 127;
    if (vol > 64) vol = 64;
    if (vol < 1) vol = 1;

    // Use Paula channel 0 for preview
    paula_dma_write(0x0001);  // disable ch0
    paula_set_sample_ptr(0, (const int8_t *)samp);
    paula_set_length(0, len_words);
    paula_set_period(0, period);
    paula_set_volume(0, (uint8_t)vol);
    paula_dma_write(0x8001);  // enable ch0
}

void st_note_off(void) {
    paula_dma_write(0x0001);  // disable ch0
    paula_set_volume(0, 0);
}

// Debug dump for native testing
#ifndef __EMSCRIPTEN__
#include <stdio.h>
static const char *fn_name(FuncState f) {
    switch (f) {
        case FN_NOP: return "NOP";
        case FN_PARSE_PATTERN: return "PARSE";
        case FN_WAIT_DURATION: return "WAIT";
        case FN_ENV1: return "E1"; case FN_ENV2: return "E2";
        case FN_ENV3: return "E3"; case FN_ENV4: return "E4";
        case FN_ENV5: return "E5"; case FN_ENV6: return "E6";
        case FN_ENV7: return "E7";
        case FN_VIB_START: return "VS"; case FN_VIB_TICK: return "VT";
        case FN_VIB_ADVANCE: return "VA";
        case FN_SLIDE: return "SL";
        default: return "??";
    }
}
void st_debug_dump(void) {
    printf("spd=%d/%d mvol=%d ", ps.speed_counter, ps.speed, ps.master_vol);
    for (int i = 0; i < NUM_VOICES; i++) {
        Voice *v = &ps.voices[i];
        printf("v%d[p=%s e=%s vb=%s vol=%d inst=%d] ",
            i, fn_name(v->pat_func), fn_name(v->env_func),
            fn_name(v->vib_func), v->volume, v->inst_num);
    }
    printf("\n");
}
#endif
