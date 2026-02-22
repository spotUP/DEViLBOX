/*
 * mame_generic.h — MAME Generic Hardware UI (SDL2/Emscripten)
 *
 * A parameterized C module that renders a retro-styled control panel
 * for any MAME chip synth. JavaScript passes parameter metadata at init
 * via a structured buffer; the C module auto-layouts controls into
 * labeled group panels with knobs, selectors, and toggles.
 *
 * Covers 25+ MAME chip types and 42+ Buzzmachine types.
 */

#ifndef MAME_GENERIC_H
#define MAME_GENERIC_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Maximum parameter / option counts */
#define MG_MAX_PARAMS    64
#define MG_MAX_OPTIONS   16
#define MG_MAX_GROUPS    16
#define MG_MAX_LABEL_LEN 32

/* Parameter types (must match ChipParamType in chipParameters.ts) */
#define MG_TYPE_KNOB    0
#define MG_TYPE_SELECT  1
#define MG_TYPE_TOGGLE  2

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Initialize with parameter metadata buffer.
 * Buffer format:
 *   [0]       param_count (uint8)
 *   [1-3]     accent_color_rgb (3 bytes)
 *   [4]       chip_name_len (uint8)
 *   [5..N]    chip_name (ASCII, not null-terminated)
 *   [N+1]     subtitle_len (uint8)
 *   [N+2..M]  subtitle (ASCII)
 *   Then per-param:
 *     [0]       type (0=knob, 1=select, 2=toggle)
 *     [1]       label_len (uint8)
 *     [2..L]    label (ASCII)
 *     [L+1]     group_len (uint8)
 *     [L+2..G]  group (ASCII)
 *     [G+1..G+4]   min (float32 LE)
 *     [G+5..G+8]   max (float32 LE)
 *     [G+9..G+12]  step (float32 LE)
 *     [G+13..G+16] value (float32 LE)
 *     [G+17]    option_count (uint8) — for selects
 *     Then per-option:
 *       [0..3]  opt_value (float32 LE)
 *       [4]     opt_label_len (uint8)
 *       [5..N]  opt_label (ASCII)
 */
void mame_generic_init_with_data(const uint8_t *data, int len);

/** Start the SDL main loop (60 fps) */
void mame_generic_start(void);

/** Tear down SDL resources */
void mame_generic_shutdown(void);

/**
 * Load current parameter values.
 * Buffer: float32 LE per parameter, in order.
 */
void mame_generic_load_config(const uint8_t *buf, int len);

/**
 * Dump current parameter values.
 * Returns number of bytes written.
 */
int mame_generic_dump_config(uint8_t *buf, int max_len);

/**
 * Set a single parameter value by index.
 */
void mame_generic_set_param(int param_index, float value);

/**
 * Get a single parameter value by index.
 */
float mame_generic_get_param(int param_index);

#ifdef __cplusplus
}
#endif

#endif /* MAME_GENERIC_H */
