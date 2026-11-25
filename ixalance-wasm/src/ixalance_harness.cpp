/*
 * Ixalance WASM harness — IXS (Impulse Tracker eXtendable Sequencer)
 *
 * Wraps webixs PlayerIXS for Emscripten/AudioWorklet.
 * Outputs interleaved stereo F32 at 44100 Hz.
 */

#include "PlayerIXS.h"
#include "PlayerCore.h"
#include "WaveGen.h"
#include "FileSFXI.h"

#include <cstdlib>
#include <cstring>
#include <cstdint>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT extern "C"
#endif

/* Stubs for JS callbacks expected by webixs EMSCRIPTEN code path */
extern "C" {
    void JS_printStatus(char *msg) {
        /* No-op: status messages are not needed in AudioWorklet */
        (void)msg;
    }

    /* JS_saveCacheFile: only reached when WaveGen builds its own cache (no destination);
     * JS_getCacheFileData always passes one, so there is nothing to save. */
    void JS_saveCacheFile(char *filename, unsigned char *dataBuf, unsigned int lenBuf) {
        (void)filename; (void)dataBuf; (void)lenBuf;
    }

    /* JS_getCacheFileData: the EMSCRIPTEN loader asks the host for the generated sample
     * cache. Build it in memory into the loader's transfer buffer (as the LINUX path does);
     * the loader then reads the cache back from `destination`. Returning 0 fails every load. */
    unsigned int JS_getCacheFileData(char *filename, unsigned char *dataBuf1,
                                     unsigned int lenBuf1, unsigned char *dataBuf2,
                                     unsigned int lenBuf2, unsigned char *destination) {
        (void)lenBuf1; (void)lenBuf2;
        IXS::BufSFXI *buf = (IXS::BufSFXI *)destination;
        buf->magic_0x0 = 0;  // reset: the transfer buffer is reused between songs
        IXS::FileSFXI *dest = IXS::IXS__FileSFXI__newFileSFXI_00413c20(buf);
        if (!dest) return 0;
        int ok = IXS::IXS__WAVEGEN__createSampleCacheFile(filename, dataBuf1, dataBuf2, dest);
        (*dest->vftptr_0x0->deleteObject)(dest);  // frees the wrapper only, not the buffer
        return ok ? 1 : 0;
    }
}

#define IXS_SAMPLE_RATE 44100
#define IXS_CHANNELS 2

/* ---- State ---- */

static IXS::PlayerIXS *g_player = nullptr;
static uint8_t *g_file_data = nullptr;
static bool g_playing = false;

/* Per-channel gain array (up to 64 channels). 1.0 = full, 0.0 = muted. */
#define IXS_MAX_CHANNELS 64
static float g_channel_gain[IXS_MAX_CHANNELS];
static bool g_gain_initialized = false;

/* ---- Public API ---- */

EXPORT int ixalance_init(const uint8_t *data, uint32_t size) {
    /* Clean up previous */
    if (g_player) {
        (*g_player->vftable->delete0)(g_player);
        g_player = nullptr;
    }
    if (g_file_data) {
        free(g_file_data);
        g_file_data = nullptr;
    }
    g_playing = false;

    g_player = IXS::IXS__PlayerIXS__createPlayer_00405d90(IXS_SAMPLE_RATE);
    if (!g_player) return -1;

    /* Copy file data */
    g_file_data = (uint8_t *)malloc(size);
    if (!g_file_data) return -2;
    memcpy(g_file_data, data, size);

    /* Load IXS file */
    char result = (*g_player->vftable->loadIxsFileData)(
        g_player, g_file_data, size, nullptr, nullptr, nullptr);
    if (result != 0) {
        free(g_file_data);
        g_file_data = nullptr;
        (*g_player->vftable->delete0)(g_player);
        g_player = nullptr;
        return -3;
    }

    /* Initialize audio output */
    (*g_player->vftable->initAudioOut)(g_player);
    g_playing = true;

    return 0;
}

EXPORT void ixalance_stop(void) {
    if (g_player) {
        (*g_player->vftable->stopGenAudioThread)(g_player);
        (*g_player->vftable->delete0)(g_player);
        g_player = nullptr;
    }
    if (g_file_data) {
        free(g_file_data);
        g_file_data = nullptr;
    }
    /* Free the static sample-cache buffer in WaveGen (30 MB) */
    IXS::IXS__WAVEGEN__freeCacheFileBuf();
    g_playing = false;
}

EXPORT int ixalance_render(float *buf, int frames) {
    if (!g_player || !g_playing) {
        memset(buf, 0, (size_t)frames * IXS_CHANNELS * sizeof(float));
        return 0;
    }

    if ((*g_player->vftable->isSongEnd)(g_player)) {
        g_playing = false;
        memset(buf, 0, (size_t)frames * IXS_CHANNELS * sizeof(float));
        return 0;
    }

    /* Generate audio block */
    (*g_player->vftable->genAudio)(g_player);

    uint8_t *audio_buf = (*g_player->vftable->getAudioBuffer)(g_player);
    uint32_t num_frames = (*g_player->vftable->getAudioBufferLen)(g_player);

    if (!audio_buf || num_frames == 0) {
        memset(buf, 0, (size_t)frames * IXS_CHANNELS * sizeof(float));
        return 0;
    }

    uint32_t to_copy = num_frames < (uint32_t)frames ? num_frames : (uint32_t)frames;

    /* S16 to F32 conversion */
    int16_t *src = (int16_t *)audio_buf;
    for (uint32_t i = 0; i < to_copy * IXS_CHANNELS; i++) {
        buf[i] = (float)src[i] / 32768.0f;
    }

    /* Zero-fill remainder if block was smaller than requested */
    if (to_copy < (uint32_t)frames) {
        memset(buf + to_copy * IXS_CHANNELS, 0,
               (size_t)(frames - to_copy) * IXS_CHANNELS * sizeof(float));
    }

    return (int)to_copy;
}

EXPORT int ixalance_get_sample_rate(void) {
    return IXS_SAMPLE_RATE;
}

EXPORT void ixalance_set_channel_gain(int channel, float gain) {
    if (!g_gain_initialized) {
        for (int i = 0; i < IXS_MAX_CHANNELS; i++) g_channel_gain[i] = 1.0f;
        g_gain_initialized = true;
    }
    if (channel >= 0 && channel < IXS_MAX_CHANNELS) {
        g_channel_gain[channel] = gain;
    }
}

EXPORT float ixalance_get_channel_gain(int channel) {
    if (!g_gain_initialized) return 1.0f;
    if (channel >= 0 && channel < IXS_MAX_CHANNELS) {
        return g_channel_gain[channel];
    }
    return 1.0f;
}
