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
#include "pack.h"
#include "cydrvb.h"
#include "cydfx.h"

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

    /* Convert interleaved Sint16 → separate float32 L/R.
     * The CYD engine divides output by PRE_GAIN_DIVISOR (4) for multi-channel
     * headroom, resulting in quiet output. Boost by 2x for normal levels. */
    const float scale = 2.0f / 32768.0f;
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
void klys_get_channel_levels(float *out, int maxCh)
{
    if (!g_initialized || !g_song_loaded) {
        for (int i = 0; i < maxCh; i++) out[i] = 0.0f;
        return;
    }
    int nch = g_song.num_channels;
    if (nch > maxCh) nch = maxCh;
    for (int i = 0; i < nch; i++) {
        /* adsr.volume is 0-128, envelope is 0-0x00ffffff */
        Uint8 vol = g_cyd.channel[i].adsr.volume;
        /* Check if channel is active (flags bit 0 = CYD_CHN_ENABLE_GATE) */
        int active = (g_cyd.channel[i].flags & 1) ? 1 : 0;
        out[i] = active ? (float)vol / 128.0f : 0.0f;
    }
    for (int i = nch; i < maxCh; i++) out[i] = 0.0f;
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
    if (maxBytes < 160) return 0; /* maximized layout needs ~150 bytes for fields + program + name */

    MusInstrument *inst = &g_song.instrument[idx];
    Uint8 *out = (Uint8 *)outBuf;
    int pos = 0;

    /* MAXIMIZED layout — every MusInstrument field, version 2.
     * Layout (little-endian, packed):
     *   ADSR(4) flags(4) cydflags(4) baseNote(1) finetune(1) slideSpeed(1)
     *   pw(2) volume(1) progPeriod(1)
     *   vibSpeed(1) vibDepth(1) pwmSpeed(1) pwmDepth(1)
     *   cutoff(2) resonance(1) flttype(1)
     *   ymEnvShape(1) buzzOffset(2)
     *   fxBus(1) vibShape(1) vibDelay(1) pwmShape(1)
     *   lfsrType(1) wavetableEntry(1) ringMod(1) syncSource(1)
     *   fmFlags(4) fmMod(1) fmFeedback(1) fmWave(1) fmHarmonic(1)
     *   fmAdsr(4) fmAttackStart(1)
     *   program(64) name(33)
     */

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

    /* CydFlags (4 bytes LE) — was 1 byte, now full width */
    Uint32 cydf = inst->cydflags;
    out[pos++] = (Uint8)(cydf & 0xFF);
    out[pos++] = (Uint8)((cydf >> 8) & 0xFF);
    out[pos++] = (Uint8)((cydf >> 16) & 0xFF);
    out[pos++] = (Uint8)((cydf >> 24) & 0xFF);

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

    /* YM env shape (1 byte) */
    out[pos++] = inst->ym_env_shape;

    /* Buzz offset (2 bytes LE, signed) */
    out[pos++] = (Uint8)(inst->buzz_offset & 0xFF);
    out[pos++] = (Uint8)((inst->buzz_offset >> 8) & 0xFF);

    /* FX bus (1 byte) */
    out[pos++] = inst->fx_bus;

    /* Vib shape (1 byte) */
    out[pos++] = inst->vib_shape;

    /* Vib delay (1 byte) */
    out[pos++] = inst->vib_delay;

    /* PWM shape (1 byte) */
    out[pos++] = inst->pwm_shape;

    /* LFSR type (1 byte) */
    out[pos++] = inst->lfsr_type;

    /* Wavetable entry (1 byte) */
    out[pos++] = inst->wavetable_entry;

    /* Ring mod source (1 byte) */
    out[pos++] = inst->ring_mod;

    /* Hard sync source (1 byte) */
    out[pos++] = inst->sync_source;

    /* FM flags (4 bytes LE) */
    Uint32 fmf = inst->fm_flags;
    out[pos++] = (Uint8)(fmf & 0xFF);
    out[pos++] = (Uint8)((fmf >> 8) & 0xFF);
    out[pos++] = (Uint8)((fmf >> 16) & 0xFF);
    out[pos++] = (Uint8)((fmf >> 24) & 0xFF);

    /* FM operator params */
    out[pos++] = inst->fm_modulation;
    out[pos++] = inst->fm_feedback;
    out[pos++] = inst->fm_wave;
    out[pos++] = inst->fm_harmonic;

    /* FM ADSR (4 bytes) */
    out[pos++] = inst->fm_adsr.a;
    out[pos++] = inst->fm_adsr.d;
    out[pos++] = inst->fm_adsr.s;
    out[pos++] = inst->fm_adsr.r;

    /* FM attack start (1 byte) */
    out[pos++] = inst->fm_attack_start;

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

/* ---- Buffer-writer helpers for save ---- */

typedef struct {
    Uint8 *buf;
    Uint32 pos;
    Uint32 cap;
} BufWriter;

static void bw_write(BufWriter *w, const void *data, Uint32 bytes)
{
    if (w->pos + bytes <= w->cap) {
        memcpy(w->buf + w->pos, data, bytes);
    }
    w->pos += bytes;
}

static void bw_u8(BufWriter *w, Uint8 v) { bw_write(w, &v, 1); }
static void bw_s8(BufWriter *w, Sint8 v) { bw_write(w, &v, 1); }
static void bw_u16(BufWriter *w, Uint16 v) { bw_write(w, &v, 2); }
static void bw_s16(BufWriter *w, Sint16 v) { bw_write(w, &v, 2); }
static void bw_u32(BufWriter *w, Uint32 v) { bw_write(w, &v, 4); }

static void save_wavetable_entry(BufWriter *w, const CydWavetableEntry *e)
{
    Uint32 flags_to_write = e->flags;

    if (e->samples > 0 && e->data) {
        /* Pre-compute compression to know which flags to set */
        int pack_flags = 0;
        Uint32 packed_bits = 0;
        Uint8 *packed = bitpack_best(e->data, e->samples, &packed_bits, &pack_flags);

        /* Set compression flag bits (bits 3-4) based on pack flags */
        flags_to_write = (e->flags & ~(Uint32)((CYD_WAVE_COMPRESSED_DELTA | CYD_WAVE_COMPRESSED_GRAY)));
        if (pack_flags & BITPACK_OPT_DELTA) flags_to_write |= CYD_WAVE_COMPRESSED_DELTA;
        if (pack_flags & BITPACK_OPT_GRAY) flags_to_write |= CYD_WAVE_COMPRESSED_GRAY;

        bw_u32(w, flags_to_write);
        bw_u32(w, e->sample_rate);
        bw_u32(w, e->samples);
        bw_u32(w, e->loop_begin);
        bw_u32(w, e->loop_end);
        bw_u16(w, e->base_note);

        bw_u32(w, packed_bits);
        Uint32 packed_bytes = (packed_bits + 7) / 8;
        bw_write(w, packed, packed_bytes);
        free(packed);
    } else {
        bw_u32(w, flags_to_write);
        bw_u32(w, e->sample_rate);
        bw_u32(w, e->samples);
        bw_u32(w, e->loop_begin);
        bw_u32(w, e->loop_end);
        bw_u16(w, e->base_note);
    }
}

static void save_fx(BufWriter *w, const CydFxSerialized *fx)
{
    Uint8 name_len = (Uint8)strlen(fx->name);
    bw_u8(w, name_len);
    if (name_len) bw_write(w, fx->name, name_len);

    bw_u32(w, fx->flags);
    bw_u8(w, fx->crush.bit_drop);
    bw_u8(w, fx->chr.rate);
    bw_u8(w, fx->chr.min_delay);
    bw_u8(w, fx->chr.max_delay);
    bw_u8(w, fx->chr.sep);
    /* v27: no spread byte, full 16 taps with panning+flags */
    for (int i = 0; i < CYDRVB_TAPS; ++i) {
        bw_u16(w, fx->rvb.tap[i].delay);
        bw_s16(w, fx->rvb.tap[i].gain);
        bw_u8(w, fx->rvb.tap[i].panning);
        bw_u8(w, fx->rvb.tap[i].flags);
    }
    bw_u8(w, fx->crushex.downsample);
    bw_u8(w, fx->crushex.gain);
}

static void save_instrument(BufWriter *w, const MusInstrument *inst)
{
    bw_u32(w, inst->flags);
    bw_u32(w, inst->cydflags);
    bw_write(w, &inst->adsr, sizeof(MusAdsr));
    bw_u8(w, inst->sync_source);
    bw_u8(w, inst->ring_mod);
    bw_u16(w, inst->pw);
    bw_u8(w, inst->volume);

    /* Count non-zero program steps */
    Uint8 progsteps = 0;
    for (int i = MUS_PROG_LEN - 1; i >= 0; --i) {
        if (inst->program[i] != 0) { progsteps = (Uint8)(i + 1); break; }
    }
    bw_u8(w, progsteps);
    if (progsteps) bw_write(w, inst->program, progsteps * sizeof(Uint16));

    bw_u8(w, inst->prog_period);
    bw_u8(w, inst->vibrato_speed);
    bw_u8(w, inst->vibrato_depth);
    bw_u8(w, inst->pwm_speed);
    bw_u8(w, inst->pwm_depth);
    bw_u8(w, inst->slide_speed);
    bw_u8(w, inst->base_note);
    bw_s8(w, inst->finetune); /* v20+ */

    Uint8 name_len = (Uint8)strlen(inst->name);
    bw_u8(w, name_len); /* v11+ */
    if (name_len) bw_write(w, inst->name, name_len);

    bw_u16(w, inst->cutoff);     /* v1+ */
    bw_u8(w, inst->resonance);   /* v1+ */
    bw_u8(w, inst->flttype);     /* v1+ */
    bw_u8(w, inst->ym_env_shape);/* v7+ */
    bw_s16(w, inst->buzz_offset);/* v7+ (was written as VER_READ with sizeof which is Sint16) */
    bw_u8(w, inst->fx_bus);      /* v10+ */
    bw_u8(w, inst->vib_shape);   /* v11+ */
    bw_u8(w, inst->vib_delay);   /* v11+ */
    bw_u8(w, inst->pwm_shape);   /* v11+ */
    bw_u8(w, inst->lfsr_type);   /* v18+ */
    bw_u8(w, inst->wavetable_entry); /* v12+ */

    bw_u32(w, inst->fm_flags);       /* v23+ */
    bw_u8(w, inst->fm_modulation);   /* v23+ */
    bw_u8(w, inst->fm_feedback);     /* v23+ */
    bw_u8(w, inst->fm_harmonic);     /* v23+ */
    bw_write(w, &inst->fm_adsr, sizeof(MusAdsr)); /* v23+ */
    bw_u8(w, inst->fm_attack_start); /* v25+ */
    bw_u8(w, inst->fm_wave);         /* v23+ */
    /* Note: wavetable entries embedded per-instrument are NOT written here.
       In v27 format, wavetable_entry indices refer to the global wavetable section. */
}

/* Serialize the in-memory song to the caller-provided buffer.
 * Returns the number of bytes written (or needed if buf is too small).
 * Call with outBuf=NULL, maxBytes=0 to query required size. */
EMSCRIPTEN_KEEPALIVE
int klys_save_song(Uint8 *outBuf, int maxBytes)
{
    if (!g_song_loaded) return 0;

    MusSong *song = &g_song;
    CydWavetableEntry *wt = g_cyd.wavetable_entries;

    BufWriter w;
    w.buf = outBuf ? outBuf : (Uint8*)""; /* dummy for size query */
    w.pos = 0;
    w.cap = outBuf ? (Uint32)maxBytes : 0;

    /* ---- Header ---- */
    bw_write(&w, MUS_SONG_SIG, 8);       /* signature "cyd!song" */
    bw_u8(&w, MUS_VERSION);               /* version = 27 */
    bw_u8(&w, song->num_channels);        /* v6+ */
    bw_u16(&w, song->time_signature);
    bw_u16(&w, song->sequence_step);      /* v17+ */
    bw_u8(&w, song->num_instruments);
    bw_u16(&w, song->num_patterns);
    bw_write(&w, song->num_sequences, sizeof(Uint16) * song->num_channels);
    bw_u16(&w, song->song_length);
    bw_u16(&w, song->loop_point);
    bw_u8(&w, song->master_volume);       /* v12+ */
    bw_u8(&w, song->song_speed);
    bw_u8(&w, song->song_speed2);
    bw_u8(&w, song->song_rate);
    bw_u32(&w, song->flags);              /* v3+ */
    bw_u8(&w, song->multiplex_period);    /* v9+ */
    bw_u8(&w, song->pitch_inaccuracy);    /* v16+ */

    /* Title (v11+: length-prefixed; v5+: data) */
    Uint8 title_len = (Uint8)strlen(song->title);
    bw_u8(&w, title_len);
    if (title_len) bw_write(&w, song->title, title_len);

    /* FX (v10+) */
    Uint8 n_fx = CYD_MAX_FX_CHANNELS;
    bw_u8(&w, n_fx);
    for (int i = 0; i < n_fx; ++i) {
        save_fx(&w, &song->fx[i]);
    }

    /* Default volumes + panning (v13+) */
    bw_write(&w, song->default_volume, song->num_channels);
    bw_write(&w, song->default_panning, song->num_channels);

    /* ---- Instruments ---- */
    for (int i = 0; i < song->num_instruments; ++i) {
        save_instrument(&w, &song->instrument[i]);
    }

    /* ---- Sequences (v8+ format: position + pattern + note_offset per entry) ---- */
    for (int ch = 0; ch < song->num_channels; ++ch) {
        for (int s = 0; s < song->num_sequences[ch]; ++s) {
            bw_u16(&w, song->sequence[ch][s].position);
            bw_u16(&w, song->sequence[ch][s].pattern);
            bw_s8(&w, song->sequence[ch][s].note_offset);
        }
    }

    /* ---- Patterns (v8+ nibble-packed format) ---- */
    for (int i = 0; i < song->num_patterns; ++i) {
        MusPattern *pat = &song->pattern[i];
        bw_u16(&w, pat->num_steps);
        bw_u8(&w, pat->color); /* v24+ */

        int pack_len = pat->num_steps / 2 + (pat->num_steps & 1);

        /* First pass: build the pack nibbles.
         * Nibble has 4 bits: NOTE(1), INST(2), CTRL(4), CMD(8).
         * Volume flag (128) is stored in the ctrl byte's upper bits (v14+),
         * so if volume is present, CTRL must also be set. */
        Uint8 *pack = calloc(pack_len, 1);
        for (int s = 0; s < pat->num_steps; ++s) {
            MusStep *st = &pat->step[s];
            Uint8 bits = 0;
            if (st->note != MUS_NOTE_NONE) bits |= MUS_PAK_BIT_NOTE;
            if (st->instrument != MUS_NOTE_NO_INSTRUMENT) bits |= MUS_PAK_BIT_INST;
            if (st->ctrl != 0 || st->volume != MUS_NOTE_NO_VOLUME)
                bits |= MUS_PAK_BIT_CTRL;
            if (st->command != 0) bits |= MUS_PAK_BIT_CMD;

            int idx = s / 2;
            if (s & 1 || s == pat->num_steps - 1) {
                pack[idx] |= (bits & 0xf);
            } else {
                pack[idx] |= (bits & 0xf) << 4;
            }
        }

        bw_write(&w, pack, pack_len);

        /* Second pass: write the field data */
        for (int s = 0; s < pat->num_steps; ++s) {
            MusStep *st = &pat->step[s];
            int has_vol = (st->volume != MUS_NOTE_NO_VOLUME);
            int has_ctrl = (st->ctrl != 0 || has_vol);

            if (st->note != MUS_NOTE_NONE)
                bw_u8(&w, st->note);
            if (st->instrument != MUS_NOTE_NO_INSTRUMENT)
                bw_u8(&w, st->instrument);
            if (has_ctrl) {
                Uint8 ctrl_byte = (st->ctrl & 7);
                if (has_vol) ctrl_byte |= MUS_PAK_BIT_VOLUME;
                bw_u8(&w, ctrl_byte);
            }
            if (st->command != 0)
                bw_u16(&w, st->command);
            if (has_vol)
                bw_u8(&w, st->volume);
        }

        free(pack);
    }

    /* ---- Wavetable entries (v12+) ---- */
    Uint8 max_wt = (Uint8)song->num_wavetables;
    bw_u8(&w, max_wt);
    for (int i = 0; i < max_wt; ++i) {
        save_wavetable_entry(&w, &wt[i]);
    }
    /* Wavetable names (v26+) */
    for (int i = 0; i < max_wt; ++i) {
        const char *name = (song->wavetable_names && song->wavetable_names[i])
                           ? song->wavetable_names[i] : "";
        Uint8 len = (Uint8)strlen(name);
        bw_u8(&w, len);
        if (len) bw_write(&w, name, len);
    }

    return (int)w.pos;
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
        case 5: inst->cydflags = (Uint32)value; break;
        case 6: inst->base_note = (Uint8)value; break;
        case 7: inst->finetune = (Sint8)value; break;
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
        /* MAXIMIZED — extended fields */
        case 31: inst->ym_env_shape = (Uint8)value; break;
        case 32: inst->vib_shape = (Uint8)value; break;
        case 33: inst->vib_delay = (Uint8)value; break;
        case 34: inst->pwm_shape = (Uint8)value; break;
        case 35: inst->lfsr_type = (Uint8)value; break;
        case 36: inst->fm_flags = (Uint32)value; break;
        case 37: inst->fm_wave = (Uint8)value; break;
        case 38: inst->fm_attack_start = (Uint8)value; break;
        default: return 0;
    }
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int klys_set_instrument_name(int idx, const char *name)
{
    if (!g_song_loaded || idx < 0 || idx >= g_song.num_instruments) return 0;
    if (!name) return 0;
    MusInstrument *inst = &g_song.instrument[idx];
    size_t n = strlen(name);
    if (n > MUS_INSTRUMENT_NAME_LEN) n = MUS_INSTRUMENT_NAME_LEN;
    memcpy(inst->name, name, n);
    inst->name[n] = 0;
    return 1;
}

EMSCRIPTEN_KEEPALIVE
void klys_set_channel_gain(int ch, float gain)
{
    extern void cyd_set_channel_gain(int ch, float gain);
    cyd_set_channel_gain(ch, gain);
}

EMSCRIPTEN_KEEPALIVE
int klys_set_instrument_program_step(int idx, int step, int value)
{
    if (!g_song_loaded || idx < 0 || idx >= g_song.num_instruments) return 0;
    if (step < 0 || step >= MUS_PROG_LEN) return 0;
    g_song.instrument[idx].program[step] = (Uint16)value;
    return 1;
}
