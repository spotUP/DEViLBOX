/*
 * eupmini WASM harness — FM TOWNS Euphony (.eup) format
 *
 * Wraps the eupmini library for Emscripten/AudioWorklet.
 * Uses output2File mode with tmpfile() to avoid SDL threading.
 * Outputs interleaved stereo F32 at 44100 Hz.
 */

#include "eupmini/eupplayer.hpp"
#include "eupmini/eupplayer_townsEmulator.hpp"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cmath>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT extern "C"
#endif

/* Global pcm struct required by eupmini library */
struct pcm_struct pcm;

#define EUP_SAMPLE_RATE 44100
#define EUP_HEADER_SIZE 2048
#define DEFAULT_DURATION_S 300 /* 5 minutes */

/* ---- State ---- */

static EUPPlayer *g_player = nullptr;
static EUP_TownsEmulator *g_device = nullptr;
static uint8_t *g_file_data = nullptr;
static FILE *g_mem_stream = nullptr;
static long g_mem_read_pos = 0;
static int g_initialized = 0;
static int g_elapsed_frames = 0;
static int g_max_frames = 0;

/* ---- Public API ---- */

EXPORT int eupmini_init(const uint8_t *data, uint32_t size) {
    /* Clean up previous */
    if (g_player) { g_player->stopPlaying(); delete g_player; g_player = nullptr; }
    if (g_device) { delete g_device; g_device = nullptr; }
    if (g_mem_stream) { fclose(g_mem_stream); g_mem_stream = nullptr; }
    free(g_file_data); g_file_data = nullptr;
    g_initialized = 0;
    g_mem_read_pos = 0;

    if (size < EUP_HEADER_SIZE + 6) return -1;

    /* Keep copy of data */
    g_file_data = (uint8_t *)malloc(size);
    if (!g_file_data) return -2;
    memcpy(g_file_data, data, size);

    /* Create emulator and player */
    g_device = new EUP_TownsEmulator;
    g_player = new EUPPlayer;

    g_device->outputSampleUnsigned(false);
    g_device->outputSampleLSBFirst(true);
    g_device->outputSampleSize(2);
    g_device->outputSampleChannels(2);
    g_device->rate(EUP_SAMPLE_RATE);

    /* Use output2File mode with tmpfile() */
    g_mem_stream = tmpfile();
    if (!g_mem_stream) return -3;
    g_device->output2File(true);
    g_device->outputStream(g_mem_stream);

    g_player->outputDevice(g_device);

    uint8_t *buf = g_file_data;

    /* Track to channel mapping (32 tracks) */
    for (int trk = 0; trk < 32; trk++)
        g_player->mapTrack_toChannel(trk, buf[0x394 + trk]);

    /* FM devices (6 channels) */
    for (int i = 0; i < 6; i++)
        g_device->assignFmDeviceToChannel(buf[0x6D4 + i]);

    /* PCM devices (8 channels) */
    for (int i = 0; i < 8; i++)
        g_device->assignPcmDeviceToChannel(buf[0x6DA + i]);

    /* Set initial tempo */
    int tempo = buf[0x805] + 30;
    g_player->tempo(tempo);

    /* Init pcm struct */
    memset(&pcm, 0, sizeof(pcm));

    /* Start playback */
    g_player->startPlaying(buf + EUP_HEADER_SIZE + 6);

    g_initialized = 1;
    g_elapsed_frames = 0;
    g_max_frames = DEFAULT_DURATION_S * EUP_SAMPLE_RATE;

    return 0;
}

EXPORT void eupmini_stop(void) {
    if (g_player) { g_player->stopPlaying(); delete g_player; g_player = nullptr; }
    if (g_device) { delete g_device; g_device = nullptr; }
    if (g_mem_stream) { fclose(g_mem_stream); g_mem_stream = nullptr; }
    free(g_file_data); g_file_data = nullptr;
    g_initialized = 0;
}

EXPORT int eupmini_render(float *buf, int frames) {
    if (!g_initialized || !g_player) {
        memset(buf, 0, (size_t)frames * 2 * sizeof(float));
        return frames;
    }

    if (g_elapsed_frames >= g_max_frames) {
        memset(buf, 0, (size_t)frames * 2 * sizeof(float));
        return 0;
    }

    int remaining = g_max_frames - g_elapsed_frames;
    if (frames > remaining) frames = remaining;

    /* Generate ticks until we have enough samples in the tmpfile */
    long needed_bytes = (long)(g_mem_read_pos + frames * 2 * 2); /* S16 stereo = 4 bytes/frame */

    fseek(g_mem_stream, 0, SEEK_END);
    long available_bytes = ftell(g_mem_stream);

    while (available_bytes < needed_bytes) {
        if (!g_player->isPlaying()) break;
        g_player->nextTick();
        fseek(g_mem_stream, 0, SEEK_END);
        available_bytes = ftell(g_mem_stream);
    }

    /* Read S16 stereo from tmpfile and convert to F32 */
    fseek(g_mem_stream, g_mem_read_pos, SEEK_SET);
    int actual_frames = frames;
    long actual_bytes = (available_bytes - g_mem_read_pos) / 4;
    if (actual_frames > (int)actual_bytes) actual_frames = (int)actual_bytes;

    for (int i = 0; i < actual_frames; i++) {
        int16_t l, r;
        if (fread(&l, 2, 1, g_mem_stream) != 1) { actual_frames = i; break; }
        if (fread(&r, 2, 1, g_mem_stream) != 1) { actual_frames = i; break; }
        buf[i * 2]     = (float)l / 32768.0f;
        buf[i * 2 + 1] = (float)r / 32768.0f;
    }

    g_mem_read_pos += actual_frames * 4;
    g_elapsed_frames += actual_frames;

    /* Zero-fill remainder if needed */
    if (actual_frames < frames) {
        memset(buf + actual_frames * 2, 0, (size_t)(frames - actual_frames) * 2 * sizeof(float));
    }

    return actual_frames;
}

EXPORT int eupmini_get_sample_rate(void) {
    return EUP_SAMPLE_RATE;
}

EXPORT void eupmini_set_channel_mute(int channel, int muted) {
    if (!g_device || channel < 0 || channel >= 32) return;
    /* enable(ch, true) = unmuted, enable(ch, false) = muted */
    g_device->enable(channel, muted ? false : true);
}

/* ══════════════════════════════════════════════════════════════════════════
 *  FM Instrument parameter read/write API
 *
 *  FM instrument data is 48 bytes. The operator layout (4 ops at offsets 0,4,8,12):
 *    byte[op*4+0]: (DT<<4) | MUL
 *    byte[op*4+4]: unused
 *    byte[op*4+8]: unused (aliased by 4-byte stride)
 *    byte[op*4+12]: TL & 0x7f
 *    byte[op*4+16]: (KS<<6) | (AR & 0x1f)
 *    byte[op*4+20]: DR & 0x1f
 *    byte[op*4+24]: SR & 0x1f
 *    byte[op*4+28]: (SL<<4) | (RR & 0x0f)
 *  Actually the layout uses stride 4 per operator within each register group:
 *    Offsets 8,9,10,11: DT/MUL for op 0,1,2,3
 *    Offsets 12,13,14,15: TL for op 0,1,2,3
 *    Offsets 16,17,18,19: KS/AR for op 0,1,2,3
 *    Offsets 20,21,22,23: DR for op 0,1,2,3
 *    Offsets 24,25,26,27: SR for op 0,1,2,3
 *    Offsets 28,29,30,31: SL/RR for op 0,1,2,3
 *    Offset 32: (FB<<3) | ALG
 *    Offset 33: LR panning
 * ══════════════════════════════════════════════════════════════════════════ */

/* Slot param IDs */
enum {
    EUP_SLOT_TL  = 0,
    EUP_SLOT_AR  = 1,
    EUP_SLOT_DR  = 2,
    EUP_SLOT_SR  = 3,
    EUP_SLOT_RR  = 4,
    EUP_SLOT_SL  = 5,
    EUP_SLOT_MUL = 6,
    EUP_SLOT_DET = 7,
    EUP_SLOT_KS  = 8,
};

/* Channel param IDs */
enum {
    EUP_CH_ALG   = 0,
    EUP_CH_FB    = 1,
    EUP_CH_PAN_L = 2,
    EUP_CH_PAN_R = 3,
};

EXPORT int eupmini_get_num_fm_instruments(void) {
    if (!g_device) return 0;
    return g_device->getMaxFmInstruments();
}

EXPORT int eupmini_get_fm_slot_param(int inst, int op, int param_id) {
    if (!g_device || op < 0 || op > 3) return -1;
    uint8_t *data = g_device->getFmInstrumentData(inst);
    if (!data) return -1;

    switch (param_id) {
        case EUP_SLOT_DET: return (data[8 + op] >> 4) & 7;
        case EUP_SLOT_MUL: return data[8 + op] & 15;
        case EUP_SLOT_TL:  return data[12 + op] & 127;
        case EUP_SLOT_KS:  return (data[16 + op] >> 6) & 3;
        case EUP_SLOT_AR:  return data[16 + op] & 31;
        case EUP_SLOT_DR:  return data[20 + op] & 31;
        case EUP_SLOT_SR:  return data[24 + op] & 31;
        case EUP_SLOT_SL:  return (data[28 + op] >> 4) & 15;
        case EUP_SLOT_RR:  return data[28 + op] & 15;
        default: return -1;
    }
}

EXPORT void eupmini_set_fm_slot_param(int inst, int op, int param_id, int value) {
    if (!g_device || op < 0 || op > 3) return;
    uint8_t *data = g_device->getFmInstrumentData(inst);
    if (!data) return;

    switch (param_id) {
        case EUP_SLOT_DET:
            data[8 + op] = (uint8_t)(((value & 7) << 4) | (data[8 + op] & 0x0f));
            break;
        case EUP_SLOT_MUL:
            data[8 + op] = (uint8_t)((data[8 + op] & 0xf0) | (value & 15));
            break;
        case EUP_SLOT_TL:
            data[12 + op] = (uint8_t)(value & 127);
            break;
        case EUP_SLOT_KS:
            data[16 + op] = (uint8_t)(((value & 3) << 6) | (data[16 + op] & 0x3f));
            break;
        case EUP_SLOT_AR:
            data[16 + op] = (uint8_t)((data[16 + op] & 0xc0) | (value & 31));
            break;
        case EUP_SLOT_DR:
            data[20 + op] = (uint8_t)(value & 31);
            break;
        case EUP_SLOT_SR:
            data[24 + op] = (uint8_t)(value & 31);
            break;
        case EUP_SLOT_SL:
            data[28 + op] = (uint8_t)(((value & 15) << 4) | (data[28 + op] & 0x0f));
            break;
        case EUP_SLOT_RR:
            data[28 + op] = (uint8_t)((data[28 + op] & 0xf0) | (value & 15));
            break;
    }
}

EXPORT int eupmini_get_fm_ch_param(int inst, int param_id) {
    if (!g_device) return -1;
    uint8_t *data = g_device->getFmInstrumentData(inst);
    if (!data) return -1;

    switch (param_id) {
        case EUP_CH_ALG:   return data[32] & 7;
        case EUP_CH_FB:    return (data[32] >> 3) & 7;
        case EUP_CH_PAN_L: return (data[33] >> 7) & 1;
        case EUP_CH_PAN_R: return (data[33] >> 6) & 1;
        default: return -1;
    }
}

EXPORT void eupmini_set_fm_ch_param(int inst, int param_id, int value) {
    if (!g_device) return;
    uint8_t *data = g_device->getFmInstrumentData(inst);
    if (!data) return;

    switch (param_id) {
        case EUP_CH_ALG:
            data[32] = (uint8_t)((data[32] & 0xf8) | (value & 7));
            break;
        case EUP_CH_FB:
            data[32] = (uint8_t)((data[32] & 0xc7) | ((value & 7) << 3));
            break;
        case EUP_CH_PAN_L:
            data[33] = (uint8_t)((data[33] & 0x7f) | ((value & 1) << 7));
            break;
        case EUP_CH_PAN_R:
            data[33] = (uint8_t)((data[33] & 0xbf) | ((value & 1) << 6));
            break;
    }
}

/**
 * Bulk read all FM instrument data for one instrument.
 * Writes 42 ints: [alg, fb, panL, panR, slot0(tl,ar,dr,sr,rr,sl,mul,det,ks) × 4]
 * = 4 + 4*9 = 40 ints
 */
EXPORT void eupmini_get_fm_instrument(int inst, int *out) {
    if (!g_device || !out) return;
    uint8_t *data = g_device->getFmInstrumentData(inst);
    if (!data) { memset(out, 0, 40 * sizeof(int)); return; }

    out[0] = data[32] & 7;           /* ALG */
    out[1] = (data[32] >> 3) & 7;    /* FB */
    out[2] = (data[33] >> 7) & 1;    /* Pan L */
    out[3] = (data[33] >> 6) & 1;    /* Pan R */

    for (int op = 0; op < 4; op++) {
        int base = 4 + op * 9;
        out[base + 0] = data[12 + op] & 127;        /* TL */
        out[base + 1] = data[16 + op] & 31;          /* AR */
        out[base + 2] = data[20 + op] & 31;          /* DR */
        out[base + 3] = data[24 + op] & 31;          /* SR */
        out[base + 4] = data[28 + op] & 15;          /* RR */
        out[base + 5] = (data[28 + op] >> 4) & 15;   /* SL */
        out[base + 6] = data[8 + op] & 15;           /* MUL */
        out[base + 7] = (data[8 + op] >> 4) & 7;     /* DET */
        out[base + 8] = (data[16 + op] >> 6) & 3;    /* KS */
    }
}
