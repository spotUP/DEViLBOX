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
#include <sys/stat.h>
#include <setjmp.h>

#include "player_registry.h"
#include "basedir_data.h"

/* exit() interception — see uade_exit_override.c */
extern jmp_buf uade_exit_jmpbuf;
extern volatile int uade_exit_status;
extern volatile int uade_exit_guard;

/* Shim reset — clears ring buffers + core state for clean load */
extern void uade_shim_reset_for_load(void);

/* Core IPC — needed to reset core-side IPC state */
extern struct uade_ipc uadecore_ipc;

/* ── Globals ────────────────────────────────────────────────────────────── */

static struct uade_state *s_state = NULL;
static int s_playing = 0;
static int s_paused  = 0;
static int s_looping = 0;
static int s_total_frames = 0;  /* Total frames rendered (for position tracking) */
static char s_last_vpath[512] = "/uade/song";  /* Last module VFS path (for loop/subsong) */

/* Sample rate for the WASM module (set at init) */
static int s_sample_rate = 44100;

/* ── CIA-A tick counter ──────────────────────────────────────────────────── */
/* Counts cumulative CIA-A Timer A overflows (= musical ticks) since last load.
 * Incremented by uade_wasm_on_cia_a_tick() which is called from cia.c
 * when CIA-A Timer A fires (via UADE_WASM hook in cia.c CIA_update()).
 * Used by the JS enhanced scan to derive row boundaries precisely. */
static uint32_t g_uade_tick_count = 0;

/* ── Paula write log ────────────────────────────────────────────────────── */
#include "paula_log.h"

/* Forward declaration — defined in memory.c (full extern in memory.h below) */
extern uint32_t g_uade_last_chip_read_addr;

static UadePaulaLogEntry g_paula_log[PAULA_LOG_SIZE];
static uint32_t g_paula_log_write   = 0;
static uint32_t g_paula_log_read    = 0;
static uint8_t  g_paula_log_enabled = 0;

/* --- CIA Tick Snapshot Buffer -------------------------------------------- */
static UadeTickSnapshot g_tick_snaps[TICK_SNAP_SIZE];
static uint32_t         g_tick_snap_write   = 0;
static uint32_t         g_tick_snap_read    = 0;
static uint8_t          g_tick_snap_enabled = 0;

/* Per-channel state for DMA restart detection (see uade_wasm_on_cia_a_tick). */
static uint32_t g_prev_lc[4]     = {0, 0, 0, 0};
static uint8_t  g_prev_dma[4]    = {0, 0, 0, 0};
static uint16_t g_prev_period[4] = {0, 0, 0, 0};
static uint16_t g_prev_volume[4] = {0, 0, 0, 0};
/* ------------------------------------------------------------------------- */

/* Called from audio.c AUDx handlers (inside #ifdef UADE_WASM guards). */
void uade_wasm_log_paula_write(uint8_t channel, uint8_t reg, uint16_t value) {
    if (!g_paula_log_enabled) return;
    uint32_t idx = g_paula_log_write & PAULA_LOG_MASK;
    g_paula_log[idx].channel     = channel;
    g_paula_log[idx].reg         = reg;
    g_paula_log[idx].value       = value;
    g_paula_log[idx].source_addr = g_uade_last_chip_read_addr;
    g_paula_log[idx].tick        = g_uade_tick_count;
    g_paula_log_write++;
}

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
 *
 * Creates the full UADE basedir structure:
 *   /uade/players/          — 175 eagleplayer binaries
 *   /uade/eagleplayer.conf  — player detection rules
 *   /uade/uade.conf         — main UADE config
 *   /uade/uaerc             — UAE emulator config
 *   /uade/score             — 68k score/replay binary
 *   /uade/uadecore          — dummy file (passes access(X_OK) check)
 */
static void populate_virtual_fs(void) {
    /* Create basedir structure */
    EM_ASM({
        FS.mkdir('/uade');
        FS.mkdir('/uade/players');
        FS.mkdir('/uade/ENV');
        FS.mkdir('/uade/ENV/EaglePlayer');
    });

    /* Write each eagleplayer binary into MEMFS */
    for (int i = 0; i < uade_player_count; i++) {
        const UADEPlayer *p = &uade_players[i];
        char path[256];
        snprintf(path, sizeof path, "/uade/players/%s", p->name);

        FILE *f = fopen(path, "wb");
        if (f) {
            fwrite(p->data, 1, p->size, f);
            fclose(f);
        }
    }

    /* Write basedir config/data files (uaerc, uade.conf, eagleplayer.conf, score) */
    for (int i = 0; i < uade_basedir_file_count; i++) {
        const UADEBasedirFile *bf = &uade_basedir_files[i];
        char path[256];
        snprintf(path, sizeof path, "/uade/%s", bf->name);

        FILE *f = fopen(path, "wb");
        if (f) {
            fwrite(bf->data, 1, bf->size, f);
            fclose(f);
        } else {
            fprintf(stderr, "[uade-wasm] Failed to write %s\n", path);
        }
    }

    /* Create dummy uadecore file — uade_new_state() checks access(X_OK).
     * In WASM the core runs in-process via shim_ipc.c, but the file must
     * exist to pass the sanity check. */
    FILE *uc = fopen("/uade/uadecore", "wb");
    if (uc) {
        const char *stub = "#!/bin/true\n";
        fwrite(stub, 1, strlen(stub), uc);
        fclose(uc);
        /* Set executable permission in MEMFS */
        EM_ASM({
            FS.chmod('/uade/uadecore', 0o755);
        });
    }
}

/* ── Exit-guarded helpers (no EM_ASM in these — Emscripten limitation) ── */

/*
 * Create UADE state with exit() interception.
 * Separated from uade_wasm_init because setjmp and EM_ASM
 * cannot coexist in the same function (Emscripten backend).
 */
static int guarded_new_state(struct uade_config *cfg) {
    uade_exit_guard = 1;
    if (setjmp(uade_exit_jmpbuf) != 0) {
        uade_exit_guard = 0;
        fprintf(stderr, "[uade-wasm] exit(%d) during uade_new_state\n", uade_exit_status);
        return -1;
    }
    s_state = uade_new_state(cfg);
    uade_exit_guard = 0;
    return s_state ? 0 : -1;
}

/*
 * Play a song with exit() interception.
 * Returns >0 on success, <=0 on failure.
 */
static int guarded_play(const char *vpath, int subsong) {
    uade_exit_guard = 1;
    if (setjmp(uade_exit_jmpbuf) != 0) {
        uade_exit_guard = 0;
        fprintf(stderr, "[uade-wasm] exit(%d) during uade_play\n", uade_exit_status);
        return -1;
    }
    int ret = uade_play(vpath, subsong, s_state);
    uade_exit_guard = 0;
    return ret;
}

static int guarded_play_from_buffer(const char *name, void *buf, size_t len, int subsong) {
    uade_exit_guard = 1;
    if (setjmp(uade_exit_jmpbuf) != 0) {
        uade_exit_guard = 0;
        fprintf(stderr, "[uade-wasm] exit(%d) during uade_play_from_buffer\n", uade_exit_status);
        return -1;
    }
    int ret = uade_play_from_buffer(name, buf, len, subsong, s_state);
    uade_exit_guard = 0;
    return ret;
}

static ssize_t guarded_read(void *buf, size_t count) {
    uade_exit_guard = 1;
    if (setjmp(uade_exit_jmpbuf) != 0) {
        uade_exit_guard = 0;
        fprintf(stderr, "[uade-wasm] exit(%d) during uade_read\n", uade_exit_status);
        return -1;
    }
    ssize_t ret = uade_read(buf, count, s_state);
    uade_exit_guard = 0;
    return ret;
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
    uade_config_set_option(cfg, UC_PANNING_VALUE, "1.0"); /* Full mono — mix all channels to center */

    if (guarded_new_state(cfg) != 0) {
        free(cfg);
        return -1;
    }
    free(cfg);

    s_playing = 0;
    s_paused  = 0;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int uade_wasm_load(const uint8_t *data, size_t len, const char *filename_hint) {
    if (!s_state) return -1;

    /* Mark as not playing */
    s_playing = 0;

    /* Reset PCM buffer, frame counter, and tick counter */
    s_pcm_read = 0;
    s_pcm_write = 0;
    s_total_frames = 0;
    g_uade_tick_count = 0;

    /* Reset DMA restart detection state */
    for (int i = 0; i < 4; i++) { g_prev_lc[i] = 0; g_prev_dma[i] = 0; }

    /* Write the file to MEMFS */
    char vpath[512];
    snprintf(vpath, sizeof(vpath), "/uade/%s", filename_hint);
    FILE *f = fopen(vpath, "wb");
    if (!f) {
        fprintf(stderr, "[uade-wasm] Cannot write to MEMFS: %s\n", vpath);
        return -1;
    }
    fwrite(data, 1, len, f);
    fclose(f);
    strlcpy(s_last_vpath, vpath, sizeof(s_last_vpath));

    /* Reset IPC state for clean load */
    uade_shim_reset_for_load();
    memset(&s_state->song, 0, sizeof(s_state->song));
    s_state->song.state = 0;
    s_state->ipc.state = 2;
    s_state->ipc.inputbytes = 0;
    uadecore_ipc.state = 0;
    uadecore_ipc.inputbytes = 0;

    {
        extern int uade_wasm_hw_initialized(void);
        if (!uade_wasm_hw_initialized()) {
            char uaerc_path[256];
            snprintf(uaerc_path, sizeof(uaerc_path), "%s/uaerc",
                     s_state->config.basedir.name);
            if (uade_send_string(UADE_COMMAND_CONFIG, uaerc_path,
                                 &s_state->ipc) != 0) {
                fprintf(stderr, "[uade-wasm] Failed to re-send CONFIG\n");
            }
        }
    }

    /* Start playback */
    chdir("/uade");
    int ret = guarded_play(vpath, -1);
    if (ret <= 0) {
        void *buf = malloc(len);
        if (buf) {
            memcpy(buf, data, len);
            ret = guarded_play_from_buffer(filename_hint, buf, len, -1);
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
    /* Subsong switching: full IPC reset + replay with new subsong index.
     * Do NOT use uade_stop() — use our clean reset path instead. */
    s_playing = 0;
    g_uade_tick_count = 0;
    uade_shim_reset_for_load();
    memset(&s_state->song, 0, sizeof(s_state->song));
    s_state->song.state = 0;
    s_state->ipc.state = 2;
    s_state->ipc.inputbytes = 0;
    uadecore_ipc.state = 0;
    uadecore_ipc.inputbytes = 0;

    /* Re-send CONFIG if needed */
    {
        extern int uade_wasm_hw_initialized(void);
        if (!uade_wasm_hw_initialized()) {
            char uaerc_path[256];
            snprintf(uaerc_path, sizeof(uaerc_path), "%s/uaerc",
                     s_state->config.basedir.name);
            uade_send_string(UADE_COMMAND_CONFIG, uaerc_path, &s_state->ipc);
        }
    }

    s_playing = (guarded_play(s_last_vpath, subsong) > 0);
}

EMSCRIPTEN_KEEPALIVE
void uade_wasm_stop(void) {
    if (!s_state) return;
    /* Do NOT call uade_stop() — it does complex IPC (send REBOOT+TOKEN,
     * read pending events) that doesn't work in our synchronous WASM shim.
     * The IPC dance triggers uadecore_handle_one_message() synchronously
     * which gets confused about core phase, causing "Expected score name"
     * and exit(1) crashes.
     *
     * Instead, just mark as not playing. The next uade_wasm_load() call
     * will do a full IPC reset via uade_shim_reset_for_load(). */
    s_playing = 0;
}

EMSCRIPTEN_KEEPALIVE
void uade_wasm_set_looping(int loop) {
    s_looping = loop;
}

/*
 * Enable/disable one-subsong mode.
 * When enabled, UADE stops playback after the first subsong ends instead of
 * advancing to the next subsong. Useful for audit renders that compare a single
 * subsong against a reference that also uses --one-subsong mode.
 * Must be called before uade_wasm_load().
 */
EMSCRIPTEN_KEEPALIVE
void uade_wasm_set_one_subsong(int on) {
    if (!s_state) return;
    s_state->config.one_subsong = on ? 1 : 0;
}

/*
 * Clean restart for looping — reset IPC and replay the song.
 * Returns 1 if restart succeeded, 0 if it failed.
 */
static int restart_for_loop(void) {
    uade_shim_reset_for_load();
    memset(&s_state->song, 0, sizeof(s_state->song));
    s_state->song.state = 0;
    s_state->ipc.state = 2;
    s_state->ipc.inputbytes = 0;
    uadecore_ipc.state = 0;
    uadecore_ipc.inputbytes = 0;
    {
        extern int uade_wasm_hw_initialized(void);
        if (!uade_wasm_hw_initialized()) {
            char uaerc_path[256];
            snprintf(uaerc_path, sizeof(uaerc_path), "%s/uaerc",
                     s_state->config.basedir.name);
            uade_send_string(UADE_COMMAND_CONFIG, uaerc_path, &s_state->ipc);
        }
    }
    return (guarded_play(s_last_vpath, -1) > 0) ? 1 : 0;
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

    /* Read int16 stereo interleaved from UADE (exit-guarded) */
    int16_t tmp[4096 * 2];
    int frames_needed = frames;
    int frames_done = 0;

    while (frames_done < frames_needed) {
        int chunk = frames_needed - frames_done;
        if (chunk > 4096) chunk = 4096;

        ssize_t nbytes = guarded_read(tmp, chunk * 4);
        if (nbytes < 0) {
            /* Error or song end */
            if (s_looping) {
                s_playing = restart_for_loop();
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
                s_playing = restart_for_loop();
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

    s_total_frames += frames_done;
    return 1;
}

/* ── Paula channel state for live pattern display ──────────────────────── */

/*
 * Include UADE core headers for Paula audio_channel[4] access.
 * sysconfig.h/sysdeps.h define uae_u16/uaecptr types needed by audio.h/custom.h.
 */
#include "sysconfig.h"
#include "sysdeps.h"
#include "audio.h"
#include "custom.h"

/* Called from cia.c once per CIA-A Timer A overflow (see cia.c CIA_update).
 * Increments the cumulative tick counter and, when tick snapshots are enabled,
 * captures the full 4-channel Paula state into the ring buffer.
 * Reads audio_channel[] directly — same mechanism as uade_wasm_get_channel_snapshot().
 */
static void rt_channel_log_tick(void);  /* forward declaration */

void uade_wasm_on_cia_a_tick(void) {
    g_uade_tick_count++;

    /* Real-time channel state logging (always runs when enabled) */
    rt_channel_log_tick();

    if (!g_tick_snap_enabled) return;

    uint32_t idx = g_tick_snap_write & TICK_SNAP_MASK;
    UadeTickSnapshot *snap = &g_tick_snaps[idx];
    snap->tick = g_uade_tick_count;

    for (int ch = 0; ch < 4; ch++) {
        snap->channels[ch].period    = (uint16_t)(audio_channel[ch].per & 0xFFFF);
        snap->channels[ch].volume    = (uint16_t)(audio_channel[ch].vol & 0xFFFF);
        snap->channels[ch].lc        = (uint32_t)audio_channel[ch].lc;
        snap->channels[ch].len       = (uint16_t)(audio_channel[ch].len & 0xFFFF);
        snap->channels[ch].dma_en    = dmaen(1 << ch) ? 1 : 0;

        /* Enhanced trigger detection:
         * 1. LC changed while DMA on (original: sample pointer change = new note)
         * 2. DMA just enabled (original: channel was off, now on)
         * 3. Period changed significantly while DMA on and LC unchanged
         *    (compiled replayers reuse same sample for different pitched notes)
         *    Threshold: period ratio > 1.06 (~1 semitone) to avoid vibrato false positives
         * 4. Volume went from 0 to >0 while DMA on (note-on after silence)
         */
        uint32_t curr_lc     = snap->channels[ch].lc;
        uint8_t  curr_dma    = snap->channels[ch].dma_en;
        uint16_t curr_period = snap->channels[ch].period;
        uint16_t curr_volume = snap->channels[ch].volume;
        uint8_t  triggered   = 0;

        if (curr_dma) {
            if (curr_lc != g_prev_lc[ch] || !g_prev_dma[ch]) {
                /* Case 1 & 2: LC changed or DMA just enabled */
                triggered = 1;
            } else if (curr_period > 0 && g_prev_period[ch] > 0) {
                /* Case 3: significant period change (>1 semitone) on same sample */
                uint16_t hi = curr_period > g_prev_period[ch] ? curr_period : g_prev_period[ch];
                uint16_t lo = curr_period > g_prev_period[ch] ? g_prev_period[ch] : curr_period;
                /* ratio > 1.06 ≈ 1 semitone (2^(1/12) ≈ 1.0595) */
                /* Use integer: hi * 100 > lo * 106 to avoid float */
                if ((uint32_t)hi * 100 > (uint32_t)lo * 106) {
                    triggered = 1;
                }
            }
            if (!triggered && curr_volume > 0 && g_prev_volume[ch] == 0 && g_prev_dma[ch]) {
                /* Case 4: volume from zero while DMA was already on */
                triggered = 1;
            }
        }
        snap->channels[ch].triggered = triggered;
        g_prev_lc[ch]     = curr_lc;
        g_prev_dma[ch]    = curr_dma;
        g_prev_period[ch] = curr_period;
        g_prev_volume[ch] = curr_volume;
    }
    g_tick_snap_write++;
}

/*
 * Write 4-channel snapshot into caller-provided buffer.
 * Layout per channel (4 uint32s = 16 bytes): period, volume, dmaen, sample_ptr
 * Total: 4 channels * 4 * 4 = 64 bytes
 *
 * Reads directly from audio_channel[4] — the Paula chip emulation registers
 * that all 130+ eagleplayer formats write to.
 */
EMSCRIPTEN_KEEPALIVE
void uade_wasm_get_channel_snapshot(uint32_t *out) {
    for (int i = 0; i < 4; i++) {
        int base = i * 4;
        out[base + 0] = (uint32_t)audio_channel[i].per;  /* AUDxPER (Amiga period) */
        out[base + 1] = (uint32_t)audio_channel[i].vol;  /* AUDxVOL (0-64) */
        out[base + 2] = dmaen(1 << i) ? 1 : 0;           /* DMA enabled for this channel */
        out[base + 3] = (uint32_t)audio_channel[i].lc;   /* Sample start address (instrument ID) */
    }
}

/* ── Extended channel state for enhanced scanning ──────────────────────── */

/*
 * Write extended 4-channel snapshot into caller-provided buffer.
 * Layout per channel (8 uint32s = 32 bytes): period, volume, dmaen,
 * lc (sample start), pt (current pointer), len (words), wper, wlen
 * Total: 4 channels * 8 * 4 = 128 bytes
 */
EMSCRIPTEN_KEEPALIVE
void uade_wasm_get_channel_extended(uint32_t *out) {
    for (int i = 0; i < 4; i++) {
        int base = i * 8;
        out[base + 0] = (uint32_t)audio_channel[i].per;     /* AUDxPER (Amiga period) */
        out[base + 1] = (uint32_t)audio_channel[i].vol;     /* AUDxVOL (0-64) */
        out[base + 2] = dmaen(1 << i) ? 1 : 0;              /* DMA enabled */
        out[base + 3] = (uint32_t)audio_channel[i].lc;      /* Sample start address */
        out[base + 4] = (uint32_t)audio_channel[i].pt;      /* Current sample pointer */
        out[base + 5] = (uint32_t)audio_channel[i].len;     /* Sample length (words) */
        out[base + 6] = (uint32_t)audio_channel[i].wper;    /* Write period (pending) */
        out[base + 7] = (uint32_t)audio_channel[i].wlen;    /* Write length (pending) */
    }
}

/* ── CIA timer state for BPM/tempo detection ───────────────────────────── */

#include "cia.h"

/*
 * Write CIA timer state into caller-provided buffer.
 * Layout: ciaata, ciaatb, ciabta, ciabtb, vblank_hz
 * Total: 5 * 4 = 20 bytes
 */
EMSCRIPTEN_KEEPALIVE
void uade_wasm_get_cia_state(uint32_t *out) {
    out[0] = (uint32_t)ciaata;       /* CIA-A Timer A */
    out[1] = (uint32_t)ciaatb;       /* CIA-A Timer B */
    out[2] = (uint32_t)ciabta;       /* CIA-B Timer A (BPM timer) */
    out[3] = (uint32_t)ciabtb;       /* CIA-B Timer B */
    out[4] = (uint32_t)vblank_hz;    /* 50 (PAL) or 60 (NTSC) */
}

/* ── Read Amiga memory for sample extraction ───────────────────────────── */

#include "memory.h"

/*
 * Read `len` bytes from Amiga address space into caller-provided buffer.
 * Uses byteget() which goes through UAE memory banking (chip RAM, etc.).
 * Returns 0 on success.
 */
EMSCRIPTEN_KEEPALIVE
int uade_wasm_read_memory(uint32_t addr, uint8_t *out, uint32_t len) {
    for (uint32_t i = 0; i < len; i++) {
        out[i] = (uint8_t)byteget(addr + i);
    }
    return 0;
}

/*
 * Write `length` bytes from `data` into Amiga address space.
 * Uses put_byte() which goes through UAE memory banking (chip RAM, etc.).
 * Returns 0 on success.
 * Used to write back edited PCM sample data to chip RAM.
 */
EMSCRIPTEN_KEEPALIVE
int uade_wasm_write_memory(uint32_t addr, const uint8_t *data, uint32_t length) {
    for (uint32_t i = 0; i < length; i++) {
        put_byte(addr + i, data[i]);
    }
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int uade_wasm_get_total_frames(void) {
    return s_total_frames;
}

/* ── Per-channel mute mask ──────────────────────────────────────────────── */

/*
 * Global mute mask referenced by audio.c sample handlers.
 * Bits 0-3 = channels 0-3; 1=active, 0=muted. Default 0x0F (all active).
 */
unsigned char uade_wasm_channel_mute_mask = 0x0F;

/*
 * Set per-channel mute mask.
 * channel_mask: bits 0-3 = channels 0-3; 1=active, 0=muted.
 * E.g. 0x01 = only channel 0 active (channels 1,2,3 muted).
 */
EMSCRIPTEN_KEEPALIVE
void uade_wasm_mute_channels(uint8_t channel_mask) {
    uade_wasm_channel_mute_mask = channel_mask;
}

/*
 * Read per-channel Paula output captured during the last uade_wasm_render() call.
 * Each channel's audio is written to separate float32 buffers (mono, not stereo).
 * Returns number of frames available (same as last render call).
 * Note: Paula channels 0+3 = left, 1+2 = right in the stereo mix.
 */
extern int uade_audio_read_channel_samples(float *ch0, float *ch1, float *ch2, float *ch3, int max_frames);

EMSCRIPTEN_KEEPALIVE
int uade_wasm_read_channel_samples(float *ch0, float *ch1, float *ch2, float *ch3, int max_frames) {
    return uade_audio_read_channel_samples(ch0, ch1, ch2, ch3, max_frames);
}

EMSCRIPTEN_KEEPALIVE
void uade_wasm_cleanup(void) {
    if (s_state) {
        uade_cleanup_state(s_state);
        s_state = NULL;
    }
    s_playing = 0;
}

/*
 * Full in-place reset — destroys and recreates UADE state without
 * allocating a new Emscripten/WASM module instance.
 *
 * This is the preferred way to recover from "score died" / load failures.
 * Unlike creating a new createUADE() instance (~2.5 MB WebAssembly.Memory
 * that can't be GC'd from the AudioWorklet thread), this reuses the
 * existing WASM memory and just reinitializes the UADE engine.
 *
 * Returns 0 on success, -1 on failure.
 */
EMSCRIPTEN_KEEPALIVE
int uade_wasm_full_reset(void) {
    /* Stop playback */
    s_playing = 0;
    s_paused  = 0;
    s_looping = 0;

    /* Destroy old UADE state (frees all resources, resets shim IPC) */
    if (s_state) {
        uade_cleanup_state(s_state);
        s_state = NULL;
    }

    /* Reset all entry.c counters and ring buffers */
    s_total_frames = 0;
    s_pcm_read  = 0;
    s_pcm_write = 0;
    g_uade_tick_count   = 0;
    g_paula_log_read    = 0;
    g_paula_log_write   = 0;
    g_paula_log_enabled = 0;
    g_tick_snap_write   = 0;
    g_tick_snap_read    = 0;
    g_tick_snap_enabled = 0;
    memset(g_prev_lc,     0, sizeof(g_prev_lc));
    memset(g_prev_dma,    0, sizeof(g_prev_dma));
    memset(g_prev_period, 0, sizeof(g_prev_period));
    memset(g_prev_volume, 0, sizeof(g_prev_volume));

    /* Create fresh UADE state — virtual FS is already populated from
     * the initial uade_wasm_init() call, no need to redo it. */
    struct uade_config *cfg = uade_new_config();
    if (!cfg) return -1;

    uade_config_set_option(cfg, UC_BASE_DIR, "/uade");
    uade_config_set_option(cfg, UC_FREQUENCY,
        s_sample_rate == 44100 ? "44100" : "48000");
    uade_config_set_option(cfg, UC_PANNING_VALUE, "1.0");

    if (guarded_new_state(cfg) != 0) {
        free(cfg);
        return -1;
    }
    free(cfg);
    return 0;
}

/* ── CIA-A tick counter exports ──────────────────────────────────────────── */

/*
 * Reset the cumulative CIA-A tick counter to zero.
 * Called automatically by uade_wasm_load() and uade_wasm_set_subsong().
 * May also be called manually before starting an enhanced scan.
 */
EMSCRIPTEN_KEEPALIVE
void uade_wasm_reset_tick_count(void) {
    g_uade_tick_count = 0;
    g_paula_log_read  = 0;
    g_paula_log_write = 0;
}

/* ── Paula log exports ──────────────────────────────────────────────────── */

/*
 * Enable or disable Paula write logging.
 * When enabling, the ring buffer is cleared (read = write = 0).
 * Called by the worklet around _scanSongEnhanced() to capture only scan data.
 */
EMSCRIPTEN_KEEPALIVE
void uade_wasm_enable_paula_log(int enable) {
    g_paula_log_enabled = enable ? 1 : 0;
    if (enable) {
        g_paula_log_read  = 0;
        g_paula_log_write = 0;
    }
}

/*
 * Drain up to maxEntries entries from the Paula log into `out`.
 * Output format per entry (3 uint32s):
 *   [0] = (channel<<24)|(reg<<16)|value
 *   [1] = source_addr (chip RAM address that sourced the value)
 *   [2] = tick        (CIA-A tick count at write time)
 * Returns the number of entries written.
 */
EMSCRIPTEN_KEEPALIVE
int uade_wasm_get_paula_log(uint32_t *out, int maxEntries) {
    int count = 0;
    while (count < maxEntries && g_paula_log_read != g_paula_log_write) {
        uint32_t idx = g_paula_log_read & PAULA_LOG_MASK;
        UadePaulaLogEntry *e = &g_paula_log[idx];
        out[count * 3 + 0] = ((uint32_t)e->channel << 24) |
                             ((uint32_t)e->reg     << 16) |
                              (uint32_t)e->value;
        out[count * 3 + 1] = e->source_addr;
        out[count * 3 + 2] = e->tick;
        g_paula_log_read++;
        count++;
    }
    return count;
}

/*
 * Return the current cumulative CIA-A Timer A tick count.
 * Each tick corresponds to one musical tick (typically 1/50s × speed).
 * Increases monotonically from 0 while the song plays.
 * Reset to 0 on each new load or subsong switch.
 */
EMSCRIPTEN_KEEPALIVE
uint32_t uade_wasm_get_tick_count(void) {
    return g_uade_tick_count;
}

/* ── CIA Tick Snapshot exports ──────────────────────────────────────────── */

/*
 * Enable or disable CIA tick snapshot capture.
 * When disabling, the ring buffer is cleared (read = write = 0).
 * Called by the worklet before/after enhanced scan to capture tick data.
 */
EMSCRIPTEN_KEEPALIVE
void uade_wasm_enable_tick_snapshots(int enable) {
    g_tick_snap_enabled = (uint8_t)(enable ? 1 : 0);
    if (!enable) {
        g_tick_snap_write = 0;
        g_tick_snap_read  = 0;
    }
    /* Reset per-channel trigger state when enabling/disabling */
    for (int i = 0; i < 4; i++) {
        g_prev_lc[i]     = 0;
        g_prev_dma[i]    = 0;
        g_prev_period[i] = 0;
        g_prev_volume[i] = 0;
    }
}

/*
 * Reset the tick snapshot ring buffer without disabling capture.
 * Useful to discard data accumulated before the scan region of interest.
 */
EMSCRIPTEN_KEEPALIVE
void uade_wasm_reset_tick_snapshots(void) {
    g_tick_snap_write = 0;
    g_tick_snap_read  = 0;
}

/*
 * Drain up to maxSnaps tick snapshots into out buffer.
 * Each snapshot = 13 uint32_t values:
 *   [0]      tick
 *   [1..3]   ch0: (period<<16|volume), lc, (len<<8|dma_en<<1|triggered)
 *   [4..6]   ch1: same layout
 *   [7..9]   ch2: same layout
 *   [10..12] ch3: same layout
 * Returns number of snapshots written.
 */
EMSCRIPTEN_KEEPALIVE
int uade_wasm_get_tick_snapshots(uint32_t *out, int maxSnaps) {
    int count = 0;
    while (count < maxSnaps && g_tick_snap_read != g_tick_snap_write) {
        uint32_t idx = g_tick_snap_read & TICK_SNAP_MASK;
        UadeTickSnapshot *s = &g_tick_snaps[idx];
        int base = count * 13;
        out[base + 0] = s->tick;
        for (int ch = 0; ch < 4; ch++) {
            UadeChannelTick *c = &s->channels[ch];
            out[base + 1 + ch * 3 + 0] = ((uint32_t)c->period << 16) | c->volume;
            out[base + 1 + ch * 3 + 1] = c->lc;
            out[base + 1 + ch * 3 + 2] = ((uint32_t)c->len << 8) |
                                          ((uint32_t)c->dma_en << 1) |
                                          (uint32_t)c->triggered;
        }
        g_tick_snap_read++;
        count++;
    }
    return count;
}

/* ── Memory watchpoints ─────────────────────────────────────────────────── */

#define WATCHPOINT_MAX    8
#define WP_HIT_LOG_SIZE  256
#define WP_HIT_LOG_MASK  (WP_HIT_LOG_SIZE - 1)
#define WP_MODE_READ  1
#define WP_MODE_WRITE 2
#define WP_MODE_BOTH  3

typedef struct {
    uint32_t addr;
    uint32_t size;
    uint8_t  mode;
    uint8_t  enabled;
} UadeWatchpoint;

typedef struct {
    uint32_t addr;
    uint32_t value;
    uint32_t tick;
    uint8_t  is_write;
    uint8_t  wp_slot;
} UadeWpHit;

static UadeWatchpoint g_watchpoints[WATCHPOINT_MAX];
static UadeWpHit      g_wp_hits[WP_HIT_LOG_SIZE];
static uint32_t g_wp_hit_write = 0;
static uint32_t g_wp_hit_read  = 0;

/*
 * Called from memory.c chipmem_bget (inside #ifdef UADE_WASM).
 * Checks whether the read address falls within any active read watchpoint.
 */
void uade_wasm_check_wp_read(uint32_t addr, uint32_t value) {
    for (int i = 0; i < WATCHPOINT_MAX; i++) {
        if (!g_watchpoints[i].enabled) continue;
        if (!(g_watchpoints[i].mode & WP_MODE_READ)) continue;
        if (addr < g_watchpoints[i].addr ||
            addr >= g_watchpoints[i].addr + g_watchpoints[i].size) continue;
        uint32_t idx = g_wp_hit_write++ & WP_HIT_LOG_MASK;
        g_wp_hits[idx].addr     = addr;
        g_wp_hits[idx].value    = value;
        g_wp_hits[idx].tick     = g_uade_tick_count;
        g_wp_hits[idx].is_write = 0;
        g_wp_hits[idx].wp_slot  = (uint8_t)i;
    }
}

/*
 * Called from memory.c chipmem_bput (inside #ifdef UADE_WASM).
 * Checks whether the write address falls within any active write watchpoint.
 */
void uade_wasm_check_wp_write(uint32_t addr, uint32_t value) {
    for (int i = 0; i < WATCHPOINT_MAX; i++) {
        if (!g_watchpoints[i].enabled) continue;
        if (!(g_watchpoints[i].mode & WP_MODE_WRITE)) continue;
        if (addr < g_watchpoints[i].addr ||
            addr >= g_watchpoints[i].addr + g_watchpoints[i].size) continue;
        uint32_t idx = g_wp_hit_write++ & WP_HIT_LOG_MASK;
        g_wp_hits[idx].addr     = addr;
        g_wp_hits[idx].value    = value;
        g_wp_hits[idx].tick     = g_uade_tick_count;
        g_wp_hits[idx].is_write = 1;
        g_wp_hits[idx].wp_slot  = (uint8_t)i;
    }
}

/*
 * Set a watchpoint slot.
 * slot: 0-7
 * addr: chip RAM address to watch
 * size: byte range to watch (typically 1)
 * mode: WP_MODE_READ(1), WP_MODE_WRITE(2), or WP_MODE_BOTH(3)
 */
EMSCRIPTEN_KEEPALIVE
void uade_wasm_set_watchpoint(int slot, uint32_t addr, uint32_t size, int mode) {
    if (slot < 0 || slot >= WATCHPOINT_MAX) return;
    g_watchpoints[slot].addr    = addr;
    g_watchpoints[slot].size    = size;
    g_watchpoints[slot].mode    = (uint8_t)mode;
    g_watchpoints[slot].enabled = 1;
}

EMSCRIPTEN_KEEPALIVE
void uade_wasm_clear_watchpoint(int slot) {
    if (slot < 0 || slot >= WATCHPOINT_MAX) return;
    g_watchpoints[slot].enabled = 0;
}

EMSCRIPTEN_KEEPALIVE
void uade_wasm_clear_all_watchpoints(void) {
    for (int i = 0; i < WATCHPOINT_MAX; i++)
        g_watchpoints[i].enabled = 0;
    g_wp_hit_read  = 0;
    g_wp_hit_write = 0;
}

/*
 * Drain up to maxHits watchpoint hits into `out`.
 * Output format per hit (4 uint32s):
 *   [0] = addr
 *   [1] = value
 *   [2] = tick
 *   [3] = (is_write<<8)|wp_slot
 * Returns the number of hits written.
 */
EMSCRIPTEN_KEEPALIVE
int uade_wasm_get_watchpoint_hits(uint32_t *out, int maxHits) {
    int count = 0;
    while (count < maxHits && g_wp_hit_read != g_wp_hit_write) {
        uint32_t idx = g_wp_hit_read & WP_HIT_LOG_MASK;
        UadeWpHit *h = &g_wp_hits[idx];
        out[count * 4 + 0] = h->addr;
        out[count * 4 + 1] = h->value;
        out[count * 4 + 2] = h->tick;
        out[count * 4 + 3] = ((uint32_t)h->is_write << 8) | (uint32_t)h->wp_slot;
        g_wp_hit_read++;
        count++;
    }
    return count;
}

/* ── String read from Amiga chip RAM ────────────────────────────────────── */

/*
 * Read a null-terminated C string from Amiga address space at `addr`
 * into the caller-provided `out` buffer.  Reads at most `maxlen-1` bytes,
 * always null-terminates `out`.
 *
 * Returns the number of bytes copied (excluding null terminator),
 * or 0 if addr is out of range, empty, or maxlen <= 0.
 *
 * Used by the JS layer to efficiently read instrument names at known
 * format-specific Amiga addresses without pulling large memory blocks.
 */
EMSCRIPTEN_KEEPALIVE
int uade_wasm_read_string(uint32_t addr, char *out, int maxlen) {
    if (maxlen <= 0) return 0;
    int i;
    for (i = 0; i < maxlen - 1; i++) {
        uint8_t c = (uint8_t)byteget(addr + i);
        if (c == 0) break;
        out[i] = (char)c;
    }
    out[i] = '\0';
    return i;
}

/*
 * Write a companion file into MEMFS /uade/ directory so UADE can find it
 * when the Amiga-side player requests it as a relative path.
 *
 * TFMX-Pro uses two files: mdat.* (module) and smpl.* (samples).
 * The eagleplayer resolves companion files relative to the module's directory.
 * Since the module is written to /uade/<filename>, companions must also be
 * in /uade/ for relative path resolution to work.
 *
 * Returns 0 on success, -1 on failure.
 */
EMSCRIPTEN_KEEPALIVE
int uade_wasm_add_extra_file(const char *filename, const uint8_t *data, size_t len) {
    char path[512];
    snprintf(path, sizeof(path), "/uade/%s", filename);

    /* Create intermediate directories (e.g. /uade/Samples/ for ZoundMonitor) */
    {
        char dir[512];
        strncpy(dir, path, sizeof(dir) - 1);
        dir[sizeof(dir) - 1] = '\0';
        for (char *p = dir + 1; *p; p++) {
            if (*p == '/') {
                *p = '\0';
                mkdir(dir, 0755);  /* ignore errors — may already exist */
                *p = '/';
            }
        }
    }

    FILE *f = fopen(path, "wb");
    if (!f) {
        fprintf(stderr, "[uade-wasm] Cannot write companion file: %s\n", path);
        return -1;
    }
    fwrite(data, 1, len, f);
    fclose(f);
    fprintf(stderr, "[uade-wasm] Companion file written: %s (%zu bytes)\n", path, len);
    return 0;
}

/* ── 68k Register Access ───────────────────────────────────────────────── */

/* The regstruct is defined in newcpu.h with many dependencies.
 * We declare just the parts we need via the extern symbol 'regs'.
 * The first 16 uint32s are D0-D7,A0-A7. PC follows at a known offset.
 * We access it as raw memory to avoid header dependency issues. */
struct _uade_regs_partial {
    uint32_t regs[16];
    /* After regs[16]: usp(4), isp(4), msp(4), sr(2), t1(1), t0(1), s(1), m(1), x(1), stopped(1), intmask(4) = 24 bytes */
    /* Then: pc(4) at offset 16*4 + 24 = 88 */
};
extern struct _uade_regs_partial regs;

/*
 * Read a 68k register by index.
 * Registers 0-7 = D0-D7 (data), 8-15 = A0-A7 (address), 16 = PC, 17 = SR.
 */
EMSCRIPTEN_KEEPALIVE
uint32_t uade_wasm_get_register(int reg) {
    if (reg >= 0 && reg <= 15) return regs.regs[reg];
    if (reg == 16) {
        /* PC is at byte offset 88 from start of regs struct */
        uint8_t *base = (uint8_t *)&regs;
        uint32_t pc;
        memcpy(&pc, base + 88, 4);
        return pc;
    }
    if (reg == 17) {
        /* SR is at byte offset 76 (after regs[16] + usp + isp + msp = 64+4+4+4=76) */
        uint8_t *base = (uint8_t *)&regs;
        uint16_t sr;
        memcpy(&sr, base + 76, 2);
        return (uint32_t)sr;
    }
    return 0;
}

/*
 * Read all 68k registers into caller buffer.
 * Layout: D0-D7 (8), A0-A7 (8), PC (1), SR (1) = 18 uint32s
 */
EMSCRIPTEN_KEEPALIVE
void uade_wasm_get_all_registers(uint32_t *out) {
    for (int i = 0; i < 16; i++) out[i] = regs.regs[i];
    uint8_t *base = (uint8_t *)&regs;
    uint32_t pc; memcpy(&pc, base + 88, 4); out[16] = pc;
    uint16_t sr; memcpy(&sr, base + 76, 2); out[17] = (uint32_t)sr;
}

/* ── Real-time per-tick channel state ring buffer ──────────────────────── */

/*
 * Per-tick channel state, captured during uade_wasm_render() on every CIA-A tick.
 * This provides continuous channel state (not just during enhanced scan).
 * The worklet can drain this to update the UI with per-channel instrument/note info.
 */

#define RT_CHAN_LOG_SIZE  512
#define RT_CHAN_LOG_MASK  (RT_CHAN_LOG_SIZE - 1)

typedef struct {
    uint32_t tick;
    uint16_t period[4];
    uint8_t  volume[4];
    uint32_t sample_ptr[4];
    uint8_t  dma[4];
} RtChannelState;

static RtChannelState g_rt_chan_log[RT_CHAN_LOG_SIZE];
static volatile uint32_t g_rt_chan_write = 0;
static volatile uint32_t g_rt_chan_read  = 0;
static int g_rt_chan_enabled = 0;

EMSCRIPTEN_KEEPALIVE
void uade_wasm_enable_rt_channel_log(int enable) {
    g_rt_chan_enabled = enable ? 1 : 0;
    if (enable) { g_rt_chan_read = 0; g_rt_chan_write = 0; }
}

/* Called from uade_wasm_on_cia_a_tick() — captures channel state every tick */
static void rt_channel_log_tick(void) {
    if (!g_rt_chan_enabled) return;
    uint32_t idx = g_rt_chan_write & RT_CHAN_LOG_MASK;
    RtChannelState *s = &g_rt_chan_log[idx];
    s->tick = g_uade_tick_count;
    for (int i = 0; i < 4; i++) {
        s->period[i]     = (uint16_t)audio_channel[i].per;
        s->volume[i]     = (uint8_t)audio_channel[i].vol;
        s->sample_ptr[i] = (uint32_t)audio_channel[i].lc;
        s->dma[i]        = dmaen(1 << i) ? 1 : 0;
    }
    g_rt_chan_write++;
}

/*
 * Drain up to maxEntries from the real-time channel log.
 * Output per entry (13 uint32s):
 *   [0] = tick
 *   [1..4] = (period<<16)|volume for channels 0-3
 *   [5..8] = sample_ptr for channels 0-3
 *   [9..12] = dma for channels 0-3
 * Returns number of entries written.
 */
EMSCRIPTEN_KEEPALIVE
int uade_wasm_get_rt_channel_log(uint32_t *out, int maxEntries) {
    int count = 0;
    while (count < maxEntries && g_rt_chan_read != g_rt_chan_write) {
        uint32_t idx = g_rt_chan_read & RT_CHAN_LOG_MASK;
        RtChannelState *s = &g_rt_chan_log[idx];
        int base = count * 13;
        out[base + 0] = s->tick;
        for (int i = 0; i < 4; i++) {
            out[base + 1 + i] = ((uint32_t)s->period[i] << 16) | s->volume[i];
            out[base + 5 + i] = s->sample_ptr[i];
            out[base + 9 + i] = s->dma[i];
        }
        g_rt_chan_read++;
        count++;
    }
    return count;
}
