/*
 * Sonix WASM harness
 * Wraps the Sonix C library for Emscripten/AudioWorklet playback.
 *
 * Song data + sidecar instrument files are loaded via JS and passed
 * through the WASM API. The harness provides I/O callbacks that serve
 * instrument data from a pre-loaded in-memory filesystem.
 */

#include "sonix/sonix.c"    /* unity build */
#include "sonix/sonix_io.c"

#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

/* ---- In-memory filesystem for sidecar instruments ---- */

#define MAX_MEMFS_FILES 256

typedef struct {
    char path[256];
    uint8_t *data;
    uint32_t size;
} MemFsEntry;

static MemFsEntry g_memfs[MAX_MEMFS_FILES];
static int g_memfs_count = 0;

/* I/O callback: read file from in-memory FS */
static bool memfs_read_file(const char *path, uint8_t **out_data,
                            uint32_t *out_size, void *user_data) {
    (void)user_data;
    for (int i = 0; i < g_memfs_count; i++) {
        if (strcmp(g_memfs[i].path, path) == 0) {
            uint8_t *copy = (uint8_t *)malloc(g_memfs[i].size);
            if (!copy) return false;
            memcpy(copy, g_memfs[i].data, g_memfs[i].size);
            *out_data = copy;
            *out_size = g_memfs[i].size;
            return true;
        }
    }
    return false;
}

/* Visitor context for directory listing */
typedef struct {
    void (*visitor)(const char *filename, void *ctx);
    void *ctx;
    int count;
} ListDirCtx;

static void memfs_list_visitor(const char *dir_prefix, int dir_len,
                               MemFsEntry *entry, ListDirCtx *lctx) {
    /* Check if entry path starts with dir_prefix/ */
    if (strncmp(entry->path, dir_prefix, (size_t)dir_len) != 0)
        return;
    if (entry->path[dir_len] != '/')
        return;
    const char *rest = entry->path + dir_len + 1;
    /* Only direct children (no further slashes) */
    if (strchr(rest, '/') != NULL)
        return;
    /* add_sidecar_dir() probes existence with a NULL visitor — count only, never call. */
    if (lctx->visitor)
        lctx->visitor(rest, lctx->ctx);
    lctx->count++;
}

/* I/O callback: list directory from in-memory FS */
static int memfs_list_dir(const char *dir_path,
                          void (*visitor)(const char *filename, void *ctx),
                          void *ctx, void *user_data) {
    (void)user_data;
    int dir_len = (int)strlen(dir_path);
    /* Strip trailing slash */
    while (dir_len > 0 && dir_path[dir_len - 1] == '/')
        dir_len--;

    ListDirCtx lctx = { visitor, ctx, 0 };
    for (int i = 0; i < g_memfs_count; i++) {
        memfs_list_visitor(dir_path, dir_len, &g_memfs[i], &lctx);
    }
    return lctx.count > 0 ? 0 : -1;
}

/* ---- State ---- */

static SonixSong *g_song = NULL;
static uint8_t *g_song_buf = NULL;
static uint32_t g_sample_rate = 48000;

/* ---- Public API ---- */

/* Register a file in the in-memory filesystem (call before sonix_init) */
EXPORT void sonix_memfs_add(const char *path, const uint8_t *data, uint32_t size) {
    if (g_memfs_count >= MAX_MEMFS_FILES) return;
    MemFsEntry *e = &g_memfs[g_memfs_count++];
    strncpy(e->path, path, sizeof(e->path) - 1);
    e->path[sizeof(e->path) - 1] = '\0';
    e->data = (uint8_t *)malloc(size);
    if (e->data) {
        memcpy(e->data, data, size);
        e->size = size;
    }
}

/* Clear the in-memory filesystem */
EXPORT void sonix_memfs_clear(void) {
    for (int i = 0; i < g_memfs_count; i++) {
        free(g_memfs[i].data);
        g_memfs[i].data = NULL;
    }
    g_memfs_count = 0;
}

/* ---- Standalone single-note synth audition (no song file) ----
 * The editor previews a synth instrument by rendering ONE note through the real
 * Sonix synth path. sonix_init_scratch() allocates a bare g_song (no module);
 * the caller then pushes the instrument's params via the sonix_synth_set_* API
 * and calls sonix_render_synth_note() for an offline mono buffer. */
EXPORT int sonix_init_scratch(int numInstruments) {
    (void)numInstruments; /* all 64 instrument slots always exist in SonixSong */
    if (g_song) {
        sonix_song_destroy(g_song);
        g_song = NULL;
    }
    if (g_song_buf) {
        free(g_song_buf);
        g_song_buf = NULL;
    }
    g_song = sonix_song_create_scratch();
    if (!g_song) return -1;
    sonix_song_set_sample_rate(g_song, g_sample_rate);
    return 0;
}

EXPORT int sonix_render_synth_note(int inst, int note, int velocity, int num_frames, float *out) {
    if (!g_song) return 0;
    return sonix_song_render_synth_note(g_song, inst, note, velocity, num_frames, out);
}

EXPORT int sonix_init(const uint8_t *module_data, uint32_t module_size) {
    /* Clean up previous */
    if (g_song) {
        sonix_song_destroy(g_song);
        g_song = NULL;
    }
    if (g_song_buf) {
        free(g_song_buf);
        g_song_buf = NULL;
    }

    /* Copy module data (library keeps pointer) */
    g_song_buf = (uint8_t *)malloc(module_size);
    if (!g_song_buf) return -1;
    memcpy(g_song_buf, module_data, module_size);

    /* Create with memfs I/O callbacks */
    SonixIoCallbacks io = {
        .read_file = memfs_read_file,
        .list_dir = memfs_list_dir,
        .user_data = NULL
    };
    g_song = sonix_song_create(g_song_buf, module_size, &io);
    if (!g_song) return -2;

    const SonixSongMetadata *meta = sonix_song_get_metadata(g_song);
    if (!meta || !meta->valid) {
        const char *err = sonix_song_get_error(g_song);
        (void)err; /* could log */
        return -3;
    }

    sonix_song_set_sample_rate(g_song, g_sample_rate);
    sonix_song_set_stereo_mix(g_song, 0.7f); /* moderate stereo separation */

    return 0;
}

/* Load sidecar instruments after init. song_file_path is used to derive
 * instrument directory paths (the memfs must be populated first). */
EXPORT int sonix_load_instruments(const char *song_file_path) {
    if (!g_song) return -1;
    return sonix_song_load_instruments(g_song, song_file_path);
}

EXPORT void sonix_start(void) {
    if (g_song) {
        sonix_song_start(g_song);
    }
}

EXPORT void sonix_stop(void) {
    if (g_song) {
        sonix_song_destroy(g_song);
        g_song = NULL;
    }
    if (g_song_buf) {
        free(g_song_buf);
        g_song_buf = NULL;
    }
}

EXPORT int sonix_render(float *buf, int frames) {
    if (!g_song) return 0;
    return sonix_song_decode(g_song, buf, frames);
}

EXPORT void sonix_set_sample_rate(uint32_t rate) {
    g_sample_rate = rate;
    if (g_song) {
        sonix_song_set_sample_rate(g_song, rate);
    }
}

EXPORT void sonix_set_solo_channel(int32_t channel) {
    if (g_song) {
        sonix_song_set_solo_channel(g_song, channel);
    }
}

EXPORT void sonix_set_mute_mask(uint32_t mask) {
    if (g_song) {
        sonix_song_set_channel_mute_mask(g_song, mask);
    }
}

EXPORT void sonix_set_stereo_mix(float mix) {
    if (g_song) {
        sonix_song_set_stereo_mix(g_song, mix);
    }
}

EXPORT int sonix_get_format(void) {
    if (!g_song) return 0;
    const SonixSongMetadata *meta = sonix_song_get_metadata(g_song);
    return meta ? (int)meta->format : 0;
}

EXPORT int sonix_get_num_channels(void) {
    if (!g_song) return 0;
    const SonixSongMetadata *meta = sonix_song_get_metadata(g_song);
    return meta ? (int)meta->num_channels : 0;
}

EXPORT int sonix_get_num_instruments(void) {
    if (!g_song) return 0;
    const SonixSongMetadata *meta = sonix_song_get_metadata(g_song);
    return meta ? (int)meta->num_ins_chunks : 0;
}

EXPORT int sonix_get_num_samples(void) {
    if (!g_song) return 0;
    const SonixSongMetadata *meta = sonix_song_get_metadata(g_song);
    return meta ? (int)meta->num_real_samples : 0;
}

EXPORT const char *sonix_get_format_name(void) {
    if (!g_song) return "UNKNOWN";
    const SonixSongMetadata *meta = sonix_song_get_metadata(g_song);
    return meta ? sonix_format_name(meta->format) : "UNKNOWN";
}

EXPORT const char *sonix_get_error(void) {
    if (!g_song) return "";
    return sonix_song_get_error(g_song);
}

EXPORT const char *sonix_get_instrument_name(uint8_t index) {
    if (!g_song) return "";
    return sonix_song_get_instrument_name(g_song, index);
}

EXPORT int sonix_is_finished(void) {
    if (!g_song) return 1;
    return sonix_song_is_finished(g_song) ? 1 : 0;
}

/* ---- Per-channel scope capture for the oscilloscope / VU meters ---- */

/* Number of valid frames captured in the last sonix_render() call. */
EXPORT int sonix_get_scope_count(void) {
    return g_song ? g_song->scope_count : 0;
}

/* Copy channel `ch`'s captured scope samples into `out` (int16), up to maxlen. */
EXPORT void sonix_get_channel_scope(int ch, int16_t *out, int maxlen) {
    if (g_song && out && ch >= 0 && ch < SONIX_NUM_CHANNELS) {
        int n = g_song->scope_count;
        if (n > maxlen) n = maxlen;
        if (n > 0) memcpy(out, g_song->scope_buf[ch], (size_t)n * 2);
    }
}

/* ---- First-class synth: per-instrument parameter get/set ----
 * The harness unity-includes sonix.c, so getters read struct fields directly.
 * Setters wrap the sonix_song_set_synth_* API (set_wave recomputes the filter bank).
 * All operate on the loaded g_song; index is the 0-63 instrument slot. */

#define SNX_OK(i) (g_song && (i) >= 0 && (i) < 64)

EXPORT int sonix_synth_is_synth(int i)         { return SNX_OK(i) ? (g_song->instrument_is_synth[i] ? 1 : 0) : 0; }
EXPORT int sonix_synth_get_base_vol(int i)     { return SNX_OK(i) ? (int)g_song->synth_base_vol[i] : 0; }
EXPORT int sonix_synth_get_port_flag(int i)    { return SNX_OK(i) ? (int)g_song->synth_port_flag[i] : 0; }
EXPORT int sonix_synth_get_c2(int i)           { return SNX_OK(i) ? (int)g_song->synth_c2[i] : 0; }
EXPORT int sonix_synth_get_c4(int i)           { return SNX_OK(i) ? (int)g_song->synth_c4[i] : 0; }
EXPORT int sonix_synth_get_filter_base(int i)  { return SNX_OK(i) ? (int)g_song->synth_filter_base[i] : 0; }
EXPORT int sonix_synth_get_filter_range(int i) { return SNX_OK(i) ? (int)g_song->synth_filter_range[i] : 0; }
EXPORT int sonix_synth_get_filter_env_sens(int i){ return SNX_OK(i) ? (int)g_song->synth_filter_env_sens[i] : 0; }
EXPORT int sonix_synth_get_env_scan_rate(int i){ return SNX_OK(i) ? (int)g_song->synth_env_scan_rate[i] : 0; }
EXPORT int sonix_synth_get_env_loop_mode(int i){ return SNX_OK(i) ? (int)g_song->synth_env_loop_mode[i] : 0; }
EXPORT int sonix_synth_get_env_delay_init(int i){ return SNX_OK(i) ? (int)g_song->synth_env_delay_init[i] : 0; }
EXPORT int sonix_synth_get_env_vol_scale(int i){ return SNX_OK(i) ? (int)g_song->synth_env_vol_scale[i] : 0; }
EXPORT int sonix_synth_get_env_pitch_scale(int i){ return SNX_OK(i) ? (int)g_song->synth_env_pitch_scale[i] : 0; }
EXPORT int sonix_synth_get_slide_rate(int i)   { return SNX_OK(i) ? (int)g_song->synth_slide_rate[i] : 0; }

/* Copy the 128-byte base waveform / filter-envelope table into out (int8[128]). */
EXPORT void sonix_synth_get_wave(int i, int8_t* out)      { if (SNX_OK(i) && out) memcpy(out, g_song->synth_wave[i], 128); }
EXPORT void sonix_synth_get_env_table(int i, int8_t* out) { if (SNX_OK(i) && out) memcpy(out, g_song->synth_env_table[i], 128); }

EXPORT void sonix_synth_set_is_synth(int i, int v)        { if (SNX_OK(i)) sonix_song_set_instrument_synth(g_song, (uint8_t)i, v != 0); }
EXPORT void sonix_synth_set_vol_params(int i, int base_vol, int port_flag) { if (SNX_OK(i)) sonix_song_set_synth_vol_params(g_song, (uint8_t)i, (uint16_t)base_vol, (uint16_t)port_flag); }
EXPORT void sonix_synth_set_blend_params(int i, int c2, int c4)            { if (SNX_OK(i)) sonix_song_set_synth_blend_params(g_song, (uint8_t)i, (uint16_t)c2, (uint16_t)c4); }
EXPORT void sonix_synth_set_filter_params(int i, int base, int range, int env_sens) { if (SNX_OK(i)) sonix_song_set_synth_filter_params(g_song, (uint8_t)i, (uint16_t)base, (uint16_t)range, (uint16_t)env_sens); }
EXPORT void sonix_synth_set_env_params(int i, int scan_rate, int loop_mode, int delay_init, int vol_scale, int pitch_scale) { if (SNX_OK(i)) sonix_song_set_synth_env_params(g_song, (uint8_t)i, (uint16_t)scan_rate, (int16_t)loop_mode, (uint16_t)delay_init, (uint16_t)vol_scale, (uint16_t)pitch_scale); }
EXPORT void sonix_synth_set_slide_rate(int i, int slide_rate)             { if (SNX_OK(i)) sonix_song_set_synth_slide_rate(g_song, (uint8_t)i, (uint16_t)slide_rate); }
/* set_wave recomputes the 64-band filter bank internally. */
EXPORT void sonix_synth_set_wave(int i, const int8_t* wave128)      { if (SNX_OK(i) && wave128) sonix_song_set_synth_wave(g_song, (uint8_t)i, wave128); }
EXPORT void sonix_synth_set_env_table(int i, const int8_t* table128){ if (SNX_OK(i) && table128) sonix_song_set_synth_env_table(g_song, (uint8_t)i, table128); }
EXPORT void sonix_synth_get_lfo_wave(int i, int8_t* out)   { if (SNX_OK(i) && out) memcpy(out, g_song->synth_lfo_wave[i], 128); }
EXPORT void sonix_synth_set_lfo_wave(int i, const int8_t* w){ if (SNX_OK(i) && w)   sonix_song_set_synth_lfo_wave(g_song, (uint8_t)i, w); }
EXPORT int  sonix_synth_get_eg_level(int i, int j) { return (SNX_OK(i) && j >= 0 && j < 4) ? (int)g_song->ss_port_target[i][j] : 0; }
EXPORT void sonix_synth_set_eg_level(int i, int j, int v) { if (SNX_OK(i) && j >= 0 && j < 4) g_song->ss_port_target[i][j] = (uint16_t)v; }
EXPORT int  sonix_synth_get_eg_rate(int i, int j)  { return (SNX_OK(i) && j >= 0 && j < 4) ? (int)g_song->ss_port_speed[i][j] : 0; }
EXPORT void sonix_synth_set_eg_rate(int i, int j, int v)  { if (SNX_OK(i) && j >= 0 && j < 4) g_song->ss_port_speed[i][j] = (uint16_t)v; }
