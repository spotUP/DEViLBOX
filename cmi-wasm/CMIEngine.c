/**
 * CMIEngine.c — Fairlight CMI IIx 8-Voice Sampler (WASM)
 *
 * Implements the essential audio synthesis of the Fairlight CMI IIx:
 *   - 8 independent voices, each with 16KB of 8-bit PCM wave RAM
 *   - Variable-pitch playback via phase accumulator
 *   - 4-pole lowpass filter (two cascaded biquads) from MAME cmi01a.cpp
 *   - Per-voice volume and stereo panning
 *
 * Based on MAME's cmi01a_device by Phil Bennett (BSD-3-Clause).
 * Filter coefficients and amplitude equations taken directly from
 * MAME's update_filters() and sound_stream_update().
 */

#include <emscripten.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

#define NUM_VOICES     8
#define WAVE_RAM_SIZE  16384   /* 16KB per voice */
#define SAMPLE_RATE    48000.0
#define MY_PI          3.14159265358979323846

typedef struct {
    uint8_t  wave_ram[WAVE_RAM_SIZE];

    int      running;
    double   phase;        /* current position in loop (0 .. loop_len) */
    double   phase_inc;    /* samples advanced per output sample */
    int      loop_start;   /* byte offset into wave_ram */
    int      loop_end;     /* exclusive end (0 = WAVE_RAM_SIZE) */

    /* Volume / panning */
    double   vol;          /* 0..1 */
    double   pan;          /* -1..1 (-1=left, 0=center, +1=right) */

    /* Filter parameter fed by the caller */
    double   flt_latch;    /* 0..255  — controls cutoff frequency */
    int      octave;       /* 0..15   — also contributes to cutoff */

    /* Biquad filter state (two cascaded lowpass stages, like MAME) */
    double   ha0, ha1;
    double   hb0, hb1;
    double   hc0, hc1;

    /* Biquad coefficients (recomputed when filter params change) */
    double   ka0, ka1, ka2;
    double   kb0, kb1, kb2;
} CMIVoice;

static CMIVoice g_voices[NUM_VOICES];

/* Scratch output buffers in WASM heap (512 floats each) */
#define BUF_SIZE 512
static float g_outL[BUF_SIZE];
static float g_outR[BUF_SIZE];

/* -----------------------------------------------------------------------
 * Filter — direct port of MAME cmi01a_device::update_filters()
 * ----------------------------------------------------------------------- */
static void cmi_update_filters(CMIVoice *v)
{
    int fval = (v->octave << 5) + (int)v->flt_latch;

    /* Calibrated from CMI Mainframe Service Manual p.133 */
    double fc = 6410.0 * pow(1.02162, (double)(fval - 256));
    if (fc > 14000.0) fc = 14000.0;
    double f0 = fc * 0.916;

    double w1 = 2.0 * MY_PI * fc;
    double w2 = 2.0 * MY_PI * fc * 1.22474487139159;
    double a1 = 1.81659021245849;
    double a2 = 1.48323969741913;

    double ma0 = a1 / w1;
    double ma1 = 1.0 / (w1 * w1);
    double mb0 = a2 / w2;
    double mb1 = 1.0 / (w2 * w2);

    /* Bilinear transform */
    double zc  = 2.0 * MY_PI * f0 / tan(MY_PI * f0 / SAMPLE_RATE);
    double za0 = ma1 * zc * zc;
    double za1 = ma0 * zc;
    double zb0 = mb1 * zc * zc;
    double zb1 = mb0 * zc;

    v->ka0 = za0 + za1 + 1.0;  v->ka1 = -2.0*za0 + 2.0;  v->ka2 = za0 - za1 + 1.0;
    v->kb0 = zb0 + zb1 + 1.0;  v->kb1 = -2.0*zb0 + 2.0;  v->kb2 = zb0 - zb1 + 1.0;
}

static int loop_len(CMIVoice *v)
{
    int end = (v->loop_end > 0) ? v->loop_end : WAVE_RAM_SIZE;
    int len = end - v->loop_start;
    return (len > 0) ? len : WAVE_RAM_SIZE;
}

/* -----------------------------------------------------------------------
 * WASM-exported API
 * ----------------------------------------------------------------------- */

EMSCRIPTEN_KEEPALIVE
void cmi_init(void)
{
    memset(g_voices, 0, sizeof(g_voices));
    for (int i = 0; i < NUM_VOICES; i++) {
        CMIVoice *v = &g_voices[i];
        v->ka0 = v->kb0 = 1.0;
        v->vol = 0.5;
        v->pan = 0.0;
        v->loop_end  = WAVE_RAM_SIZE;
        v->octave    = 8;      /* BIT(8,3)=1 → no octave divisor in CMI formula */
        v->flt_latch = 200.0;  /* ~8 kHz cutoff — warm default */
        cmi_update_filters(v);

        /* Pre-fill wave_ram with a built-in waveform so voices produce audio
         * without requiring an external sample to be loaded first.
         * CMI uses offset-binary: 0x80=silence, 0xFF=+127, 0x00=-128.
         * Each voice gets a different waveform to showcase variety. */
        for (int j = 0; j < WAVE_RAM_SIZE; j++) {
            double phase = 2.0 * MY_PI * j / WAVE_RAM_SIZE;
            int val;
            switch (i % 8) {
            case 0: /* sine */
                val = (int)(sin(phase) * 127.0); break;
            case 1: /* sawtooth */
                val = (int)((double)j / WAVE_RAM_SIZE * 254.0) - 127; break;
            case 2: /* square 50% */
                val = (j < WAVE_RAM_SIZE / 2) ? 120 : -120; break;
            case 3: { /* triangle */
                double t = (double)j / WAVE_RAM_SIZE;
                val = (t < 0.5) ? (int)(t * 508.0 - 127.0)
                                : (int)((1.0 - t) * 508.0 - 127.0); break;
            }
            case 4: /* sine + 3rd harmonic (organ) */
                val = (int)((sin(phase) * 0.7 + sin(phase * 3.0) * 0.3) * 100.0); break;
            case 5: /* pulse 25% */
                val = (j < WAVE_RAM_SIZE / 4) ? 120 : -40; break;
            case 6: /* soft-square: tanh approximation */
                val = (int)(tanh(sin(phase) * 3.0) * 110.0); break;
            default: /* organ: sine + 2nd + 3rd harmonics */
                val = (int)((sin(phase)*0.6 + sin(phase*2.0)*0.3 + sin(phase*3.0)*0.1) * 110.0); break;
            }
            if (val >  127) val =  127;
            if (val < -127) val = -127;
            v->wave_ram[j] = (uint8_t)(val + 128);
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void cmi_note_on(int voice, double freq_hz, double velocity)
{
    if (voice < 0 || voice >= NUM_VOICES || freq_hz <= 0.0) return;
    CMIVoice *v = &g_voices[voice];

    /* phase_inc: how many loop samples to advance per output sample */
    v->phase_inc = freq_hz * (double)loop_len(v) / SAMPLE_RATE;

    /* Reset position and filter history on new note */
    v->phase = 0.0;
    v->ha0 = v->ha1 = v->hb0 = v->hb1 = v->hc0 = v->hc1 = 0.0;

    v->vol     = velocity;
    v->running = 1;
}

EMSCRIPTEN_KEEPALIVE
void cmi_note_off(int voice)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    g_voices[voice].running = 0;
}

EMSCRIPTEN_KEEPALIVE
void cmi_set_frequency(int voice, double freq_hz)
{
    if (voice < 0 || voice >= NUM_VOICES || freq_hz <= 0.0) return;
    CMIVoice *v = &g_voices[voice];
    v->phase_inc = freq_hz * (double)loop_len(v) / SAMPLE_RATE;
}

EMSCRIPTEN_KEEPALIVE
void cmi_set_volume(int voice, double vol_0_1)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    g_voices[voice].vol = vol_0_1;
}

EMSCRIPTEN_KEEPALIVE
void cmi_set_pan(int voice, double pan_neg1_to_1)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    g_voices[voice].pan = pan_neg1_to_1;
}

EMSCRIPTEN_KEEPALIVE
void cmi_set_filter(int voice, double flt_0_255)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    g_voices[voice].flt_latch = flt_0_255;
    cmi_update_filters(&g_voices[voice]);
}

EMSCRIPTEN_KEEPALIVE
void cmi_set_loop(int voice, int start, int end)
{
    if (voice < 0 || voice >= NUM_VOICES) return;
    CMIVoice *v = &g_voices[voice];
    v->loop_start = (start < 0 || start >= WAVE_RAM_SIZE) ? 0 : start;
    v->loop_end   = (end   <= 0 || end   >  WAVE_RAM_SIZE) ? WAVE_RAM_SIZE : end;
}

EMSCRIPTEN_KEEPALIVE
void cmi_load_sample(int voice, uint8_t *data, int size)
{
    if (voice < 0 || voice >= NUM_VOICES || !data || size <= 0) return;
    CMIVoice *v = &g_voices[voice];
    int n = (size > WAVE_RAM_SIZE) ? WAVE_RAM_SIZE : size;
    memcpy(v->wave_ram, data, (size_t)n);
    /* Auto-set loop to loaded data */
    v->loop_start = 0;
    v->loop_end   = n;
}

/* render into internal buffers, return pointer to outL (caller reads outL then outR) */
EMSCRIPTEN_KEEPALIVE
float* cmi_render(int num_samples)
{
    if (num_samples > BUF_SIZE) num_samples = BUF_SIZE;

    memset(g_outL, 0, num_samples * sizeof(float));
    memset(g_outR, 0, num_samples * sizeof(float));

    for (int vi = 0; vi < NUM_VOICES; vi++) {
        CMIVoice *v = &g_voices[vi];
        if (!v->running) continue;

        int lstart = v->loop_start;
        int lend   = (v->loop_end > 0) ? v->loop_end : WAVE_RAM_SIZE;
        int llen   = lend - lstart;
        if (llen <= 0) continue;

        float pan_r = (float)((v->pan + 1.0) * 0.5);
        float pan_l = 1.0f - pan_r;

        for (int i = 0; i < num_samples; i++) {
            /* Advance phase accumulator */
            v->phase += v->phase_inc;
            while (v->phase >= (double)llen) v->phase -= (double)llen;
            while (v->phase < 0.0)            v->phase += (double)llen;

            /* Read 8-bit sample — offset-binary like CMI hardware */
            int idx = lstart + (int)v->phase;
            if (idx < 0) idx = 0;
            if (idx >= lend) idx = lend - 1;
            double sample = (double)((int8_t)(v->wave_ram[idx] ^ 0x80));

            /* Biquad stage A — from MAME sound_stream_update() */
            double hbn = (sample + 2.0*v->ha0 + v->ha1
                         - v->ka1*v->hb0 - v->ka2*v->hb1) / v->ka0;
            /* Biquad stage B */
            double hcn = (hbn   + 2.0*v->hb0 + v->hb1
                         - v->kb1*v->hc0 - v->kb2*v->hc1) / v->kb0;
            v->ha1 = v->ha0;  v->ha0 = sample;
            v->hb1 = v->hb0;  v->hb0 = hbn;
            v->hc1 = v->hc0;  v->hc0 = hcn;

            /* MAME uses hbn × env × vol_latch, normalised to ±1 */
            double out = hbn * v->vol / 128.0;

            g_outL[i] += (float)out * pan_l;
            g_outR[i] += (float)out * pan_r;
        }
    }

    return g_outL;
}

EMSCRIPTEN_KEEPALIVE float* cmi_get_outR(void) { return g_outR; }
EMSCRIPTEN_KEEPALIVE double cmi_get_sample_rate(void) { return SAMPLE_RATE; }
EMSCRIPTEN_KEEPALIVE int    cmi_get_wave_ram_size(void) { return WAVE_RAM_SIZE; }
EMSCRIPTEN_KEEPALIVE int    cmi_get_num_voices(void) { return NUM_VOICES; }

/* Fill a single voice's wave_ram with waveform type wf (0-7) */
static void cmi_fill_voice_waveform(CMIVoice *v, int wf)
{
    for (int j = 0; j < WAVE_RAM_SIZE; j++) {
        double phase = 2.0 * MY_PI * j / WAVE_RAM_SIZE;
        int val;
        switch (wf & 7) {
        case 0: val = (int)(sin(phase) * 127.0); break;
        case 1: val = (int)((double)j / WAVE_RAM_SIZE * 254.0) - 127; break;
        case 2: val = (j < WAVE_RAM_SIZE / 2) ? 120 : -120; break;
        case 3: { double t = (double)j / WAVE_RAM_SIZE;
                  val = (t < 0.5) ? (int)(t * 508.0 - 127.0) : (int)((1.0 - t) * 508.0 - 127.0); break; }
        case 4: val = (int)((sin(phase) * 0.7 + sin(phase * 3.0) * 0.3) * 100.0); break;
        case 5: val = (j < WAVE_RAM_SIZE / 4) ? 120 : -40; break;
        case 6: val = (int)(tanh(sin(phase) * 3.0) * 110.0); break;
        default: val = (int)((sin(phase)*0.6 + sin(phase*2.0)*0.3 + sin(phase*3.0)*0.1) * 110.0); break;
        }
        if (val >  127) val =  127;
        if (val < -127) val = -127;
        v->wave_ram[j] = (uint8_t)(val + 128);
    }
}

EMSCRIPTEN_KEEPALIVE
void cmi_set_param(int paramId, double value)
{
    /* paramId 0 = waveform: fill all voices with the selected waveform type */
    if (paramId == 0) {
        int wf = (int)(value + 0.5);
        if (wf < 0) wf = 0;
        if (wf > 7) wf = 7;
        for (int i = 0; i < NUM_VOICES; i++)
            cmi_fill_voice_waveform(&g_voices[i], wf);
    }
}
