/**
 * SWP00Engine.c — Yamaha SWP00 AWM2 32-Voice ROMpler (WASM)
 *
 * Based on MAME's swp00.cpp (33K lines).
 * The SWP00 is the AWM2 streaming + MEG effects engine in the Yamaha MU50 (XG).
 * We implement the AWM2 streaming core with envelope and Chamberlin state-variable filter.
 * The MEG effects DSP is omitted (outputs dry signal only).
 *
 * Build:
 *   emcc swp00-wasm/SWP00Engine.c -o public/mame/SWP00.js \
 *     -lm -O2 -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME=SWP00Engine \
 *     -s EXPORTED_FUNCTIONS='["_swp00_init","_swp00_note_on","_swp00_note_off",\
 *       "_swp00_set_frequency","_swp00_set_volume","_swp00_set_pan",\
 *       "_swp00_load_rom","_swp00_render","_swp00_get_outR",\
 *       "_swp00_get_sample_rate","_swp00_get_num_voices","_malloc","_free"]' \
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
#define MAX_ROM_SIZE (16 * 1024 * 1024)  /* 16MB AWM2 wave ROM */

typedef struct {
    int      running;
    uint32_t pos;         /* byte address in ROM */
    uint32_t loop_pos;    /* loop start byte */
    uint32_t end_pos;     /* end byte (exclusive) */
    double   phase_frac;  /* 0..1 fractional position within sample step */
    double   phase_inc;   /* bytes per output sample */
    uint8_t  format;      /* 0=16-bit, 1=8-bit */
    int8_t   dpcm_delta;  /* DPCM decode state */

    /* Envelope (simplified ADSR) */
    int      env_state;   /* 0=attack, 1=decay, 2=sustain, 3=release, 4=off */
    double   env_level;
    double   env_attack;
    double   env_decay;
    double   env_sustain;
    double   env_release;

    /* Chamberlin state-variable lowpass filter */
    double   flt_k;       /* cutoff coefficient (0..1) */
    double   flt_q;       /* 1/resonance */
    double   flt_b;       /* bandpass state */
    double   flt_l;       /* lowpass state */

    /* LFO */
    double   lfo_phase;
    double   lfo_step;
    double   lfo_amod;
    double   lfo_fmod;

    /* Mixer */
    double   vol_l, vol_r;

    /* Fallback oscillator */
    double   osc_phase;
    double   osc_freq;
} SWP00Voice;

static int         g_fallback_osc = 1;
static uint8_t    *g_rom = NULL;
static int         g_rom_size = 0;
static SWP00Voice  g_voices[NUM_VOICES];
static float       g_outL[BUF_SIZE];
static float       g_outR[BUF_SIZE];

/* -----------------------------------------------------------------------
 * Sample read (16-bit or 8-bit from ROM)
 * ----------------------------------------------------------------------- */

static double swp00_read_sample(const SWP00Voice *v, uint32_t byte_addr)
{
    if (!g_rom || byte_addr >= (uint32_t)g_rom_size) return 0.0;
    if (v->format == 0) {
        /* 16-bit little-endian */
        if (byte_addr + 1 >= (uint32_t)g_rom_size) return 0.0;
        int16_t s = (int16_t)((uint16_t)g_rom[byte_addr] | ((uint16_t)g_rom[byte_addr+1] << 8));
        return (double)s / 32768.0;
    } else {
        /* 8-bit signed */
        return (double)(int8_t)g_rom[byte_addr] / 128.0;
    }
}

/* -----------------------------------------------------------------------
 * WASM-exported API
 * ----------------------------------------------------------------------- */

EMSCRIPTEN_KEEPALIVE
void swp00_init(void)
{
    g_fallback_osc = 1;
    if (g_rom) { free(g_rom); g_rom = NULL; }
    g_rom_size = 0;
    memset(g_voices, 0, sizeof(g_voices));
    for (int i = 0; i < NUM_VOICES; i++) {
        SWP00Voice *v  = &g_voices[i];
        v->vol_l       = 0.5;
        v->vol_r       = 0.5;
        v->flt_k       = 0.5;
        v->flt_q       = 1.0;
        v->env_attack  = 0.005;
        v->env_decay   = 0.001;
        v->env_sustain = 0.8;
        v->env_release = 0.003;
        v->env_state   = 4;
    }
}

EMSCRIPTEN_KEEPALIVE
void swp00_note_on(int voice, double freq_hz, double velocity)
{
    if (voice < 0 || voice >= NUM_VOICES || freq_hz <= 0.0) return;
    SWP00Voice *v = &g_voices[voice];
    v->osc_freq  = freq_hz;
    v->osc_phase = 0.0;
    if (g_rom) {
        int stride = (v->format == 0) ? 2 : 1;
        uint32_t len = (v->end_pos - v->pos) / (uint32_t)stride;
        if (len == 0) len = 1;
        v->phase_inc  = freq_hz * (double)stride * (double)len / SAMPLE_RATE;
    }
    v->phase_frac = 0.0;
    v->flt_b      = 0.0;
    v->flt_l      = 0.0;
    v->lfo_phase  = 0.0;
    v->vol_l      = velocity * 0.707;
    v->vol_r      = velocity * 0.707;
    v->env_state  = 0;
    v->env_level  = 0.0;
    v->running    = 1;
}

EMSCRIPTEN_KEEPALIVE
void swp00_note_off(int voice)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    SWP00Voice *v = &g_voices[voice];
    if (v->env_state < 3) v->env_state = 3;
}

EMSCRIPTEN_KEEPALIVE
void swp00_set_frequency(int voice, double freq_hz)
{
    if (voice < 0 || voice >= NUM_VOICES || freq_hz <= 0.0) return;
    SWP00Voice *v = &g_voices[voice];
    int stride = (v->format == 0) ? 2 : 1;
    uint32_t len = (v->end_pos - v->loop_pos) / (uint32_t)stride;
    if (len == 0) len = 1;
    v->phase_inc = freq_hz * (double)stride * (double)len / SAMPLE_RATE;
}

EMSCRIPTEN_KEEPALIVE
void swp00_set_volume(int voice, double vol)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    g_voices[voice].vol_l = vol * 0.707;
    g_voices[voice].vol_r = vol * 0.707;
}

EMSCRIPTEN_KEEPALIVE
void swp00_set_pan(int voice, double pan)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    SWP00Voice *v = &g_voices[voice];
    double pan_r = (pan + 1.0) * 0.5;
    double avg   = (v->vol_l + v->vol_r) / 2.0;
    v->vol_l = avg * (1.0 - pan_r) * 2.0;
    v->vol_r = avg * pan_r * 2.0;
}

EMSCRIPTEN_KEEPALIVE
void swp00_load_rom(uint8_t *data, int size)
{
    if (!data || size <= 0) return;
    if (g_rom) { free(g_rom); g_rom = NULL; }
    g_rom_size = (size > MAX_ROM_SIZE) ? MAX_ROM_SIZE : size;
    g_rom = (uint8_t*)malloc((size_t)g_rom_size);
    if (!g_rom) { g_rom_size = 0; return; }
    memcpy(g_rom, data, (size_t)g_rom_size);
    uint32_t region = (uint32_t)(g_rom_size / NUM_VOICES);
    for (int i = 0; i < NUM_VOICES; i++) {
        g_voices[i].pos      = (uint32_t)(i * region);
        g_voices[i].loop_pos = (uint32_t)(i * region);
        g_voices[i].end_pos  = (uint32_t)((i + 1) * region);
        g_voices[i].format   = 0;  /* default 16-bit */
    }
    g_fallback_osc = 0;
}

EMSCRIPTEN_KEEPALIVE
float* swp00_render(int num_samples)
{
    if (num_samples > BUF_SIZE) num_samples = BUF_SIZE;
    memset(g_outL, 0, (size_t)num_samples * sizeof(float));
    memset(g_outR, 0, (size_t)num_samples * sizeof(float));

    if (g_fallback_osc) {
        const double two_pi = 6.28318530717959;
        for (int vi = 0; vi < NUM_VOICES; vi++) {
            SWP00Voice *v = &g_voices[vi];
            if (!v->running || v->env_state == 4) continue;
            double step = two_pi * v->osc_freq / SAMPLE_RATE;
            for (int i = 0; i < num_samples; i++) {
                switch (v->env_state) {
                case 0: v->env_level += v->env_attack;  if (v->env_level >= 1.0) { v->env_level = 1.0; v->env_state = 1; } break;
                case 1: v->env_level -= v->env_decay;   if (v->env_level <= v->env_sustain) { v->env_level = v->env_sustain; v->env_state = 2; } break;
                case 2: break;
                case 3: v->env_level -= v->env_release; if (v->env_level <= 0.0) { v->env_level = 0.0; v->env_state = 4; v->running = 0; } break;
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
        SWP00Voice *v = &g_voices[vi];
        if (!v->running || v->env_state == 4) continue;

        int stride = (v->format == 0) ? 2 : 1;
        uint32_t start = v->loop_pos;
        uint32_t end   = v->end_pos;
        if (start >= end) continue;

        for (int i = 0; i < num_samples; i++) {
            /* Envelope */
            switch (v->env_state) {
            case 0: v->env_level += v->env_attack;  if (v->env_level >= 1.0) { v->env_level = 1.0; v->env_state = 1; } break;
            case 1: v->env_level -= v->env_decay;   if (v->env_level <= v->env_sustain) { v->env_level = v->env_sustain; v->env_state = 2; } break;
            case 2: break;
            case 3: v->env_level -= v->env_release; if (v->env_level <= 0.0) { v->env_level = 0.0; v->env_state = 4; v->running = 0; } break;
            }

            /* LFO */
            v->lfo_phase += v->lfo_step;
            if (v->lfo_phase > 6.2832) v->lfo_phase -= 6.2832;
            double lfo_val = sin(v->lfo_phase);

            /* Advance position */
            v->phase_frac += v->phase_inc;
            uint32_t advance = (uint32_t)v->phase_frac;
            v->phase_frac -= (double)advance;
            v->pos += advance * (uint32_t)stride;
            if (v->pos >= end) {
                v->pos -= (end - start);
                if (v->pos >= end) v->pos = start;
            }

            double raw = swp00_read_sample(v, v->pos);

            /* Chamberlin state-variable LPF */
            double fk = v->flt_k * (1.0 + lfo_val * v->lfo_fmod * 0.1);
            v->flt_b = v->flt_b + fk * raw - v->flt_q * v->flt_b - v->flt_l * fk;
            v->flt_l = v->flt_l + fk * v->flt_b;
            double sample = v->flt_l;

            double out = sample * v->env_level * (1.0 + lfo_val * v->lfo_amod);

            g_outL[i] += (float)(out * v->vol_l);
            g_outR[i] += (float)(out * v->vol_r);
        }
    }
    return g_outL;
}

EMSCRIPTEN_KEEPALIVE float* swp00_get_outR(void)       { return g_outR; }
EMSCRIPTEN_KEEPALIVE double swp00_get_sample_rate(void) { return SAMPLE_RATE; }
EMSCRIPTEN_KEEPALIVE int    swp00_get_num_voices(void)  { return NUM_VOICES; }

EMSCRIPTEN_KEEPALIVE
void swp00_set_param(int paramId, double value)
{
    for (int vi = 0; vi < NUM_VOICES; vi++) {
        SWP00Voice *v = &g_voices[vi];
        switch (paramId) {
        case 0: v->flt_k       = value; break;
        case 1: v->flt_q       = 0.1 + value * 3.9; break;
        case 2: v->lfo_step    = value * 0.1; break;
        case 3: v->lfo_amod    = value; break;
        case 4: v->lfo_fmod    = value; break;
        case 5: v->env_attack  = value > 0.0 ? value : 0.0001; break;
        case 6: v->env_decay   = value > 0.0 ? value : 0.0001; break;
        case 7: v->env_sustain = value; break;
        case 8: v->env_release = value > 0.0 ? value : 0.0001; break;
        }
    }
}
