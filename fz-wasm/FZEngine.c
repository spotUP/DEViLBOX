/**
 * FZEngine.c — Casio FZ-1 8-Voice 16-bit PCM Sampler (WASM)
 *
 * Based on MAME's fz_pcm_device by Devin Acker (BSD-3-Clause).
 * The Casio FZ-1 (1987) uses 8 PCM voices sharing 2MB of 16-bit wave RAM.
 * Each voice has independent start, end, loop, pitch, volume, and panning.
 *
 * Build:
 *   emcc fz-wasm/FZEngine.c -o public/mame/FZ.js \
 *     -lm -O2 -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME=FZEngine \
 *     -s EXPORTED_FUNCTIONS='["_fz_init","_fz_note_on","_fz_note_off",\
 *       "_fz_set_frequency","_fz_set_volume","_fz_set_pan","_fz_load_sample",\
 *       "_fz_set_loop","_fz_render","_fz_get_outR","_fz_get_sample_rate",\
 *       "_fz_get_num_voices","_malloc","_free"]' \
 *     -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
 *     -s ENVIRONMENT=web,worker -s ALLOW_MEMORY_GROWTH=1 -s FILESYSTEM=0
 */

#include <emscripten.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

#define NUM_VOICES      8
#define SAMPLE_RATE     44100.0
/* Shared 2MB wave RAM: 1M 16-bit words (21-bit byte address space) */
#define WAVE_RAM_WORDS  (1 << 20)
#define BUF_SIZE        512

typedef struct {
    int      running;
    uint32_t start;       /* word address in g_wave_ram */
    uint32_t end;         /* exclusive end (word) */
    uint32_t loop_start;  /* loop start (word) */
    uint32_t loop_end;    /* loop end (word, exclusive) */
    double   phase;       /* fractional position in loop (0..loop_len) */
    double   phase_inc;   /* phase advance per output sample */
    double   vol;         /* 0..1 */
    double   pan;         /* -1..1 */
} FZVoice;

/* Shared wave RAM — 2MB total */
static int16_t  g_wave_ram[WAVE_RAM_WORDS];
static FZVoice  g_voices[NUM_VOICES];
static float    g_outL[BUF_SIZE];
static float    g_outR[BUF_SIZE];
static double   g_fz_pitch_fine = 0.0;  /* -1..+1, scales phase_inc */

/* -----------------------------------------------------------------------
 * WASM-exported API
 * ----------------------------------------------------------------------- */

EMSCRIPTEN_KEEPALIVE
void fz_init(void)
{
    memset(g_wave_ram, 0, sizeof(g_wave_ram));
    memset(g_voices, 0, sizeof(g_voices));

    /* Pre-fill shared wave RAM: each voice gets a 1024-sample waveform in its
     * own region so voices produce audio without external samples loaded. */
    const int PERIOD = 1024;
    for (int i = 0; i < NUM_VOICES; i++) {
        uint32_t rstart = (uint32_t)i * (WAVE_RAM_WORDS / NUM_VOICES);
        for (int j = 0; j < PERIOD; j++) {
            double phase = 2.0 * 3.14159265358979 * j / PERIOD;
            double val;
            switch (i % 8) {
            case 0: val = sin(phase); break;
            case 1: val = (j < PERIOD/2) ? 1.0 : -1.0; break; /* square */
            case 2: val = (double)j / PERIOD * 2.0 - 1.0; break; /* sawtooth */
            case 3: { double t = (double)j/PERIOD; val = (t<0.5)?(4*t-1):(3-4*t); break; } /* triangle */
            case 4: val = sin(phase)*0.7 + sin(phase*3)*0.3; break; /* organ */
            case 5: val = (j < PERIOD/4) ? 1.0 : -0.333; break; /* pulse 25% */
            case 6: val = tanh(sin(phase)*3.0); break; /* soft-square */
            default: val = sin(phase)*0.6 + sin(phase*2)*0.3 + sin(phase*3)*0.1; break;
            }
            if (val >  1.0) val =  1.0;
            if (val < -1.0) val = -1.0;
            g_wave_ram[rstart + (uint32_t)j] = (int16_t)(val * 32767.0);
        }

        FZVoice *v = &g_voices[i];
        v->vol        = 0.5;
        v->pan        = 0.0;
        v->start      = rstart;
        v->end        = rstart + (uint32_t)PERIOD;
        v->loop_start = rstart;
        v->loop_end   = rstart + (uint32_t)PERIOD;
    }
}

static int fz_loop_len(const FZVoice *v)
{
    int len = (int)(v->loop_end - v->loop_start);
    return (len > 0) ? len : 1;
}

EMSCRIPTEN_KEEPALIVE
void fz_note_on(int voice, double freq_hz, double velocity)
{
    if (voice < 0 || voice >= NUM_VOICES || freq_hz <= 0.0) return;
    FZVoice *v = &g_voices[voice];
    v->phase_inc = freq_hz * (double)fz_loop_len(v) / SAMPLE_RATE;
    v->phase     = 0.0;
    v->vol       = velocity;
    v->running   = 1;
}

EMSCRIPTEN_KEEPALIVE
void fz_note_off(int voice)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    g_voices[voice].running = 0;
}

EMSCRIPTEN_KEEPALIVE
void fz_set_frequency(int voice, double freq_hz)
{
    if (voice < 0 || voice >= NUM_VOICES || freq_hz <= 0.0) return;
    FZVoice *v = &g_voices[voice];
    v->phase_inc = freq_hz * (double)fz_loop_len(v) / SAMPLE_RATE;
}

EMSCRIPTEN_KEEPALIVE
void fz_set_volume(int voice, double vol)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    g_voices[voice].vol = vol;
}

EMSCRIPTEN_KEEPALIVE
void fz_set_pan(int voice, double pan)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    g_voices[voice].pan = pan;
}

/**
 * Load 16-bit signed PCM data into shared wave RAM at word_offset.
 * data points to little-endian int16 samples, size is byte count.
 */
EMSCRIPTEN_KEEPALIVE
void fz_load_sample(int voice, uint8_t *data, int size)
{
    if (voice < 0 || voice >= NUM_VOICES || !data || size < 2) return;
    FZVoice *v  = &g_voices[voice];
    /* Assign a region of wave RAM based on voice index */
    uint32_t region_start = (uint32_t)voice * (WAVE_RAM_WORDS / NUM_VOICES);
    uint32_t region_words = WAVE_RAM_WORDS / NUM_VOICES;
    int words = size / 2;
    if (words > (int)region_words) words = (int)region_words;
    memcpy(&g_wave_ram[region_start], data, (size_t)(words * 2));
    v->start      = region_start;
    v->end        = region_start + (uint32_t)words;
    v->loop_start = region_start;
    v->loop_end   = region_start + (uint32_t)words;
}

EMSCRIPTEN_KEEPALIVE
void fz_set_loop(int voice, int start_words, int end_words)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    FZVoice *v = &g_voices[voice];
    uint32_t max_word = WAVE_RAM_WORDS;
    v->loop_start = (uint32_t)((start_words < 0) ? 0 : start_words);
    v->loop_end   = (uint32_t)((end_words <= 0 || (uint32_t)end_words > max_word)
                                ? max_word : (uint32_t)end_words);
}

EMSCRIPTEN_KEEPALIVE
float* fz_render(int num_samples)
{
    if (num_samples > BUF_SIZE) num_samples = BUF_SIZE;
    memset(g_outL, 0, (size_t)num_samples * sizeof(float));
    memset(g_outR, 0, (size_t)num_samples * sizeof(float));

    for (int vi = 0; vi < NUM_VOICES; vi++) {
        FZVoice *v = &g_voices[vi];
        if (!v->running) continue;

        int lstart = (int)v->loop_start;
        int lend   = (int)v->loop_end;
        int llen   = lend - lstart;
        if (llen <= 0) continue;

        float pan_r = (float)((v->pan + 1.0) * 0.5);
        float pan_l = 1.0f - pan_r;

        double effective_inc = v->phase_inc * (1.0 + g_fz_pitch_fine * 0.1);
        for (int i = 0; i < num_samples; i++) {
            v->phase += effective_inc;
            while (v->phase >= (double)llen) v->phase -= (double)llen;
            while (v->phase < 0.0)            v->phase += (double)llen;

            int    idx  = lstart + (int)v->phase;
            double frac = v->phase - (int)v->phase;

            if (idx < lstart) idx = lstart;
            if (idx >= lend)  idx = lend - 1;
            int idx2 = (idx + 1 < lend) ? idx + 1 : lstart;

            /* Linear interpolation of signed 16-bit samples */
            double s0  = (double)g_wave_ram[idx];
            double s1  = (double)g_wave_ram[idx2];
            double out = (s0 + (s1 - s0) * frac) * v->vol / 32768.0;

            g_outL[i] += (float)(out * pan_l);
            g_outR[i] += (float)(out * pan_r);
        }
    }
    return g_outL;
}

EMSCRIPTEN_KEEPALIVE float* fz_get_outR(void)       { return g_outR; }
EMSCRIPTEN_KEEPALIVE double fz_get_sample_rate(void) { return SAMPLE_RATE; }
EMSCRIPTEN_KEEPALIVE int    fz_get_num_voices(void)  { return NUM_VOICES; }

EMSCRIPTEN_KEEPALIVE
void fz_set_param(int paramId, double value)
{
    if (paramId == 0) {
        /* pitch_fine: -1..+1, scales all running phase_inc values by (1 + value * 0.1) */
        g_fz_pitch_fine = value;
    }
}
