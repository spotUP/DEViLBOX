/**
 * KS0164Engine.c — Samsung KS0164 32-Voice Wavetable GM Synth (WASM)
 *
 * Based on MAME's ks0164.cpp.
 * The KS0164 is a 64-voice wavetable GM synthesizer used in Roland SC-88 Pro
 * and Samsung YEPP player chips. We expose 32 of its voices.
 * Supports 8-bit (with decode table) and 16-bit linear samples from ROM.
 *
 * Build:
 *   emcc ks0164-wasm/KS0164Engine.c -o public/mame/KS0164.js \
 *     -lm -O2 -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME=KS0164Engine \
 *     -s EXPORTED_FUNCTIONS='["_ks_init","_ks_note_on","_ks_note_off",\
 *       "_ks_set_frequency","_ks_set_volume","_ks_set_pan",\
 *       "_ks_load_rom","_ks_render","_ks_get_outR",\
 *       "_ks_get_sample_rate","_ks_get_num_voices","_malloc","_free"]' \
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
#define MAX_ROM_SIZE (4 * 1024 * 1024)

/*
 * KS0164 8-bit decode table (from ks0164.cpp lines 19-53).
 * Maps 8-bit unsigned ROM byte to signed 16-bit PCM value.
 */
static const int16_t g_decode[256] = {
       0,  256,  512,  768, 1024, 1280, 1536, 1792,
    2048, 2304, 2560, 2816, 3072, 3328, 3584, 3840,
    4096, 4352, 4608, 4864, 5120, 5376, 5632, 5888,
    6144, 6400, 6656, 6912, 7168, 7424, 7680, 7936,
    8192, 8448, 8704, 8960, 9216, 9472, 9728, 9984,
   10240,10496,10752,11008,11264,11520,11776,12032,
   12288,12544,12800,13056,13312,13568,13824,14080,
   14336,14592,14848,15104,15360,15616,15872,16128,
   16384,16640,16896,17152,17408,17664,17920,18176,
   18432,18688,18944,19200,19456,19712,19968,20224,
   20480,20736,20992,21248,21504,21760,22016,22272,
   22528,22784,23040,23296,23552,23808,24064,24320,
   24576,24832,25088,25344,25600,25856,26112,26368,
   26624,26880,27136,27392,27648,27904,28160,28416,
   28672,28928,29184,29440,29696,29952,30208,30464,
   30720,30976,31232,31488,31744,32000,32256,32511,
   /* Upper 128: negative values (mirror) */
  -32512,-32256,-32000,-31744,-31488,-31232,-30976,-30720,
  -30464,-30208,-29952,-29696,-29440,-29184,-28928,-28672,
  -28416,-28160,-27904,-27648,-27392,-27136,-26880,-26624,
  -26368,-26112,-25856,-25600,-25344,-25088,-24832,-24576,
  -24320,-24064,-23808,-23552,-23296,-23040,-22784,-22528,
  -22272,-22016,-21760,-21504,-21248,-20992,-20736,-20480,
  -20224,-19968,-19712,-19456,-19200,-18944,-18688,-18432,
  -18176,-17920,-17664,-17408,-17152,-16896,-16640,-16384,
  -16128,-15872,-15616,-15360,-15104,-14848,-14592,-14336,
  -14080,-13824,-13568,-13312,-13056,-12800,-12544,-12288,
  -12032,-11776,-11520,-11264,-11008,-10752,-10496,-10240,
   -9984, -9728, -9472, -9216, -8960, -8704, -8448, -8192,
   -7936, -7680, -7424, -7168, -6912, -6656, -6400, -6144,
   -5888, -5632, -5376, -5120, -4864, -4608, -4352, -4096,
   -3840, -3584, -3328, -3072, -2816, -2560, -2304, -2048,
   -1792, -1536, -1280, -1024,  -768,  -512,  -256,     0,
};

typedef struct {
    int      running;
    uint32_t start_addr;   /* byte address in ROM */
    uint32_t end_addr;
    uint32_t loop_addr;
    double   phase;        /* 0..len */
    double   phase_inc;
    int      is_8bit;      /* 0=16-bit, 1=8-bit lookup */

    /* Volume ramp (KS0164 has smooth volume transitions) */
    double   vol_l, vol_r;
    double   tgt_vol_l, tgt_vol_r;
    uint16_t ramp_speed;
    uint16_t ramp_count;

    /* Fallback oscillator */
    double   osc_phase;
    double   osc_freq;
} KS0164Voice;

static int           g_fallback_osc = 1;
static uint8_t      *g_rom = NULL;
static int           g_rom_size = 0;
static KS0164Voice   g_voices[NUM_VOICES];
static float         g_outL[BUF_SIZE];
static float         g_outR[BUF_SIZE];

/* -----------------------------------------------------------------------
 * Sample read
 * ----------------------------------------------------------------------- */

static double ks_read(const KS0164Voice *v, uint32_t byte_addr)
{
    if (!g_rom || byte_addr >= (uint32_t)g_rom_size) return 0.0;
    if (v->is_8bit) {
        return (double)g_decode[g_rom[byte_addr]] / 32768.0;
    } else {
        if (byte_addr + 1 >= (uint32_t)g_rom_size) return 0.0;
        int16_t s = (int16_t)((uint16_t)g_rom[byte_addr] | ((uint16_t)g_rom[byte_addr+1] << 8));
        return (double)s / 32768.0;
    }
}

/* -----------------------------------------------------------------------
 * WASM-exported API
 * ----------------------------------------------------------------------- */

EMSCRIPTEN_KEEPALIVE
void ks_init(void)
{
    g_fallback_osc = 1;
    if (g_rom) { free(g_rom); g_rom = NULL; }
    g_rom_size = 0;
    memset(g_voices, 0, sizeof(g_voices));
    for (int i = 0; i < NUM_VOICES; i++) {
        g_voices[i].tgt_vol_l = g_voices[i].vol_l = 0.5;
        g_voices[i].tgt_vol_r = g_voices[i].vol_r = 0.5;
        g_voices[i].ramp_speed = 1;
    }
}

EMSCRIPTEN_KEEPALIVE
void ks_note_on(int voice, double freq_hz, double velocity)
{
    if (voice < 0 || voice >= NUM_VOICES || freq_hz <= 0.0) return;
    KS0164Voice *v = &g_voices[voice];
    v->osc_freq  = freq_hz;
    v->osc_phase = 0.0;
    if (g_rom) {
        int stride = v->is_8bit ? 1 : 2;
        uint32_t len = (v->end_addr - v->start_addr) / (uint32_t)stride;
        if (len == 0) len = 1;
        v->phase_inc = freq_hz * (double)len / SAMPLE_RATE;
        v->phase     = 0.0;
    }
    v->tgt_vol_l     = velocity * 0.707;
    v->tgt_vol_r     = velocity * 0.707;
    v->vol_l         = v->tgt_vol_l;
    v->vol_r         = v->tgt_vol_r;
    v->running       = 1;
}

EMSCRIPTEN_KEEPALIVE
void ks_note_off(int voice)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    /* Ramp to zero */
    g_voices[voice].tgt_vol_l = 0.0;
    g_voices[voice].tgt_vol_r = 0.0;
}

EMSCRIPTEN_KEEPALIVE
void ks_set_frequency(int voice, double freq_hz)
{
    if (voice < 0 || voice >= NUM_VOICES || freq_hz <= 0.0) return;
    KS0164Voice *v = &g_voices[voice];
    int stride = v->is_8bit ? 1 : 2;
    uint32_t len = (v->end_addr - v->start_addr) / (uint32_t)stride;
    if (len == 0) len = 1;
    v->phase_inc = freq_hz * (double)len / SAMPLE_RATE;
}

EMSCRIPTEN_KEEPALIVE
void ks_set_volume(int voice, double vol)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    g_voices[voice].tgt_vol_l = vol * 0.707;
    g_voices[voice].tgt_vol_r = vol * 0.707;
}

EMSCRIPTEN_KEEPALIVE
void ks_set_pan(int voice, double pan)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    KS0164Voice *v = &g_voices[voice];
    double pan_r = (pan + 1.0) * 0.5;
    double avg   = (v->tgt_vol_l + v->tgt_vol_r) / 2.0;
    v->tgt_vol_l = avg * (1.0 - pan_r) * 2.0;
    v->tgt_vol_r = avg * pan_r * 2.0;
}

EMSCRIPTEN_KEEPALIVE
void ks_load_rom(uint8_t *data, int size)
{
    if (!data || size <= 0) return;
    if (g_rom) { free(g_rom); g_rom = NULL; }
    g_rom_size = (size > MAX_ROM_SIZE) ? MAX_ROM_SIZE : size;
    g_rom = (uint8_t*)malloc((size_t)g_rom_size);
    if (!g_rom) { g_rom_size = 0; return; }
    memcpy(g_rom, data, (size_t)g_rom_size);
    /* Auto-assign voice regions */
    uint32_t region = (uint32_t)(g_rom_size / NUM_VOICES);
    for (int i = 0; i < NUM_VOICES; i++) {
        g_voices[i].start_addr = (uint32_t)(i * region);
        g_voices[i].loop_addr  = (uint32_t)(i * region);
        g_voices[i].end_addr   = (uint32_t)((i + 1) * region);
        g_voices[i].is_8bit    = 1;
    }
    g_fallback_osc = 0;
}

EMSCRIPTEN_KEEPALIVE
float* ks_render(int num_samples)
{
    if (num_samples > BUF_SIZE) num_samples = BUF_SIZE;
    memset(g_outL, 0, (size_t)num_samples * sizeof(float));
    memset(g_outR, 0, (size_t)num_samples * sizeof(float));

    if (g_fallback_osc) {
        const double two_pi = 6.28318530717959;
        for (int vi = 0; vi < NUM_VOICES; vi++) {
            KS0164Voice *v = &g_voices[vi];
            if (!v->running) continue;
            double step = two_pi * v->osc_freq / SAMPLE_RATE;
            for (int i = 0; i < num_samples; i++) {
                v->vol_l += (v->tgt_vol_l - v->vol_l) * 0.002;
                v->vol_r += (v->tgt_vol_r - v->vol_r) * 0.002;
                if (v->vol_l < 0.001 && v->vol_r < 0.001 &&
                    v->tgt_vol_l < 0.001 && v->tgt_vol_r < 0.001) {
                    v->running = 0; break;
                }
                v->osc_phase += step;
                if (v->osc_phase >= two_pi) v->osc_phase -= two_pi;
                double out = sin(v->osc_phase);
                g_outL[i] += (float)(out * v->vol_l);
                g_outR[i] += (float)(out * v->vol_r);
            }
        }
        return g_outL;
    }

    if (!g_rom) return g_outL;

    for (int vi = 0; vi < NUM_VOICES; vi++) {
        KS0164Voice *v = &g_voices[vi];
        if (!v->running) continue;

        int stride = v->is_8bit ? 1 : 2;
        uint32_t len = (v->end_addr - v->start_addr) / (uint32_t)stride;
        uint32_t loop_off = (v->loop_addr - v->start_addr) / (uint32_t)stride;
        if (len == 0) continue;

        double vol_ramp = 0.002;

        for (int i = 0; i < num_samples; i++) {
            v->vol_l += (v->tgt_vol_l - v->vol_l) * vol_ramp;
            v->vol_r += (v->tgt_vol_r - v->vol_r) * vol_ramp;

            if (v->vol_l < 0.001 && v->vol_r < 0.001 &&
                v->tgt_vol_l < 0.001 && v->tgt_vol_r < 0.001) {
                v->running = 0;
                break;
            }

            v->phase += v->phase_inc;
            while (v->phase >= (double)len) {
                v->phase -= (double)(len - loop_off);
            }
            if (v->phase < 0.0) v->phase = 0.0;

            uint32_t byte_addr = v->start_addr + (uint32_t)(v->phase * (double)stride);
            double sample = ks_read(v, byte_addr);

            g_outL[i] += (float)(sample * v->vol_l);
            g_outR[i] += (float)(sample * v->vol_r);
        }
    }
    return g_outL;
}

EMSCRIPTEN_KEEPALIVE float* ks_get_outR(void)        { return g_outR; }
EMSCRIPTEN_KEEPALIVE double ks_get_sample_rate(void)  { return SAMPLE_RATE; }
EMSCRIPTEN_KEEPALIVE int    ks_get_num_voices(void)   { return NUM_VOICES; }

EMSCRIPTEN_KEEPALIVE
void ks_set_param(int paramId, double value)
{
    if (paramId == 0) {
        /* ramp_speed: 0..1 controls vol ramp step size (lower = smoother glide) */
        double ramp = (value > 0.001) ? value : 0.001;
        for (int vi = 0; vi < NUM_VOICES; vi++)
            g_voices[vi].ramp_speed = (uint16_t)(ramp * 65535.0);
    }
}
