/*
 * KlysWrapper.c - WASM binding layer for klystron (klystrack) replayer
 *
 * Provides EMSCRIPTEN_KEEPALIVE exports for song playback and data query.
 * The replayer produces interleaved stereo int16; this wrapper converts
 * to float32 separate L/R channels for the AudioWorklet.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cyd.h"
#include "music.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

/* ---- State ---- */
static CydEngine g_cyd;
static MusEngine g_mus;
static MusSong g_song;
static int g_initialized = 0;
static int g_song_loaded = 0;
static int g_playing = 0;
static int g_song_ended = 0;
static Uint32 g_sample_rate = 44100;

/* Interleaved stereo int16 mix buffer */
static Sint16 *g_mixBuf = NULL;
static Uint32 g_mixBufSamples = 0; /* in stereo frames */

/* ---- Memory RWops ---- */

typedef struct {
    RWops base;
    const Uint8 *data;
    Uint32 pos;
    Uint32 len;
} MemRWops;

static int mem_read(struct RWops *context, void *ptr, int size, int maxnum)
{
    MemRWops *m = (MemRWops *)context;
    int total = size * maxnum;
    int avail = (int)(m->len - m->pos);
    if (total > avail) total = avail;
    if (total <= 0) return 0;
    memcpy(ptr, m->data + m->pos, total);
    m->pos += total;
    return total / size;
}

static int mem_close(struct RWops *context)
{
    free(context);
    return 0;
}

static RWops *RWFromMem(const void *data, Uint32 len)
{
    MemRWops *m = calloc(1, sizeof(MemRWops));
    m->base.read = mem_read;
    m->base.close = mem_close;
    m->data = (const Uint8 *)data;
    m->pos = 0;
    m->len = len;
    return (RWops *)m;
}

/* ---- Helpers ---- */

static void ensure_mix_buffer(Uint32 samples)
{
    if (samples > g_mixBufSamples) {
        free(g_mixBuf);
        g_mixBuf = (Sint16 *)malloc(samples * 2 * sizeof(Sint16)); /* stereo */
        g_mixBufSamples = samples;
    }
}

/* ---- Playback API ---- */

EMSCRIPTEN_KEEPALIVE
void klys_init(Uint32 sampleRate)
{
    if (g_initialized) {
        cyd_deinit(&g_cyd);
    }
    g_sample_rate = sampleRate;
    memset(&g_cyd, 0, sizeof(g_cyd));
    memset(&g_mus, 0, sizeof(g_mus));
    memset(&g_song, 0, sizeof(g_song));

    cyd_init(&g_cyd, sampleRate, CYD_MAX_CHANNELS);
    g_cyd.flags |= CYD_SINGLE_THREAD;
    mus_init_engine(&g_mus, &g_cyd);

    g_initialized = 1;
    g_song_loaded = 0;
    g_playing = 0;
    g_song_ended = 0;
}

EMSCRIPTEN_KEEPALIVE
int klys_load_song(const void *buf, Uint32 len)
{
    if (!g_initialized) return 0;

    if (g_song_loaded) {
        mus_set_song(&g_mus, NULL, 0);
        mus_free_song(&g_song);
        g_song_loaded = 0;
        g_playing = 0;
    }

    memset(&g_song, 0, sizeof(g_song));

    RWops *rw = RWFromMem(buf, len);
    int result = mus_load_song_RW(rw, &g_song, g_cyd.wavetable_entries);
    rw->close(rw);

    if (result) {
        g_song_loaded = 1;
        g_song_ended = 0;
        /* Set up the callback chain: cyd calls mus_advance_tick at song_rate Hz */
        cyd_set_callback(&g_cyd, mus_advance_tick, &g_mus, g_song.song_rate);
        mus_set_song(&g_mus, &g_song, 0);
        g_playing = 1;
    }

    return result;
}

EMSCRIPTEN_KEEPALIVE
void klys_free_song(void)
{
    if (g_song_loaded) {
        mus_set_song(&g_mus, NULL, 0);
        mus_free_song(&g_song);
        g_song_loaded = 0;
        g_playing = 0;
    }
}

EMSCRIPTEN_KEEPALIVE
int klys_decode(float *outL, float *outR, Uint32 numSamples)
{
    if (!g_initialized || !g_song_loaded || !g_playing) return 0;

    ensure_mix_buffer(numSamples);
    memset(g_mixBuf, 0, numSamples * 2 * sizeof(Sint16));

    /* cyd_output_buffer_stereo fills interleaved Sint16 stereo.
     * len parameter is in BYTES. */
    Uint32 lenBytes = numSamples * 2 * sizeof(Sint16);
    cyd_output_buffer_stereo(&g_cyd, (Uint8 *)g_mixBuf, lenBytes);

    /* Convert interleaved Sint16 → separate float32 L/R */
    const float scale = 1.0f / 32768.0f;
    for (Uint32 i = 0; i < numSamples; i++) {
        outL[i] = g_mixBuf[i * 2] * scale;
        outR[i] = g_mixBuf[i * 2 + 1] * scale;
    }

    return (int)numSamples;
}

EMSCRIPTEN_KEEPALIVE
void klys_pause(int pause)
{
    if (!g_initialized) return;
    if (pause)
        g_cyd.flags |= CYD_PAUSED;
    else
        g_cyd.flags &= ~CYD_PAUSED;
}

EMSCRIPTEN_KEEPALIVE
void klys_stop(void)
{
    if (!g_initialized) return;
    mus_set_song(&g_mus, NULL, 0);
    g_playing = 0;
}

/* ---- Query API ---- */

EMSCRIPTEN_KEEPALIVE
int klys_get_song_position(void)
{
    return g_mus.song_position;
}

EMSCRIPTEN_KEEPALIVE
int klys_get_pattern_position(void)
{
    /* Return the step position within the current pattern for channel 0 */
    if (!g_song_loaded) return 0;
    return g_mus.song_track[0].pattern_step;
}

EMSCRIPTEN_KEEPALIVE
int klys_get_song_speed(void)
{
    if (!g_song_loaded) return 0;
    return g_song.song_speed;
}

EMSCRIPTEN_KEEPALIVE
int klys_get_song_speed2(void)
{
    if (!g_song_loaded) return 0;
    return g_song.song_speed2;
}

EMSCRIPTEN_KEEPALIVE
int klys_get_song_rate(void)
{
    if (!g_song_loaded) return 0;
    return g_song.song_rate;
}

EMSCRIPTEN_KEEPALIVE
int klys_get_num_channels(void)
{
    if (!g_song_loaded) return 0;
    return g_song.num_channels;
}

EMSCRIPTEN_KEEPALIVE
int klys_get_song_length(void)
{
    if (!g_song_loaded) return 0;
    return g_song.song_length;
}

EMSCRIPTEN_KEEPALIVE
int klys_get_num_instruments(void)
{
    if (!g_song_loaded) return 0;
    return g_song.num_instruments;
}

EMSCRIPTEN_KEEPALIVE
int klys_get_num_patterns(void)
{
    if (!g_song_loaded) return 0;
    return g_song.num_patterns;
}

EMSCRIPTEN_KEEPALIVE
int klys_get_pattern_length(int patIdx)
{
    if (!g_song_loaded || patIdx < 0 || patIdx >= g_song.num_patterns) return 0;
    return g_song.pattern[patIdx].num_steps;
}

EMSCRIPTEN_KEEPALIVE
const char *klys_get_title(void)
{
    if (!g_song_loaded) return "";
    return g_song.title;
}

EMSCRIPTEN_KEEPALIVE
const char *klys_get_instrument_name(int idx)
{
    if (!g_song_loaded || idx < 0 || idx >= g_song.num_instruments) return "";
    return g_song.instrument[idx].name;
}

EMSCRIPTEN_KEEPALIVE
int klys_get_loop_point(void)
{
    if (!g_song_loaded) return 0;
    return g_song.loop_point;
}

EMSCRIPTEN_KEEPALIVE
int klys_get_master_volume(void)
{
    if (!g_song_loaded) return 128;
    return g_song.master_volume;
}

EMSCRIPTEN_KEEPALIVE
int klys_get_flags(void)
{
    if (!g_song_loaded) return 0;
    return (int)g_song.flags;
}

/*
 * Get pattern step data as packed binary:
 *   Per step: note(1) + instrument(1) + ctrl(1) + volume(1) + command(2) = 6 bytes
 * Returns number of steps written.
 */
EMSCRIPTEN_KEEPALIVE
int klys_get_pattern_data(int patIdx, void *outBuf, int maxSteps)
{
    if (!g_song_loaded || patIdx < 0 || patIdx >= g_song.num_patterns) return 0;

    MusPattern *pat = &g_song.pattern[patIdx];
    int n = pat->num_steps;
    if (n > maxSteps) n = maxSteps;

    Uint8 *out = (Uint8 *)outBuf;
    for (int i = 0; i < n; i++) {
        MusStep *s = &pat->step[i];
        out[0] = s->note;
        out[1] = s->instrument;
        out[2] = s->ctrl;
        out[3] = s->volume;
        out[4] = (Uint8)(s->command & 0xFF);
        out[5] = (Uint8)((s->command >> 8) & 0xFF);
        out += 6;
    }

    return n;
}

/*
 * Get sequence data for a channel as packed binary:
 *   Per entry: position(2LE) + pattern(2LE) + note_offset(1) = 5 bytes
 * Returns number of entries written.
 */
EMSCRIPTEN_KEEPALIVE
int klys_get_sequence_data(int chan, void *outBuf, int maxEntries)
{
    if (!g_song_loaded || chan < 0 || chan >= g_song.num_channels) return 0;

    int n = g_song.num_sequences[chan];
    if (n > maxEntries) n = maxEntries;

    Uint8 *out = (Uint8 *)outBuf;
    for (int i = 0; i < n; i++) {
        MusSeqPattern *seq = &g_song.sequence[chan][i];
        out[0] = (Uint8)(seq->position & 0xFF);
        out[1] = (Uint8)((seq->position >> 8) & 0xFF);
        out[2] = (Uint8)(seq->pattern & 0xFF);
        out[3] = (Uint8)((seq->pattern >> 8) & 0xFF);
        out[4] = (Uint8)seq->note_offset;
        out += 5;
    }

    return n;
}

/*
 * Get instrument data as packed binary for JS side.
 * Layout: see comments inline. Returns bytes written.
 */
EMSCRIPTEN_KEEPALIVE
int klys_get_instrument_data(int idx, void *outBuf, int maxBytes)
{
    if (!g_song_loaded || idx < 0 || idx >= g_song.num_instruments) return 0;
    if (maxBytes < 64) return 0; /* need at least basic fields */

    MusInstrument *inst = &g_song.instrument[idx];
    Uint8 *out = (Uint8 *)outBuf;
    int pos = 0;

    /* ADSR (4 bytes) */
    out[pos++] = inst->adsr.a;
    out[pos++] = inst->adsr.d;
    out[pos++] = inst->adsr.s;
    out[pos++] = inst->adsr.r;

    /* Flags (4 bytes LE) */
    Uint32 flags = inst->flags;
    out[pos++] = (Uint8)(flags & 0xFF);
    out[pos++] = (Uint8)((flags >> 8) & 0xFF);
    out[pos++] = (Uint8)((flags >> 16) & 0xFF);
    out[pos++] = (Uint8)((flags >> 24) & 0xFF);

    /* Waveform (1 byte) */
    out[pos++] = inst->cydflags;

    /* Base note (1 byte) */
    out[pos++] = inst->base_note;

    /* Finetune (1 byte) */
    out[pos++] = inst->finetune;

    /* Slide speed (1 byte) */
    out[pos++] = inst->slide_speed;

    /* Pulse width (2 bytes LE) */
    out[pos++] = (Uint8)(inst->pw & 0xFF);
    out[pos++] = (Uint8)((inst->pw >> 8) & 0xFF);

    /* Volume (1 byte) */
    out[pos++] = inst->volume;

    /* Program period (1 byte) */
    out[pos++] = inst->prog_period;

    /* Vibrato speed (1 byte) */
    out[pos++] = inst->vibrato_speed;

    /* Vibrato depth (1 byte) */
    out[pos++] = inst->vibrato_depth;

    /* PWM speed (1 byte) */
    out[pos++] = inst->pwm_speed;

    /* PWM depth (1 byte) */
    out[pos++] = inst->pwm_depth;

    /* Filter cutoff (2 bytes LE) */
    out[pos++] = (Uint8)(inst->cutoff & 0xFF);
    out[pos++] = (Uint8)((inst->cutoff >> 8) & 0xFF);

    /* Filter resonance (1 byte) */
    out[pos++] = inst->resonance;

    /* Filter type (1 byte) */
    out[pos++] = inst->flttype;

    /* FX bus (1 byte) */
    out[pos++] = inst->fx_bus;

    /* Buzz offset (2 bytes LE) */
    out[pos++] = (Uint8)(inst->buzz_offset & 0xFF);
    out[pos++] = (Uint8)((inst->buzz_offset >> 8) & 0xFF);

    /* Ring mod source (1 byte) */
    out[pos++] = inst->ring_mod;

    /* Hard sync source (1 byte) */
    out[pos++] = inst->sync_source;

    /* Wavetable entry (1 byte) */
    out[pos++] = inst->wavetable_entry;

    /* FM: modulator, feedback, harmonic, adsr (7 bytes) */
    out[pos++] = inst->fm_modulation;
    out[pos++] = inst->fm_feedback;
    out[pos++] = inst->fm_harmonic;
    out[pos++] = inst->fm_adsr.a;
    out[pos++] = inst->fm_adsr.d;
    out[pos++] = inst->fm_adsr.s;
    out[pos++] = inst->fm_adsr.r;

    /* Program (32 steps, 2 bytes each = 64 bytes) */
    for (int i = 0; i < MUS_PROG_LEN && pos + 2 <= maxBytes; i++) {
        Uint16 p = inst->program[i];
        out[pos++] = (Uint8)(p & 0xFF);
        out[pos++] = (Uint8)((p >> 8) & 0xFF);
    }

    /* Name (32 bytes, null-terminated) */
    int nameLen = 32;
    if (pos + nameLen <= maxBytes) {
        memcpy(out + pos, inst->name, nameLen);
        pos += nameLen;
    }

    return pos;
}

/*
 * Get per-channel track status: current sequence pos, pattern index, pattern step.
 * Layout per channel: seqPos(2LE) + patIdx(2LE) + patStep(2LE) = 6 bytes
 */
EMSCRIPTEN_KEEPALIVE
int klys_get_track_status(void *outBuf, int maxChannels)
{
    if (!g_initialized || !g_song_loaded) return 0;

    int n = g_song.num_channels;
    if (n > maxChannels) n = maxChannels;

    Uint8 *out = (Uint8 *)outBuf;
    for (int i = 0; i < n; i++) {
        MusTrackStatus *ts = &g_mus.song_track[i];
        int seqPos = ts->sequence_position;
        int patIdx = ts->pattern ? (int)(ts->pattern - g_song.pattern) : 0;
        int patStep = ts->pattern_step;

        out[0] = (Uint8)(seqPos & 0xFF);
        out[1] = (Uint8)((seqPos >> 8) & 0xFF);
        out[2] = (Uint8)(patIdx & 0xFF);
        out[3] = (Uint8)((patIdx >> 8) & 0xFF);
        out[4] = (Uint8)(patStep & 0xFF);
        out[5] = (Uint8)((patStep >> 8) & 0xFF);
        out += 6;
    }

    return n;
}

EMSCRIPTEN_KEEPALIVE
int klys_is_playing(void)
{
    return g_playing;
}

/* ---- Setter functions for editing ---- */

EMSCRIPTEN_KEEPALIVE
int klys_set_pattern_step(int patIdx, int stepIdx, int note, int instrument, int ctrl, int volume, int cmdLo, int cmdHi)
{
    if (!g_song_loaded || patIdx < 0 || patIdx >= g_song.num_patterns) return 0;
    MusPattern *pat = &g_song.pattern[patIdx];
    if (stepIdx < 0 || stepIdx >= pat->num_steps) return 0;

    MusStep *s = &pat->step[stepIdx];
    s->note = (Uint8)note;
    s->instrument = (Uint8)instrument;
    s->ctrl = (Uint8)ctrl;
    s->volume = (Uint8)volume;
    s->command = (Uint16)((cmdHi << 8) | (cmdLo & 0xFF));
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int klys_set_sequence_entry(int chan, int pos, int position, int pattern, int noteOffset)
{
    if (!g_song_loaded || chan < 0 || chan >= g_song.num_channels) return 0;
    if (pos < 0 || pos >= g_song.num_sequences[chan]) return 0;

    MusSeqPattern *seq = &g_song.sequence[chan][pos];
    seq->position = (Uint16)position;
    seq->pattern = (Uint16)pattern;
    seq->note_offset = (Sint8)noteOffset;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int klys_set_instrument_param(int idx, int paramId, int value)
{
    if (!g_song_loaded || idx < 0 || idx >= g_song.num_instruments) return 0;
    MusInstrument *inst = &g_song.instrument[idx];

    switch (paramId) {
        case 0: inst->adsr.a = (Uint8)value; break;
        case 1: inst->adsr.d = (Uint8)value; break;
        case 2: inst->adsr.s = (Uint8)value; break;
        case 3: inst->adsr.r = (Uint8)value; break;
        case 4: inst->flags = (Uint32)value; break;
        case 5: inst->cydflags = (Uint8)value; break;
        case 6: inst->base_note = (Uint8)value; break;
        case 7: inst->finetune = (Uint8)value; break;
        case 8: inst->slide_speed = (Uint8)value; break;
        case 9: inst->pw = (Uint16)value; break;
        case 10: inst->volume = (Uint8)value; break;
        case 11: inst->prog_period = (Uint8)value; break;
        case 12: inst->vibrato_speed = (Uint8)value; break;
        case 13: inst->vibrato_depth = (Uint8)value; break;
        case 14: inst->pwm_speed = (Uint8)value; break;
        case 15: inst->pwm_depth = (Uint8)value; break;
        case 16: inst->cutoff = (Uint16)value; break;
        case 17: inst->resonance = (Uint8)value; break;
        case 18: inst->flttype = (Uint8)value; break;
        case 19: inst->fx_bus = (Uint8)value; break;
        case 20: inst->buzz_offset = (Sint16)value; break;
        case 21: inst->ring_mod = (Uint8)value; break;
        case 22: inst->sync_source = (Uint8)value; break;
        case 23: inst->wavetable_entry = (Uint8)value; break;
        case 24: inst->fm_modulation = (Uint8)value; break;
        case 25: inst->fm_feedback = (Uint8)value; break;
        case 26: inst->fm_harmonic = (Uint8)value; break;
        case 27: inst->fm_adsr.a = (Uint8)value; break;
        case 28: inst->fm_adsr.d = (Uint8)value; break;
        case 29: inst->fm_adsr.s = (Uint8)value; break;
        case 30: inst->fm_adsr.r = (Uint8)value; break;
        default: return 0;
    }
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int klys_set_instrument_program_step(int idx, int step, int value)
{
    if (!g_song_loaded || idx < 0 || idx >= g_song.num_instruments) return 0;
    if (step < 0 || step >= MUS_PROG_LEN) return 0;
    g_song.instrument[idx].program[step] = (Uint16)value;
    return 1;
}
