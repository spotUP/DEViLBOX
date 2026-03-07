/*
 * zxtune_wrapper.c - ZX Spectrum chiptune player using ayumi AY-3-8910 emulator
 *
 * Supports formats: PSG, PT3, YM (uncompressed YM2/3/3b/5/6), VTX (LH5 compressed)
 * Uses ayumi for accurate AY-3-8910 / YM2149 chip emulation.
 */

#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "ayumi.h"

/* ===== Configuration ===== */
#define MAX_MODULE_SIZE   (4 * 1024 * 1024)
#define MAX_CHANNELS      3
#define DEFAULT_CLOCK     1773400.0   /* ZX Spectrum 128K AY clock */
#define DEFAULT_FRAME_RATE 50
#define MAX_POSITIONS     256
#define MAX_PATTERNS      256
#define MAX_PATTERN_ROWS  64
#define MAX_SAMPLES       32
#define MAX_ORNAMENTS     16
#define MAX_SAMPLE_LINES  64
#define MAX_ORN_LINES     64

/* ===== Format enum ===== */
typedef enum {
    FMT_UNKNOWN = 0,
    FMT_PSG,
    FMT_PT3,
    FMT_YM,
    FMT_VTX
} ModuleFormat;

/* ===== Forward declarations for LH5 ===== */
static uint8_t* lh5_decompress(const uint8_t* src, int src_len, int dst_len, int* out_len);

/* ===== PSG state ===== */
typedef struct {
    const uint8_t* data;
    int data_len;
    int pos;
    int frame_skip;
} PsgState;

/* ===== PT3 structures ===== */
typedef struct {
    int tone_shift;
    int amplitude;
    int tone_mask;    /* 1 = tone off */
    int noise_mask;   /* 1 = noise off */
    int env_mask;     /* 1 = envelope on */
    int noise_or_env;
    int accumulate;
} Pt3SampleLine;

typedef struct {
    Pt3SampleLine lines[MAX_SAMPLE_LINES];
    int length;
    int loop;
} Pt3Sample;

typedef struct {
    int8_t values[MAX_ORN_LINES];
    int length;
    int loop;
} Pt3Ornament;

typedef struct {
    int enabled;
    int note;
    int sample_num;
    int ornament_num;
    int sample_pos;
    int ornament_pos;
    int volume;
    int tone_slide;
    int tone_slide_step;
    int tone_accumulator;
    int env_enabled;
} Pt3Channel;

typedef struct {
    const uint8_t* data;
    int data_len;
    int version;
    int delay;
    int num_positions;
    int loop_position;
    int patterns_offset;
    int positions[MAX_POSITIONS];
    Pt3Sample samples[MAX_SAMPLES];
    Pt3Ornament ornaments[MAX_ORNAMENTS];
    int pattern_ptrs[MAX_PATTERNS][3];
    Pt3Channel channels[3];
    int current_position;
    int current_row;
    int current_delay;
    int delay_counter;
    int env_base_period;
    int env_type;
    int noise_base;
} Pt3State;

/* ===== YM state ===== */
typedef struct {
    const uint8_t* reg_data;
    int num_frames;
    int current_frame;
    int num_regs;
    int frame_rate;
    int chip_type;       /* 0=AY, 1=YM */
    double clock_rate;
    int interleaved;
    int loop_frame;
} YmState;

/* ===== Global state ===== */
static struct ayumi g_ay;
static int g_initialized = 0;
static int g_sample_rate = 44100;
static int g_frame_rate = DEFAULT_FRAME_RATE;
static double g_clock_rate = DEFAULT_CLOCK;
static int g_is_ym = 0;
static ModuleFormat g_format = FMT_UNKNOWN;
static float g_channel_gain[MAX_CHANNELS] = {1.0f, 1.0f, 1.0f};
static int g_playing = 0;
static int g_subsong = 0;
static double g_samples_per_frame = 0;
static double g_sample_accumulator = 0;
static uint8_t* g_module_data = NULL;
static int g_module_len = 0;
static uint8_t* g_decompressed = NULL;  /* For VTX/YM LHA decompressed data */

static PsgState g_psg;
static Pt3State g_pt3;
static YmState g_ym;
static uint8_t g_regs[14];

/* ===== PT3 tone tables ===== */
static const int PT3_TABLE_ST[] = {
    0x0EF8,0x0E10,0x0D60,0x0C80,0x0BD8,0x0B28,0x0A88,0x09F0,0x0960,0x08E0,0x0858,0x07E0,
    0x077C,0x0708,0x06B0,0x0640,0x05EC,0x0594,0x0544,0x04F8,0x04B0,0x0470,0x042C,0x03F0,
    0x03BE,0x0384,0x0358,0x0320,0x02F6,0x02CA,0x02A2,0x027C,0x0258,0x0238,0x0216,0x01F8,
    0x01DF,0x01C2,0x01AC,0x0190,0x017B,0x0165,0x0151,0x013E,0x012C,0x011C,0x010B,0x00FC,
    0x00EF,0x00E1,0x00D6,0x00C8,0x00BD,0x00B2,0x00A8,0x009F,0x0096,0x008E,0x0085,0x007E,
    0x0077,0x0070,0x006B,0x0064,0x005E,0x0059,0x0054,0x004F,0x004B,0x0047,0x0042,0x003F,
    0x003B,0x0038,0x0035,0x0032,0x002F,0x002C,0x002A,0x0027,0x0025,0x0023,0x0021,0x001F,
    0x001D,0x001C,0x001A,0x0019,0x0017,0x0016,0x0015,0x0013,0x0012,0x0011,0x0010,0x000F,
};

static const int PT3_TABLE_VT2[] = {
    0x0CDA,0x0C22,0x0B73,0x0ACF,0x0A33,0x09A1,0x0917,0x0894,0x0819,0x07A4,0x0737,0x06CF,
    0x066D,0x0611,0x05BA,0x0567,0x051A,0x04D0,0x048B,0x044A,0x040C,0x03D2,0x039B,0x0367,
    0x0337,0x0308,0x02DD,0x02B4,0x028D,0x0268,0x0246,0x0225,0x0206,0x01E9,0x01CE,0x01B4,
    0x019B,0x0184,0x016E,0x015A,0x0146,0x0134,0x0123,0x0112,0x0103,0x00F5,0x00E7,0x00DA,
    0x00CE,0x00C2,0x00B7,0x00AD,0x00A3,0x009A,0x0091,0x0089,0x0082,0x007A,0x0073,0x006D,
    0x0067,0x0061,0x005C,0x0056,0x0052,0x004D,0x0049,0x0045,0x0041,0x003D,0x003A,0x0036,
    0x0033,0x0031,0x002E,0x002B,0x0029,0x0027,0x0024,0x0022,0x0020,0x001F,0x001D,0x001B,
    0x001A,0x0018,0x0017,0x0016,0x0014,0x0013,0x0012,0x0011,0x0010,0x000F,0x000E,0x000D,
};

/* ===== Utility ===== */
static int read_u16le(const uint8_t* p) { return p[0] | (p[1] << 8); }

static void apply_regs_to_ayumi(void) {
    ayumi_set_tone(&g_ay, 0, g_regs[0] | (g_regs[1] << 8));
    ayumi_set_tone(&g_ay, 1, g_regs[2] | (g_regs[3] << 8));
    ayumi_set_tone(&g_ay, 2, g_regs[4] | (g_regs[5] << 8));
    ayumi_set_noise(&g_ay, g_regs[6]);
    for (int i = 0; i < 3; i++) {
        int t_off = (g_regs[7] >> i) & 1;
        int n_off = (g_regs[7] >> (i + 3)) & 1;
        int e_on  = (g_regs[8 + i] >> 4) & 1;
        ayumi_set_mixer(&g_ay, i, t_off, n_off, e_on);
    }
    ayumi_set_volume(&g_ay, 0, g_regs[8] & 0x0F);
    ayumi_set_volume(&g_ay, 1, g_regs[9] & 0x0F);
    ayumi_set_volume(&g_ay, 2, g_regs[10] & 0x0F);
    ayumi_set_envelope(&g_ay, g_regs[11] | (g_regs[12] << 8));
    if (g_regs[13] != 0xFF) {
        ayumi_set_envelope_shape(&g_ay, g_regs[13]);
    }
}

/* ===== PSG format ===== */
static int psg_detect(const uint8_t* data, int len) {
    return (len >= 16 && data[0] == 'P' && data[1] == 'S' && data[2] == 'G' && data[3] == 0x1A);
}

static int psg_init(const uint8_t* data, int len) {
    g_psg.data = data;
    g_psg.data_len = len;
    g_psg.pos = 16;  /* skip header */
    g_psg.frame_skip = 0;
    memset(g_regs, 0, sizeof(g_regs));
    g_regs[13] = 0xFF;
    return 0;
}

static int psg_frame(void) {
    if (g_psg.frame_skip > 0) { g_psg.frame_skip--; return 1; }
    while (g_psg.pos < g_psg.data_len) {
        uint8_t cmd = g_psg.data[g_psg.pos++];
        if (cmd == 0xFD) { g_psg.pos = 16; return 1; }       /* end -> loop */
        if (cmd == 0xFF) { return 1; }                         /* end of frame */
        if (cmd == 0xFE) {
            if (g_psg.pos < g_psg.data_len)
                g_psg.frame_skip = g_psg.data[g_psg.pos++] * 4;
            return 1;
        }
        if (cmd < 14 && g_psg.pos < g_psg.data_len) {
            g_regs[cmd] = g_psg.data[g_psg.pos++];
        }
    }
    g_psg.pos = 16;
    return 1;
}

/* ===== PT3 format ===== */
static int pt3_detect(const uint8_t* data, int len) {
    if (len < 100) return 0;
    if (memcmp(data, "ProTracker 3.", 13) == 0) return 1;
    if (len >= 18 && memcmp(data, "Vortex Tracker II", 17) == 0) return 1;
    return 0;
}

static int pt3_init(const uint8_t* data, int len) {
    memset(&g_pt3, 0, sizeof(g_pt3));
    g_pt3.data = data;
    g_pt3.data_len = len;

    /* Detect version from header string */
    if (data[13] >= '0' && data[13] <= '9')
        g_pt3.version = data[13] - '0';
    else
        g_pt3.version = 6;

    g_pt3.delay = data[64];
    if (g_pt3.delay < 1) g_pt3.delay = 6;
    g_pt3.num_positions = data[65];
    if (g_pt3.num_positions > MAX_POSITIONS) g_pt3.num_positions = MAX_POSITIONS;
    if (g_pt3.num_positions < 1) g_pt3.num_positions = 1;
    g_pt3.loop_position = data[66];
    if (g_pt3.loop_position >= g_pt3.num_positions) g_pt3.loop_position = 0;
    g_pt3.patterns_offset = read_u16le(data + 67);

    /* Parse sample pointers (offset 69, up to 16 samples) */
    for (int i = 0; i < 16 && 69 + i * 2 + 1 < len; i++) {
        int off = read_u16le(data + 69 + i * 2);
        if (off > 0 && off + 3 < len) {
            Pt3Sample* s = &g_pt3.samples[i];
            s->loop = data[off];
            s->length = data[off + 1];
            if (s->length > MAX_SAMPLE_LINES) s->length = MAX_SAMPLE_LINES;
            if (s->loop >= s->length) s->loop = 0;
            int base = off + 2;
            for (int j = 0; j < s->length && base + j * 4 + 3 < len; j++) {
                uint8_t b0 = data[base + j * 4];
                uint8_t b1 = data[base + j * 4 + 1];
                uint8_t b2 = data[base + j * 4 + 2];
                uint8_t b3 = data[base + j * 4 + 3];
                Pt3SampleLine* l = &s->lines[j];
                l->accumulate = (b0 >> 7) & 1;
                l->tone_mask = (b0 >> 6) & 1;
                l->noise_mask = (b0 >> 5) & 1;
                l->noise_or_env = b0 & 0x1F;
                l->env_mask = b1 & 1;
                l->amplitude = b3 & 0x0F;
                int ts = b2 | ((b3 & 0xF0) << 4);
                if (ts & 0x800) ts |= ~0xFFF;
                l->tone_shift = ts;
            }
        }
    }

    /* Parse ornament pointers (offset 101, up to 16 ornaments) */
    for (int i = 0; i < 16 && 101 + i * 2 + 1 < len; i++) {
        int off = read_u16le(data + 101 + i * 2);
        if (off > 0 && off + 2 < len) {
            Pt3Ornament* o = &g_pt3.ornaments[i];
            o->loop = data[off];
            o->length = data[off + 1];
            if (o->length > MAX_ORN_LINES) o->length = MAX_ORN_LINES;
            if (o->loop >= o->length) o->loop = 0;
            int base = off + 2;
            for (int j = 0; j < o->length && base + j < len; j++) {
                o->values[j] = (int8_t)data[base + j];
            }
        }
    }

    /* Position list at offset 133 */
    for (int i = 0; i < g_pt3.num_positions && 133 + i < len; i++) {
        g_pt3.positions[i] = data[133 + i];
    }

    /* Parse pattern data pointers */
    if (g_pt3.patterns_offset > 0 && g_pt3.patterns_offset + 5 < len) {
        int pp = g_pt3.patterns_offset;
        for (int pat = 0; pat < MAX_PATTERNS && pp + 5 < len; pat++) {
            int a = read_u16le(data + pp);
            int b = read_u16le(data + pp + 2);
            int c = read_u16le(data + pp + 4);
            if (a == 0 && b == 0 && c == 0) break;
            g_pt3.pattern_ptrs[pat][0] = a;
            g_pt3.pattern_ptrs[pat][1] = b;
            g_pt3.pattern_ptrs[pat][2] = c;
            pp += 6;
        }
    }

    /* Init playback */
    g_pt3.current_position = 0;
    g_pt3.current_row = 0;
    g_pt3.current_delay = g_pt3.delay;
    g_pt3.delay_counter = 1;
    for (int ch = 0; ch < 3; ch++) {
        g_pt3.channels[ch].volume = 15;
        g_pt3.channels[ch].sample_num = 1;
    }
    return 0;
}

static void pt3_decode_channel(int ch_idx) {
    Pt3Channel* ch = &g_pt3.channels[ch_idx];
    int pat = g_pt3.positions[g_pt3.current_position];
    if (pat >= MAX_PATTERNS) return;
    int data_off = g_pt3.pattern_ptrs[pat][ch_idx];
    if (data_off <= 0 || data_off >= g_pt3.data_len) return;

    /* Seek to current row (variable-length stream) */
    int pos = data_off;
    int row = 0;
    while (row < g_pt3.current_row && pos < g_pt3.data_len) {
        uint8_t c = g_pt3.data[pos];
        if (c >= 0x01 && c <= 0x5F) { pos++; row++; }
        else if (c >= 0x60 && c <= 0x6F) { pos++; }
        else if (c >= 0x70 && c <= 0x7F) { pos++; }
        else if (c >= 0x80 && c <= 0x8F) { pos += 3; }
        else if (c == 0xC0) { pos++; row++; }
        else if (c == 0xD0) { return; }
        else if (c == 0xB0) { pos += 3; }
        else if (c == 0xB1) { pos += 2; }
        else if (c >= 0xF0) { pos++; }
        else { pos++; row++; }
    }
    if (pos >= g_pt3.data_len) return;

    /* Decode current row */
    int done = 0;
    while (!done && pos < g_pt3.data_len) {
        uint8_t c = g_pt3.data[pos++];
        if (c >= 0x01 && c <= 0x5F) {
            ch->note = c - 1;
            ch->enabled = 1;
            ch->sample_pos = 0;
            ch->ornament_pos = 0;
            ch->tone_accumulator = 0;
            ch->tone_slide = 0;
            done = 1;
        } else if (c >= 0x60 && c <= 0x6F) {
            ch->sample_num = c & 0x0F;
        } else if (c >= 0x70 && c <= 0x7F) {
            ch->ornament_num = c & 0x0F;
            ch->ornament_pos = 0;
        } else if (c >= 0x80 && c <= 0x8F) {
            if (pos + 1 < g_pt3.data_len) {
                g_pt3.env_type = c & 0x0F;
                g_pt3.env_base_period = read_u16le(g_pt3.data + pos);
                pos += 2;
                ch->env_enabled = 1;
            }
        } else if (c == 0xC0) {
            ch->enabled = 0;
            done = 1;
        } else if (c == 0xD0) {
            done = 1;
        } else if (c == 0xB0) {
            if (pos + 2 < g_pt3.data_len) {
                g_pt3.env_type = g_pt3.data[pos++];
                g_pt3.env_base_period = read_u16le(g_pt3.data + pos);
                pos += 2;
            }
        } else if (c == 0xB1) {
            if (pos < g_pt3.data_len) {
                g_pt3.current_delay = g_pt3.data[pos++];
                if (g_pt3.current_delay < 1) g_pt3.current_delay = 1;
            }
        } else if (c >= 0xF0) {
            ch->volume = c & 0x0F;
        } else {
            done = 1;
        }
    }
}

static int pt3_frame(void) {
    g_pt3.delay_counter--;
    if (g_pt3.delay_counter <= 0) {
        g_pt3.delay_counter = g_pt3.current_delay;
        for (int ch = 0; ch < 3; ch++) pt3_decode_channel(ch);
        g_pt3.current_row++;
        if (g_pt3.current_row >= MAX_PATTERN_ROWS) {
            g_pt3.current_row = 0;
            g_pt3.current_position++;
            if (g_pt3.current_position >= g_pt3.num_positions) {
                g_pt3.current_position = g_pt3.loop_position;
            }
        }
    }

    /* Build AY registers */
    memset(g_regs, 0, sizeof(g_regs));
    g_regs[7] = 0x3F;
    g_regs[13] = 0xFF;

    for (int ch = 0; ch < 3; ch++) {
        Pt3Channel* c = &g_pt3.channels[ch];
        if (!c->enabled) continue;

        Pt3Sample* smp = &g_pt3.samples[c->sample_num < MAX_SAMPLES ? c->sample_num : 0];
        Pt3Ornament* orn = &g_pt3.ornaments[c->ornament_num < MAX_ORNAMENTS ? c->ornament_num : 0];

        int spos = c->sample_pos;
        if (smp->length > 0) {
            if (spos >= smp->length) spos = smp->loop;
        } else { spos = 0; }
        Pt3SampleLine* sl = (smp->length > 0 && spos < smp->length) ? &smp->lines[spos] : NULL;

        int opos = c->ornament_pos;
        if (orn->length > 0) {
            if (opos >= orn->length) opos = orn->loop;
        } else { opos = 0; }
        int orn_val = (orn->length > 0 && opos < orn->length) ? orn->values[opos] : 0;

        int note = c->note + orn_val;
        if (note < 0) note = 0;
        if (note > 95) note = 95;

        const int* table = (g_pt3.version >= 6) ? PT3_TABLE_VT2 : PT3_TABLE_ST;
        int tp = table[note] + c->tone_slide + (sl ? sl->tone_shift : 0) + c->tone_accumulator;
        if (tp < 0) tp = 0;
        if (tp > 0xFFF) tp = 0xFFF;

        if (sl && sl->accumulate) c->tone_accumulator += sl->tone_shift;

        g_regs[ch * 2] = tp & 0xFF;
        g_regs[ch * 2 + 1] = (tp >> 8) & 0x0F;

        int vol = sl ? sl->amplitude : 15;
        vol = (vol * c->volume) / 15;
        g_regs[8 + ch] = c->env_enabled ? (vol | 0x10) : (vol & 0x0F);

        int tone_on = sl ? !sl->tone_mask : 1;
        int noise_on = sl ? !sl->noise_mask : 0;
        if (tone_on) g_regs[7] &= ~(1 << ch);
        if (noise_on) {
            g_regs[7] &= ~(1 << (ch + 3));
            g_regs[6] = sl ? (sl->noise_or_env & 0x1F) : 0;
        }

        if (smp->length > 0) {
            c->sample_pos++;
            if (c->sample_pos >= smp->length) c->sample_pos = smp->loop;
        }
        if (orn->length > 0) {
            c->ornament_pos++;
            if (c->ornament_pos >= orn->length) c->ornament_pos = orn->loop;
        }
    }

    if (g_pt3.env_type > 0 && g_pt3.env_type <= 0x0F) {
        g_regs[11] = g_pt3.env_base_period & 0xFF;
        g_regs[12] = (g_pt3.env_base_period >> 8) & 0xFF;
    }

    return 1;
}

/* ===== YM format ===== */
static int ym_detect(const uint8_t* data, int len) {
    if (len < 4) return 0;
    /* Check for YM signature or LHA header */
    if (data[0] == 'Y' && data[1] == 'M' && data[2] >= '2' && data[2] <= '6') return 1;
    /* LHA archive (often used for YM files) */
    if (len > 22 && data[2] == '-' && data[3] == 'l' && data[4] == 'h') return 1;
    return 0;
}

static int ym_init_raw(const uint8_t* data, int len) {
    memset(&g_ym, 0, sizeof(g_ym));
    if (len < 8) return -1;

    int version = data[2] - '0';
    if (version < 2 || version > 6) return -1;

    /* Check end marker */
    int has_end_marker = 0;
    if (len >= 4 && memcmp(data + len - 4, "End!", 4) == 0) {
        has_end_marker = 1;
    }

    if (version <= 3) {
        /* YM2/YM3/YM3b: simple interleaved register dump */
        int hdr = 4;
        int has_loop = (data[3] == 'b');
        int effective_len = len - hdr;
        if (has_end_marker) effective_len -= 4;

        int loop_bytes = 0;
        if (has_loop) {
            /* Last 4 bytes before End! = loop frame (LE) */
            effective_len -= 4;
            int lp_off = hdr + effective_len;
            if (lp_off + 3 < len)
                g_ym.loop_frame = data[lp_off] | (data[lp_off+1]<<8) | (data[lp_off+2]<<16) | (data[lp_off+3]<<24);
            loop_bytes = 4;
        }

        g_ym.num_regs = 14;
        g_ym.num_frames = effective_len / g_ym.num_regs;
        if (g_ym.num_frames < 1) return -1;
        g_ym.reg_data = data + hdr;
        g_ym.interleaved = 1;
        g_ym.frame_rate = 50;
        g_ym.clock_rate = DEFAULT_CLOCK;
        g_ym.chip_type = 1;
        return 0;
    }

    /* YM5/YM6 */
    if (len < 34) return -1;

    /* Check "LeOnArD!" at offset 4 */
    if (memcmp(data + 4, "LeOnArD!", 8) != 0) return -1;

    g_ym.num_frames = (data[12]<<24) | (data[13]<<16) | (data[14]<<8) | data[15];
    int attrs = (data[16]<<24) | (data[17]<<16) | (data[18]<<8) | data[19];
    g_ym.interleaved = (attrs & 1);
    int num_dd = (data[20]<<8) | data[21];

    g_ym.clock_rate = (data[22]<<24) | (data[23]<<16) | (data[24]<<8) | data[25];
    if (g_ym.clock_rate < 1000000) g_ym.clock_rate = DEFAULT_CLOCK;

    g_ym.frame_rate = (data[26]<<8) | data[27];
    if (g_ym.frame_rate < 25 || g_ym.frame_rate > 100) g_ym.frame_rate = 50;

    g_ym.loop_frame = (data[28]<<24) | (data[29]<<16) | (data[30]<<8) | data[31];

    int extra = (data[32]<<8) | data[33];
    int pos = 34 + extra;

    /* Skip digidrums */
    for (int i = 0; i < num_dd && pos + 4 <= len; i++) {
        int dd_sz = (data[pos]<<24) | (data[pos+1]<<16) | (data[pos+2]<<8) | data[pos+3];
        pos += 4 + dd_sz;
    }

    /* Skip 3 null-terminated strings */
    for (int s = 0; s < 3; s++) {
        while (pos < len && data[pos]) pos++;
        if (pos < len) pos++;
    }

    g_ym.num_regs = 16;
    int avail = len - pos;
    if (has_end_marker) avail -= 4;
    if (g_ym.num_regs * g_ym.num_frames > avail) {
        g_ym.num_regs = 14;
        if (g_ym.num_regs * g_ym.num_frames > avail) return -1;
    }

    g_ym.reg_data = data + pos;
    g_ym.chip_type = 1;
    return 0;
}

/* Extract content from LHA level-0/1 archive */
static uint8_t* lha_extract_file(const uint8_t* data, int len, int* out_len) {
    if (len < 22) return NULL;

    int hdr_size = data[0];
    if (hdr_size < 20) return NULL;

    /* Check method "-lhX-" at bytes 2-6 */
    if (data[2] != '-' || data[3] != 'l' || data[4] != 'h' || data[6] != '-') return NULL;
    int method = data[5] - '0';

    int comp_size = data[7] | (data[8]<<8) | (data[9]<<16) | (data[10]<<24);
    int orig_size = data[11] | (data[12]<<8) | (data[13]<<16) | (data[14]<<24);

    if (orig_size <= 0 || orig_size > MAX_MODULE_SIZE) return NULL;

    int data_off = hdr_size + 2;
    if (data_off + comp_size > len) return NULL;

    if (method == 0) {
        /* Stored */
        uint8_t* r = (uint8_t*)malloc(orig_size);
        if (!r) return NULL;
        int cp = comp_size < orig_size ? comp_size : orig_size;
        memcpy(r, data + data_off, cp);
        *out_len = cp;
        return r;
    } else if (method == 5) {
        /* LH5 compressed */
        return lh5_decompress(data + data_off, comp_size, orig_size, out_len);
    }
    return NULL;
}

static int ym_init(const uint8_t* data, int len) {
    /* Check if LHA compressed */
    if (len > 22 && data[2] == '-' && data[3] == 'l' && data[4] == 'h') {
        int dec_len = 0;
        uint8_t* dec = lha_extract_file(data, len, &dec_len);
        if (!dec) return -1;
        if (g_decompressed) free(g_decompressed);
        g_decompressed = dec;
        return ym_init_raw(dec, dec_len);
    }
    return ym_init_raw(data, len);
}

static int ym_frame(void) {
    if (!g_ym.reg_data || g_ym.num_frames < 1) return 0;
    int f = g_ym.current_frame;
    if (g_ym.interleaved) {
        for (int r = 0; r < 14 && r < g_ym.num_regs; r++)
            g_regs[r] = g_ym.reg_data[r * g_ym.num_frames + f];
    } else {
        int off = f * g_ym.num_regs;
        for (int r = 0; r < 14 && r < g_ym.num_regs; r++)
            g_regs[r] = g_ym.reg_data[off + r];
    }
    g_ym.current_frame++;
    if (g_ym.current_frame >= g_ym.num_frames) {
        g_ym.current_frame = g_ym.loop_frame;
        if (g_ym.current_frame >= g_ym.num_frames) g_ym.current_frame = 0;
    }
    return 1;
}

/* ===== VTX format ===== */
static int vtx_detect(const uint8_t* data, int len) {
    if (len < 20) return 0;
    return ((data[0] == 'a' && data[1] == 'y') || (data[0] == 'y' && data[1] == 'm'));
}

/* VTX state reuses YmState */

static int vtx_init(const uint8_t* data, int len) {
    memset(&g_ym, 0, sizeof(g_ym));
    if (len < 20) return -1;

    g_ym.chip_type = (data[0] == 'y') ? 1 : 0;
    int stereo = data[2];
    (void)stereo;

    /* VTX "new" format layout:
     * 0-1: "ay"/"ym"
     * 2: stereo type
     * 3-4: loop (LE 16-bit) -- but some versions use different offsets
     * 5-8: clock (LE 32-bit)
     * 9: frame rate
     * 10-11: year (LE 16-bit)
     * 12-15: uncompressed size (LE 32-bit)
     * Then 4 or 5 null-terminated strings
     * Then LH5 compressed data
     */

    g_ym.clock_rate = data[5] | (data[6]<<8) | (data[7]<<16) | (data[8]<<24);
    if (g_ym.clock_rate < 1000000 || g_ym.clock_rate > 4000000)
        g_ym.clock_rate = DEFAULT_CLOCK;

    g_ym.frame_rate = data[9];
    if (g_ym.frame_rate < 25 || g_ym.frame_rate > 100) g_ym.frame_rate = 50;

    int pos = 10;
    pos += 2;  /* year */

    int uncomp_size = 0;
    if (pos + 4 <= len) {
        uncomp_size = data[pos] | (data[pos+1]<<8) | (data[pos+2]<<16) | (data[pos+3]<<24);
        pos += 4;
    }

    /* Skip null-terminated strings */
    for (int s = 0; s < 5 && pos < len; s++) {
        while (pos < len && data[pos]) pos++;
        if (pos < len) pos++;
    }

    if (pos >= len) return -1;

    int comp_len = len - pos;
    if (uncomp_size <= 0 || uncomp_size > MAX_MODULE_SIZE) {
        uncomp_size = comp_len * 4;
        if (uncomp_size > MAX_MODULE_SIZE) uncomp_size = MAX_MODULE_SIZE;
    }

    int dec_len = 0;
    uint8_t* dec = lh5_decompress(data + pos, comp_len, uncomp_size, &dec_len);
    if (!dec || dec_len < 14) {
        if (dec) free(dec);
        return -1;
    }

    if (g_decompressed) free(g_decompressed);
    g_decompressed = dec;

    /* VTX data is interleaved: all R0 values, then all R1, ..., R13 */
    g_ym.num_regs = 14;
    g_ym.num_frames = dec_len / 14;
    if (g_ym.num_frames < 1) return -1;
    g_ym.reg_data = dec;
    g_ym.interleaved = 1;
    g_ym.loop_frame = 0;
    g_ym.current_frame = 0;
    return 0;
}

/* ===== LH5 Decompressor ===== */
/* Based on the classic LHA lh5 algorithm (Haruyasu Yoshizaki).
 * Simplified single-function implementation. */

#define LH5_DICBIT  13
#define LH5_DICSIZ  (1 << LH5_DICBIT)
#define LH5_MAXMATCH 256
#define LH5_THRESHOLD 3
#define LH5_NC      510
#define LH5_NP      14    /* DICBIT + 1 */
#define LH5_NT      19
#define LH5_TBIT    5
#define LH5_CBIT    9
#define LH5_PBIT    4

typedef struct {
    const uint8_t* src;
    int src_len, src_pos;
    uint32_t bitbuf;
    int subbitbuf, bitcount;
    /* Huffman tables */
    uint16_t c_table[4096];
    uint8_t  c_len[LH5_NC];
    uint16_t pt_table[256];
    uint8_t  pt_len[LH5_NT];
    uint16_t left_tree[2 * LH5_NC];
    uint16_t right_tree[2 * LH5_NC];
    int      blocksize;
    /* Dictionary */
    uint8_t  text[LH5_DICSIZ];
    int      dpos;
} LH5;

static void lh5_fill(LH5* s, int n) {
    while (n > s->bitcount) {
        n -= s->bitcount;
        s->bitbuf = (s->bitbuf << s->bitcount) | ((uint32_t)s->subbitbuf >> (8 - s->bitcount));
        s->subbitbuf = (s->src_pos < s->src_len) ? s->src[s->src_pos++] : 0;
        s->bitcount = 8;
    }
    s->bitcount -= n;
    s->bitbuf = (s->bitbuf << n) | ((uint32_t)s->subbitbuf >> (8 - n));
    s->subbitbuf <<= n;
    s->subbitbuf &= 0xFF;
}

static int lh5_bits(LH5* s, int n) {
    int x = (int)(s->bitbuf >> (16 - n));
    lh5_fill(s, n);
    return x;
}

static void lh5_mktbl(LH5* s, int nchar, uint8_t* bitlen, int tablebits, uint16_t* table) {
    uint16_t count[17] = {0};
    uint16_t weight[17], start[18];
    int i, ch, jutbits, avail;
    uint16_t nextcode;

    for (i = 0; i < nchar; i++) if (bitlen[i] <= 16) count[bitlen[i]]++;

    start[1] = 0;
    for (i = 1; i <= 16; i++) start[i+1] = start[i] + (count[i] << (16 - i));

    jutbits = 16 - tablebits;
    for (i = 1; i <= tablebits; i++) { start[i] >>= jutbits; weight[i] = 1 << (tablebits - i); }
    for (; i <= 16; i++) weight[i] = 1 << (16 - i);

    i = start[tablebits + 1] >> jutbits;
    if (i != 0) { int k = 1 << tablebits; while (i < k) table[i++] = 0; }

    avail = nchar;
    for (ch = 0; ch < nchar; ch++) {
        int len = bitlen[ch];
        if (len == 0) continue;
        nextcode = start[len] + weight[len];
        if (len <= tablebits) {
            if (nextcode > (1 << tablebits)) nextcode = 1 << tablebits;
            for (i = start[len]; i < nextcode; i++) table[i] = ch;
        } else {
            uint16_t* p = &table[start[len] >> jutbits];
            int k = len - tablebits;
            uint16_t mask = 1 << (15 - tablebits);
            uint16_t code = start[len];
            while (k > 0) {
                if (*p == 0) { s->left_tree[avail] = s->right_tree[avail] = 0; *p = avail++; }
                if (code & mask) p = &s->right_tree[*p]; else p = &s->left_tree[*p];
                code <<= 1; k--;
            }
            *p = ch;
        }
        start[len] = nextcode;
    }
}

static void lh5_read_pt(LH5* s, int nn, int nbit, int i_special) {
    int i, n = lh5_bits(s, nbit);
    if (n == 0) {
        int c = lh5_bits(s, nbit);
        memset(s->pt_len, 0, nn);
        for (i = 0; i < 256; i++) s->pt_table[i] = c;
    } else {
        i = 0;
        while (i < n && i < nn) {
            int c = (int)(s->bitbuf >> 13);
            if (c == 7) { uint32_t m = 1 << 12; while (m && (s->bitbuf & m)) { m >>= 1; c++; } }
            lh5_fill(s, (c < 7) ? 3 : c - 3);
            s->pt_len[i++] = (uint8_t)c;
            if (i == i_special) { int sk = lh5_bits(s, 2); while (sk-- > 0 && i < nn) s->pt_len[i++] = 0; }
        }
        while (i < nn) s->pt_len[i++] = 0;
        lh5_mktbl(s, nn, s->pt_len, 8, s->pt_table);
    }
}

static void lh5_read_c(LH5* s) {
    int i, n = lh5_bits(s, LH5_CBIT);
    if (n == 0) {
        int c = lh5_bits(s, LH5_CBIT);
        memset(s->c_len, 0, LH5_NC);
        for (i = 0; i < 4096; i++) s->c_table[i] = c;
    } else {
        i = 0;
        while (i < n && i < LH5_NC) {
            int c = s->pt_table[s->bitbuf >> 8];
            if (c >= LH5_NT) {
                uint32_t m = 1 << 7;
                while (m) { if (s->bitbuf & m) c = s->right_tree[c]; else c = s->left_tree[c]; m >>= 1; if (c < LH5_NT) break; }
            }
            lh5_fill(s, s->pt_len[c]);
            if (c <= 2) {
                int sk;
                if (c == 0) sk = 1;
                else if (c == 1) sk = lh5_bits(s, 4) + 3;
                else sk = lh5_bits(s, LH5_CBIT) + 20;
                while (sk-- > 0 && i < LH5_NC) s->c_len[i++] = 0;
            } else {
                s->c_len[i++] = (uint8_t)(c - 2);
            }
        }
        while (i < LH5_NC) s->c_len[i++] = 0;
        lh5_mktbl(s, LH5_NC, s->c_len, 12, s->c_table);
    }
}

static int lh5_dec_c(LH5* s) {
    if (s->blocksize == 0) {
        s->blocksize = lh5_bits(s, 16);
        lh5_read_pt(s, LH5_NT, LH5_TBIT, 3);
        lh5_read_c(s);
        lh5_read_pt(s, LH5_NP, LH5_PBIT, -1);
    }
    s->blocksize--;
    int c = s->c_table[s->bitbuf >> 4];
    if (c >= LH5_NC) {
        uint32_t m = 1 << 3;
        while (m) { if (s->bitbuf & m) c = s->right_tree[c]; else c = s->left_tree[c]; m >>= 1; if (c < LH5_NC) break; }
    }
    lh5_fill(s, s->c_len[c]);
    return c;
}

static int lh5_dec_p(LH5* s) {
    int p = s->pt_table[s->bitbuf >> 8];
    if (p >= LH5_NP) {
        uint32_t m = 1 << 7;
        while (m) { if (s->bitbuf & m) p = s->right_tree[p]; else p = s->left_tree[p]; m >>= 1; if (p < LH5_NP) break; }
    }
    lh5_fill(s, s->pt_len[p]);
    if (p > 1) p = (1 << (p - 1)) + lh5_bits(s, p - 1);
    return p;
}

static uint8_t* lh5_decompress(const uint8_t* src, int src_len, int dst_len, int* out_len) {
    if (dst_len <= 0) return NULL;
    uint8_t* dst = (uint8_t*)malloc(dst_len);
    if (!dst) return NULL;

    LH5 st;
    memset(&st, 0, sizeof(st));
    st.src = src;
    st.src_len = src_len;
    memset(st.text, 0x20, LH5_DICSIZ);

    /* Init bit reader */
    st.bitbuf = 0; st.subbitbuf = 0; st.bitcount = 0;
    lh5_fill(&st, 16);

    int out_pos = 0;
    while (out_pos < dst_len) {
        int c = lh5_dec_c(&st);
        if (c < 256) {
            st.text[st.dpos] = (uint8_t)c;
            st.dpos = (st.dpos + 1) & (LH5_DICSIZ - 1);
            dst[out_pos++] = (uint8_t)c;
        } else {
            int ml = c - 256 + LH5_THRESHOLD;
            int mp = (st.dpos - lh5_dec_p(&st) - 1) & (LH5_DICSIZ - 1);
            for (int i = 0; i < ml && out_pos < dst_len; i++) {
                uint8_t b = st.text[mp]; mp = (mp + 1) & (LH5_DICSIZ - 1);
                st.text[st.dpos] = b; st.dpos = (st.dpos + 1) & (LH5_DICSIZ - 1);
                dst[out_pos++] = b;
            }
        }
    }

    *out_len = out_pos;
    return dst;
}

/* AY format detection (ZXAYEMUL header) */
static int ay_detect(const uint8_t* data, int len) {
    return (len >= 8 && memcmp(data, "ZXAYEMUL", 8) == 0);
}

/* ===== Format dispatch ===== */
static ModuleFormat detect_format(const uint8_t* data, int len) {
    if (psg_detect(data, len)) return FMT_PSG;
    if (pt3_detect(data, len)) return FMT_PT3;
    if (ay_detect(data, len))  return FMT_YM;   /* AY files detected as YM-like */
    if (ym_detect(data, len))  return FMT_YM;
    if (vtx_detect(data, len)) return FMT_VTX;
    return FMT_UNKNOWN;
}

static int process_frame(void) {
    switch (g_format) {
        case FMT_PSG: return psg_frame();
        case FMT_PT3: return pt3_frame();
        case FMT_YM:  return ym_frame();
        case FMT_VTX: return ym_frame();  /* VTX uses same playback as YM (register dump) */
        default: return 0;
    }
}

/* ===== WASM exports ===== */

EMSCRIPTEN_KEEPALIVE
int zxtune_init(uint8_t* data, int len) {
    if (!data || len < 4 || len > MAX_MODULE_SIZE) return -1;

    g_playing = 0;
    g_format = FMT_UNKNOWN;

    /* Free previous */
    if (g_module_data) { free(g_module_data); g_module_data = NULL; }
    if (g_decompressed) { free(g_decompressed); g_decompressed = NULL; }

    g_module_data = (uint8_t*)malloc(len);
    if (!g_module_data) return -2;
    memcpy(g_module_data, data, len);
    g_module_len = len;

    g_format = detect_format(g_module_data, g_module_len);
    if (g_format == FMT_UNKNOWN) {
        free(g_module_data); g_module_data = NULL;
        return -3;
    }

    int result = -1;
    g_is_ym = 0;
    g_clock_rate = DEFAULT_CLOCK;
    g_frame_rate = DEFAULT_FRAME_RATE;

    switch (g_format) {
        case FMT_PSG:
            result = psg_init(g_module_data, g_module_len);
            break;
        case FMT_PT3:
            result = pt3_init(g_module_data, g_module_len);
            break;
        case FMT_YM:
            result = ym_init(g_module_data, g_module_len);
            if (result == 0) {
                g_frame_rate = g_ym.frame_rate;
                g_is_ym = g_ym.chip_type;
                g_clock_rate = g_ym.clock_rate;
            }
            break;
        case FMT_VTX:
            result = vtx_init(g_module_data, g_module_len);
            if (result == 0) {
                g_frame_rate = g_ym.frame_rate;
                g_is_ym = g_ym.chip_type;
                g_clock_rate = g_ym.clock_rate;
            }
            break;
        default:
            break;
    }

    if (result != 0) {
        g_format = FMT_UNKNOWN;
        return -4;
    }

    ayumi_configure(&g_ay, g_is_ym, g_clock_rate, g_sample_rate);
    ayumi_set_pan(&g_ay, 0, 0.1, 0);
    ayumi_set_pan(&g_ay, 1, 0.9, 0);
    ayumi_set_pan(&g_ay, 2, 0.5, 0);

    g_samples_per_frame = (double)g_sample_rate / (double)g_frame_rate;
    g_sample_accumulator = 0;
    memset(g_regs, 0, sizeof(g_regs));
    g_regs[13] = 0xFF;
    g_playing = 1;
    g_initialized = 1;

    return 0;
}

EMSCRIPTEN_KEEPALIVE
int zxtune_render(float* out, int frames) {
    if (!g_playing || !g_initialized || !out || frames <= 0) {
        if (out && frames > 0) memset(out, 0, frames * 2 * sizeof(float));
        return frames;
    }

    for (int i = 0; i < frames; i++) {
        if (g_sample_accumulator <= 0) {
            if (!process_frame()) {
                memset(out + i * 2, 0, (frames - i) * 2 * sizeof(float));
                return frames;
            }
            apply_regs_to_ayumi();
            g_sample_accumulator += g_samples_per_frame;
        }

        ayumi_process(&g_ay);
        ayumi_remove_dc(&g_ay);

        float l = (float)(g_ay.left * 0.33);
        float r = (float)(g_ay.right * 0.33);
        if (l > 1.0f) l = 1.0f; if (l < -1.0f) l = -1.0f;
        if (r > 1.0f) r = 1.0f; if (r < -1.0f) r = -1.0f;
        out[i * 2]     = l;
        out[i * 2 + 1] = r;

        g_sample_accumulator -= 1.0;
    }
    return frames;
}

EMSCRIPTEN_KEEPALIVE
void zxtune_stop(void) {
    g_playing = 0;
    memset(g_regs, 0, sizeof(g_regs));
    g_regs[13] = 0xFF;
    ayumi_configure(&g_ay, g_is_ym, g_clock_rate, g_sample_rate);
    ayumi_set_pan(&g_ay, 0, 0.1, 0);
    ayumi_set_pan(&g_ay, 1, 0.9, 0);
    ayumi_set_pan(&g_ay, 2, 0.5, 0);
}

EMSCRIPTEN_KEEPALIVE
void player_set_subsong(int subsong) {
    g_subsong = subsong;
}

EMSCRIPTEN_KEEPALIVE
void player_set_channel_gain(int ch, float gain) {
    if (ch >= 0 && ch < MAX_CHANNELS) {
        g_channel_gain[ch] = gain;
        /* Approximate muting via pan */
        double pans[3] = {0.1, 0.9, 0.5};
        if (gain <= 0.01f) {
            ayumi_set_pan(&g_ay, ch, 0.5, 0);
        } else {
            ayumi_set_pan(&g_ay, ch, pans[ch], 0);
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void player_set_sample_rate(int rate) {
    if (rate >= 8000 && rate <= 192000) {
        g_sample_rate = rate;
        if (g_initialized) {
            ayumi_configure(&g_ay, g_is_ym, g_clock_rate, g_sample_rate);
            ayumi_set_pan(&g_ay, 0, 0.1, 0);
            ayumi_set_pan(&g_ay, 1, 0.9, 0);
            ayumi_set_pan(&g_ay, 2, 0.5, 0);
            g_samples_per_frame = (double)g_sample_rate / (double)g_frame_rate;
        }
    }
}
