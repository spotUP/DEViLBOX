/*
 * fp_harness.c — WASM harness for Future Player replayer
 *
 * Provides the exported C API for the WASM module:
 *   fp_wasm_init(data, size) — load module
 *   fp_wasm_render(buf, frames) — render audio frames
 *   fp_wasm_stop() — stop playback
 */

#include "FuturePlayer.h"
#include "paula_soft.h"
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

static uint8_t* module_copy = NULL;
static uint32_t module_size = 0;
static int initialized = 0;

/* Forward declarations for shadow array */
static void build_shadow(int subsong);
static int shadow_built;
static int current_subsong = 0;

/* Ticks per frame at PAL rate:
 * CIA timer fires at ~50Hz (PAL vblank).
 * Paula output rate: 28150 Hz.
 * Frames per tick: 28150 / 50 = 563 frames.
 * But the actual timer rate depends on the module's CIA timer value.
 * Default: ~50Hz = 563 frames per tick. */
static int frames_per_tick = 563;
static int frame_counter = 0;

EXPORT int fp_wasm_init(const uint8_t* data, uint32_t size) {
    if (module_copy) { free(module_copy); module_copy = NULL; module_size = 0; }

    module_copy = (uint8_t*)malloc(size);
    if (!module_copy) return -1;
    memcpy(module_copy, data, size);
    module_size = size;

    paula_reset();

    int ret = fp_init(module_copy, size);
    if (ret != 0) {
        free(module_copy);
        module_copy = NULL;
        module_size = 0;
        return -1;
    }

    initialized = 1;
    frame_counter = 0;
    frames_per_tick = 563;  /* Default 50Hz */

    /* Build linearized shadow array for pattern editing */
    current_subsong = 0;
    shadow_built = 0;
    build_shadow(0);

    return 0;
}

EXPORT int fp_wasm_render(float* buffer, int frames) {
    if (!initialized) {
        memset(buffer, 0, frames * 2 * sizeof(float));
        return frames;
    }

    int written = 0;
    while (written < frames) {
        if (frame_counter <= 0) {
            fp_play();
            frame_counter = frames_per_tick;
        }

        int chunk = frames - written;
        if (chunk > frame_counter) chunk = frame_counter;

        int rendered = paula_render(buffer + written * 2, chunk);
        written += rendered;
        frame_counter -= rendered;
    }

    return written;
}

EXPORT void fp_wasm_stop(void) {
    fp_stop();
    initialized = 0;
    if (module_copy) { free(module_copy); module_copy = NULL; module_size = 0; }
}

EXPORT void fp_wasm_get_channel_levels(float *out4) {
    paula_get_channel_levels(out4);
}

EXPORT int fp_wasm_get_sample_rate(void) {
    return fp_get_sample_rate();
}

EXPORT int fp_wasm_get_num_subsongs(void) {
    return fp_get_num_subsongs();
}

EXPORT void fp_wasm_set_subsong(int subsong) {
    fp_set_subsong(subsong);
    /* Rebuild shadow array for the new subsong */
    current_subsong = subsong;
    shadow_built = 0;
    build_shadow(subsong);
}

/* ── Per-note instrument preview ───────────────────────────────────────── */

static int preview_frames_per_tick = 563;  /* 28150/50 */
static double preview_accum = 0.0;

EXPORT void fp_wasm_note_on(uint32_t instr_ptr, int note, int velocity) {
    if (!initialized) return;
    fp_note_on(instr_ptr, note, velocity);
    preview_accum = 0.0;
}

EXPORT void fp_wasm_note_off(void) {
    fp_note_off();
}

EXPORT int fp_wasm_render_preview(float* buffer, int frames) {
    if (!initialized || !fp_is_preview_active()) {
        memset(buffer, 0, frames * 2 * sizeof(float));
        return frames;
    }

    float* out = buffer;
    int remaining = frames;

    while (remaining > 0) {
        double until_tick = (double)preview_frames_per_tick - preview_accum;
        int n = (int)until_tick;
        if (n < 1) n = 1;
        if (n > remaining) n = remaining;

        int got = paula_render(out, n);
        out += got * 2;
        remaining -= got;
        preview_accum += (double)got;

        if (preview_accum >= (double)preview_frames_per_tick) {
            preview_accum -= (double)preview_frames_per_tick;
            fp_preview_tick();
        }
    }
    return frames;
}

EXPORT int fp_wasm_get_instrument_info(uint32_t instr_ptr) {
    int is_wt = 0;
    int size = fp_get_instrument_info(instr_ptr, &is_wt);
    /* Pack: bit 31 = wavetable flag, bits 0-30 = sample size */
    return (is_wt ? (1 << 30) : 0) | (size & 0x3FFFFFFF);
}

/* ── Shadow pattern array for editing ─────────────────────────────────── */

/*
 * Each cell stores 4 bytes: note, instrument, effect, param.
 * The shadow array is built by simulating the bytecode sequence reader
 * (like the TypeScript linearizeVoice function) without affecting playback.
 * Edits modify the shadow array only — the original bytecode still plays.
 * The shadow data is what the editor sees/modifies for display and export.
 */

#define MAX_SHADOW_ROWS 8192
#define NUM_FP_VOICES   4

typedef struct {
    uint8_t note;        /* 0=empty, 1-96=note */
    uint8_t instrument;  /* 0=none, 1+=instrument index */
    uint8_t effect;      /* effect type */
    uint8_t param;       /* effect parameter */
} FPCell;

static FPCell shadow[NUM_FP_VOICES][MAX_SHADOW_ROWS];
static int    shadow_len[NUM_FP_VOICES];  /* actual row count per voice */
/* shadow_built declared at top of file */

/* Module data read helpers (operate on the code section after hunk strip) */
static const uint8_t* sh_base = NULL;
static uint32_t       sh_size = 0;

static uint8_t  sh_rd8(uint32_t p)  { return (p < sh_size) ? sh_base[p] : 0; }
static uint16_t sh_rd16(uint32_t p) { return (p+1 < sh_size) ? (uint16_t)((sh_base[p]<<8)|sh_base[p+1]) : 0; }
static uint32_t sh_rd32(uint32_t p) { return (p+3 < sh_size) ? (uint32_t)((sh_base[p]<<24)|(sh_base[p+1]<<16)|(sh_base[p+2]<<8)|sh_base[p+3]) : 0; }

/* Instrument pointer → 1-based instrument ID mapping */
#define MAX_INSTRUMENTS 64
static uint32_t instr_ptrs[MAX_INSTRUMENTS];
static int      instr_count = 0;

static int find_or_add_instrument(uint32_t ptr) {
    if (ptr == 0) return 0;
    for (int i = 0; i < instr_count; i++) {
        if (instr_ptrs[i] == ptr) return i + 1;
    }
    if (instr_count < MAX_INSTRUMENTS) {
        instr_ptrs[instr_count] = ptr;
        instr_count++;
        return instr_count;
    }
    return 0;
}

/*
 * Linearize a single voice's bytecode into the shadow array.
 * Mirrors the logic of linearizeVoice() in FuturePlayerParser.ts.
 */
static void linearize_voice(int voice, uint32_t start_pos) {
    int row = 0;
    int ended = 0;
    int safety = 0;
    const int MAX_ITER = 100000;

    /* Simulated call stack for subroutine calls */
    uint32_t call_stack[8];
    int call_depth = 0;

    /* Loop state */
    uint32_t loop_addrs[8];
    uint8_t  loop_counts[8];
    int loop_depth = 0;

    int current_instr = 0;
    uint32_t pos = start_pos;

    while (row < MAX_SHADOW_ROWS && !ended && safety < MAX_ITER) {
        safety++;

        uint8_t b = sh_rd8(pos);
        pos++;

        if (b & 0x80) {
            /* Command byte */
            int cmd_num = ((b << 2) & 0xFF) >> 2;  /* same as b & 0x3F, i.e. b - 0x80 */
            uint8_t arg = sh_rd8(pos);
            pos++;

            switch (cmd_num) {
                case 0: /* end voice / return from sub */
                    if (call_depth > 0) {
                        call_depth--;
                        pos = call_stack[call_depth];
                    } else {
                        ended = 1;
                    }
                    break;

                case 1: { /* set instrument (4-byte ptr) */
                    uint32_t iptr = sh_rd32(pos);
                    pos += 4;
                    current_instr = find_or_add_instrument(iptr);
                    break;
                }

                case 2: /* set arpeggio table (4-byte ptr) */
                    pos += 4;
                    break;

                case 3: /* reset arpeggio */
                    break;

                case 4: { /* set portamento (2-byte word) */
                    uint16_t rate = sh_rd16(pos);
                    pos += 2;
                    /* Apply portamento effect to previous row if possible */
                    if (row > 0 && rate > 0) {
                        FPCell* prev = &shadow[voice][row - 1];
                        if (prev->effect == 0 && prev->param == 0) {
                            prev->effect = 0x03;  /* tone portamento */
                            prev->param = (uint8_t)(rate > 255 ? 255 : rate);
                        }
                    }
                    break;
                }

                case 5: /* nop */
                    break;

                case 6: { /* call subroutine (4-byte ptr) */
                    if (call_depth < 8) {
                        call_stack[call_depth] = pos + 4;
                        call_depth++;
                    }
                    uint32_t target = sh_rd32(pos);
                    uint32_t seq_data = sh_rd32(target + 8);
                    pos = seq_data;
                    break;
                }

                case 7: { /* jump pattern (4-byte ptr) */
                    uint32_t target = sh_rd32(pos);
                    uint32_t seq_data = sh_rd32(target + 8);
                    pos = seq_data;
                    break;
                }

                case 8: /* repeat start */
                    if (loop_depth < 8) {
                        loop_addrs[loop_depth] = pos;
                        loop_counts[loop_depth] = arg;
                        loop_depth++;
                    }
                    break;

                case 9: /* repeat check */
                    if (loop_depth > 0) {
                        int idx = loop_depth - 1;
                        loop_counts[idx]--;
                        if (loop_counts[idx] > 0) {
                            pos = loop_addrs[idx];
                        } else {
                            loop_depth--;
                        }
                    }
                    break;

                case 10: /* repeat jump (conditional — infinite loop) */
                    if (loop_depth > 0) {
                        pos = loop_addrs[loop_depth - 1];
                    }
                    break;

                case 11: /* set transpose 1 */
                    break;

                case 12: /* set transpose 2 */
                    break;

                case 13: /* check flag → end */
                    ended = 1;
                    break;

                case 14: /* reset counter (nop) */
                    break;

                default:
                    ended = 1;
                    break;
            }
            continue;
        }

        /* Note or rest + duration byte */
        uint8_t note = b;  /* 0=rest, 1-96=note */
        uint8_t dur = sh_rd8(pos);
        pos++;

        int duration = dur & 0x80 ? (dur & 0x7F) : dur;
        if (duration < 1) duration = 1;

        /* First row gets the note */
        if (row < MAX_SHADOW_ROWS) {
            shadow[voice][row].note = note;
            shadow[voice][row].instrument = (note > 0) ? (uint8_t)current_instr : 0;
            shadow[voice][row].effect = 0;
            shadow[voice][row].param = 0;
            row++;
        }

        /* Remaining duration rows are empty (sustain) */
        for (int d = 1; d < duration && row < MAX_SHADOW_ROWS; d++) {
            shadow[voice][row].note = 0;
            shadow[voice][row].instrument = 0;
            shadow[voice][row].effect = 0;
            shadow[voice][row].param = 0;
            row++;
        }
    }

    shadow_len[voice] = row;
}

/*
 * Build the shadow array for all voices of the current subsong.
 * Called after fp_wasm_init succeeds.
 */
static void build_shadow(int subsong) {
    const uint8_t* base;
    uint32_t size;
    if (fp_get_module_data(&base, &size) != 0) return;

    sh_base = base;
    sh_size = size;
    instr_count = 0;

    memset(shadow, 0, sizeof(shadow));
    memset(shadow_len, 0, sizeof(shadow_len));

    int nsubs = fp_get_num_subsongs();
    if (subsong >= nsubs) return;
    int sub = subsong;

    for (int v = 0; v < NUM_FP_VOICES; v++) {
        int start = fp_get_voice_seq_start(sub, v);
        if (start > 0) {
            linearize_voice(v, (uint32_t)start);
        }
    }

    shadow_built = 1;
}

/* ── Exported cell accessors ──────────────────────────────────────────── */

EXPORT int fp_wasm_get_voice_length(int voice) {
    if (!shadow_built || voice < 0 || voice >= NUM_FP_VOICES) return 0;
    return shadow_len[voice];
}

EXPORT uint32_t fp_wasm_get_cell(int voice, int row) {
    if (!shadow_built || voice < 0 || voice >= NUM_FP_VOICES) return 0;
    if (row < 0 || row >= shadow_len[voice]) return 0;

    const FPCell* c = &shadow[voice][row];
    /* Pack: (note << 24) | (instrument << 16) | (effect << 8) | param */
    return ((uint32_t)c->note << 24)
         | ((uint32_t)c->instrument << 16)
         | ((uint32_t)c->effect << 8)
         | (uint32_t)c->param;
}

EXPORT void fp_wasm_set_cell(int voice, int row, int note, int instrument, int effect, int param) {
    if (!shadow_built || voice < 0 || voice >= NUM_FP_VOICES) return;
    if (row < 0 || row >= MAX_SHADOW_ROWS) return;

    /* Extend voice length if writing beyond current end */
    if (row >= shadow_len[voice]) {
        /* Zero-fill gap */
        for (int r = shadow_len[voice]; r < row; r++) {
            shadow[voice][r].note = 0;
            shadow[voice][r].instrument = 0;
            shadow[voice][r].effect = 0;
            shadow[voice][r].param = 0;
        }
        shadow_len[voice] = row + 1;
    }

    shadow[voice][row].note = (uint8_t)note;
    shadow[voice][row].instrument = (uint8_t)instrument;
    shadow[voice][row].effect = (uint8_t)effect;
    shadow[voice][row].param = (uint8_t)param;
}

/* ── Live module byte read/write ───────────────────────────────────────────
 *
 * The Future Player engine doesn't have a chip-RAM-style memory window, but
 * `module_copy` (the writable buffer fp_init runs against) IS the module's
 * working storage. Patching a byte here takes effect on the next instrument
 * trigger because update_audio() reads parameters fresh from the detail
 * struct via mod_base[detailPtr + offset] every tick.
 *
 * Used by FuturePlayerControls to live-edit instrument envelope/modulation
 * parameters from the editor — same UX as the TFMX/SonicArranger editors.
 */

EXPORT uint32_t fp_wasm_get_module_size(void) {
    return module_size;
}

EXPORT int fp_wasm_read_byte(uint32_t addr) {
    if (!module_copy || addr >= module_size) return -1;
    return module_copy[addr];
}

EXPORT int fp_wasm_write_byte(uint32_t addr, int value) {
    if (!module_copy || addr >= module_size) return -1;
    module_copy[addr] = (uint8_t)(value & 0xFF);
    return 0;
}

/* Bulk byte write — fewer cwrap roundtrips for blocks of params */
EXPORT int fp_wasm_write_bytes(uint32_t addr, const uint8_t* data, uint32_t length) {
    if (!module_copy || addr >= module_size) return -1;
    if (addr + length > module_size) length = module_size - addr;
    memcpy(module_copy + addr, data, length);
    return (int)length;
}
