/**
 * SWP20Engine.c — Yamaha SWP20 AWM2 32-Voice ROMpler (WASM)
 *
 * The SWP20 is an AWM2 ROM streaming chip (same family as SWP00/SWP30).
 * MAME's swp20.cpp has only a register stub (no audio implementation).
 * This engine implements the AWM2 playback algorithm based on the register map
 * and SWP00/SWP30 family documentation.
 *
 * Build:
 *   emcc swp20-wasm/SWP20Engine.c -o public/mame/SWP20.js \
 *     -lm -O2 -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME=SWP20Engine \
 *     -s EXPORTED_FUNCTIONS='["_swp20_init","_swp20_note_on","_swp20_note_off",\
 *       "_swp20_set_frequency","_swp20_set_volume","_swp20_set_pan",\
 *       "_swp20_load_rom","_swp20_render","_swp20_get_outR",\
 *       "_swp20_get_sample_rate","_swp20_get_num_voices","_malloc","_free"]' \
 *     -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
 *     -s ENVIRONMENT=web,worker -s ALLOW_MEMORY_GROWTH=1 -s FILESYSTEM=0
 */

#include <emscripten.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

#define NUM_VOICES   32
#define SAMPLE_RATE  44100.0
#define BUF_SIZE     512
#define MAX_ROM_SIZE (8 * 1024 * 1024)

typedef struct {
    int      running;
    uint32_t sample_start; /* byte address (24-bit) */
    uint32_t sample_end;
    uint32_t cur_pos;
    double   cur_frac;
    double   phase_inc;
    uint8_t  format;       /* 0=16-bit, 1=8-bit */

    /* ADSR */
    int      env_state;
    double   env_level;

    /* Panning */
    uint8_t  pan_l, pan_r; /* 0..255 */

    double   vol_l, vol_r;

    /* Fallback oscillator */
    double   osc_phase;
    double   osc_freq;
} SWP20Voice;

static int         g_fallback_osc = 1;
static uint8_t    *g_rom = NULL;
static int         g_rom_size = 0;
static SWP20Voice  g_voices[NUM_VOICES];
static float       g_outL[BUF_SIZE];
static float       g_outR[BUF_SIZE];

static double swp20_read_sample(const SWP20Voice *v, uint32_t addr)
{
    if (!g_rom || addr >= (uint32_t)g_rom_size) return 0.0;
    if (v->format == 0) {
        if (addr + 1 >= (uint32_t)g_rom_size) return 0.0;
        int16_t s = (int16_t)((uint16_t)g_rom[addr] | ((uint16_t)g_rom[addr+1] << 8));
        return (double)s / 32768.0;
    }
    return (double)(int8_t)g_rom[addr] / 128.0;
}

/* -----------------------------------------------------------------------
 * WASM-exported API
 * ----------------------------------------------------------------------- */

EMSCRIPTEN_KEEPALIVE
void swp20_init(void)
{
    g_fallback_osc = 1;
    if (g_rom) { free(g_rom); g_rom = NULL; }
    g_rom_size = 0;
    memset(g_voices, 0, sizeof(g_voices));
    for (int i = 0; i < NUM_VOICES; i++) {
        g_voices[i].vol_l    = 0.5;
        g_voices[i].vol_r    = 0.5;
        g_voices[i].env_state = 4;
    }
}

EMSCRIPTEN_KEEPALIVE
void swp20_note_on(int voice, double freq_hz, double velocity)
{
    if (voice < 0 || voice >= NUM_VOICES || freq_hz <= 0.0) return;
    SWP20Voice *v = &g_voices[voice];
    v->osc_freq  = freq_hz;
    v->osc_phase = 0.0;
    if (g_rom) {
        int stride = (v->format == 0) ? 2 : 1;
        uint32_t len = (v->sample_end - v->sample_start) / (uint32_t)stride;
        if (len == 0) len = 1;
        v->cur_pos   = v->sample_start;
        v->phase_inc = freq_hz * (double)stride * (double)len / SAMPLE_RATE;
    }
    v->cur_frac   = 0.0;
    v->env_state  = 0;
    v->env_level  = 0.0;
    v->vol_l      = velocity * 0.707;
    v->vol_r      = velocity * 0.707;
    v->running    = 1;
}

EMSCRIPTEN_KEEPALIVE
void swp20_note_off(int voice)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    SWP20Voice *v = &g_voices[voice];
    if (v->env_state < 3) v->env_state = 3;
}

EMSCRIPTEN_KEEPALIVE
void swp20_set_frequency(int voice, double freq_hz)
{
    if (voice < 0 || voice >= NUM_VOICES || freq_hz <= 0.0) return;
    SWP20Voice *v = &g_voices[voice];
    int stride = (v->format == 0) ? 2 : 1;
    uint32_t len = (v->sample_end - v->sample_start) / (uint32_t)stride;
    if (len == 0) len = 1;
    v->phase_inc = freq_hz * (double)stride * (double)len / SAMPLE_RATE;
}

EMSCRIPTEN_KEEPALIVE
void swp20_set_volume(int voice, double vol)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    g_voices[voice].vol_l = vol * 0.707;
    g_voices[voice].vol_r = vol * 0.707;
}

EMSCRIPTEN_KEEPALIVE
void swp20_set_pan(int voice, double pan)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    SWP20Voice *v = &g_voices[voice];
    double pan_r = (pan + 1.0) * 0.5;
    double avg   = (v->vol_l + v->vol_r) / 2.0;
    v->vol_l = avg * (1.0 - pan_r) * 2.0;
    v->vol_r = avg * pan_r * 2.0;
}

EMSCRIPTEN_KEEPALIVE
void swp20_load_rom(uint8_t *data, int size)
{
    if (!data || size <= 0) return;
    if (g_rom) { free(g_rom); g_rom = NULL; }
    g_rom_size = (size > MAX_ROM_SIZE) ? MAX_ROM_SIZE : size;
    g_rom = (uint8_t*)malloc((size_t)g_rom_size);
    if (!g_rom) { g_rom_size = 0; return; }
    memcpy(g_rom, data, (size_t)g_rom_size);
    uint32_t region = (uint32_t)(g_rom_size / NUM_VOICES);
    for (int i = 0; i < NUM_VOICES; i++) {
        g_voices[i].sample_start = (uint32_t)(i * region);
        g_voices[i].sample_end   = (uint32_t)((i + 1) * region);
        g_voices[i].cur_pos      = (uint32_t)(i * region);
    }
    g_fallback_osc = 0;
}

EMSCRIPTEN_KEEPALIVE
float* swp20_render(int num_samples)
{
    if (num_samples > BUF_SIZE) num_samples = BUF_SIZE;
    memset(g_outL, 0, (size_t)num_samples * sizeof(float));
    memset(g_outR, 0, (size_t)num_samples * sizeof(float));

    if (g_fallback_osc) {
        const double two_pi = 6.28318530717959;
        for (int vi = 0; vi < NUM_VOICES; vi++) {
            SWP20Voice *v = &g_voices[vi];
            if (!v->running || v->env_state == 4) continue;
            double step = two_pi * v->osc_freq / SAMPLE_RATE;
            for (int i = 0; i < num_samples; i++) {
                switch (v->env_state) {
                case 0: v->env_level += 0.005; if (v->env_level >= 1.0) { v->env_level = 1.0; v->env_state = 1; } break;
                case 1: v->env_level -= 0.001; if (v->env_level <= 0.8) { v->env_level = 0.8; v->env_state = 2; } break;
                case 2: break;
                case 3: v->env_level -= 0.003; if (v->env_level <= 0.0) { v->env_level = 0.0; v->env_state = 4; v->running = 0; } break;
                default: break;
                }
                v->osc_phase += step;
                if (v->osc_phase >= two_pi) v->osc_phase -= two_pi;
                double out = sin(v->osc_phase) * v->env_level;
                g_outL[i] += (float)(out * v->vol_l);
                g_outR[i] += (float)(out * v->vol_r);
            }
        }
        return g_outL;
    }

    if (!g_rom) return g_outL;

    for (int vi = 0; vi < NUM_VOICES; vi++) {
        SWP20Voice *v = &g_voices[vi];
        if (!v->running || v->env_state == 4) continue;

        int stride = (v->format == 0) ? 2 : 1;
        uint32_t start = v->sample_start;
        uint32_t end   = v->sample_end;
        if (start >= end) continue;

        for (int i = 0; i < num_samples; i++) {
            /* Simple ADSR */
            switch (v->env_state) {
            case 0: v->env_level += 0.005; if (v->env_level >= 1.0) { v->env_level = 1.0; v->env_state = 1; } break;
            case 1: v->env_level -= 0.001; if (v->env_level <= 0.8) { v->env_level = 0.8; v->env_state = 2; } break;
            case 2: break;
            case 3: v->env_level -= 0.003; if (v->env_level <= 0.0) { v->env_level = 0.0; v->env_state = 4; v->running = 0; } break;
            }

            v->cur_frac += v->phase_inc;
            uint32_t advance = (uint32_t)v->cur_frac;
            v->cur_frac -= (double)advance;
            v->cur_pos  += advance * (uint32_t)stride;
            if (v->cur_pos >= end) {
                v->cur_pos -= (end - start);
                if (v->cur_pos >= end) v->cur_pos = start;
            }

            double sample = swp20_read_sample(v, v->cur_pos);
            double out    = sample * v->env_level;

            g_outL[i] += (float)(out * v->vol_l);
            g_outR[i] += (float)(out * v->vol_r);
        }
    }
    return g_outL;
}

EMSCRIPTEN_KEEPALIVE float* swp20_get_outR(void)       { return g_outR; }
EMSCRIPTEN_KEEPALIVE double swp20_get_sample_rate(void) { return SAMPLE_RATE; }
EMSCRIPTEN_KEEPALIVE int    swp20_get_num_voices(void)  { return NUM_VOICES; }

EMSCRIPTEN_KEEPALIVE
void swp20_set_param(int paramId, double value)
{
    for (int vi = 0; vi < NUM_VOICES; vi++) {
        switch (paramId) {
        case 0: g_voices[vi].format = (uint8_t)(value + 0.5); break;
        }
    }
}
