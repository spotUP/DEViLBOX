/*
 * eagleplayer_wasm.c - exports for the EaglePlayer worklet and tests
 *
 * ep_wasm_load() takes an eagleplayer binary (third-party/uade-3.05/players,
 * served from public/eagleplayer/players/) and a module, boots UADE's score
 * with them on musashi-host and runs until the player starts its sound.
 * See musashi-host/src/eagle_runner.h.
 */
#include <emscripten/emscripten.h>
#include <stdint.h>
#include "eagle_runner.h"
#include "uade_score.h"   /* generated: g_uade_score[] */
#include "amiga_host.h"
#include "paula_soft.h"

static int s_sampleRate = 48000;

EMSCRIPTEN_KEEPALIVE void ep_wasm_init(int sampleRate) { if (sampleRate > 0) s_sampleRate = sampleRate; }

EMSCRIPTEN_KEEPALIVE int ep_wasm_add_file(const char *name, const uint8_t *data, int len) {
  return len < 0 ? -1 : eagle_add_file(name, data, (size_t)len);
}
EMSCRIPTEN_KEEPALIVE void ep_wasm_clear_files(void) { eagle_clear_files(); }

/* 0 ok; -1 bad arguments, -2 not a hunk executable, -3 the player refused the
 * module, -4 score died, -5 no sound within the boot budget. */
EMSCRIPTEN_KEEPALIVE int ep_wasm_load(const uint8_t *player, int playerLen,
                                      const uint8_t *module, int moduleLen,
                                      const char *moduleName, int subsong, const char *options) {
  if (playerLen <= 0 || moduleLen < 0) return -1;
  return eagle_load(g_uade_score, sizeof g_uade_score, player, (size_t)playerLen,
                    module, (size_t)moduleLen, moduleName, subsong, options, s_sampleRate);
}

EMSCRIPTEN_KEEPALIVE int ep_wasm_render(float *out, int frames) { return eagle_render(out, 0, frames, 0); }
/* As ep_wasm_render, plus 4 planar Paula voice buffers `stride` floats apart. */
EMSCRIPTEN_KEEPALIVE int ep_wasm_render_voices(float *out, float *voices, int frames, int stride) {
  return eagle_render(out, voices, frames, stride < frames ? frames : stride);
}
/* Bit N set = Paula voice N audible (mixer mute/solo). */
EMSCRIPTEN_KEEPALIVE void ep_wasm_set_voice_mask(int mask) { eagle_set_voice_mask((uint32_t)mask); }
EMSCRIPTEN_KEEPALIVE void ep_wasm_set_subsong(int subsong) { eagle_set_subsong(subsong); }
EMSCRIPTEN_KEEPALIVE int ep_wasm_subsong_min(void) { return eagle_subsong_min(); }
EMSCRIPTEN_KEEPALIVE int ep_wasm_subsong_max(void) { return eagle_subsong_max(); }
EMSCRIPTEN_KEEPALIVE int ep_wasm_subsong_current(void) { return eagle_subsong_current(); }
EMSCRIPTEN_KEEPALIVE uint32_t ep_wasm_player_ticks(void) { return eagle_player_ticks(); }
EMSCRIPTEN_KEEPALIVE int ep_wasm_song_ended(void) { return eagle_song_ended(); }
EMSCRIPTEN_KEEPALIVE void ep_wasm_set_song_end_detection(int on) { eagle_set_song_end_detection(on); }
EMSCRIPTEN_KEEPALIVE void ep_wasm_stop(void) { eagle_stop(); }
EMSCRIPTEN_KEEPALIVE const char *ep_wasm_player_name(void) { return eagle_player_name(); }
EMSCRIPTEN_KEEPALIVE const char *ep_wasm_format_name(void) { return eagle_format_name(); }
EMSCRIPTEN_KEEPALIVE const char *ep_wasm_last_message(void) { return eagle_last_message(); }
EMSCRIPTEN_KEEPALIVE const char *ep_wasm_log(void) { return eagle_log(); }
EMSCRIPTEN_KEEPALIVE int ep_wasm_unsupported(void) { return eagle_unsupported_messages(); }

/* 16 uint32 at `out`: per voice AUDxPER, AUDxVOL, DMACON enable, AUDxLC (chip
 * address) - the layout of UADE's uade_wasm_get_channel_snapshot, so the two
 * engines' register streams compare directly. */
EMSCRIPTEN_KEEPALIVE void ep_wasm_voice_state(uint32_t *out) {
  for (int ch = 0; ch < 4; ch++) {
    out[ch * 4 + 0] = paula_reg_period(ch);
    out[ch * 4 + 1] = paula_reg_volume(ch);
    out[ch * 4 + 2] = ((ah_dmacon() & 0x200) && (ah_dmacon() & (1u << ch))) ? 1u : 0u;   /* DMACON, as UADE dmaen() */
    const uintptr_t lc = paula_reg_sample_ptr(ch);
    out[ch * 4 + 3] = lc ? (uint32_t)(lc - (uintptr_t)ah_ram) : 0u;
  }
}
