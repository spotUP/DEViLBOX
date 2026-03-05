/*
 * FuturePlayer.c — Future Player replayer, transpiled from 68k assembly
 *
 * Original: (c) 1988-89 by Paul van der Valk (from Hybris title music)
 * EaglePlayer adaptation: Wanted Team, V1.0 (14 Oct 2003)
 * Source: Future Player_v1.asm (DeliTracker compatible version)
 *
 * Transpiled to C for WASM playback in DEViLBOX.
 * UADE uses this exact player binary — output should match 1:1.
 *
 * Architecture:
 *   - 4 hardware voices, each with a 190-byte voice struct
 *   - Per-tick: sequence reader (lbC002C4A) + audio updater (lbC002E00)
 *   - 15 sequence commands via dispatch table (lbL003808)
 *   - 4 modulation tables per instrument (2 pitch, 2 sample-offset)
 *   - ADSR-like 4-phase volume envelope
 *   - Portamento via per-voice slide rate
 *   - 96-entry period table (8 octaves × 12 notes)
 *
 * Register/memory mapping from ASM to C:
 *   A0 = voice struct pointer (passed to most routines)
 *   A1 = Paula hardware register base ($DFF0A0/B0/C0/D0)
 *   A2 = instrument pointer (from voice->0x68)
 *   A3 = sample/waveform info pointer
 *   A4 = instrument detail pointer (from instr+12)
 *   A5 = modulation table pointer
 *   A6 = modulation data pointer
 *
 * Voice struct layout (190 bytes, offsets in hex):
 *   0x00: state byte (0=playing, 0x80=stopped/init)
 *   0x01: end flag (0x80=song end for this voice)
 *   0x04: call stack depth (word)
 *   0x06..0x65: call stack (return addresses, 4 bytes each, up to 8 levels)
 *   0x46..0x65: loop addresses for repeat commands
 *   0x26..0x45: loop counters
 *   0x68: instrument pointer (long)
 *   0x6C: secondary instrument pointer (long)
 *   0x70: arpeggio table pointer (long)
 *   0x74: arpeggio index (word)
 *   0x76: portamento rate (word, 0=off)
 *   0x78: Paula register base address (long) — $DFF0A0/B0/C0/D0
 *   0x7C: DMA disable mask (word)
 *   0x7E: DMA enable mask (word, with $8000 set)
 *   0x80: master volume (word)
 *   0x81: volume byte from lbC0034E8 (byte)
 *   0x82: voice volume (byte)
 *   0x83: envelope current level (byte)
 *   0x84: envelope phase (byte: 0=attack, 1=decay, 2=sustain, 3=release)
 *   0x86: pitch detune (word, signed)
 *   0x88: pitch mod 1 index (word)
 *   0x8A: pitch mod 2 index (word)
 *   0x8C: sample mod 1 index (word)
 *   0x8E: sample mod 2 index (word)
 *   0x90: pitch mod 1 delay (byte)
 *   0x91: pitch mod 2 delay (byte)
 *   0x92: sample mod 1 delay (byte)
 *   0x93: sample mod 2 delay (byte)
 *   0x94: transpose 1 (byte)
 *   0x95: transpose 2 (byte)
 *   0x96: (byte, cleared on init)
 *   0x9C: note-off countdown (word)
 *   0x9E: current note (byte)
 *   0x9F: row duration countdown (byte)
 *   0xA0: current period (word)
 *   0xA2: last written period (word)
 *   0xA4: note trigger flag (byte, nonzero = new note this tick)
 *   0xA5: DMA trigger flag (byte, nonzero = need DMA restart)
 *   0xA6: sequence position pointer (long)
 *   0xAF: (byte, cleared in repeat commands)
 *   0xB0: wavetable active flag (byte, 0xFF=active)
 *   0xB1: wavetable frame countdown (byte)
 *   0xB2: wavetable current sample pointer (long)
 *   0xB6: wavetable position pointer (long)
 *   0xBA: wavetable loop pointer (long)
 */

#include "FuturePlayer.h"
#include "paula_soft.h"
#include <string.h>
#include <stdio.h>

/* ======================================================================
 * Period table — 96 entries (8 octaves × 12 notes)
 * From lbW0036C4 in the ASM source
 * ====================================================================== */
static const uint16_t period_table[96] = {
    0x1C40, 0x1AC0, 0x1940, 0x17D0, 0x1680, 0x1530, 0x1400, 0x12E0,
    0x11D0, 0x10D0, 0x0FE0, 0x0F00, 0x0E20, 0x0D60, 0x0CA0, 0x0BE8,
    0x0B40, 0x0A98, 0x0A00, 0x0970, 0x08E8, 0x0868, 0x07F0, 0x0780,
    0x0710, 0x06B0, 0x0650, 0x05F4, 0x05A0, 0x054C, 0x0500, 0x04B8,
    0x0474, 0x0434, 0x03F8, 0x03C0, 0x0388, 0x0358, 0x0328, 0x02FA,
    0x02D0, 0x02A6, 0x0280, 0x025C, 0x023A, 0x021A, 0x01FC, 0x01E0,
    0x01C4, 0x01AC, 0x0194, 0x017D, 0x0168, 0x0153, 0x0140, 0x012E,
    0x011D, 0x010D, 0x00FE, 0x00F0, 0x00E2, 0x00D6, 0x00CA, 0x00BE,
    0x00B4, 0x00AA, 0x00A0, 0x0097, 0x008F, 0x0087, 0x007F, 0x0078,
    0x0071, 0x006B, 0x0065, 0x005F, 0x005A, 0x0055, 0x0050, 0x004C,
    0x0048, 0x0044, 0x0040, 0x003C, 0x0039, 0x0035, 0x0032, 0x002F,
    0x002D, 0x002A, 0x0028, 0x0026, 0x0024, 0x0022, 0x0020, 0x001E,
};

/* ======================================================================
 * Voice struct — 190 bytes per voice, matching the ASM BSS layout
 * ====================================================================== */
#define VOICE_SIZE  190
#define NUM_VOICES  4

static uint8_t voice_data[NUM_VOICES][VOICE_SIZE];

/* Pointers to the 4 voice structs (equivalent to lbL003786 table) */
static uint8_t* voice_ptrs[NUM_VOICES] = {
    voice_data[0], voice_data[1], voice_data[2], voice_data[3]
};

/* ======================================================================
 * Helper macros for reading voice struct fields
 * ====================================================================== */
#define V_B(v, off)    (v[off])                                     /* byte */
#define V_W(v, off)    ((uint16_t)((v[off] << 8) | v[(off)+1]))    /* word, big-endian */
#define V_L(v, off)    ((uint32_t)((v[off] << 24) | (v[(off)+1] << 16) | (v[(off)+2] << 8) | v[(off)+3]))  /* long */
#define V_SB(v, off)   ((int8_t)v[off])                             /* signed byte */
#define V_SW(v, off)   ((int16_t)V_W(v, off))                      /* signed word */
#define V_SL(v, off)   ((int32_t)V_L(v, off))                      /* signed long */

#define SET_B(v, off, val)  do { v[off] = (uint8_t)(val); } while(0)
#define SET_W(v, off, val)  do { uint16_t _v = (uint16_t)(val); v[off] = _v >> 8; v[(off)+1] = _v & 0xFF; } while(0)
#define SET_L(v, off, val)  do { uint32_t _v = (uint32_t)(val); v[off] = _v >> 24; v[(off)+1] = (_v >> 16) & 0xFF; v[(off)+2] = (_v >> 8) & 0xFF; v[(off)+3] = _v & 0xFF; } while(0)

/* ======================================================================
 * Module data access — all pointers are offsets into the loaded module
 * ====================================================================== */
static const uint8_t* mod_base = NULL;
static uint32_t mod_size = 0;

/* Read big-endian values from module data at an absolute pointer (stored as offset) */
static inline uint8_t  RD8(uint32_t ptr)  { return (ptr < mod_size) ? mod_base[ptr] : 0; }
static inline uint16_t RD16(uint32_t ptr) { return (ptr+1 < mod_size) ? (uint16_t)((mod_base[ptr] << 8) | mod_base[ptr+1]) : 0; }
static inline uint32_t RD32(uint32_t ptr) { return (ptr+3 < mod_size) ? (uint32_t)((mod_base[ptr] << 24) | (mod_base[ptr+1] << 16) | (mod_base[ptr+2] << 8) | mod_base[ptr+3]) : 0; }
static inline int8_t   RDS8(uint32_t ptr) { return (int8_t)RD8(ptr); }
static inline int16_t  RDS16(uint32_t ptr){ return (int16_t)RD16(ptr); }

/* ======================================================================
 * Global state variables — from BSS/data section in ASM
 * ====================================================================== */
static uint8_t  fade_state;     /* lbB003664: 0=off, 1=fade in, 0xFF=fade out */
static uint8_t  fade_level;     /* lbB003665: current fade level */
static uint8_t  fade_speed;     /* lbB003666: fade speed (0=not fading) */
static uint8_t  skip_seq;       /* lbB00366A: skip sequence reads flag */
static uint8_t  tick_speed;     /* lbB00366D: ticks per row (default 4) */
static uint8_t  tick_counter;   /* lbB00366E: current tick countdown */
static uint8_t  cmd_overflow;   /* lbB00366F: command overflow flag */
static int      seq_break;     /* Set by cmd_end_voice to break read_sequence loop (simulates TST.L (SP)+) */
static uint32_t intro_count;    /* lbL003680: intro row count */
static uint32_t wait_counter;   /* lbL003698: wait counter */

/* Song data pointer — points to the subsong table in the module */
static uint32_t song_ptr;       /* offset into mod_base */
static int      num_subsongs;

/* Default arpeggio table pointer — lbL00378E in ASM */
static uint32_t default_arp_ptr;

/* Default instrument pointer — lbL00379E in ASM */
static uint32_t default_instr_ptr;

/* Null/empty sample data for silence */
static const int8_t empty_sample[4] = {0, 0, 0, 0};

/* ======================================================================
 * Forward declarations for command handlers
 * ====================================================================== */
static void cmd_end_voice(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_set_instrument(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_set_arp_table(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_reset_arp(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_set_portamento(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_nop(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_call_sub(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_jump_pattern(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_repeat_start(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_repeat_check(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_repeat_jump(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_set_transpose1(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_set_transpose2(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_check_flag(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static void cmd_reset_counter(uint8_t* v, uint32_t* seq_pos, uint8_t d0);

/* Command dispatch table — matches lbL003808 in ASM */
typedef void (*cmd_func_t)(uint8_t* v, uint32_t* seq_pos, uint8_t d0);
static const cmd_func_t cmd_table[15] = {
    cmd_end_voice,      /* 0: lbC002CCC — end/return from sub */
    cmd_set_instrument, /* 1: lbC002CF2 — set instrument + detune */
    cmd_set_arp_table,  /* 2: lbC002D62 — set arpeggio table ptr */
    cmd_reset_arp,      /* 3: lbC002D68 — reset arpeggio to default */
    cmd_set_portamento, /* 4: lbC002D76 — set portamento rate */
    cmd_nop,            /* 5: lbC002D7C — no operation */
    cmd_call_sub,       /* 6: lbC002D7E — call subroutine */
    cmd_jump_pattern,   /* 7: lbC002D9C — jump to pattern */
    cmd_repeat_start,   /* 8: lbC002DA4 — start repeat */
    cmd_repeat_check,   /* 9: lbC002DB6 — decrement repeat counter */
    cmd_repeat_jump,    /* A: lbC002DC6 — conditional repeat jump */
    cmd_set_transpose1, /* B: lbC002DD6 — set transpose 1 */
    cmd_set_transpose2, /* C: lbC002DDC — set transpose 2 */
    cmd_check_flag,     /* D: lbC002CC2 — check skip flag */
    cmd_reset_counter,  /* E: lbC002DF6 — reset position counter */
};

/* ======================================================================
 * Voice struct field offsets — named constants for readability
 * ====================================================================== */
#define VS_STATE        0x00
#define VS_END_FLAG     0x01
#define VS_STACK_DEPTH  0x04
#define VS_STACK_BASE   0x06    /* call stack: 4 bytes per entry, up to 8 */
#define VS_LOOP_COUNT   0x26    /* loop counters: 1 byte per stack level */
#define VS_LOOP_ADDR    0x46    /* loop addresses: 4 bytes per stack level */
#define VS_INSTR_PTR    0x68
#define VS_INSTR2_PTR   0x6C
#define VS_ARP_PTR      0x70
#define VS_ARP_IDX      0x74
#define VS_PORTA_RATE   0x76
#define VS_PAULA_BASE   0x78
#define VS_DMA_OFF      0x7C
#define VS_DMA_ON       0x7E
#define VS_MASTER_VOL   0x80
#define VS_VOL_BYTE     0x81
#define VS_VOICE_VOL    0x82
#define VS_ENV_LEVEL    0x83
#define VS_ENV_PHASE    0x84
#define VS_DETUNE       0x86
#define VS_PMOD1_IDX    0x88
#define VS_PMOD2_IDX    0x8A
#define VS_SMOD1_IDX    0x8C
#define VS_SMOD2_IDX    0x8E
#define VS_PMOD1_DLY    0x90
#define VS_PMOD2_DLY    0x91
#define VS_SMOD1_DLY    0x92
#define VS_SMOD2_DLY    0x93
#define VS_TRANSPOSE1   0x94
#define VS_TRANSPOSE2   0x95
#define VS_NOTEOFF_CNT  0x9C
#define VS_CUR_NOTE     0x9E
#define VS_ROW_TIMER    0x9F
#define VS_CUR_PERIOD   0xA0
#define VS_LAST_PERIOD  0xA2
#define VS_NOTE_TRIG    0xA4
#define VS_DMA_TRIG     0xA5
#define VS_SEQ_POS      0xA6
#define VS_REPEAT_FLAG  0xAF
#define VS_WAVE_ACTIVE  0xB0
#define VS_WAVE_FRAMES  0xB1
#define VS_WAVE_SAMP    0xB2
#define VS_WAVE_POS     0xB6
#define VS_WAVE_LOOP    0xBA

/* ======================================================================
 * Channel index from voice pointer
 * ====================================================================== */
static int voice_channel(const uint8_t* v) {
    for (int i = 0; i < NUM_VOICES; i++) {
        if (v == voice_data[i]) return i;
    }
    return 0;
}

/* ======================================================================
 * Paula hardware write helpers
 * These translate $DFF0xx register writes to paula_soft API calls.
 * The voice struct stores which Paula channel it maps to in VS_PAULA_BASE.
 * ====================================================================== */
static void hw_write_period(int ch, uint16_t period) {
    if (period > 0) paula_set_period(ch, period);
}

static void hw_write_volume(int ch, uint8_t vol) {
    paula_set_volume(ch, vol > 64 ? 64 : vol);
}

static void hw_write_sample(int ch, uint32_t addr, uint16_t len_words) {
    if (addr && addr < mod_size) {
        paula_set_sample_ptr(ch, (const int8_t*)(mod_base + addr));
    } else {
        paula_set_sample_ptr(ch, empty_sample);
    }
    paula_set_length(ch, len_words);
}

static void hw_write_dmacon(uint16_t dmacon) {
    paula_dma_write(dmacon);
}

/* ======================================================================
 * lbC0034E8 — Set fade level for all voices
 * Sets D0 into lbB003665 and into $81(voice) for each voice
 * ====================================================================== */
static void set_fade_level(uint8_t level) {
    fade_level = level;
    for (int i = 0; i < NUM_VOICES; i++) {
        SET_B(voice_data[i], VS_VOL_BYTE, level);
    }
}

/* ======================================================================
 * lbC003424 — Silence all channels
 * Writes empty sample to all 4 Paula channels
 * ====================================================================== */
static void silence_all(void) {
    /* MOVE.W #15,$DFF096 — disable DMA for all 4 channels */
    hw_write_dmacon(0x000F);
    for (int ch = 0; ch < 4; ch++) {
        hw_write_sample(ch, 0, 2);
        hw_write_period(ch, 1);
        hw_write_volume(ch, 0);
    }
}

/* ======================================================================
 * lbC003262 — Init voice structs for playback
 * Sets up each of the 4 voice channels with DMA masks, Paula base,
 * default instrument/arpeggio, and clears state.
 * ====================================================================== */
static void init_voices(void) {
    silence_all();

    for (int i = 0; i < 4; i++) {
        uint8_t* v = voice_data[i];
        uint16_t dma_bit = 1 << i;

        SET_B(v, VS_STATE, 0x80);
        SET_B(v, VS_END_FLAG, 0x80);
        SET_W(v, VS_DMA_OFF, dma_bit);
        SET_W(v, VS_DMA_ON, dma_bit | 0x8000);

        /* Paula register base: $DFF0A0 + i*16 */
        /* We store the channel index instead of the actual address */
        SET_L(v, VS_PAULA_BASE, 0xDFF0A0 + i * 0x10);

        SET_L(v, VS_ARP_PTR, default_arp_ptr);
        SET_L(v, VS_INSTR_PTR, default_instr_ptr);
        SET_W(v, VS_PORTA_RATE, 0);
        SET_W(v, VS_MASTER_VOL, 0);
        SET_B(v, VS_ROW_TIMER, 1);
        SET_B(v, VS_VOICE_VOL, 0);
        SET_W(v, VS_DETUNE, 0);
        SET_B(v, VS_TRANSPOSE1, 0);
        SET_B(v, VS_TRANSPOSE2, 0);
        SET_B(v, 0x96, 0);
    }
}

/* ======================================================================
 * lbC002C4A — Sequence reader (called once per row for each voice)
 * Reads note data and commands from the sequence.
 * ====================================================================== */
static void read_sequence(uint8_t* v) {
    int ch = (v == voice_data[0]) ? 0 : (v == voice_data[1]) ? 1 : (v == voice_data[2]) ? 2 : 3;

    /* TST.B 1(A0) — if end flag set, skip */
    if (V_B(v, VS_END_FLAG) != 0) {
        return;
    }

    SET_B(v, VS_DMA_TRIG, 0);  /* CLR.B $A5(A0) */
    cmd_overflow = 0;           /* CLR.B lbB00366F */
    seq_break = 0;              /* Reset break flag */

    /* SUBQ.B #1,$9F(A0) — decrement row timer */
    uint8_t timer = V_B(v, VS_ROW_TIMER);
    timer--;
    SET_B(v, VS_ROW_TIMER, timer);
    if (timer != 0) return;     /* BNE lbC0032EE */

    /* Read sequence data */
    uint32_t seq = V_L(v, VS_SEQ_POS);

read_next:
    {
        uint8_t d0 = RD8(seq);
        seq++;

        if (d0 & 0x80) {
            /* BMI — command byte (negative) */
            /* Check overflow protection */
            cmd_overflow--;
            if (cmd_overflow == 0) {
                /* lbC002CB8: overflow — set flag and return */
                cmd_overflow = 0x81;
                return;
            }

            /* Decode command: ASL.B #2,D0 → multiply by 4, mask to byte */
            uint8_t cmd_idx = (d0 << 2) & 0xFF;
            uint16_t tbl_idx = cmd_idx;

            /* Read command argument byte: MOVE.B (A1)+,D0 */
            uint8_t arg = RD8(seq);
            seq++;

            /* Dispatch: index into command table (4 bytes per entry) */
            int cmd_num = tbl_idx / 4;
            if (cmd_num < 15) {
                cmd_table[cmd_num](v, &seq, arg);
            }

            /* cmd_end_voice uses TST.L (SP)+ to exit read_sequence entirely.
             * We simulate this with seq_break. */
            if (seq_break) return;

            /* After command, continue reading (BRA lbC002C68) */
            goto read_next;
        }

        /* Note or rest */
        if (d0 == 0) {
            /* BEQ — rest (no note change) — keep current note */
        } else {
            SET_B(v, VS_CUR_NOTE, d0);
        }

        /* Read duration byte */
        uint8_t d1 = RD8(seq);
        seq++;

        if (d1 & 0x80) {
            SET_L(v, VS_SEQ_POS, seq);
            d1 &= 0x7F;
            SET_B(v, VS_ROW_TIMER, d1);
            SET_B(v, VS_NOTE_TRIG, d0);
            return;
        }

        /* Normal note with trigger */
        SET_L(v, VS_SEQ_POS, seq);
        SET_B(v, VS_ROW_TIMER, d1);
        SET_B(v, VS_NOTE_TRIG, d0);
        SET_B(v, VS_DMA_TRIG, d0);
    }
}

/* ======================================================================
 * Command handlers — matching lbL003808 dispatch table
 * ====================================================================== */

/* Cmd 0: lbC002CCC — End voice / return from subroutine */
static void cmd_end_voice(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    /* TST.B lbB00366A — check skip flag */
    if (skip_seq) return;

    /* lbC002CCC: TST.W 4(A0) — check call stack depth */
    uint16_t depth = V_W(v, VS_STACK_DEPTH);
    if (depth != 0) {
        /* lbC002DE2: return from subroutine — continue reading at saved position */
        if (depth > 0) {
            depth -= 4;
            SET_W(v, VS_STACK_DEPTH, depth);
        }
        *seq_pos = V_L(v, VS_STACK_BASE + depth);
        return;  /* returns to dispatch loop, which continues reading */
    }

    /* lbC002CD4: TST.L (SP)+ — pops read_sequence return address.
     * This effectively exits read_sequence entirely. We simulate
     * this by setting seq_break so the dispatch loop stops. */
    SET_B(v, VS_END_FLAG, 0x80);

    if (V_B(v, VS_STATE) == 0) {
        /* First time ending — disable DMA */
        SET_B(v, VS_STATE, 0x80);
        uint16_t dma_off = V_W(v, VS_DMA_OFF);
        hw_write_dmacon(dma_off);
    }

    seq_break = 1;  /* signal read_sequence to return immediately */
}

/* Cmd 1: lbC002CF2 — Set instrument + detune for all voices */
static void cmd_set_instrument(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    uint32_t instr_ptr = RD32(*seq_pos);
    *seq_pos += 4;

    SET_L(v, VS_INSTR_PTR, instr_ptr);

    /* Read detune values from instrument+12 -> bytes 14-17 */
    uint32_t detail_ptr = RD32(instr_ptr + 12);

    int8_t detune0 = RDS8(detail_ptr + 14);
    SET_W(voice_data[0], VS_DETUNE, (int16_t)detune0);

    int8_t detune1 = RDS8(detail_ptr + 15);
    SET_W(voice_data[1], VS_DETUNE, (int16_t)detune1);

    int8_t detune2 = RDS8(detail_ptr + 16);
    SET_W(voice_data[2], VS_DETUNE, (int16_t)detune2);

    int8_t detune3 = RDS8(detail_ptr + 17);
    SET_W(voice_data[3], VS_DETUNE, (int16_t)detune3);

    /* Clear modulation state */
    SET_W(v, VS_PMOD1_IDX, 0);
    SET_W(v, VS_PMOD2_IDX, 0);
    SET_W(v, VS_SMOD1_IDX, 0);
    SET_W(v, VS_SMOD2_IDX, 0);
    SET_B(v, VS_PMOD1_DLY, 0);
    SET_B(v, VS_PMOD2_DLY, 0);
    SET_B(v, VS_SMOD1_DLY, 0);
    SET_B(v, VS_SMOD2_DLY, 0);
    SET_B(v, VS_WAVE_ACTIVE, 0);
    /* NOTE: Unlike cmd_call_sub/cmd_jump, cmd_set_instrument does NOT change
     * the sequence position. It just saves the instrument pointer and returns.
     * The ASM (lbC002CF2) does MOVEA.L (A1)+,A2 then RTS — A1 continues
     * normally from after the 4-byte instrument pointer. */
}

/* Cmd 2: lbC002D62 — Set arpeggio table pointer */
static void cmd_set_arp_table(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    uint32_t arp = RD32(*seq_pos);
    *seq_pos += 4;
    SET_L(v, VS_ARP_PTR, arp);
}

/* Cmd 3: lbC002D68 — Reset arpeggio to default */
static void cmd_reset_arp(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    SET_L(v, VS_ARP_PTR, default_arp_ptr);
    SET_W(v, VS_ARP_IDX, 0);
}

/* Cmd 4: lbC002D76 — Set portamento rate */
static void cmd_set_portamento(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    uint16_t rate = RD16(*seq_pos);
    *seq_pos += 2;
    SET_W(v, VS_PORTA_RATE, rate);
}

/* Cmd 5: lbC002D7C — No operation */
static void cmd_nop(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    /* Nothing */
}

/* Cmd 6: lbC002D7E — Call subroutine */
static void cmd_call_sub(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    uint16_t depth = V_W(v, VS_STACK_DEPTH);

    /* Save return address (current seq_pos + 4, skipping the pattern pointer) */
    SET_L(v, VS_STACK_BASE + depth, *seq_pos + 4);

    /* Limit stack depth to 0x1C (8 levels × 4 bytes) */
    if (depth < 0x1C) {
        depth += 4;
    }
    SET_W(v, VS_STACK_DEPTH, depth);
    SET_B(v, VS_LOOP_COUNT + depth, 1);

    /* Jump to pattern pointed to by the 4-byte argument */
    uint32_t target_ptr = RD32(*seq_pos);
    uint32_t pattern_data = RD32(target_ptr + 8);
    *seq_pos = pattern_data;
}

/* Cmd 7: lbC002D9C — Jump to pattern (immediate) */
static void cmd_jump_pattern(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    uint32_t target_ptr = RD32(*seq_pos);
    uint32_t pattern_data = RD32(target_ptr + 8);
    *seq_pos = pattern_data;
}

/* Cmd 8: lbC002DA4 — Start repeat (set loop counter and save address) */
static void cmd_repeat_start(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    uint16_t depth = V_W(v, VS_STACK_DEPTH);
    SET_L(v, VS_LOOP_ADDR + depth, *seq_pos);
    SET_B(v, VS_LOOP_COUNT + depth, d0);
    SET_B(v, VS_REPEAT_FLAG, 0);
}

/* Cmd 9: lbC002DB6 — Decrement repeat counter, loop if not done */
static void cmd_repeat_check(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    uint16_t depth = V_W(v, VS_STACK_DEPTH);
    uint8_t count = V_B(v, VS_LOOP_COUNT + depth);
    count--;
    SET_B(v, VS_LOOP_COUNT + depth, count);
    if (count != 0) {
        *seq_pos = V_L(v, VS_LOOP_ADDR + depth);
    }
}

/* Cmd A: lbC002DC6 — Conditional repeat jump */
static void cmd_repeat_jump(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    if (V_B(v, VS_REPEAT_FLAG) == 0) {
        uint16_t depth = V_W(v, VS_STACK_DEPTH);
        *seq_pos = V_L(v, VS_LOOP_ADDR + depth);
    }
}

/* Cmd B: lbC002DD6 — Set transpose 1 */
static void cmd_set_transpose1(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    SET_B(v, VS_TRANSPOSE1, d0);
}

/* Cmd C: lbC002DDC — Set transpose 2 */
static void cmd_set_transpose2(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    SET_B(v, VS_TRANSPOSE2, d0);
}

/* Cmd D: lbC002CC2 — Check skip flag */
static void cmd_check_flag(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    if (skip_seq) return;
    /* Fall through to cmd_end_voice behavior */
    cmd_end_voice(v, seq_pos, d0);
}

/* Cmd E: lbC002DF6 — Reset position counter */
static void cmd_reset_counter(uint8_t* v, uint32_t* seq_pos, uint8_t d0) {
    /* No-op in this version (counter tracking removed) */
}

/* ======================================================================
 * lbC002E00 — Audio update (called every tick for each voice)
 * Handles: DMA control, note trigger, arpeggio, portamento,
 * pitch modulation, sample pointer modulation, volume envelope,
 * wavetable animation.
 * ====================================================================== */
static void update_audio(uint8_t* v) {
    int ch = voice_channel(v);
    uint32_t instr_ptr = V_L(v, VS_INSTR_PTR);
    uint32_t instr2_ptr;

    /* MOVE.B 0(A0),D0 — check voice state */
    uint8_t state = V_B(v, VS_STATE);
    if (state & 0x80) return;  /* BMI — stopped, skip */
    if (instr_ptr == 0 || instr_ptr >= mod_size) return;  /* No instrument set */

    if (state != 0) {
        /* Voice is in note-off countdown state */
        instr2_ptr = V_L(v, VS_INSTR2_PTR);

        uint16_t noteoff = V_W(v, VS_NOTEOFF_CNT);
        if (noteoff != 0) {
            noteoff--;
            SET_W(v, VS_NOTEOFF_CNT, noteoff);
            if (noteoff != 0) goto do_note;  /* not yet expired */

            /* Note-off expired — disable DMA */
            hw_write_dmacon(V_W(v, VS_DMA_OFF));

            if (V_B(v, VS_END_FLAG) != 0) {
                SET_B(v, VS_STATE, 0x80);
                return;
            }

            if (V_B(v, VS_DMA_TRIG) != 0) {
                SET_B(v, VS_NOTEOFF_CNT, 1);
                return;
            }

            SET_B(v, VS_STATE, 0);
            instr_ptr = V_L(v, VS_INSTR_PTR);
        }
    }

do_note:
    /* ===== Note trigger (lbC002E4E) ===== */
    if (V_B(v, VS_DMA_TRIG) != 0) {
        /* New note — disable DMA first */
        hw_write_dmacon(V_W(v, VS_DMA_OFF));

        SET_W(v, VS_ARP_IDX, 0);
        SET_B(v, VS_WAVE_ACTIVE, 0);

        /* Get instrument detail pointer */
        uint32_t detail = RD32(instr_ptr + 12);

        SET_B(v, VS_ENV_PHASE, 0);  /* Reset envelope */

        /* Check if instrument has sustain override */
        if (RD8(detail + 0x19) == 0) {
            /* Use max of current and instrument's attack level */
            uint8_t cur_level = V_B(v, VS_ENV_LEVEL);
            uint8_t atk_level = RD8(detail + 0x12);
            if (cur_level <= atk_level) {
                SET_B(v, VS_ENV_LEVEL, atk_level);
            }
        } else {
            SET_B(v, VS_ENV_LEVEL, RD8(detail + 0x12));
        }

        /* Reset modulation indices unless "continue" mode */
        if (RD8(detail + 0x20) != 1) {
            SET_W(v, VS_PMOD1_IDX, 0);
            SET_B(v, VS_PMOD1_DLY, RD8(detail + 0x1F));
        }
        if (RD8(detail + 0x28) != 1) {
            SET_W(v, VS_PMOD2_IDX, 0);
            SET_B(v, VS_PMOD2_DLY, RD8(detail + 0x27));
        }
        if (RD8(detail + 0x30) != 1) {
            SET_W(v, VS_SMOD1_IDX, 0);
            SET_B(v, VS_SMOD1_DLY, RD8(detail + 0x2F));
        }
        if (RD8(detail + 0x38) != 1) {
            SET_W(v, VS_SMOD2_IDX, 0);
            SET_B(v, VS_SMOD2_DLY, RD8(detail + 0x37));
        }
    }

    /* ===== Sample/waveform setup (lbC002ECC) ===== */
    uint32_t samp_info = RD32(instr_ptr + 8);  /* A3 = instrument sample info */
    uint32_t wave_data_ptr;                     /* D7 = sample data pointer for wavetable */
    uint32_t sample_ptr;                        /* D2 = final sample address */
    uint16_t sample_len;                        /* D0 = sample length in words */

    if (RD8(samp_info + 8) != 0) {
        /* Wavetable mode */
        if (V_B(v, VS_WAVE_ACTIVE) == 0) {
            /* Initialize wavetable */
            uint32_t wave_list = RD32(samp_info + 10);
            wave_list += 8;  /* skip header */

            if (RD32(wave_list) == 0) {
                /* Empty wavetable — use default silent sample */
                wave_data_ptr = 0;  /* will use lbL0037F6 equivalent */
                goto use_wave;
            }

            SET_L(v, VS_WAVE_LOOP, wave_list);
            SET_L(v, VS_WAVE_SAMP, RD32(wave_list));
            SET_B(v, VS_WAVE_FRAMES, RD8(wave_list + 4));
            uint32_t next = wave_list + 6;
            SET_L(v, VS_WAVE_POS, next);
            SET_B(v, VS_WAVE_ACTIVE, 0xFF);
        }

        /* Advance wavetable */
        uint8_t frames = V_B(v, VS_WAVE_FRAMES);
        frames--;
        SET_B(v, VS_WAVE_FRAMES, frames);

        if (frames == 0) {
            /* Next wavetable entry */
            uint32_t wpos = V_L(v, VS_WAVE_POS);
            if (RD32(wpos) == 0) {
                /* Loop back */
                wpos = V_L(v, VS_WAVE_LOOP);
            }
            SET_L(v, VS_WAVE_SAMP, RD32(wpos));
            SET_B(v, VS_WAVE_FRAMES, RD8(wpos + 4));

            /* Check loop flag */
            if (RD8(wpos + 5) != 0) {
                SET_L(v, VS_WAVE_LOOP, wpos - 6);
            }
            SET_L(v, VS_WAVE_POS, wpos + 6);
        }

        wave_data_ptr = V_L(v, VS_WAVE_SAMP);
        goto use_wave;
    } else {
        /* Normal sample mode */
        wave_data_ptr = RD32(samp_info + 10);
    }

use_wave:;

    /* ===== Period calculation ===== */
    /* ASM lbC002F40: base_note($11(A3)) + cur_note($9E) + transpose1($94) + transpose2($95) */
    uint16_t d0_note = 0;
    uint8_t note_sum = RD8(wave_data_ptr + 0x11)  /* base_note from sample_info */
                     + V_B(v, VS_CUR_NOTE)
                     + V_B(v, VS_TRANSPOSE1)
                     + V_B(v, VS_TRANSPOSE2);

    uint16_t porta_rate = V_W(v, VS_PORTA_RATE);
    uint16_t period;

    if (porta_rate == 0) {
        /* No portamento — use arpeggio table */
        uint32_t arp = V_L(v, VS_ARP_PTR);
        int8_t arp_val = 0;

        if (arp != 0 && arp < mod_size) {
            uint16_t arp_idx = V_W(v, VS_ARP_IDX);
            arp_val = RDS8(arp + 8 + arp_idx);
            if ((uint8_t)arp_val == 0x80) {
                /* End marker — wrap to start */
                arp_val = RDS8(arp + 8);
                arp_idx = 0xFFFF;  /* will be incremented to 0 */
            }
            arp_idx++;
            SET_W(v, VS_ARP_IDX, arp_idx);
        }

        uint8_t final_note = note_sum + (uint8_t)arp_val;
        /* ASL.B #1,D0 — multiply by 2 for table index */
        uint8_t tbl_idx = (final_note << 1) & 0xFF;
        period = period_table[tbl_idx / 2 < 96 ? tbl_idx / 2 : 95];
    } else {
        /* Portamento mode */
        uint8_t final_note = note_sum;
        uint8_t tbl_idx = (final_note << 1) & 0xFF;
        uint16_t target = period_table[tbl_idx / 2 < 96 ? tbl_idx / 2 : 95];

        uint16_t cur = V_W(v, VS_CUR_PERIOD);

        if (cur < target) {
            /* Slide up (period increases) */
            uint32_t new_per = (uint32_t)cur + porta_rate;
            if (new_per > 0xFFFF || (uint16_t)new_per >= target) {
                cur = target;
            } else {
                cur = (uint16_t)new_per;
            }
        } else if (cur > target) {
            /* Slide down (period decreases) */
            if (cur < porta_rate) {
                cur = target;
            } else {
                cur -= porta_rate;
                if (cur < target) cur = target;
            }
        }

        period = cur;
    }

    SET_W(v, VS_CUR_PERIOD, period);

    /* ===== Pitch modulation 1 (lbC002FDA) ===== */
    uint32_t detail = RD32(instr_ptr + 12);

    if (RD32(detail + 0x1A) != 0) {
        uint32_t mod_tbl = RD32(detail + 0x1A);
        uint32_t mod_data = RD32(mod_tbl + 8);

        if (V_B(v, VS_PMOD1_DLY) != 0) {
            uint8_t dly = V_B(v, VS_PMOD1_DLY);
            dly--;
            SET_B(v, VS_PMOD1_DLY, dly);
        } else {
            int16_t idx = V_SW(v, VS_PMOD1_IDX);
            if (idx >= 0) {
                int8_t mod_val = RDS8(mod_data + idx);
                int16_t mod_ext = (int16_t)mod_val;

                /* Check negate flag */
                if (RD8(detail + 0x21) != 0) {
                    mod_ext = -mod_ext;
                }

                /* Apply shift */
                uint8_t shift = RD8(detail + 0x1E);
                mod_ext <<= shift;
                period += mod_ext;

                idx++;
                uint16_t mod_len = RD16(mod_tbl + 12);
                if ((uint16_t)idx >= mod_len) {
                    idx = 0;
                    /* Check one-shot flag */
                    if (RD8(detail + 0x20) & 0x80) {
                        idx = -1;  /* $FFFF — stop */
                    }
                }
                SET_W(v, VS_PMOD1_IDX, (uint16_t)idx);
            }
        }
    }

    /* ===== Pitch modulation 2 (lbC00302A) ===== */
    if (RD32(detail + 0x22) != 0) {
        uint32_t mod_tbl = RD32(detail + 0x22);
        uint32_t mod_data = RD32(mod_tbl + 8);

        if (V_B(v, VS_PMOD2_DLY) != 0) {
            uint8_t dly = V_B(v, VS_PMOD2_DLY);
            dly--;
            SET_B(v, VS_PMOD2_DLY, dly);
        } else {
            int16_t idx = V_SW(v, VS_PMOD2_IDX);
            if (idx >= 0) {
                int8_t mod_val = RDS8(mod_data + idx);
                int16_t mod_ext = (int16_t)mod_val;

                if (RD8(detail + 0x29) != 0) {
                    mod_ext = -mod_ext;
                }

                uint8_t shift = RD8(detail + 0x26);
                mod_ext <<= shift;
                period += mod_ext;

                idx++;
                uint16_t mod_len = RD16(mod_tbl + 12);
                if ((uint16_t)idx >= mod_len) {
                    idx = 0;
                    if (RD8(detail + 0x28) & 0x80) {
                        idx = -1;
                    }
                }
                SET_W(v, VS_PMOD2_IDX, (uint16_t)idx);
            }
        }
    }

    /* ===== Add detune and write period ===== */
    {
        int16_t det = V_SW(v, VS_DETUNE);
        period += det;
    }
    hw_write_period(ch, period);
    SET_W(v, VS_LAST_PERIOD, period);

    /* ===== Sample pointer calculation ===== */
    if (RD8(samp_info + 8) != 0) {
        /* Wavetable mode — use animated wave_data_ptr */
        sample_ptr = wave_data_ptr;
    } else {
        /* Normal sample */
        sample_ptr = RD32(samp_info + 10);

        /* ASM lbC00307A: no trigger + not looping → skip sample write */
        if (V_B(v, VS_DMA_TRIG) == 0) {
            if (!(RD8(sample_ptr + 0x10) & 0x01)) {
                goto skip_sample;
            }
        }
    }

    /* Get sample data pointer and length */
    if (sample_ptr) {
        uint32_t samp_data = RD32(sample_ptr + 8);
        uint16_t samp_len_raw = RD16(sample_ptr + 12);
        sample_len = samp_len_raw >> 1;

        uint32_t samp_addr = samp_data;

        if (RD8(sample_ptr + 0x10) & 0x01) {
            /* Looping: halve length, then apply sample offset modulations */
            sample_len >>= 1;

            /* ===== Sample offset modulation 1 (lbC0030C2) ===== */

            if (RD32(detail + 0x2A) != 0) {
                uint32_t mod_tbl = RD32(detail + 0x2A);
                uint32_t mod_data = RD32(mod_tbl + 8);

                if (V_B(v, VS_SMOD1_DLY) != 0) {
                    uint8_t dly = V_B(v, VS_SMOD1_DLY);
                    dly--;
                    SET_B(v, VS_SMOD1_DLY, dly);
                } else {
                    int16_t idx = V_SW(v, VS_SMOD1_IDX);
                    if (idx >= 0) {
                        uint8_t mod_val = RD8(mod_data + idx);
                        uint8_t shift = RD8(detail + 0x2E) + 1;
                        /* ASM: ANDI.L #$FF,D6 then ASL.W D4,D6 — 16-bit shift */
                        uint16_t offset = (uint16_t)((uint16_t)mod_val << shift);
                        samp_addr += offset;

                        idx++;
                        uint16_t mod_len = RD16(mod_tbl + 12);
                        if ((uint16_t)idx >= mod_len) {
                            idx = 0;
                            if (RD8(detail + 0x30) & 0x80) {
                                idx = -1;
                            }
                        }
                        SET_W(v, VS_SMOD1_IDX, (uint16_t)idx);
                    }
                }
            }

            /* ===== Sample offset modulation 2 (lbC003110) ===== */
            /* ASM: smod2 delay loops back to its own entry (BRA.S lbC0030F6),
             * burning through the entire delay counter in one tick. */
            if (RD32(detail + 0x32) != 0) {
                uint32_t mod_tbl = RD32(detail + 0x32);
                uint32_t mod_data = RD32(mod_tbl + 8);

                /* Consume entire delay counter (ASM loops until zero) */
                while (V_B(v, VS_SMOD2_DLY) != 0) {
                    uint8_t dly = V_B(v, VS_SMOD2_DLY);
                    dly--;
                    SET_B(v, VS_SMOD2_DLY, dly);
                }

                {
                    int16_t idx = V_SW(v, VS_SMOD2_IDX);
                    if (idx >= 0) {
                        uint8_t mod_val = RD8(mod_data + idx);
                        uint8_t shift = RD8(detail + 0x36) + 1;
                        /* ASM: ANDI.L #$FF,D6 then ASL.W D4,D6 — 16-bit shift */
                        uint16_t offset = (uint16_t)((uint16_t)mod_val << shift);
                        samp_addr += offset;

                        idx++;
                        uint16_t mod_len = RD16(mod_tbl + 12);
                        if ((uint16_t)idx >= mod_len) {
                            idx = 0;
                            if (RD8(detail + 0x38) & 0x80) {
                                idx = -1;
                            }
                        }
                        SET_W(v, VS_SMOD2_IDX, (uint16_t)idx);
                    }
                }
            }
        }
        /* else: non-looping — full length, no modulation (ASM BEQ → lbC003144) */

        hw_write_sample(ch, samp_addr, sample_len);
    }

skip_sample:

    /* ===== Volume envelope (lbC00314A) ===== */
    {
        uint16_t vol_master = V_W(v, VS_MASTER_VOL);
        uint8_t  instr_vol = RD8(detail + 8);
        uint32_t vol = (uint32_t)vol_master * (uint32_t)instr_vol;
        uint8_t  env_level = V_B(v, VS_ENV_LEVEL);
        vol = (uint32_t)vol * (uint32_t)env_level;
        /* SWAP + LSR.B #2 = divide by 256*4 = 1024 */
        uint8_t final_vol = (uint8_t)((vol >> 16) >> 2);
        hw_write_volume(ch, final_vol);

        /* ===== Envelope state machine ===== */
        uint8_t note_trig = V_B(v, VS_NOTE_TRIG);

        if (note_trig == 0) {
            /* Release phase — subtract release rate */
            uint8_t rel_rate = RD8(detail + 0x18);
            if (env_level >= rel_rate) {
                env_level -= rel_rate;
            } else {
                env_level = 0;
            }
            SET_B(v, VS_ENV_LEVEL, env_level);
            goto env_done;
        }

        uint8_t phase = V_B(v, VS_ENV_PHASE);

        if (phase == 0) {
            /* Attack: add attack rate, check peak */
            uint8_t atk_rate = RD8(detail + 0x12);
            uint8_t atk_peak = RD8(detail + 0x13);
            if (atk_rate == atk_peak) goto phase1;

            uint16_t new_level = (uint16_t)env_level + atk_rate;
            if (new_level > 255 || (uint8_t)new_level >= atk_peak) {
                SET_B(v, VS_ENV_LEVEL, atk_peak);
                SET_B(v, VS_ENV_PHASE, 1);
            } else {
                SET_B(v, VS_ENV_LEVEL, (uint8_t)new_level);
            }
            goto env_done;
        }

phase1:
        if (phase <= 1) {
            /* Decay: subtract decay rate, check sustain level */
            uint8_t dec_rate = RD8(detail + 0x14);
            uint8_t sus_level = RD8(detail + 0x15);

            if (env_level >= dec_rate) {
                env_level -= dec_rate;
            } else {
                env_level = 0;
            }

            if (env_level <= sus_level) {
                SET_B(v, VS_ENV_LEVEL, sus_level);
                SET_B(v, VS_ENV_PHASE, 2);
            } else {
                SET_B(v, VS_ENV_LEVEL, env_level);
            }
            goto env_done;
        }

        if (phase == 2) {
            /* Sustain: add/subtract towards target */
            uint8_t sus_rate = RD8(detail + 0x16);
            uint8_t sus_target = RD8(detail + 0x17);

            if (sus_rate & 0x80) {
                /* Subtract */
                sus_rate &= 0x7F;
                if (env_level >= sus_rate) {
                    env_level -= sus_rate;
                } else {
                    env_level = 0;
                }
                if (env_level <= sus_target) {
                    SET_B(v, VS_ENV_LEVEL, sus_target);
                    SET_B(v, VS_ENV_PHASE, 3);
                } else {
                    SET_B(v, VS_ENV_LEVEL, env_level);
                }
            } else {
                /* Add */
                uint16_t new_level = (uint16_t)env_level + sus_rate;
                if (new_level > 255 || (uint8_t)new_level >= sus_target) {
                    SET_B(v, VS_ENV_LEVEL, sus_target);
                    SET_B(v, VS_ENV_PHASE, 3);
                } else {
                    SET_B(v, VS_ENV_LEVEL, (uint8_t)new_level);
                }
            }
            goto env_done;
        }

        /* Phase 3: hold at sustain target */
        {
            uint8_t sus_target = RD8(detail + 0x17);
            SET_B(v, VS_ENV_LEVEL, sus_target);
        }
    }

env_done:

    /* ===== DMA trigger (lbC00322A) ===== */
    if (V_B(v, VS_DMA_TRIG) != 0) {
        /* Enable DMA for this channel */
        hw_write_dmacon(V_W(v, VS_DMA_ON));
        SET_B(v, VS_DMA_TRIG, 0);
        return;
    }

    /* ===== Loop handling for non-wavetable samples ===== */
    if (RD8(samp_info + 8) == 0) {
        /* Check if sample has loop-to-silence flag */
        uint32_t samp_ptr2 = RD32(samp_info + 10);
        if (samp_ptr2 && (RD8(samp_ptr2 + 0x10) & 0x02)) {
            /* Set to 2-word empty sample for looping silence */
            hw_write_sample(ch, 0, 2);
        }
    }
}

/* ======================================================================
 * Play — main tick handler (called from interrupt)
 * Equivalent to the Play label at line 561 of the ASM
 * ====================================================================== */
void fp_play(void) {
    static int play_tick = 0;

    /* ===== Fade handling ===== */
    if (fade_state != 0) {
        if (fade_state & 0x80) {
            /* Fade out (0xFF) */
            if (fade_speed != 0) {
                if (fade_level >= fade_speed) {
                    fade_level -= fade_speed;
                    set_fade_level(fade_level);
                } else {
                    /* Fade complete — stop */
                    fade_state = 0;
                    set_fade_level(0);
                    silence_all();
                    return;
                }
            } else {
                /* No fade speed — immediate stop */
                fade_state = 0;
                set_fade_level(0);
                silence_all();
                return;
            }
        } else {
            /* Fade in (1) */
            if (fade_speed != 0) {
                uint16_t new_level = (uint16_t)fade_level + fade_speed;
                if (new_level > 255) {
                    /* Fade in complete */
                    set_fade_level(0);  /* 0 = full volume in this context */
                    goto tick;
                }
                set_fade_level((uint8_t)new_level);
            }
        }
    }

tick:
    /* ===== Tick counter ===== */
    tick_counter--;
    if (tick_counter == 0) {
        tick_counter = tick_speed;

        /* Read sequence for all 4 voices */
        for (int i = 0; i < 4; i++) {
            read_sequence(voice_data[i]);
        }
    }

    /* ===== Update audio for all 4 voices ===== */
    for (int i = 0; i < 4; i++) {
        update_audio(voice_data[i]);
    }

    /* Per-tick debug: print period + volume for all channels */
    if (play_tick < 200) {
        fprintf(stderr, "T%03d", play_tick);
        for (int i = 0; i < 4; i++) {
            uint8_t* v = voice_data[i];
            fprintf(stderr, " %d:%d/%d", i,
                    V_W(v, VS_CUR_PERIOD),
                    V_B(v, VS_ENV_LEVEL));
        }
        fprintf(stderr, "\n");
    }
    play_tick++;
}

/* ======================================================================
 * Module parsing and initialization
 * ====================================================================== */

/*
 * FP module format (from the ASM InitPlayer/InitSound):
 *
 * The module is an AmigaDOS executable (hunk format).
 * After loading, the code section starts with:
 *   offset 0: MOVEQ #-1,D0; RTS ($70FF4E75)
 *   offset 4: "F.PLAYER" signature
 *   offset 12: pointer to song name string
 *   offset 16: pointer to author name string
 *   offset 20: pointer to special info string
 *   offset 24: load size (long)
 *   offset 28: calculated size (long)
 *   offset 32: subsong table start
 *
 * Subsong table: pairs of (pattern_list_ptr, speed_word) until NULL.
 *
 * Each subsong's pattern_list has:
 *   offset 0: ??? (8 bytes header)
 *   offset 8: voice 0 sequence ptr (or NULL)
 *   offset 12: voice 1 sequence ptr (or NULL)
 *   offset 16: voice 2 sequence ptr (or NULL)
 *   offset 20: voice 3 sequence ptr (or NULL)
 *   offset 24: intro row count (long)
 */

int fp_init(const uint8_t* module_data, uint32_t module_len) {
    mod_base = module_data;
    mod_size = module_len;

    /* The module data passed to us is the raw file content.
     * For FP modules loaded via UADE, the LoadSeg strips the hunk headers.
     * We need to find the actual data section.
     *
     * Check for AmigaDOS hunk header ($000003F3) */
    if (mod_size < 44) return -1;

    uint32_t offset = 0;
    uint32_t code_size = mod_size;  /* default to full file */

    if (RD32(0) == 0x000003F3) {
        /* AmigaDOS executable — skip hunk headers */
        /* Hunk header: $3F3, 0, num_hunks, first, last, sizes... */
        uint32_t num_hunks = RD32(8);
        /* Skip: 4 (magic) + 4 (resident_libs) + 4 (num_hunks) + 4 (first) + 4 (last) */
        offset = 20;
        /* Skip hunk sizes */
        for (uint32_t i = 0; i < num_hunks; i++) {
            offset += 4;
        }
        /* Skip HUNK_CODE marker ($3E9) and code size */
        if (RD32(offset) == 0x000003E9) {
            code_size = RD32(offset + 4) * 4;
            offset += 8;  /* Now at start of code data */
        }
    }

    /* Adjust mod_base/mod_size to point at the code section.
     * All pointers stored in the module are offsets relative to the code
     * section start (as they would be after LoadSeg relocation on Amiga).
     * Use code_size (not file_size-offset) to exclude the relocation table. */
    if (offset > 0) {
        mod_base += offset;
        mod_size = code_size;
    }

    /* Verify signature: $70FF4E75 then "F.PL" then "AYER" */
    if (RD32(0) != 0x70FF4E75) return -1;
    if (RD32(4) != 0x462E504C) return -1;  /* "F.PL" */
    if (RD32(8) != 0x41594552) return -1;  /* "AYER" */

    /* Parse header — all pointers are code-section-relative offsets.
     * Header layout:
     *   +0:  $70FF4E75 "F.PLAYER" (12 bytes preamble)
     *   +12: song_name_ptr
     *   +16: author_name_ptr
     *   +20: special_info_ptr
     *   +24: load_size
     *   +28: calc_size
     *   +32: subsong table starts here (8 bytes per entry) */
    uint32_t song_table = 32;
    song_ptr = song_table;

    /* Count subsongs */
    num_subsongs = 0;
    uint32_t scan = song_table;
    while (scan + 8 <= mod_size) {
        if (RD32(scan) == 0) break;
        num_subsongs++;
        scan += 8;  /* each entry is 8 bytes: ptr + speed */
    }

    if (num_subsongs == 0) return -1;

    /* Set defaults */
    tick_speed = 4;
    tick_counter = 1;
    fade_state = 0;
    fade_speed = 0;
    fade_level = 0;
    skip_seq = 0;
    cmd_overflow = 0;
    intro_count = 0;
    wait_counter = 0;

    /* Initialize default arpeggio and instrument pointers.
     * These point to static data in the ASM (lbL00378E, lbL00379E).
     * For the C version, we'll handle them specially. */
    default_arp_ptr = 0;
    default_instr_ptr = 0;

    /* Reset Paula */
    paula_reset();

    /* Set default subsong (0) */
    fp_set_subsong(0);

    return 0;
}

void fp_set_subsong(int subsong) {
    if (subsong < 0 || subsong >= num_subsongs) subsong = 0;

    /* Clear voice data */
    memset(voice_data, 0, sizeof(voice_data));

    /* Init voices */
    init_voices();
    silence_all();

    /* Get subsong entry */
    uint32_t entry = song_ptr + subsong * 8;
    uint32_t song_data = RD32(entry);
    uint16_t speed_val = RD16(entry + 4);

    fprintf(stderr, "[FP] set_subsong(%d): entry=0x%X, song_data=0x%X, speed_val=0x%04X, mod_size=%u\n",
            subsong, entry, song_data, speed_val, mod_size);

    /* Speed comes from song_data+0x18, NOT from the subsong entry.
     * The ASM (lbC0032F0) reads: MOVE.B $18(A2),D0; ANDI.B #7,D0
     * If result is 0, default to 8. */
    uint8_t spd = RD8(song_data + 0x18) & 7;
    if (spd == 0) spd = 8;
    tick_speed = spd;
    tick_counter = 1;

    fprintf(stderr, "[FP] tick_speed=%d\n", tick_speed);

    /* Set up each voice's sequence pointer from the song data */
    for (int i = 0; i < 4; i++) {
        uint32_t voice_seq_ptr = RD32(song_data + 8 + i * 4);
        fprintf(stderr, "[FP] voice %d: seq_block_ptr=0x%X", i, voice_seq_ptr);
        if (voice_seq_ptr != 0) {
            uint32_t seq_data = RD32(voice_seq_ptr + 8);
            fprintf(stderr, " -> seq_data=0x%X", seq_data);
            SET_L(voice_data[i], VS_SEQ_POS, seq_data);
            SET_L(voice_data[i], VS_STACK_BASE, seq_data);
            SET_W(voice_data[i], VS_STACK_DEPTH, 0);
            SET_B(voice_data[i], VS_STATE, 0);
            SET_B(voice_data[i], VS_END_FLAG, 0);
            SET_B(voice_data[i], VS_ROW_TIMER, 1);
        }
    }

    /* Get intro count */
    intro_count = RD32(song_data + 24);

    /* Set fade state */
    fade_state = 0;
    fade_speed = speed_val >> 8;
    set_fade_level(0);

    /* lbC0034BE — After init, if no fade active, set full volume.
     * The ASM does: if (fade_state == 0) set_fade_level(0xFF) */
    if (fade_state == 0) {
        set_fade_level(0xFF);
    }

    /* Reset counters */
    skip_seq = 0;
    cmd_overflow = 0;
}

void fp_stop(void) {
    silence_all();
    for (int i = 0; i < 4; i++) {
        SET_B(voice_data[i], VS_STATE, 0x80);
        SET_B(voice_data[i], VS_END_FLAG, 0x80);
    }
}

int fp_get_num_subsongs(void) {
    return num_subsongs;
}

int fp_get_sample_rate(void) {
    return PAULA_RATE_PAL;
}

/* ======================================================================
 * Per-note instrument preview API
 * Uses voice 0 only. Caller provides the instrument pointer (file offset)
 * and a note value (1-96, matching the period table).
 * ====================================================================== */

static int preview_active = 0;

void fp_note_on(uint32_t instr_ptr, int note, int velocity) {
    if (!mod_base || mod_size == 0) return;
    if (instr_ptr == 0 || instr_ptr >= mod_size) return;
    if (note < 1) note = 1;
    if (note > 96) note = 96;

    /* Use voice 0 for preview */
    uint8_t* v = voice_data[0];

    /* Reset voice state */
    memset(v, 0, VOICE_SIZE);
    SET_W(v, VS_DMA_OFF, 0x0001);
    SET_W(v, VS_DMA_ON, 0x8001);
    SET_L(v, VS_PAULA_BASE, 0xDFF0A0);

    /* Set instrument */
    SET_L(v, VS_INSTR_PTR, instr_ptr);
    SET_L(v, VS_ARP_PTR, default_arp_ptr);
    SET_W(v, VS_ARP_IDX, 0);

    /* Set note and trigger */
    SET_B(v, VS_CUR_NOTE, (uint8_t)note);
    SET_B(v, VS_NOTE_TRIG, (uint8_t)note);
    SET_B(v, VS_DMA_TRIG, (uint8_t)note);
    SET_B(v, VS_STATE, 0);
    SET_B(v, VS_END_FLAG, 0);
    SET_B(v, VS_ROW_TIMER, 0xFF);  /* long duration */

    /* Set volume (velocity 0-127 → master vol 0-255) */
    int vol = velocity * 2;
    if (vol > 255) vol = 255;
    SET_W(v, VS_MASTER_VOL, (uint16_t)vol);

    /* Init envelope */
    SET_B(v, VS_ENV_PHASE, 0);
    uint32_t detail = RD32(instr_ptr + 12);
    SET_B(v, VS_ENV_LEVEL, RD8(detail + 0x12));  /* attack level */

    /* Clear modulation */
    SET_W(v, VS_PMOD1_IDX, 0);
    SET_W(v, VS_PMOD2_IDX, 0);
    SET_W(v, VS_SMOD1_IDX, 0);
    SET_W(v, VS_SMOD2_IDX, 0);
    SET_B(v, VS_PMOD1_DLY, 0);
    SET_B(v, VS_PMOD2_DLY, 0);
    SET_B(v, VS_SMOD1_DLY, 0);
    SET_B(v, VS_SMOD2_DLY, 0);
    SET_B(v, VS_WAVE_ACTIVE, 0);
    SET_B(v, VS_TRANSPOSE1, 0);
    SET_B(v, VS_TRANSPOSE2, 0);
    SET_W(v, VS_PORTA_RATE, 0);
    SET_W(v, VS_DETUNE, 0);

    preview_active = 1;
}

void fp_note_off(void) {
    if (!preview_active) return;
    uint8_t* v = voice_data[0];
    /* Clear note trigger → envelope enters release phase */
    SET_B(v, VS_NOTE_TRIG, 0);
    /* Disable DMA */
    hw_write_dmacon(V_W(v, VS_DMA_OFF));
    paula_set_volume(0, 0);
    SET_B(v, VS_STATE, 0x80);
    preview_active = 0;
}

void fp_preview_tick(void) {
    if (!preview_active) return;
    update_audio(voice_data[0]);
}

int fp_is_preview_active(void) {
    return preview_active;
}

/* Get instrument info for display.
 * Returns sample length in bytes (0 for wavetable/synth instruments).
 * Sets *is_wavetable to 1 if instrument uses wavetable mode. */
int fp_get_instrument_info(uint32_t instr_ptr, int* is_wavetable) {
    if (!mod_base || mod_size == 0 || instr_ptr == 0 || instr_ptr >= mod_size) {
        if (is_wavetable) *is_wavetable = 0;
        return 0;
    }
    uint32_t samp_info = RD32(instr_ptr + 8);
    if (samp_info == 0 || samp_info >= mod_size) {
        if (is_wavetable) *is_wavetable = 0;
        return 0;
    }
    int wt = (RD8(samp_info + 8) != 0) ? 1 : 0;
    if (is_wavetable) *is_wavetable = wt;
    if (wt) return 0;
    /* PCM: sample data ptr at +10, length at +4 (words) */
    uint16_t len_words = RD16(samp_info + 4);
    return (int)len_words * 2;
}
