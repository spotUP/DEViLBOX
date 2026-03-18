/**
 * PS1SPUEngine.c — PlayStation 1 CXD2922BQ SPU (WASM)
 *
 * Based on MAME's spu.cpp (PlayStation 1 SPU emulation).
 * The PS1 SPU has 24 voices with 4-bit ADPCM (XA-ADPCM format) and full ADSR envelopes.
 * SPU RAM is 512KB shared across all voices.
 *
 * Build:
 *   emcc ps1spu-wasm/PS1SPUEngine.c -o public/mame/PS1SPU.js \
 *     -lm -O2 -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME=PS1SPUEngine \
 *     -s EXPORTED_FUNCTIONS='["_spu_init","_spu_note_on","_spu_note_off",\
 *       "_spu_set_frequency","_spu_set_volume","_spu_set_pan","_spu_load_sample",\
 *       "_spu_render","_spu_get_outR","_spu_get_sample_rate",\
 *       "_spu_get_num_voices","_malloc","_free"]' \
 *     -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
 *     -s ENVIRONMENT=web,worker -s ALLOW_MEMORY_GROWTH=1 -s FILESYSTEM=0
 */

#include <emscripten.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

#define NUM_VOICES      24
#define SAMPLE_RATE     44100.0
#define SPU_RAM_SIZE    (512 * 1024)   /* 512KB SPU RAM */
#define BUF_SIZE        512

/* PS-ADPCM filter coefficients * 32 */
static const int g_filter_pos[5] = { 0, 60, 115,  98, 122 };
static const int g_filter_neg[5] = { 0,  0, -52, -55, -60 };

typedef struct {
    int      running;
    uint32_t start_addr;   /* byte address in SPU RAM */
    uint32_t loop_addr;
    uint32_t cur_addr;
    double   cur_frac;     /* 0..1 fractional position within block */
    uint16_t pitch;        /* 0x1000 = natural (44100 Hz) */

    /* ADPCM decode state */
    int16_t  hist1, hist2;
    int16_t  pcm_buf[28];  /* decoded block */
    int      pcm_pos;      /* current sample position in pcm_buf */
    int      at_loop;      /* flag: end-of-block with loop flag set */
    int      flags;        /* loop/end flags from last block header */

    /* ADSR */
    int      env_state;    /* 0=attack, 1=decay, 2=sustain, 3=release, 4=off */
    double   env_level;    /* 0..1 */
    double   attack_rate;
    double   decay_rate;
    double   sustain_level;
    double   sustain_rate;
    double   release_rate;

    double   vol_l, vol_r; /* 0..1 */

    /* Fallback oscillator (used when no ADPCM data is loaded) */
    double   osc_phase;
    double   osc_freq;
} SPUVoice;

/* Set to 1 until spu_load_sample() is called — enables sine fallback. */
static int g_fallback_osc = 1;

static uint8_t g_spu_ram[SPU_RAM_SIZE];
static SPUVoice g_voices[NUM_VOICES];
static float g_outL[BUF_SIZE];
static float g_outR[BUF_SIZE];

/* Decode one 16-byte PS-ADPCM block starting at addr in SPU RAM.
 * Output: 28 signed 16-bit samples into buf. Returns loop/end flags byte. */
static int spu_decode_block(uint32_t addr, int16_t hist1, int16_t hist2, int16_t out[28])
{
    if (addr + 16 > SPU_RAM_SIZE) { memset(out, 0, 28*2); return 1; }
    const uint8_t *b = &g_spu_ram[addr];
    int shift  = b[0] & 0x0f;
    int filter = (b[0] >> 4) & 0x07;
    if (filter > 4) filter = 4;
    int flags = b[1];
    int f1 = g_filter_pos[filter];
    int f2 = g_filter_neg[filter];

    for (int i = 0; i < 14; i++) {
        uint8_t byte = b[2 + i];
        int nibbles[2] = { (int)(byte & 0x0f), (int)(byte >> 4) };
        for (int n = 0; n < 2; n++) {
            int nib = nibbles[n];
            if (nib & 0x08) nib |= 0xfffffff0;  /* sign extend 4-bit */
            int raw = (nib << 12) >> shift;
            int s = raw + (f1 * hist1 + f2 * hist2 + 32) / 64;
            if (s >  32767) s =  32767;
            if (s < -32768) s = -32768;
            out[i*2 + n] = (int16_t)s;
            hist2 = hist1;
            hist1 = (int16_t)s;
        }
    }
    return flags;
}

/* -----------------------------------------------------------------------
 * WASM-exported API
 * ----------------------------------------------------------------------- */

EMSCRIPTEN_KEEPALIVE
void spu_init(void)
{
    g_fallback_osc = 1;
    memset(g_spu_ram, 0, sizeof(g_spu_ram));
    memset(g_voices, 0, sizeof(g_voices));
    for (int i = 0; i < NUM_VOICES; i++) {
        SPUVoice *v    = &g_voices[i];
        v->pitch       = 0x1000;
        v->vol_l       = 0.5;
        v->vol_r       = 0.5;
        v->env_state   = 4;  /* off */
        v->attack_rate = 0.01;
        v->decay_rate  = 0.002;
        v->sustain_level = 0.8;
        v->sustain_rate  = 0.0;
        v->release_rate  = 0.005;
    }
}

EMSCRIPTEN_KEEPALIVE
void spu_note_on(int voice, double freq_hz, double velocity)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    SPUVoice *v  = &g_voices[voice];
    /* pitch: 0x1000 = 44100 Hz */
    double pitch_f = freq_hz / SAMPLE_RATE * 4096.0;
    v->pitch = (uint16_t)(pitch_f < 0x3fff ? pitch_f : 0x3fff);
    v->cur_addr = v->start_addr;
    v->cur_frac = 0.0;
    v->hist1    = 0;
    v->hist2    = 0;
    v->pcm_pos  = 28;  /* force decode on first sample */
    v->at_loop  = 0;
    v->env_state = 0;
    v->env_level = 0.0;
    v->vol_l = velocity * 0.707;
    v->vol_r = velocity * 0.707;
    v->osc_freq  = freq_hz;
    v->osc_phase = 0.0;
    v->running = 1;
}

EMSCRIPTEN_KEEPALIVE
void spu_note_off(int voice)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    SPUVoice *v = &g_voices[voice];
    if (v->env_state < 3) v->env_state = 3;  /* release */
}

EMSCRIPTEN_KEEPALIVE
void spu_set_frequency(int voice, double freq_hz)
{
    if (voice < 0 || voice >= NUM_VOICES || freq_hz <= 0.0) return;
    SPUVoice *v = &g_voices[voice];
    double pitch_f = freq_hz / SAMPLE_RATE * 4096.0;
    v->pitch = (uint16_t)(pitch_f < 0x3fff ? pitch_f : 0x3fff);
}

EMSCRIPTEN_KEEPALIVE
void spu_set_volume(int voice, double vol)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    SPUVoice *v = &g_voices[voice];
    v->vol_l = vol * 0.707;
    v->vol_r = vol * 0.707;
}

EMSCRIPTEN_KEEPALIVE
void spu_set_pan(int voice, double pan)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    SPUVoice *v = &g_voices[voice];
    double pan_r = (pan + 1.0) * 0.5;
    double pan_l = 1.0 - pan_r;
    double total = v->vol_l + v->vol_r;
    double avg   = (total > 0.001) ? total / 2.0 : 0.5;
    v->vol_l = avg * pan_l * 2.0;
    v->vol_r = avg * pan_r * 2.0;
}

/**
 * Load raw PS-ADPCM data into SPU RAM at byte_offset.
 * data: pointer to ADPCM blocks (16 bytes each), size: byte count.
 * Sets voice start_addr = byte_offset, loop_addr = byte_offset.
 */
EMSCRIPTEN_KEEPALIVE
void spu_load_sample(int voice, uint8_t *data, int size)
{
    if (voice < 0 || voice >= NUM_VOICES || !data || size <= 0) return;
    SPUVoice *v = &g_voices[voice];
    uint32_t offset = (uint32_t)(voice * (SPU_RAM_SIZE / NUM_VOICES));
    int copy = size;
    if ((int)offset + copy > SPU_RAM_SIZE)
        copy = SPU_RAM_SIZE - (int)offset;
    if (copy > 0) memcpy(&g_spu_ram[offset], data, (size_t)copy);
    v->start_addr = offset;
    v->loop_addr  = offset;
    g_fallback_osc = 0;  /* real ADPCM data loaded — disable sine fallback */
}

EMSCRIPTEN_KEEPALIVE
float* spu_render(int num_samples)
{
    if (num_samples > BUF_SIZE) num_samples = BUF_SIZE;
    memset(g_outL, 0, (size_t)num_samples * sizeof(float));
    memset(g_outR, 0, (size_t)num_samples * sizeof(float));

    /* Fallback sine oscillator — active until spu_load_sample() is called */
    if (g_fallback_osc) {
        const double two_pi = 6.28318530717959;
        for (int vi = 0; vi < NUM_VOICES; vi++) {
            SPUVoice *v = &g_voices[vi];
            if (!v->running) continue;
            double step = two_pi * v->osc_freq / SAMPLE_RATE;
            for (int i = 0; i < num_samples; i++) {
                switch (v->env_state) {
                case 0: v->env_level += v->attack_rate;  if (v->env_level >= 1.0) { v->env_level = 1.0; v->env_state = 1; } break;
                case 1: v->env_level -= v->decay_rate;   if (v->env_level <= v->sustain_level) { v->env_level = v->sustain_level; v->env_state = 2; } break;
                case 2: break;
                case 3: v->env_level -= v->release_rate; if (v->env_level <= 0.0) { v->env_level = 0.0; v->env_state = 4; v->running = 0; } break;
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

    for (int vi = 0; vi < NUM_VOICES; vi++) {
        SPUVoice *v = &g_voices[vi];
        if (!v->running || v->env_state == 4) continue;

        for (int i = 0; i < num_samples; i++) {
            /* ADSR envelope */
            switch (v->env_state) {
            case 0: /* attack */
                v->env_level += v->attack_rate;
                if (v->env_level >= 1.0) { v->env_level = 1.0; v->env_state = 1; }
                break;
            case 1: /* decay */
                v->env_level -= v->decay_rate;
                if (v->env_level <= v->sustain_level) { v->env_level = v->sustain_level; v->env_state = 2; }
                break;
            case 2: /* sustain */
                v->env_level -= v->sustain_rate;
                if (v->env_level < 0.0) v->env_level = 0.0;
                break;
            case 3: /* release */
                v->env_level -= v->release_rate;
                if (v->env_level <= 0.0) { v->env_level = 0.0; v->env_state = 4; v->running = 0; }
                break;
            }

            /* Decode next ADPCM sample */
            if (v->pcm_pos >= 28) {
                v->flags   = spu_decode_block(v->cur_addr, v->hist1, v->hist2, v->pcm_buf);
                v->hist1   = v->pcm_buf[27];
                v->hist2   = v->pcm_buf[26];
                v->pcm_pos = 0;
                /* Advance block address */
                v->cur_addr += 16;
                if (v->cur_addr >= SPU_RAM_SIZE) v->cur_addr = v->loop_addr;
                /* Loop flag in bit 1 */
                if (v->flags & 0x01) {
                    /* end of sample */
                    if (v->flags & 0x02) {
                        /* loop */
                        v->cur_addr = v->loop_addr;
                    } else {
                        v->env_state = 4;
                        v->running   = 0;
                    }
                }
                if (v->flags & 0x04) {
                    /* set loop point */
                    v->loop_addr = v->cur_addr;
                }
            }

            int16_t samp = v->pcm_buf[v->pcm_pos++];
            double out   = (double)samp * v->env_level / 32768.0;

            g_outL[i] += (float)(out * v->vol_l);
            g_outR[i] += (float)(out * v->vol_r);
        }
    }
    return g_outL;
}

EMSCRIPTEN_KEEPALIVE float* spu_get_outR(void)       { return g_outR; }
EMSCRIPTEN_KEEPALIVE double spu_get_sample_rate(void) { return SAMPLE_RATE; }
EMSCRIPTEN_KEEPALIVE int    spu_get_num_voices(void)  { return NUM_VOICES; }

EMSCRIPTEN_KEEPALIVE
void spu_set_param(int paramId, double value)
{
    for (int vi = 0; vi < NUM_VOICES; vi++) {
        SPUVoice *v = &g_voices[vi];
        switch (paramId) {
        case 0: v->attack_rate   = value > 0.0 ? value : 0.0001; break;
        case 1: v->decay_rate    = value > 0.0 ? value : 0.0001; break;
        case 2: v->sustain_level = value; break;
        case 3: v->release_rate  = value > 0.0 ? value : 0.0001; break;
        }
    }
}
