/**
 * ZSG2Engine.c — ZOOM ZSG-2 48-Channel ROM PCM (WASM)
 *
 * Based on MAME's zsg2.cpp by Olivier Galibert.
 * The ZSG-2 is a 48-channel wavetable chip used in ZOOM multi-effects units.
 * Samples are stored in ROM using a 2:1 ADPCM-like block format.
 * Sample rate: approximately 32552 Hz (clock/768).
 *
 * Build:
 *   emcc zsg2-wasm/ZSG2Engine.c -o public/mame/ZSG2.js \
 *     -lm -O2 -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME=ZSG2Engine \
 *     -s EXPORTED_FUNCTIONS='["_zsg2_init","_zsg2_note_on","_zsg2_note_off",\
 *       "_zsg2_set_frequency","_zsg2_set_volume","_zsg2_set_pan",\
 *       "_zsg2_load_rom","_zsg2_render","_zsg2_get_outR",\
 *       "_zsg2_get_sample_rate","_zsg2_get_num_voices","_malloc","_free"]' \
 *     -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
 *     -s ENVIRONMENT=web,worker -s ALLOW_MEMORY_GROWTH=1 -s FILESYSTEM=0
 */

#include <emscripten.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

#define NUM_CHANNELS  48
#define SAMPLE_RATE   32552.0   /* ZSG2 native: clock/768 */
#define BUF_SIZE      512
#define MAX_ROM_SIZE  (8 * 1024 * 1024)

typedef struct {
    uint32_t start;       /* ROM word address */
    uint32_t loop;
    uint32_t end;
    double   phase;       /* 0..len */
    double   phase_inc;
    int      active;

    /* Simple output IIR filter (emphasis) */
    double   flt_state;
    uint16_t cutoff;     /* 0-65535 → filter coefficient 0..1 */

    /* Volume ramp */
    double   vol_l, vol_r;
    double   vol_target_l, vol_target_r;

    /* Fallback oscillator */
    double   osc_phase;
    double   osc_freq;
} ZSG2Channel;

/*
 * ZSG-2 block decode: each 32-bit word holds 4 signed samples.
 * Layout from MAME zsg2.cpp:
 *   bits [22:16] → sample0 (7-bit mantissa), sign extend
 *   bits [14: 8] → sample1
 *   bits [ 6: 0] → sample2
 *   bits [27:24] → 4 bits of sample3 (rest from bit[7] of sample0)
 *   bits [31:28] → scale (4-bit exponent)
 */
static void zsg2_decode_block(uint32_t word, int16_t out[4])
{
    int scale  = (int)((word >> 28) & 0xf);
    int s[4];
    s[0] = (int)((word >> 16) & 0x7f); if (s[0] & 0x40) s[0] |= ~0x3f;
    s[1] = (int)((word >>  8) & 0x7f); if (s[1] & 0x40) s[1] |= ~0x3f;
    s[2] = (int)((word >>  0) & 0x7f); if (s[2] & 0x40) s[2] |= ~0x3f;
    s[3] = (int)((word >> 24) & 0x0f); if (s[3] & 0x08) s[3] |= ~0x07;
    for (int i = 0; i < 4; i++) {
        int v = s[i] << scale;
        if (v >  32767) v =  32767;
        if (v < -32768) v = -32768;
        out[i] = (int16_t)v;
    }
}

static int       g_fallback_osc = 1;
static uint8_t  *g_rom = NULL;
static int       g_rom_size = 0;
static ZSG2Channel g_ch[NUM_CHANNELS];
static float     g_outL[BUF_SIZE];
static float     g_outR[BUF_SIZE];

static double read_zsg2_sample(uint32_t word_addr)
{
    if (!g_rom || word_addr * 4 + 3 >= (uint32_t)g_rom_size) return 0.0;
    uint32_t word =
        (uint32_t)g_rom[word_addr*4 + 0] |
        ((uint32_t)g_rom[word_addr*4 + 1] << 8) |
        ((uint32_t)g_rom[word_addr*4 + 2] << 16) |
        ((uint32_t)g_rom[word_addr*4 + 3] << 24);
    /* Each word contains 4 sub-samples. We return the first for phase-based access. */
    int16_t buf[4];
    zsg2_decode_block(word, buf);
    return (double)buf[0] / 32768.0;
}

/* -----------------------------------------------------------------------
 * WASM-exported API
 * ----------------------------------------------------------------------- */

EMSCRIPTEN_KEEPALIVE
void zsg2_init(void)
{
    g_fallback_osc = 1;
    if (g_rom) { free(g_rom); g_rom = NULL; }
    g_rom_size = 0;
    memset(g_ch, 0, sizeof(g_ch));
    for (int i = 0; i < NUM_CHANNELS; i++) {
        g_ch[i].vol_l = g_ch[i].vol_target_l = 0.5;
        g_ch[i].vol_r = g_ch[i].vol_target_r = 0.5;
        g_ch[i].cutoff = 0xffff;
    }
}

EMSCRIPTEN_KEEPALIVE
void zsg2_note_on(int ch, double freq_hz, double velocity)
{
    if (ch < 0 || ch >= NUM_CHANNELS || freq_hz <= 0.0) return;
    ZSG2Channel *c = &g_ch[ch];
    c->osc_freq  = freq_hz;
    c->osc_phase = 0.0;
    if (g_rom) {
        uint32_t len = c->end - c->start;
        if (len == 0) len = 1;
        c->phase_inc = freq_hz * (double)len / SAMPLE_RATE;
        c->phase     = 0.0;
    }
    c->vol_l = c->vol_target_l = velocity * 0.707;
    c->vol_r = c->vol_target_r = velocity * 0.707;
    c->flt_state = 0.0;
    c->active    = 1;
}

EMSCRIPTEN_KEEPALIVE
void zsg2_note_off(int ch)
{
    if (ch < 0 || ch >= NUM_CHANNELS) return;
    g_ch[ch].active = 0;
}

EMSCRIPTEN_KEEPALIVE
void zsg2_set_frequency(int ch, double freq_hz)
{
    if (ch < 0 || ch >= NUM_CHANNELS || freq_hz <= 0.0) return;
    ZSG2Channel *c = &g_ch[ch];
    uint32_t len = c->end - c->start;
    if (len == 0) len = 1;
    c->phase_inc = freq_hz * (double)len / SAMPLE_RATE;
}

EMSCRIPTEN_KEEPALIVE
void zsg2_set_volume(int ch, double vol)
{
    if (ch < 0 || ch >= NUM_CHANNELS) return;
    g_ch[ch].vol_target_l = vol * 0.707;
    g_ch[ch].vol_target_r = vol * 0.707;
}

EMSCRIPTEN_KEEPALIVE
void zsg2_set_pan(int ch, double pan)
{
    if (ch < 0 || ch >= NUM_CHANNELS) return;
    ZSG2Channel *c = &g_ch[ch];
    double pan_r = (pan + 1.0) * 0.5;
    double avg   = (c->vol_target_l + c->vol_target_r) / 2.0;
    c->vol_target_l = avg * (1.0 - pan_r) * 2.0;
    c->vol_target_r = avg * pan_r * 2.0;
}

EMSCRIPTEN_KEEPALIVE
void zsg2_load_rom(uint8_t *data, int size)
{
    if (!data || size <= 0) return;
    if (g_rom) { free(g_rom); g_rom = NULL; }
    g_rom_size = (size > MAX_ROM_SIZE) ? MAX_ROM_SIZE : size;
    g_rom = (uint8_t*)malloc((size_t)g_rom_size);
    if (!g_rom) { g_rom_size = 0; return; }
    memcpy(g_rom, data, (size_t)g_rom_size);
    /* Default all channels to use consecutive ROM word regions */
    uint32_t region_words = (uint32_t)(g_rom_size / 4 / NUM_CHANNELS);
    for (int i = 0; i < NUM_CHANNELS; i++) {
        g_ch[i].start = (uint32_t)(i * region_words);
        g_ch[i].loop  = (uint32_t)(i * region_words);
        g_ch[i].end   = (uint32_t)((i + 1) * region_words);
    }
    g_fallback_osc = 0;
}

EMSCRIPTEN_KEEPALIVE
float* zsg2_render(int num_samples)
{
    if (num_samples > BUF_SIZE) num_samples = BUF_SIZE;
    memset(g_outL, 0, (size_t)num_samples * sizeof(float));
    memset(g_outR, 0, (size_t)num_samples * sizeof(float));

    if (g_fallback_osc) {
        const double two_pi = 6.28318530717959;
        for (int ci = 0; ci < NUM_CHANNELS; ci++) {
            ZSG2Channel *c = &g_ch[ci];
            if (!c->active) continue;
            double step = two_pi * c->osc_freq / SAMPLE_RATE;
            for (int i = 0; i < num_samples; i++) {
                c->vol_l += (c->vol_target_l - c->vol_l) * 0.001;
                c->vol_r += (c->vol_target_r - c->vol_r) * 0.001;
                c->osc_phase += step;
                if (c->osc_phase >= two_pi) c->osc_phase -= two_pi;
                double sample = sin(c->osc_phase);
                g_outL[i] += (float)(sample * c->vol_l);
                g_outR[i] += (float)(sample * c->vol_r);
            }
        }
        return g_outL;
    }

    if (!g_rom) return g_outL;

    for (int ci = 0; ci < NUM_CHANNELS; ci++) {
        ZSG2Channel *c = &g_ch[ci];
        if (!c->active) continue;

        uint32_t len      = c->end - c->start;
        uint32_t loop_off = c->loop - c->start;
        if (len == 0) continue;

        /* Volume ramp (smooth ramping) */
        double ramp = 0.001;
        double fl = c->flt_state;

        for (int i = 0; i < num_samples; i++) {
            /* Volume ramp */
            c->vol_l += (c->vol_target_l - c->vol_l) * ramp;
            c->vol_r += (c->vol_target_r - c->vol_r) * ramp;

            c->phase += c->phase_inc;
            while (c->phase >= (double)len)
                c->phase -= (double)(len - loop_off);
            if (c->phase < 0.0) c->phase = 0.0;

            double sample = read_zsg2_sample(c->start + (uint32_t)c->phase);

            /* Simple one-pole IIR output filter */
            double k = (double)c->cutoff / 65535.0;
            fl = fl + k * (sample - fl);
            sample = fl;

            g_outL[i] += (float)(sample * c->vol_l);
            g_outR[i] += (float)(sample * c->vol_r);
        }
        c->flt_state = fl;
    }
    return g_outL;
}

EMSCRIPTEN_KEEPALIVE float* zsg2_get_outR(void)       { return g_outR; }
EMSCRIPTEN_KEEPALIVE double zsg2_get_sample_rate(void) { return SAMPLE_RATE; }
EMSCRIPTEN_KEEPALIVE int    zsg2_get_num_voices(void)  { return NUM_CHANNELS; }

EMSCRIPTEN_KEEPALIVE
void zsg2_set_param(int paramId, double value)
{
    for (int ci = 0; ci < NUM_CHANNELS; ci++) {
        switch (paramId) {
        case 0: g_ch[ci].cutoff = (uint16_t)(value * 65535.0); break;
        }
    }
}
