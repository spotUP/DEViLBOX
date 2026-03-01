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

/* Sample rate for the WASM module (set at init) */
static int s_sample_rate = 44100;

/* ── CIA-A tick counter ──────────────────────────────────────────────────── */
/* Counts cumulative CIA-A Timer A overflows (= musical ticks) since last load.
 * Incremented by uade_wasm_on_cia_a_tick() which is called from cia.c
 * when CIA-A Timer A fires (via UADE_WASM hook in cia.c CIA_update()).
 * Used by the JS enhanced scan to derive row boundaries precisely. */
static uint32_t g_uade_tick_count = 0;

/* Called from cia.c once per CIA-A Timer A overflow (see cia.c CIA_update). */
void uade_wasm_on_cia_a_tick(void) {
    g_uade_tick_count++;
}

/* ── Paula write log ────────────────────────────────────────────────────── */
#include "paula_log.h"

/* Forward declaration — defined in memory.c (full extern in memory.h below) */
extern uint32_t g_uade_last_chip_read_addr;

static UadePaulaLogEntry g_paula_log[PAULA_LOG_SIZE];
static uint32_t g_paula_log_write   = 0;
static uint32_t g_paula_log_read    = 0;
static uint8_t  g_paula_log_enabled = 0;

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

    fprintf(stderr, "[uade-wasm] After uade_new_state: IPC state=%d, in_fd=%d, out_fd=%d\n",
            s_state->ipc.state, s_state->ipc.in_fd, s_state->ipc.out_fd);

    s_playing = 0;
    s_paused  = 0;
    return 0;
}

EMSCRIPTEN_KEEPALIVE
int uade_wasm_load(const uint8_t *data, size_t len, const char *filename_hint) {
    if (!s_state) return -1;

    /* Mark as not playing (do NOT call uade_stop() — it does complex IPC
     * that doesn't work in our synchronous WASM shim) */
    s_playing = 0;

    /* Reset PCM buffer, frame counter, and tick counter */
    s_pcm_read = 0;
    s_pcm_write = 0;
    s_total_frames = 0;
    g_uade_tick_count = 0;

    /* Write the file to MEMFS so UADE can open it */
    const char *vpath = "/uade/song";
    FILE *f = fopen(vpath, "wb");
    if (!f) {
        fprintf(stderr, "[uade-wasm] Cannot write to MEMFS: %s\n", vpath);
        return -1;
    }
    fwrite(data, 1, len, f);
    fclose(f);

    /* ── Reset IPC state for clean load ──
     *
     * Clears ring buffers (removes stale messages from previous play/stop
     * cycles or failed loads), resets core phase, and sets IPC states to
     * the expected pre-play configuration:
     *   - Frontend IPC: S_STATE (2) — ready to send SCORE+player+module
     *   - Core IPC: INITIAL_STATE (0) — first receive transitions to R_STATE
     *   - Core phase: 2 (if hardware initialized) or 1 (first load)
     *   - Ring buffers: empty
     *
     * Also reset frontend song state to avoid stale resource pointers.
     */
    uade_shim_reset_for_load();

    /* Reset frontend song state (replaces uade_stop's resource cleanup) */
    memset(&s_state->song, 0, sizeof(s_state->song));
    s_state->song.state = 0;  /* UADE_STATE_INVALID */

    /* Reset IPC state machines */
    s_state->ipc.state = 2;    /* UADE_S_STATE — frontend ready to send */
    s_state->ipc.inputbytes = 0;  /* Clear any buffered partial messages */
    uadecore_ipc.state = 0;    /* UADE_INITIAL_STATE — core awaits first receive */
    uadecore_ipc.inputbytes = 0;

    /* For the first load, CONFIG must be in CMD buffer for phase 1
     * (hardware init). We cleared it above, so re-send it.
     * For subsequent loads (hw already initialized, core phase=2),
     * CONFIG is NOT needed — phase 2 reads SCORE directly. */
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
            fprintf(stderr, "[uade-wasm] First load: sent CONFIG, core phase=1\n");
        } else {
            fprintf(stderr, "[uade-wasm] Reload: hw initialized, core phase=2\n");
        }
    }

    /* Start playback from the MEMFS file (exit-guarded) */
    int ret = guarded_play(vpath, -1);
    if (ret <= 0) {
        /* Try from buffer directly */
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

    s_playing = (guarded_play("/uade/song", subsong) > 0);
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
    return (guarded_play("/uade/song", -1) > 0) ? 1 : 0;
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

EMSCRIPTEN_KEEPALIVE
void uade_wasm_cleanup(void) {
    if (s_state) {
        uade_cleanup_state(s_state);
        s_state = NULL;
    }
    s_playing = 0;
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
 * Write a companion file into MEMFS root ("/") so UADE can find it when
 * the Amiga-side player requests it as a relative path.
 *
 * TFMX-Pro uses two files: mdat.* (module) and smpl.* (samples).
 * The eagleplayer requests "smpl.filename" as a relative path, which
 * uade_find_amiga_file resolves via "./smpl.filename" (CWD = "/").
 * Writing the file here as "/filename" makes it findable.
 *
 * Returns 0 on success, -1 on failure.
 */
EMSCRIPTEN_KEEPALIVE
int uade_wasm_add_extra_file(const char *filename, const uint8_t *data, size_t len) {
    char path[512];
    snprintf(path, sizeof(path), "/%s", filename);

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
