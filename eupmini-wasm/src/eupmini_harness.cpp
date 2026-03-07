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
