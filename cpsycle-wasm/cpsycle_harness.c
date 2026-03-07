/*
 * cpsycle WASM harness — Psycle tracker (.psy) playback
 *
 * Wraps the cpsycle audio engine for Emscripten/AudioWorklet.
 * Outputs interleaved stereo F32 at 48000 Hz.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

#include "exclusivelock.h"
#include "machine.h"
#include "machinefactory.h"
#include "player.h"
#include "plugincatcher.h"
#include "sequencer.h"
#include "silentdriver.h"
#include "song.h"
#include "songio.h"

#define CPSYCLE_SAMPLE_RATE 48000
#define RENDER_BLOCK_SIZE 2048

/* ---- State ---- */

static psy_audio_Player g_player;
static psy_audio_Song *g_song = NULL;
static psy_audio_MachineCallback g_machinecallback;
static psy_audio_MachineFactory g_machinefactory;
static psy_audio_PluginCatcher g_plugincatcher;
static int g_initialized = 0;
static int g_song_ended = 0;

/* Temp file path for Emscripten MEMFS */
static const char *TEMP_PSY_PATH = "/tmp/current.psy";

/* ---- Public API ---- */

int EXPORT cpsycle_init(const uint8_t *data, uint32_t size) {
    /* Clean up previous */
    if (g_initialized) {
        psy_audio_player_stop(&g_player);
        psy_audio_player_dispose(&g_player);
        if (g_song) {
            psy_audio_song_deallocate(g_song);
            g_song = NULL;
        }
        psy_audio_machinefactory_dispose(&g_machinefactory);
        psy_audio_plugincatcher_dispose(&g_plugincatcher);
        psy_audio_dispose();
        g_initialized = 0;
    }
    g_song_ended = 0;

    /* Write data to MEMFS temp file */
    FILE *f = fopen(TEMP_PSY_PATH, "wb");
    if (!f) return -1;
    size_t written = fwrite(data, 1, size, f);
    fclose(f);
    if (written != size) return -2;

    /* Initialize audio subsystem */
    psy_audio_init();

    /* Set up machine callback */
    psy_audio_machinecallback_init(&g_machinecallback);

    /* Initialize plugin catcher (minimal) */
    psy_audio_plugincatcher_init(&g_plugincatcher);

    /* Initialize machine factory */
    psy_audio_machinefactory_init(&g_machinefactory, &g_machinecallback, &g_plugincatcher);

    /* Initialize player */
    psy_audio_player_init(&g_player, NULL, NULL);
    psy_audio_machinecallback_setplayer(&g_machinecallback, &g_player);

    /* Allocate and load song */
    g_song = psy_audio_song_allocinit(&g_machinefactory);
    if (!g_song) {
        psy_audio_player_dispose(&g_player);
        psy_audio_machinefactory_dispose(&g_machinefactory);
        psy_audio_plugincatcher_dispose(&g_plugincatcher);
        psy_audio_dispose();
        return -3;
    }

    psy_audio_machinecallback_set_song(&g_machinecallback, g_song);

    /* Load the song file */
    psy_audio_SongFile songfile;
    psy_audio_songfile_init(&songfile);
    songfile.song = g_song;
    int err = psy_audio_songfile_load(&songfile, TEMP_PSY_PATH);
    psy_audio_songfile_dispose(&songfile);

    if (err != PSY_OK) {
        psy_audio_song_deallocate(g_song);
        g_song = NULL;
        psy_audio_player_dispose(&g_player);
        psy_audio_machinefactory_dispose(&g_machinefactory);
        psy_audio_plugincatcher_dispose(&g_plugincatcher);
        psy_audio_dispose();
        return -4;
    }

    /* Connect song to player */
    psy_audio_exclusivelock_enter();
    psy_audio_player_setsong(&g_player, g_song);
    psy_audio_player_setbpm(&g_player, g_song->properties.bpm);
    psy_audio_player_set_lpb(&g_player, g_song->properties.lpb);
    psy_audio_exclusivelock_leave();

    /* Set sample rate */
    psy_audio_sequencer_setsamplerate(&g_player.sequencer, (psy_dsp_big_hz_t)CPSYCLE_SAMPLE_RATE);

    /* Start playback */
    psy_audio_sequencer_stop_loop(&g_player.sequencer);
    psy_audio_player_setposition(&g_player, 0.0);
    psy_audio_player_start(&g_player);

    g_initialized = 1;

    /* Clean up temp file */
    remove(TEMP_PSY_PATH);

    return 0;
}

void EXPORT cpsycle_stop(void) {
    if (g_initialized) {
        psy_audio_player_stop(&g_player);
        psy_audio_player_dispose(&g_player);
        if (g_song) {
            psy_audio_song_deallocate(g_song);
            g_song = NULL;
        }
        psy_audio_machinefactory_dispose(&g_machinefactory);
        psy_audio_plugincatcher_dispose(&g_plugincatcher);
        psy_audio_dispose();
        g_initialized = 0;
    }
    g_song_ended = 0;
}

int EXPORT cpsycle_render(float *buf, int frames) {
    if (!g_initialized || !g_song || g_song_ended) {
        memset(buf, 0, (size_t)frames * 2 * sizeof(float));
        return 0;
    }

    int numsamples = frames;
    if (numsamples > RENDER_BLOCK_SIZE) numsamples = RENDER_BLOCK_SIZE;

    int hostisplaying = 1;
    psy_dsp_amp_t *rendered = psy_audio_player_work(&g_player, &numsamples, &hostisplaying);

    if (!rendered || numsamples <= 0) {
        g_song_ended = 1;
        memset(buf, 0, (size_t)frames * 2 * sizeof(float));
        return 0;
    }

    /* Scale from native range [-32768, 32768] to [-1, 1] */
    int total = numsamples * 2;
    const float scale = 1.0f / 32768.0f;
    for (int i = 0; i < total; i++) {
        buf[i] = rendered[i] * scale;
    }

    /* Zero-fill remainder */
    if (numsamples < frames) {
        memset(buf + numsamples * 2, 0, (size_t)(frames - numsamples) * 2 * sizeof(float));
    }

    if (!hostisplaying) {
        g_song_ended = 1;
    }

    return numsamples;
}

int EXPORT cpsycle_get_sample_rate(void) {
    return CPSYCLE_SAMPLE_RATE;
}
