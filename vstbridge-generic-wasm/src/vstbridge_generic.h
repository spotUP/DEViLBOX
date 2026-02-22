/*
 * vstbridge_generic.h — VSTBridge Generic Instrument Editor (SDL2/Emscripten)
 *
 * Parameterized hardware UI for VSTBridge synth plugins:
 * Vital, Odin2, Surge, TonewheelOrgan, Melodica, Monique, Helm,
 * Sorcer, amsynth, OBXf, Open303
 *
 * Uses the same parameterized approach as MAME Generic, but with
 * a more modern visual style (darker theme, larger knobs).
 *
 * Init buffer protocol: same as MAME Generic (mame_generic.h)
 */

#ifndef VSTBRIDGE_GENERIC_H
#define VSTBRIDGE_GENERIC_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define VB_MAX_PARAMS   128
#define VB_MAX_OPTIONS  16
#define VB_MAX_GROUPS   16

/* Init buffer protocol (same format as MAME Generic):
 * [0]     param_count
 * [1-3]   accent_color_rgb
 * [4]     name_len
 * [5..N]  name
 * Then per-param:
 *   type(1), label_len(1), label, group_len(1), group,
 *   min(f32), max(f32), step(f32), value(f32),
 *   option_count(1), then per-option: value(f32), label_len(1), label
 */

void vstbridge_generic_init_with_data(const uint8_t *init_buf, int init_len, int w, int h);
void vstbridge_generic_start(void);
void vstbridge_generic_shutdown(void);
void vstbridge_generic_load_config(const uint8_t *buf, int len);
int  vstbridge_generic_dump_config(uint8_t *buf, int max_len);

#ifdef __cplusplus
}
#endif

#endif /* VSTBRIDGE_GENERIC_H */
