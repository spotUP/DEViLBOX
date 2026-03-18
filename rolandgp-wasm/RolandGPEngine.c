/**
 * RolandGPEngine.c — Roland TC6116 PCM Chip 28-Channel (WASM)
 *
 * Based on MAME's roland_gp.cpp (skeleton) and roland_gp.h register map.
 * The TC6116 is a PCM chip used in Roland SC-88 and JV/XP series products.
 * It has 28 PCM channels with dual volume envelopes and a filter envelope.
 * MAME has a non-functional skeleton; this implements based on register docs.
 *
 * Build:
 *   emcc rolandgp-wasm/RolandGPEngine.c -o public/mame/RolandGP.js \
 *     -lm -O2 -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME=RolandGPEngine \
 *     -s EXPORTED_FUNCTIONS='["_rgp_init","_rgp_note_on","_rgp_note_off",\
 *       "_rgp_set_frequency","_rgp_set_volume","_rgp_set_pan",\
 *       "_rgp_load_rom","_rgp_render","_rgp_get_outR",\
 *       "_rgp_get_sample_rate","_rgp_get_num_voices","_malloc","_free"]' \
 *     -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
 *     -s ENVIRONMENT=web,worker -s ALLOW_MEMORY_GROWTH=1 -s FILESYSTEM=0
 */

#include <emscripten.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

#define NUM_CHANNELS  28
#define SAMPLE_RATE   44100.0
#define BUF_SIZE      512
#define MAX_ROM_SIZE  (4 * 1024 * 1024)

typedef struct {
    int      running;
    uint32_t start_addr;
    uint32_t loop_addr;
    uint32_t end_addr;
    double   phase;        /* 0..len */
    double   phase_inc;
    int      alt_loop;     /* ping-pong loop */
    int      reverse;

    /* Dual volume envelopes (from roland_gp.h) */
    double   vol1, vol1_tv;     /* current/target */
    double   vol1_speed;
    double   vol2, vol2_tv;
    double   vol2_speed;

    /* Filter envelope */
    double   cutoff, cutoff_tv;
    double   cutoff_speed;
    /* One-pole lowpass filter state */
    double   flt_state;

    /* Pan */
    uint16_t pan_l, pan_r;

    double   out_l, out_r;

    /* Fallback oscillator */
    double   osc_phase;
    double   osc_freq;
} RolandGPChannel;

static int            g_fallback_osc = 1;
static uint8_t       *g_rom = NULL;
static int            g_rom_size = 0;
static RolandGPChannel g_ch[NUM_CHANNELS];
static float          g_outL[BUF_SIZE];
static float          g_outR[BUF_SIZE];

static double rgp_read_sample(uint32_t addr)
{
    if (!g_rom || addr >= (uint32_t)g_rom_size) return 0.0;
    /* ROM stores signed 16-bit little-endian samples */
    if (addr + 1 >= (uint32_t)g_rom_size) return 0.0;
    int16_t s = (int16_t)((uint16_t)g_rom[addr] | ((uint16_t)g_rom[addr+1] << 8));
    return (double)s / 32768.0;
}

/* -----------------------------------------------------------------------
 * WASM-exported API
 * ----------------------------------------------------------------------- */

EMSCRIPTEN_KEEPALIVE
void rgp_init(void)
{
    g_fallback_osc = 1;
    if (g_rom) { free(g_rom); g_rom = NULL; }
    g_rom_size = 0;
    memset(g_ch, 0, sizeof(g_ch));
    for (int i = 0; i < NUM_CHANNELS; i++) {
        RolandGPChannel *c = &g_ch[i];
        c->vol1      = c->vol1_tv = 1.0;
        c->vol2      = c->vol2_tv = 0.5;
        c->vol1_speed = 0.001;
        c->vol2_speed = 0.001;
        c->cutoff    = c->cutoff_tv = 1.0;
        c->cutoff_speed = 0.001;
        c->pan_l = 32767;
        c->pan_r = 32767;
    }
}

EMSCRIPTEN_KEEPALIVE
void rgp_note_on(int ch, double freq_hz, double velocity)
{
    if (ch < 0 || ch >= NUM_CHANNELS || freq_hz <= 0.0) return;
    RolandGPChannel *c = &g_ch[ch];
    c->osc_freq  = freq_hz;
    c->osc_phase = 0.0;
    if (g_rom) {
        uint32_t len = (c->end_addr - c->start_addr) / 2;
        if (len == 0) len = 1;
        c->phase_inc = freq_hz * 2.0 * (double)len / SAMPLE_RATE;
    }
    c->phase     = 0.0;
    c->vol1      = velocity;
    c->vol1_tv   = velocity;
    c->vol2      = 1.0;
    c->vol2_tv   = 1.0;
    c->cutoff    = 1.0;
    c->cutoff_tv = 1.0;
    c->flt_state = 0.0;
    c->running   = 1;
}

EMSCRIPTEN_KEEPALIVE
void rgp_note_off(int ch)
{
    if (ch < 0 || ch >= NUM_CHANNELS) return;
    /* Ramp vol2 down for natural release */
    g_ch[ch].vol2_tv = 0.0;
}

EMSCRIPTEN_KEEPALIVE
void rgp_set_frequency(int ch, double freq_hz)
{
    if (ch < 0 || ch >= NUM_CHANNELS || freq_hz <= 0.0) return;
    RolandGPChannel *c = &g_ch[ch];
    uint32_t len = (c->end_addr - c->start_addr) / 2;
    if (len == 0) len = 1;
    c->phase_inc = freq_hz * 2.0 * (double)len / SAMPLE_RATE;
}

EMSCRIPTEN_KEEPALIVE
void rgp_set_volume(int ch, double vol)
{
    if (ch < 0 || ch >= NUM_CHANNELS) return;
    g_ch[ch].vol1_tv = vol;
}

EMSCRIPTEN_KEEPALIVE
void rgp_set_pan(int ch, double pan)
{
    if (ch < 0 || ch >= NUM_CHANNELS) return;
    RolandGPChannel *c = &g_ch[ch];
    double pan_r = (pan + 1.0) * 0.5;
    c->pan_r = (uint16_t)(pan_r * 65535);
    c->pan_l = (uint16_t)((1.0 - pan_r) * 65535);
}

EMSCRIPTEN_KEEPALIVE
void rgp_load_rom(uint8_t *data, int size)
{
    if (!data || size <= 0) return;
    if (g_rom) { free(g_rom); g_rom = NULL; }
    g_rom_size = (size > MAX_ROM_SIZE) ? MAX_ROM_SIZE : size;
    g_rom = (uint8_t*)malloc((size_t)g_rom_size);
    if (!g_rom) { g_rom_size = 0; return; }
    memcpy(g_rom, data, (size_t)g_rom_size);
    uint32_t region = (uint32_t)(g_rom_size / NUM_CHANNELS);
    for (int i = 0; i < NUM_CHANNELS; i++) {
        g_ch[i].start_addr = (uint32_t)(i * region);
        g_ch[i].loop_addr  = (uint32_t)(i * region);
        g_ch[i].end_addr   = (uint32_t)((i + 1) * region);
    }
    g_fallback_osc = 0;
}

EMSCRIPTEN_KEEPALIVE
float* rgp_render(int num_samples)
{
    if (num_samples > BUF_SIZE) num_samples = BUF_SIZE;
    memset(g_outL, 0, (size_t)num_samples * sizeof(float));
    memset(g_outR, 0, (size_t)num_samples * sizeof(float));

    if (g_fallback_osc) {
        const double two_pi = 6.28318530717959;
        for (int ci = 0; ci < NUM_CHANNELS; ci++) {
            RolandGPChannel *c = &g_ch[ci];
            if (!c->running) continue;
            double step = two_pi * c->osc_freq / SAMPLE_RATE;
            double pl = (double)c->pan_l / 65535.0;
            double pr = (double)c->pan_r / 65535.0;
            for (int i = 0; i < num_samples; i++) {
                double spd2 = c->vol2_speed > 0.0 ? c->vol2_speed : 0.001;
                c->vol2 += (c->vol2_tv - c->vol2) * spd2;
                if (c->vol2 < 0.001 && c->vol2_tv < 0.001) { c->running = 0; break; }
                c->osc_phase += step;
                if (c->osc_phase >= two_pi) c->osc_phase -= two_pi;
                double out = sin(c->osc_phase) * c->vol1 * c->vol2;
                g_outL[i] += (float)(out * pl);
                g_outR[i] += (float)(out * pr);
            }
        }
        return g_outL;
    }

    if (!g_rom) return g_outL;

    for (int ci = 0; ci < NUM_CHANNELS; ci++) {
        RolandGPChannel *c = &g_ch[ci];
        if (!c->running) continue;

        uint32_t start = c->start_addr;
        uint32_t end   = c->end_addr;
        uint32_t loop  = c->loop_addr;
        if (start >= end || end <= loop) continue;
        uint32_t loop_len = (end - loop) / 2;
        if (loop_len == 0) loop_len = 1;
        uint32_t full_len = (end - start) / 2;
        if (full_len == 0) full_len = 1;

        for (int i = 0; i < num_samples; i++) {
            /* Vol1 ramp */
            double spd1 = c->vol1_speed > 0.0 ? c->vol1_speed : 0.001;
            c->vol1 += (c->vol1_tv - c->vol1) * spd1;

            /* Vol2 ramp */
            double spd2 = c->vol2_speed > 0.0 ? c->vol2_speed : 0.001;
            c->vol2 += (c->vol2_tv - c->vol2) * spd2;

            /* Stop when both vols near zero */
            if (c->vol2 < 0.001 && c->vol2_tv < 0.001) {
                c->running = 0;
                break;
            }

            /* Filter cutoff ramp */
            c->cutoff += (c->cutoff_tv - c->cutoff) * c->cutoff_speed;

            c->phase += c->phase_inc;
            while (c->phase >= (double)full_len) {
                c->phase -= (double)loop_len;
            }
            if (c->phase < 0.0) c->phase = 0.0;

            uint32_t byte_addr = start + (uint32_t)(c->phase) * 2;
            double raw = rgp_read_sample(byte_addr);

            /* Simple one-pole LPF with filter envelope */
            double fk = c->cutoff * 0.8;
            c->flt_state = c->flt_state + fk * (raw - c->flt_state);
            double sample = c->flt_state;

            double out = sample * c->vol1 * c->vol2;
            double pl  = (double)c->pan_l / 65535.0;
            double pr  = (double)c->pan_r / 65535.0;

            g_outL[i] += (float)(out * pl);
            g_outR[i] += (float)(out * pr);
        }
    }
    return g_outL;
}

EMSCRIPTEN_KEEPALIVE float* rgp_get_outR(void)        { return g_outR; }
EMSCRIPTEN_KEEPALIVE double rgp_get_sample_rate(void)  { return SAMPLE_RATE; }
EMSCRIPTEN_KEEPALIVE int    rgp_get_num_voices(void)   { return NUM_CHANNELS; }

EMSCRIPTEN_KEEPALIVE
void rgp_set_param(int paramId, double value)
{
    for (int i = 0; i < NUM_CHANNELS; i++) {
        RolandGPChannel *c = &g_ch[i];
        switch (paramId) {
        case 0: c->vol1_speed   = value > 0.0 ? value : 0.001; break;
        case 1: c->vol2_speed   = value > 0.0 ? value : 0.001; break;
        case 2: c->cutoff_speed = value > 0.0 ? value : 0.001; break;
        case 3: c->alt_loop     = (int)(value + 0.5); break;
        case 4: c->reverse      = (int)(value + 0.5); break;
        case 5: c->cutoff_tv    = value; break;
        }
    }
}
