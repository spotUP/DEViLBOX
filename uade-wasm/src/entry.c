/*
 * entry.c — WASM entry point for the merged UADE module.
 *
 * This file implements the exported WASM API used by UADE.worklet.js.
 * It bridges between JavaScript calls and the libuade C API.
 *
 * The UADE architecture (merged for WASM):
 *   JavaScript → uade_wasm_* exports
 *              → libuade (uadestate.c, uadecontrol.c, eagleplayer.c, ...)
 *              → shim_ipc.c (in-memory ring buffers instead of socketpair)
 *              → uadecore (68k CPU + custom chip emulation, Paula PCM output)
 *              → float32 PCM → returned to JS
 *
 * Eagleplayer binaries (175 players) are embedded via player_registry.c.
 * The UADE "basedir" is set to a virtual filesystem populated at init.
 */

#include <uade/uade.h>
#include <uade/uadestate.h>

#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#include "player_registry.h"

/* ── Globals ────────────────────────────────────────────────────────────── */

static struct uade_state *s_state = NULL;
static int s_playing = 0;
static int s_paused  = 0;
static int s_looping = 0;

/* Sample rate for the WASM module (set at init) */
static int s_sample_rate = 44100;

/* PCM ring buffer — interleaved int16 stereo */
#define PCM_BUF_FRAMES  (8192)
#define PCM_BUF_BYTES   (PCM_BUF_FRAMES * 4)   /* 2 channels * 2 bytes/sample */

static int16_t s_pcm_buf[PCM_BUF_FRAMES * 2];   /* stereo int16 */
static int     s_pcm_write = 0;
static int     s_pcm_read  = 0;

/* ── Virtual filesystem for UADE data ──────────────────────────────────── */

/*
 * Mount eagleplayers and config into MEMFS.
 * Called once at startup, before uade_new_state().
 */
static void populate_virtual_fs(void) {
    /* Create basedir structure */
    EM_ASM({
        FS.mkdir('/uade');
        FS.mkdir('/uade/players');
        FS.mkdir('/uade/eagleplayer.conf');
    });

    /* Write each eagleplayer binary into MEMFS */
    for (int i = 0; i < uade_player_count; i++) {
        const UADEPlayer *p = &uade_players[i];
        char path[256];
        snprintf(path, sizeof path, "/uade/players/%s", p->name);

        /* Write binary to MEMFS */
        FILE *f = fopen(path, "wb");
        if (f) {
            fwrite(p->data, 1, p->size, f);
            fclose(f);
        }
    }

    /* Write a minimal eagleplayer.conf */
    FILE *conf = fopen("/uade/eagleplayer.conf", "w");
    if (conf) {
        fprintf(conf, "# UADE WASM eagleplayer configuration\n");
        for (int i = 0; i < uade_player_count; i++) {
            fprintf(conf, "player %s\n", uade_players[i].name);
        }
        fclose(conf);
    }
}

/* ── WASM Exported API ──────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
int uade_wasm_init(int sample_rate) {
    s_sample_rate = (sample_rate > 0) ? sample_rate : 44100;

    /* Populate virtual filesystem with eagleplayers */
    populate_virtual_fs();

    /* Create UADE state with our basedir */
    struct uade_config *cfg = uade_new_config();
    if (!cfg) return -1;

    uade_config_set_option(cfg, UC_BASE_DIR, "/uade");
    uade_config_set_option(cfg, UC_FREQUENCY, s_sample_rate == 44100 ? "44100" : "48000");

    s_state = uade_new_state(cfg);
    uade_free_config(cfg);

    if (!s_state) {
        fprintf(stderr, "[uade-wasm] Failed to create UADE state\n");
        return -1;
    }

    s_playing = 0;
    s_paused  = 0;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int uade_wasm_load(const uint8_t *data, size_t len, const char *filename_hint) {
    if (!s_state) return -1;

    /* Stop any current playback */
    if (s_playing) {
        uade_stop(s_state);
        s_playing = 0;
    }

    /* Reset PCM buffer */
    s_pcm_read = 0;
    s_pcm_write = 0;

    /* Write the file to MEMFS so UADE can open it */
    const char *vpath = "/uade/song";
    FILE *f = fopen(vpath, "wb");
    if (!f) {
        fprintf(stderr, "[uade-wasm] Cannot write to MEMFS: %s\n", vpath);
        return -1;
    }
    fwrite(data, 1, len, f);
    fclose(f);

    /* Start playback from the MEMFS file */
    int ret = uade_play(vpath, -1, s_state);
    if (ret <= 0) {
        /* Try from buffer directly */
        void *buf = malloc(len);
        if (buf) {
            memcpy(buf, data, len);
            ret = uade_play_from_buffer(filename_hint, buf, len, -1, s_state);
            free(buf);
        }
    }

    if (ret <= 0) {
        fprintf(stderr, "[uade-wasm] Cannot play file: %s (ret=%d)\n", filename_hint, ret);
        return -1;
    }

    s_playing = 1;
    s_paused  = 0;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int uade_wasm_get_subsong_count(void) {
    if (!s_state) return 1;
    const struct uade_song_info *info = uade_get_song_info(s_state);
    if (!info) return 1;
    return info->subsongs.max - info->subsongs.min + 1;
}

EMSCRIPTEN_KEEPALIVE
int uade_wasm_get_subsong_min(void) {
    if (!s_state) return 0;
    const struct uade_song_info *info = uade_get_song_info(s_state);
    return info ? info->subsongs.min : 0;
}

EMSCRIPTEN_KEEPALIVE
int uade_wasm_get_subsong_max(void) {
    if (!s_state) return 0;
    const struct uade_song_info *info = uade_get_song_info(s_state);
    return info ? info->subsongs.max : 0;
}

EMSCRIPTEN_KEEPALIVE
void uade_wasm_get_player_name(char *out, int maxlen) {
    if (!s_state || !out) return;
    const struct uade_song_info *info = uade_get_song_info(s_state);
    if (info && info->playername[0]) {
        strncpy(out, info->playername, maxlen - 1);
        out[maxlen - 1] = '\0';
    } else {
        out[0] = '\0';
    }
}

EMSCRIPTEN_KEEPALIVE
void uade_wasm_get_format_name(char *out, int maxlen) {
    if (!s_state || !out) return;
    const struct uade_song_info *info = uade_get_song_info(s_state);
    if (info && info->formatname[0]) {
        strncpy(out, info->formatname, maxlen - 1);
        out[maxlen - 1] = '\0';
    } else {
        out[0] = '\0';
    }
}

EMSCRIPTEN_KEEPALIVE
void uade_wasm_set_subsong(int subsong) {
    if (!s_state || !s_playing) return;
    /* UADE implements subsong switching via uade_stop() + uade_play() with subsong index */
    const char *vpath = "/uade/song";
    uade_stop(s_state);
    s_playing = (uade_play(vpath, subsong, s_state) > 0);
}

EMSCRIPTEN_KEEPALIVE
void uade_wasm_stop(void) {
    if (!s_state) return;
    if (s_playing) {
        uade_stop(s_state);
        s_playing = 0;
    }
}

EMSCRIPTEN_KEEPALIVE
void uade_wasm_set_looping(int loop) {
    s_looping = loop;
}

/*
 * Render N frames of stereo float32 PCM.
 * Returns 1 if audio was produced, 0 if song ended, -1 on error.
 *
 * out_l and out_r are float32 arrays of length `frames`.
 * UADE outputs int16 stereo interleaved internally, which we convert to float32.
 */
EMSCRIPTEN_KEEPALIVE
int uade_wasm_render(float *out_l, float *out_r, int frames) {
    if (!s_state || !s_playing || s_paused) {
        /* Output silence */
        memset(out_l, 0, frames * sizeof(float));
        memset(out_r, 0, frames * sizeof(float));
        return s_playing ? 1 : 0;
    }

    /* Read int16 stereo interleaved from UADE */
    int16_t tmp[4096 * 2];
    int frames_needed = frames;
    int frames_done = 0;

    while (frames_done < frames_needed) {
        int chunk = frames_needed - frames_done;
        if (chunk > 4096) chunk = 4096;

        ssize_t nbytes = uade_read(tmp, chunk * 4, s_state);
        if (nbytes < 0) {
            /* Error or song end */
            if (s_looping) {
                /* Restart */
                uade_stop(s_state);
                const char *vpath = "/uade/song";
                s_playing = (uade_play(vpath, -1, s_state) > 0);
                if (!s_playing) break;
                continue;
            }
            s_playing = 0;
            /* Fill rest with silence */
            while (frames_done < frames_needed) {
                out_l[frames_done] = 0.0f;
                out_r[frames_done] = 0.0f;
                frames_done++;
            }
            return 0;
        }
        if (nbytes == 0) {
            /* Song end */
            if (s_looping) {
                uade_stop(s_state);
                const char *vpath = "/uade/song";
                s_playing = (uade_play(vpath, -1, s_state) > 0);
                if (!s_playing) break;
                continue;
            }
            s_playing = 0;
            while (frames_done < frames_needed) {
                out_l[frames_done] = 0.0f;
                out_r[frames_done] = 0.0f;
                frames_done++;
            }
            return 0;
        }

        /* Convert int16 stereo → float32 separate channels */
        int got_frames = (int)(nbytes / 4);
        for (int i = 0; i < got_frames; i++) {
            out_l[frames_done + i] = tmp[i * 2]     / 32768.0f;
            out_r[frames_done + i] = tmp[i * 2 + 1] / 32768.0f;
        }
        frames_done += got_frames;
    }

    return 1;
}

EMSCRIPTEN_KEEPALIVE
void uade_wasm_cleanup(void) {
    if (s_state) {
        uade_cleanup_state(s_state);
        s_state = NULL;
    }
    s_playing = 0;
}
