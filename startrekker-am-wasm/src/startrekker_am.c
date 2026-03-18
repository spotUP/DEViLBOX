// startrekker_am.c — StarTrekker AM replayer, C port from StarTrekker_v1.2_AM.s
// Original 68k assembly by Björn Wesen / Exolon of Fairlight
// C port for DEViLBOX WASM module

#include "startrekker_am.h"
#include "paula_soft.h"
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

// ─── Module data (set by sam_init) ───────────────────────────────────────────
static uint8_t* g_mod  = NULL;   // replaces EQU mt_data  ($58000)
static uint8_t* g_nt   = NULL;   // replaces EQU mt_data2 ($55000)

// ─── Read helpers (big-endian) ────────────────────────────────────────────────
static inline uint16_t r16(const uint8_t* p, int off) {
    return (uint16_t)(((uint16_t)p[off] << 8) | p[off + 1]);
}
static inline int16_t rs16(const uint8_t* p, int off) {
    return (int16_t)r16(p, off);
}
static inline uint32_t r32(const uint8_t* p, int off) {
    return ((uint32_t)r16(p, off) << 16) | r16(p, off + 2);
}
static inline void w16(uint8_t* p, int off, uint16_t v) {
    p[off]     = (uint8_t)(v >> 8);
    p[off + 1] = (uint8_t)(v & 0xff);
}

// ─── NT instrument accessor (24-byte header, 120 bytes per instrument) ────────
static inline const uint8_t* nt_instr(int n) {
    // NT layout: 24-byte header, then 120-byte instrument blocks
    return g_nt + 24 + (n * 120);
}

// ─── Static waveform tables ───────────────────────────────────────────────────

// mt_sin — 32-byte vibrato sine table (ProTracker-style)
static const int8_t mt_sin[32] = {
    0, 0x18, 0x31, 0x4a, 0x61, 0x78, (int8_t)0x8d, (int8_t)0xa1,
    (int8_t)0xb4, (int8_t)0xc5, (int8_t)0xd4, (int8_t)0xe0,
    (int8_t)0xeb, (int8_t)0xf4, (int8_t)0xfa, (int8_t)0xfd,
    (int8_t)0xff, (int8_t)0xfd, (int8_t)0xfa, (int8_t)0xf4,
    (int8_t)0xeb, (int8_t)0xe0, (int8_t)0xd4, (int8_t)0xc5,
    (int8_t)0xb4, (int8_t)0xa1, (int8_t)0x8d, 0x78, 0x61, 0x4a, 0x31, 0x18
};

// mt_arplist — 32-byte arpeggio sequencer
static const uint8_t mt_arplist[32] = {
    0,1,2,0,1,2,0,1,2,0,1,2,0,
    1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1
};

// mt_periods — ProTracker period table (36 periods + terminal 0)
static const uint16_t mt_periods[37] = {
    0x358,0x328,0x2fa,0x2d0,0x2a6,0x280,0x25c,0x23a,0x21a,0x1fc,0x1e0,
    0x1c5,0x1ac,0x194,0x17d,0x168,0x153,0x140,0x12e,0x11d,0x10d,0xfe,
    0xf0,0xe2,0xd6,0xca,0xbe,0xb4,0xaa,0xa0,0x97,0x8f,0x87,
    0x7f,0x78,0x71,0
};

// mt_amwaveforms — 4 × 32 bytes = 128 bytes (must stay mutable for noise regen)
// Waveform 0: sine
// Waveform 1: sawtooth
// Waveform 2: square (blk.b 16,-128; blk.b 16,127)
// Waveform 3: noise (regenerated each tick by mt_noisewave)
static int8_t mt_amwaveforms[128] = {
    // 0: sine
    0,25,49,71,90,106,117,125,
    127,125,117,106,90,71,49,25,
    0,-25,-49,-71,-90,-106,-117,-125,
    -127,-125,-117,-106,-90,-71,-49,-25,
    // 1: sawtooth (-128 to +120)
    -128,-120,-112,-104,-96,-88,-80,-72,-64,-56,-48,
    -40,-32,-24,-16,-8,0,8,16,24,32,40,48,56,64,72,80,
    88,96,104,112,120,
    // NOTE: sawtooth is 32 bytes: 11+16+5 = 32 ✓
    // 2: square (16 × -128 then 16 × 127)
    -128,-128,-128,-128,-128,-128,-128,-128,
    -128,-128,-128,-128,-128,-128,-128,-128,
    127,127,127,127,127,127,127,127,
    127,127,127,127,127,127,127,127,
    // 3: noise (placeholder, regenerated each tick)
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
};

// mt_amsinus — 180 signed words, quarter-period of 0→127→0 sine for AM vibrato
static const int16_t mt_amsinus[180] = {
    0,2,4,6,8,0xb,0xd,0xf,0x11,0x14,0x16,0x18,0x1a,0x1c,0x1e,0x21,
    0x23,0x25,0x27,0x29,0x2b,0x2d,0x2f,0x32,0x34,0x36,0x38,0x3a,0x3c,0x3e,
    0x3f,0x41,0x43,0x45,0x47,0x49,0x4b,0x4d,0x4e,0x50,0x52,0x53,0x55,0x57,
    0x58,0x5a,0x5c,0x5d,0x5f,0x60,0x62,0x63,0x64,0x66,0x67,0x68,0x6a,0x6b,
    0x6c,0x6d,0x6e,0x6f,0x71,0x72,0x73,0x74,0x74,0x75,0x76,0x77,0x78,0x79,
    0x79,0x7a,0x7b,0x7b,0x7c,0x7c,0x7d,0x7d,0x7e,0x7e,0x7e,0x7f,0x7f,0x7f,
    0x7f,0x7f,0x7f,0x7f,0x80,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7f,0x7e,0x7e,
    0x7e,0x7d,0x7d,0x7c,0x7c,0x7b,0x7b,0x7a,0x79,0x79,0x78,0x77,0x76,0x75,
    0x74,0x73,0x72,0x71,0x6f,0x6e,0x6d,0x6c,0x6b,0x6a,0x68,0x67,0x66,0x64,
    0x63,0x62,0x60,0x5f,0x5d,0x5c,0x5a,0x58,0x57,0x55,0x53,0x52,0x50,0x4e,
    0x4d,0x4b,0x49,0x47,0x45,0x43,0x41,0x40,0x3e,0x3c,0x3a,0x38,0x36,0x34,
    0x32,0x2f,0x2d,0x2b,0x29,0x27,0x25,0x23,0x21,0x1e,0x1c,0x1a,0x18,0x16,
    0x14,0x11,0xf,0xd,0xb,0x8,0x6,0x4,0x2,0
};

// ─── Voice struct — matches 68k layout at mt_voice1/2/3/4 ────────────────────
// Each voice is 42 bytes (21 words).
//   +0  w: raw pattern cell word 0 (period/instr high nibble)
//   +2  w: raw pattern cell word 1 (instr low nibble / effect / param)
//   +4  l: current sample start ptr (C pointer stored as uint32_t offset)
//   +8  w: sample length in words
//   +10 l: loop start ptr
//   +14 w: loop length in words
//   +16 w: current period (playing period, modified by effects)
//   +18 w: volume (byte at +19 = 0-64)
//   +20 w: (unused)
//   +22 w: (unused)
//   +24 b: portamento target direction (0=up, 1=down)
//   +25 b: portamento speed (cached effect param)
//   +26 w: dmacon bit for this channel (1/2/4/8)
//   +28 w: (unused)
//   +30 w: AM mode flag (0=PCM, non-zero=AM instrument)
//   +32 w: AM current amplitude (0-255, output /4 to Paula volume 0-64)
//   +34 w: current instrument number (for NT lookup)
//   +36 w: AM vibrato phase accumulator (0-719)
//   +38 w: AM ADSR phase (0=off, 1=attack, 2=atk→dec, 3=decay, 4=sustain, 5=release)
//   +40 w: AM sustain tick counter

typedef struct {
    uint16_t cell0;         // +0:  raw pattern data bytes 0-1
    uint16_t cell1;         // +2:  raw pattern data bytes 2-3
    const int8_t* samp_ptr; // +4:  current sample data pointer (replaces long in 68k)
    uint16_t samp_len;      // +8:  sample length (words)
    const int8_t* loop_ptr; // +10: loop start pointer
    uint16_t loop_len;      // +14: loop length (words)
    uint16_t period;        // +16: current playing period
    uint8_t  volume;        // +18/+19 (byte at +19 in asm)
    uint8_t  _pad19;
    uint8_t  _pad20[4];
    uint8_t  port_dir;      // +24: portamento direction (0=up, 1=down)
    uint8_t  port_speed;    // +25: portamento speed
    uint16_t dmacon_bit;    // +26: DMACON bit (1/2/4/8)
    uint16_t port_target;   // +22 remap: tone portamento target period
    uint16_t vib_params;    // +24 remap: vibrato (high=speed, low=depth)
    uint8_t  vib_phase;     // +25 remap: vibrato phase counter
    uint16_t am_flag;       // +30: 0=PCM, 0xFFFF=AM
    uint16_t am_ampl;       // +32: AM current amplitude
    uint16_t am_instr;      // +34: instrument number (for NT lookup)
    uint16_t am_vib_phase;  // +36: AM vibrato accumulator (0-719)
    uint16_t am_adsr_phase; // +38: ADSR phase (0=off…5=release)
    uint16_t am_sustain_cnt;// +40: sustain tick counter
    int      ch;            // channel index 0-3 (extra, not in 68k struct)
} Voice;

// ─── Playback state ───────────────────────────────────────────────────────────
static Voice    s_voices[4];
static uint8_t  s_speed      = 6;
static uint8_t  s_counter    = 0;
static uint16_t s_pattpos    = 0;
static uint8_t  s_songpos    = 0;
static uint8_t  s_break_flag = 0;
static uint16_t s_dmacon_new = 0;

// Sample start pointers (computed during init, like mt_samplestarts)
#define MAX_SAMPLES 31
static const int8_t* s_sample_starts[MAX_SAMPLES];

// ─── Forward declarations ─────────────────────────────────────────────────────
static void mt_playvoice(Voice* v, const uint8_t* pattern_row);
static void mt_com(Voice* v);
static void mt_com2(Voice* v);
static void mt_amhandler(void);
static void mt_noisewave(void);

// ─── sam_init ─────────────────────────────────────────────────────────────────
int sam_init(const uint8_t* mod_data, int mod_len,
             const uint8_t* nt_data,  int nt_len)
{
    (void)mod_len; (void)nt_len;
    if (!mod_data || !nt_data) return 0;

    // Store pointers (we keep const-correct copies in the replayer state)
    g_mod = (uint8_t*)mod_data;
    g_nt  = (uint8_t*)nt_data;

    // ── Find highest pattern number in order table (mt_init style) ──
    const uint8_t* order_table = g_mod + 0x3B8;  // 128-byte pattern order
    uint8_t max_pat = 0;
    int i;
    for (i = 0; i < 128; i++) {
        if (order_table[i] > max_pat) max_pat = order_table[i];
    }
    uint32_t num_patterns = (uint32_t)max_pat + 1;
    uint32_t pattern_data_size = num_patterns * 1024;  // 256 rows * 4 bytes/ch * 4ch? No.

    // Standard MOD: each pattern = 64 rows × 4 channels × 4 bytes = 1024 bytes
    // Pattern data starts at offset 0x43C (after "M.K." signature at 0x438)
    const int8_t* sample_data_start =
        (const int8_t*)(g_mod + 0x43C + pattern_data_size);

    // ── Build sample start table ──
    // Assembly: a3 = mt_data + $C; length at (a3, instr*30) where instr is 1-based.
    // For the init loop, iterate instruments 1..31 using the same base.
    const uint8_t* instr_tbl = g_mod + 0x0C;
    const int8_t*  sptr = sample_data_start;
    for (i = 0; i < MAX_SAMPLES; i++) {
        s_sample_starts[i] = sptr;
        // instrument (i+1) length is at instr_tbl + (i+1)*30 + 0
        uint16_t len_words = r16(instr_tbl, (int)((i + 1) * 30));
        sptr += (uint32_t)len_words * 2;
    }

    // ── Initialize voices ──
    memset(s_voices, 0, sizeof(s_voices));
    s_voices[0].dmacon_bit = 1;
    s_voices[1].dmacon_bit = 2;
    s_voices[2].dmacon_bit = 4;
    s_voices[3].dmacon_bit = 8;
    s_voices[0].ch = 0;
    s_voices[1].ch = 1;
    s_voices[2].ch = 2;
    s_voices[3].ch = 3;

    // ── Reset playback state ──
    s_speed      = 6;
    s_counter    = 0;
    s_pattpos    = 0;
    s_songpos    = 0;
    s_break_flag = 0;
    s_dmacon_new = 0;

    paula_reset();
    return 1;
}

// ─── sam_end ──────────────────────────────────────────────────────────────────
void sam_end(void) {
    paula_dma_write(0x000F);  // disable all channels ($0xxx = disable)
}

// ─── sam_get_voice_info — per-channel instrument + position ───────────────────
void sam_get_voice_info(float* out8) {
    int i;
    for (i = 0; i < 4; i++) {
        float dbg[8];
        paula_debug_state(i, dbg);
        float instr = (float)s_voices[i].am_instr;
        float pos = 0.0f;
        // pos fraction = current position / sample length
        if (dbg[0] > 0.0f && dbg[4] > 0.0f) {  // dma_on && sample_len > 0
            pos = dbg[3] / dbg[4];  // pos / sample_len
            if (pos > 1.0f) pos = 1.0f;
        }
        out8[i * 2]     = instr;
        out8[i * 2 + 1] = pos;
    }
}

// ─── sam_set_pattern_cell — write a 4-byte ProTracker cell to MOD pattern data ─
void sam_set_pattern_cell(int pattern, int row, int channel, const uint8_t* cell4) {
    if (!g_mod || pattern < 0 || row < 0 || row >= 64 || channel < 0 || channel >= 4) return;
    uint8_t* dst = g_mod + 0x43C + (uint32_t)pattern * 1024 + (uint32_t)row * 16 + (uint32_t)channel * 4;
    dst[0] = cell4[0];
    dst[1] = cell4[1];
    dst[2] = cell4[2];
    dst[3] = cell4[3];
}

// ─── sam_set_nt_param — write a 16-bit value to NT instrument data ────────────
void sam_set_nt_param(int instr, int offset, int value) {
    if (!g_nt || instr < 1 || instr > 31) return;
    if (offset < 0 || offset > 118) return;  // 120-byte block, writing 2 bytes
    uint8_t* ni = g_nt + 24 + instr * 120;
    w16(ni, offset, (uint16_t)value);
}

// ─── mt_stopsound ─────────────────────────────────────────────────────────────
static void mt_stopsound(Voice* v) {
    paula_dma_write(v->dmacon_bit);  // disable this channel
}

// ─── mt_setport ───────────────────────────────────────────────────────────────
static void mt_setport(Voice* v) {
    uint16_t target = v->cell0 & 0x0FFF;
    v->port_target = target;
    // Clear port speed: if effect param != 0, cache it
    uint8_t speed = (uint8_t)(v->cell1 & 0xFF);
    if (speed != 0) {
        v->port_speed = speed;
        v->cell1 &= 0xFF00;  // clr.b 3(a4)
    }
    if (v->port_target == 0) {
        v->port_target = 0;
        return;  // mt_clrport
    }
    // Determine direction
    if (v->period <= target) {
        v->port_dir = 0;  // need to go down (larger period = lower pitch)
    } else {
        v->port_dir = 1;  // need to go up (smaller period = higher pitch)
    }
}

// ─── mt_port ──────────────────────────────────────────────────────────────────
static void mt_port(Voice* v) {
    uint8_t speed = (uint8_t)(v->cell1 & 0xFF);
    if (speed != 0) {
        v->port_speed = speed;
        v->cell1 &= 0xFF00;
    }
    if (v->port_target == 0) return;
    if (v->port_dir != 0) {
        // Going up (decreasing period)
        if (v->period > (int16_t)v->port_speed)
            v->period -= v->port_speed;
        if (v->period <= v->port_target) {
            v->period      = v->port_target;
            v->port_target = 0;
        }
    } else {
        // Going down (increasing period)
        v->period += v->port_speed;
        if (v->period >= v->port_target) {
            v->period      = v->port_target;
            v->port_target = 0;
        }
    }
    paula_set_period(v->ch, v->period);
}

// ─── mt_vib ───────────────────────────────────────────────────────────────────
static void mt_vib2(Voice* v) {
    // mt_vib2: use existing params (mt_vib updates them first if effect param != 0)
    uint8_t phase = v->vib_phase;
    uint8_t idx   = (phase >> 2) & 0x1F;
    int16_t depth = (int16_t)(mt_sin[idx]);
    if (depth < 0) depth = -depth;  // always positive magnitude
    uint8_t d = (uint8_t)(v->vib_params & 0x0F);  // depth nibble
    int32_t delta = ((int32_t)depth * d) >> 7;
    uint16_t per  = v->period;
    if (phase & 0x80) {
        // mt_vibsub: subtract
        per = (uint16_t)((int16_t)per - (int16_t)delta);
    } else {
        per = (uint16_t)((int16_t)per + (int16_t)delta);
    }
    paula_set_period(v->ch, per);
    // Advance phase: speed = upper nibble of vib_params
    uint8_t speed = (v->vib_params >> 4) & 0x3C;
    v->vib_phase += speed;
}

static void mt_vib(Voice* v) {
    uint8_t param = (uint8_t)(v->cell1 & 0xFF);
    if (param != 0) v->vib_params = param;
    mt_vib2(v);
}

// ─── mt_volslide ──────────────────────────────────────────────────────────────
static void mt_volslide(Voice* v) {
    uint8_t param = (uint8_t)(v->cell1 & 0xFF);
    uint8_t hi    = param >> 4;
    if (hi != 0) {
        int16_t vol = (int16_t)v->volume + hi;
        if (vol > 0x40) vol = 0x40;
        v->volume = (uint8_t)vol;
    } else {
        uint8_t lo = param & 0x0F;
        int16_t vol = (int16_t)v->volume - lo;
        if (vol < 0) vol = 0;
        v->volume = (uint8_t)vol;
    }
    paula_set_volume(v->ch, v->volume);
}

// ─── mt_arp ───────────────────────────────────────────────────────────────────
static void mt_arp(Voice* v) {
    uint8_t step = mt_arplist[s_counter & 0x1F];
    if (step == 0) {
        paula_set_period(v->ch, v->period);
        return;
    }
    uint8_t param = (uint8_t)(v->cell1 & 0xFF);
    uint8_t semi;
    if (step == 1) {
        semi = param >> 4;
    } else {  // step == 2
        semi = param & 0x0F;
    }
    uint16_t base = v->period & 0x0FFF;
    // Find in period table
    int j;
    for (j = 0; j < 36; j++) {
        if (base >= mt_periods[j]) {
            // Found entry at j; play j + semi
            int k = j - (int)semi;
            if (k < 0) k = 0;
            if (k > 35) k = 35;
            paula_set_period(v->ch, mt_periods[k]);
            return;
        }
    }
    paula_set_period(v->ch, v->period);
}

// ─── mt_portup/down ───────────────────────────────────────────────────────────
static void mt_portup(Voice* v) {
    uint8_t param = (uint8_t)(v->cell1 & 0xFF);
    int16_t per = (int16_t)v->period - param;
    if (per < 0x71) per = 0x71;
    v->period = (uint16_t)per;
    paula_set_period(v->ch, v->period);
}

static void mt_portdown(Voice* v) {
    uint8_t param = (uint8_t)(v->cell1 & 0xFF);
    int32_t per = (int32_t)v->period + param;
    if (per > 0x358) per = 0x358;
    v->period = (uint16_t)per;
    paula_set_period(v->ch, v->period);
}

// ─── mt_com2 — row-trigger effects ───────────────────────────────────────────
static void mt_com2(Voice* v) {
    uint8_t eff = (uint8_t)((v->cell1 >> 8) & 0x0F);
    uint8_t prm = (uint8_t)(v->cell1 & 0xFF);
    switch (eff) {
    case 0x0E:  // filter
        // In WASM there's no hardware filter to toggle; ignore
        break;
    case 0x0D:  // pattern break
        s_break_flag = 1;
        break;
    case 0x0B:  // song jump
        s_break_flag = 1;
        s_songpos    = (uint8_t)(prm - 1);
        break;
    case 0x0C:  // set volume
        if (prm > 0x40) prm = 0x40;
        v->volume = prm;
        paula_set_volume(v->ch, v->volume);
        break;
    case 0x0F:  // set speed
        if (prm > 0x1F) prm = 0x1F;
        if (prm == 0)   prm = 1;
        s_speed = prm;
        break;
    default:
        break;
    }
}

// ─── mt_com — per-tick effect handler (called when counter != 0) ──────────────
static void mt_com(Voice* v) {
    uint16_t eff_word = v->cell1;
    uint16_t full     = eff_word & 0x0FFF;
    if (full == 0) {
        paula_set_period(v->ch, v->period);
        return;
    }
    uint8_t eff = (uint8_t)((eff_word >> 8) & 0x0F);
    switch (eff) {
    case 0:  mt_arp(v);      break;
    case 1:  mt_portup(v);   break;
    case 2:  mt_portdown(v); break;
    case 3:  mt_port(v);     break;
    case 4:  mt_vib(v);      break;
    case 5:
        mt_port(v);
        mt_volslide(v);
        break;
    case 6:
        mt_vib2(v);
        mt_volslide(v);
        break;
    case 0x0A: mt_volslide(v); break;
    default:
        paula_set_period(v->ch, v->period);
        break;
    }
}

// ─── mt_playvoice — process one pattern row for one voice ─────────────────────
static void mt_playvoice(Voice* v, const uint8_t* row)
{
    // Load 4-byte pattern cell into voice
    v->cell0 = r16(row, 0);
    v->cell1 = r16(row, 2);

    // Extract instrument number: high nibble of byte0 | high nibble of byte2
    uint8_t instr_hi = (uint8_t)((v->cell0 >> 8) & 0xF0);
    uint8_t instr_lo = (uint8_t)((v->cell1 >> 12) & 0x0F);
    uint8_t instr    = instr_hi | instr_lo;

    if (instr != 0) {
        // New instrument
        v->am_instr = instr;

        // Check if this instrument has AM data in NT file
        const uint8_t* ni = nt_instr(instr);
        uint16_t am_magic = r16(ni, 0);
        v->am_flag = 0;
        uint16_t init_vol;

        if (am_magic == 0x414D) {  // "AM"
            uint16_t base_period = r16(ni, 6);
            // Initial volume = base_period / 4 (matching assembly lsr.w #2,d0)
            init_vol  = base_period >> 2;
            v->am_flag = 0xFFFF;
        } else {
            init_vol = 0;
            v->am_flag = 0;
        }
        v->volume = (uint8_t)(init_vol > 64 ? 64 : init_vol);

        // Set sample pointer from pre-computed table
        int sidx = (int)instr - 1;
        if (sidx < 0 || sidx >= MAX_SAMPLES) sidx = 0;
        v->samp_ptr = s_sample_starts[sidx];

        // Read sample header fields from instrument table.
        // Assembly: a3 = mt_data + $C; fields at a3 + instr*30 + offset
        // This skips the 22-byte instrument name, pointing directly at:
        //   +0: sample length (words), +2: finetune, +3: volume, +4: loop start, +6: loop len
        const uint8_t* shdr = g_mod + 0x0C + (uint32_t)instr * 30;
        v->samp_len  = r16(shdr, 0);   // words
        uint16_t lstart = r16(shdr, 4); // loop start in words
        uint16_t llen   = r16(shdr, 6); // loop length in words

        if (!v->am_flag) {
            // PCM instrument — use header volume
            v->volume = shdr[3];  // volume byte at shdr+3
            if (v->volume > 64) v->volume = 64;
        }

        if (llen > 1) {
            // Looped sample
            v->loop_ptr = v->samp_ptr + (uint32_t)lstart * 2;
            v->loop_len = (uint16_t)(lstart + llen);  // total length covering loop
        } else {
            v->loop_ptr = v->samp_ptr;
            v->loop_len = 0;
        }
    }

    // Extract period from pattern cell
    uint16_t period = v->cell0 & 0x0FFF;

    if (period == 0) goto mt_oldinstr;

    // Check if effect is portamento (3 or 5)
    {
        uint8_t eff = (uint8_t)((v->cell1 >> 8) & 0x0F);
        if (!v->am_flag) {
            if (v->samp_len == 0) { mt_stopsound(v); return; }
            if (v->volume == 0)   { mt_stopsound(v); return; }
            if (eff == 3 || eff == 5) { mt_setport(v); goto mt_com2_lbl; }
        }
    }

    // mt_rambo: trigger new note
    v->period   = period;
    v->vib_phase = 0;
    paula_dma_write(v->dmacon_bit);  // disable channel before reload

    if (v->am_flag) {
        // AM instrument
        const uint8_t* ni = nt_instr((int)v->am_instr);
        uint8_t  wf_num = (uint8_t)(r16(ni, 26) & 0x03);  // waveform 0-3
        const int8_t* wf_ptr = &mt_amwaveforms[wf_num * 32];

        paula_set_sample_ptr(v->ch, wf_ptr);
        paula_set_length(v->ch, 16);  // 16 words = 32 bytes (half-wave loop)

        // Store loop = same waveform (Paula loops the waveform)
        v->loop_ptr = wf_ptr;
        v->loop_len = 16;

        // Base period from NT[6], shifted by NT[34]
        uint16_t base_period = r16(ni, 6);
        uint16_t shift       = r16(ni, 34);
        if (shift > 0 && shift < 16) {
            period = (uint16_t)((uint32_t)period << shift);
        }
        v->period = period;

        // Initial amplitude = NT[6] (stored in am_ampl for ADSR start)
        v->am_ampl = base_period;

        // Reset ADSR: vib_phase=0, adsr_phase=1 (attack), sustain_cnt=0
        v->am_vib_phase  = 0;
        v->am_adsr_phase = 1;
        v->am_sustain_cnt = 0;

        // Set Paula period
        paula_set_period(v->ch, period);
    } else {
        // PCM instrument
        paula_set_sample_ptr(v->ch, v->samp_ptr);
        paula_set_length(v->ch, v->samp_len);
        paula_set_volume(v->ch, v->volume);
        paula_set_period(v->ch, v->period);
    }

    // Mark this channel for DMA enable
    s_dmacon_new |= v->dmacon_bit;
    goto mt_com2_lbl;

mt_oldinstr:
    // No new note — just process row effects
    ;

mt_com2_lbl:
    mt_com2(v);
}

// ─── mt_noisewave — regenerate noise waveform table ──────────────────────────
static void mt_noisewave(void) {
    // Original uses VHPOSR hardware for random bits; we use a simple LFSR
    static uint16_t seed = 0x7327;
    int8_t* buf = &mt_amwaveforms[3 * 32];  // noise waveform at index 3
    int i;
    for (i = 0; i < 32; i++) {
        buf[i] = (int8_t)(seed & 0xFF);
        seed += (uint16_t)i;
        seed ^= 124;
        seed  = (uint16_t)((seed << 3) | (seed >> 13));
    }
}

// ─── mt_amhandler — per-tick AM synthesis ADSR + vibrato ─────────────────────
static void mt_amhandler(void) {
    int v_idx;
    for (v_idx = 0; v_idx < 4; v_idx++) {
        Voice* v = &s_voices[v_idx];
        if (!v->am_flag) continue;        // not an AM voice
        if (!v->am_adsr_phase) continue;  // ADSR phase 0 = inactive

        const uint8_t* ni = nt_instr((int)v->am_instr);
        int16_t ampl      = (int16_t)v->am_ampl;
        int     phase     = (int)v->am_adsr_phase;

        if (phase == 1) {
            // Attack: move toward NT[8] at rate NT[10]
            int16_t target = rs16(ni, 8);
            int16_t rate   = rs16(ni, 10);
            if (ampl == target) {
                v->am_adsr_phase = 2;
            } else if (ampl < target) {
                ampl += rate;
                if (ampl >= target) { ampl = target; v->am_adsr_phase = 2; }
            } else {
                ampl -= rate;
                if (ampl <= target) { ampl = target; v->am_adsr_phase = 2; }
            }
        } else if (phase == 2) {
            // Second attack phase: move toward NT[12] at rate NT[14]
            int16_t target = rs16(ni, 12);
            int16_t rate   = rs16(ni, 14);
            if (ampl == target) {
                v->am_adsr_phase = 3;
            } else if (ampl < target) {
                ampl += rate;
                if (ampl >= target) { ampl = target; v->am_adsr_phase = 3; }
            } else {
                ampl -= rate;
                if (ampl <= target) { ampl = target; v->am_adsr_phase = 3; }
            }
        } else if (phase == 3) {
            // Decay: move toward NT[16] at rate NT[18]
            int16_t target = rs16(ni, 16);
            int16_t rate   = rs16(ni, 18);
            if (ampl == target) {
                v->am_adsr_phase  = 4;
                v->am_sustain_cnt = r16(ni, 20);
            } else if (ampl < target) {
                ampl += rate;
                if (ampl >= target) {
                    ampl = target;
                    v->am_adsr_phase  = 4;
                    v->am_sustain_cnt = r16(ni, 20);
                }
            } else {
                ampl -= rate;
                if (ampl <= target) {
                    ampl = target;
                    v->am_adsr_phase  = 4;
                    v->am_sustain_cnt = r16(ni, 20);
                }
            }
        } else if (phase == 4) {
            // Sustain: count down
            if (v->am_sustain_cnt > 0) {
                v->am_sustain_cnt--;
            } else {
                v->am_adsr_phase = 5;
            }
        } else {
            // Phase 5: release — decrement amplitude by NT[24]
            int16_t rate = rs16(ni, 24);
            ampl -= rate;
            if (ampl <= 0) {
                // Amplitude exhausted — stop voice
                v->am_flag       = 0;
                v->am_ampl       = 0;
                v->am_adsr_phase = 0;
                paula_dma_write(v->dmacon_bit);  // disable DMA
                continue;
            }
        }

        v->am_ampl = (uint16_t)ampl;

        // Output volume: ampl / 4 clamped to 0-64
        uint8_t vol = (uint8_t)(ampl >> 2);
        if (ampl < 0)   vol = 0;
        if (vol > 64)   vol = 64;
        paula_set_volume(v->ch, vol);

        // AM vibrato — uses mt_amsinus table
        uint16_t vib_freq_step = r16(ni, 28);
        int16_t  vib_ampl      = rs16(ni, 30);

        // Accumulate the period offset (add NT[28] to period each tick for pitch drift)
        v->period = (uint16_t)((int16_t)v->period + (int16_t)vib_freq_step);
        int16_t final_period = (int16_t)v->period;

        if (vib_ampl != 0) {
            uint16_t vib_phase = v->am_vib_phase;
            int      negate    = 0;
            if (vib_phase >= 360) {
                vib_phase -= 360;
                negate = 1;
            }
            // mt_amsinus is indexed as word offset (even values)
            // vib_phase is 0-359 in steps that maintain even alignment
            int16_t sin_val  = mt_amsinus[vib_phase / 2];
            int32_t delta    = ((int32_t)sin_val * vib_ampl) >> 7;
            if (negate) delta = -delta;
            final_period += (int16_t)delta;
        }

        if (final_period > 0)
            paula_set_period(v->ch, (uint16_t)final_period);

        // Advance vib phase by NT[32] * 2
        uint16_t vib_speed = r16(ni, 32);
        v->am_vib_phase += vib_speed * 2;
        if (v->am_vib_phase >= 720) v->am_vib_phase -= 720;
    }

    // Regenerate noise waveform
    mt_noisewave();
}

// ─── sam_music — one tick of the replayer (call at 50 Hz) ────────────────────
void sam_music(void) {
    s_counter++;
    if (s_counter >= s_speed) {
        // ── New row ──
        s_counter = 0;

        // Get pattern number for current song position
        const uint8_t* order_table = g_mod + 0x3B8;
        uint8_t        pat_num     = order_table[s_songpos & 0x7F];

        // Pattern data: each row is 4 channels × 4 bytes = 16 bytes
        // Pattern data starts at 0x43C; each pattern = 64 rows × 16 bytes = 1024 bytes
        // mt_pattpos is a byte offset within the pattern (0, 16, 32, … 1008)
        const uint8_t* pattern_base = g_mod + 0x43C + (uint32_t)pat_num * 1024;
        const uint8_t* row_base     = pattern_base + s_pattpos;

        // Get song instrument table offset (a3 in assembly = mod+$c for volumes)
        const uint8_t* instr_table = g_mod + 0x0C;

        s_dmacon_new = 0;

        // Process each voice
        mt_playvoice(&s_voices[0], row_base + 0);
        mt_playvoice(&s_voices[1], row_base + 4);
        mt_playvoice(&s_voices[2], row_base + 8);
        mt_playvoice(&s_voices[3], row_base + 12);
        (void)instr_table;

        // Enable DMA for voices that started a new note
        if (s_dmacon_new) {
            paula_dma_write(0x8000 | s_dmacon_new);  // enable
            // Set loop pointers for newly started voices
            int i;
            for (i = 0; i < 4; i++) {
                if (s_dmacon_new & s_voices[i].dmacon_bit) {
                    Voice* v = &s_voices[i];
                    if (v->am_flag) {
                        // AM: loop the waveform (16 words = 32 bytes)
                        paula_set_sample_ptr(v->ch, v->loop_ptr);
                        paula_set_length(v->ch, 16);
                    } else if (v->loop_len > 0) {
                        // PCM: set loop
                        paula_set_sample_ptr(v->ch, v->loop_ptr);
                        paula_set_length(v->ch, v->loop_len);
                    }
                    // PCM without loop: no reload needed (DMA will auto-stop)
                }
            }
        }

        // Advance pattern position
        s_pattpos += 16;
        if (s_pattpos >= 1024) {
            // End of pattern
            s_pattpos    = 0;
            s_break_flag = 0;

            // Advance song position
            s_songpos++;
            s_songpos &= 0x7F;

            // Check song end
            uint8_t song_len = g_mod[0x3B6];
            if (s_songpos >= song_len) {
                s_songpos = g_mod[0x3B7];  // loop back to restart position
            }
        }

        if (s_break_flag) {
            s_break_flag = 0;
            s_pattpos    = 0;
            s_songpos++;
            s_songpos &= 0x7F;
            uint8_t song_len = g_mod[0x3B6];
            if (s_songpos >= song_len) {
                s_songpos = g_mod[0x3B7];
            }
        }
    } else {
        // ── Mid-row ticks: process per-tick effects only ──
        mt_com(&s_voices[0]);
        mt_com(&s_voices[1]);
        mt_com(&s_voices[2]);
        mt_com(&s_voices[3]);
    }

    // AM handler runs every tick
    mt_amhandler();
}
