/**
 * format_synth_api.h
 * Universal C API contract for all UADE format-specific WASM synthesis modules.
 *
 * Each format WASM module (SoundMon, SidMon, FC, Fred, TFMX, DigMug) implements
 * this interface. The TypeScript engine layer calls these exports via Emscripten.
 *
 * Design principles:
 *  - All functions are stateless from the caller's perspective — state lives in ctx.
 *  - ctx is an opaque pointer allocated by format_init and freed by format_dispose.
 *  - Audio output is floating-point stereo, [-1.0, +1.0] range.
 *  - load_instrument accepts a raw binary blob: either a serialised config struct
 *    (for synth formats) or a PCM sample (for PCM instruments).
 *  - set_param accepts normalised 0-1 values for all parameters.
 *
 * WASM export names follow the pattern: <format>_<function>
 * e.g. sm_init, sm_load_instrument, sm_note_on, sm_note_off, sm_render, sm_set_param, sm_dispose
 *      sidmon_init, sidmon_load_instrument, ...
 *      fc_init, fc_load_instrument, ...
 *      fred_init, fred_load_instrument, ...
 *      tfmx_init, tfmx_load_instrument, ...
 *      digmug_init, digmug_load_instrument, ...
 *
 * JavaScript/TypeScript usage pattern:
 *   const ctx = Module._sm_init(44100);
 *   Module._sm_load_instrument(ctx, dataPtr, dataLen);
 *   Module._sm_note_on(ctx, 60, 100);           // MIDI note 60, velocity 100
 *   const rendered = Module._sm_render(ctx, outLPtr, outRPtr, 128);
 *   Module._sm_note_off(ctx);
 *   Module._sm_dispose(ctx);
 */

#ifndef FORMAT_SYNTH_API_H
#define FORMAT_SYNTH_API_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ─── Context Lifecycle ───────────────────────────────────────────────────── */

/**
 * Allocate a new synth context.
 * @param sampleRate  Host sample rate in Hz (typically 44100 or 48000).
 * @return  Opaque pointer to the synth state. Pass to all other functions.
 *          Returns NULL on allocation failure.
 */
void* format_init(int sampleRate);

/**
 * Free all resources associated with a synth context.
 * After this call, ctx must not be used.
 */
void format_dispose(void* ctx);


/* ─── Instrument Loading ─────────────────────────────────────────────────── */

/**
 * Upload a binary instrument blob into the synth context.
 *
 * The blob layout is format-specific and mirrors the TypeScript config struct.
 * Each format defines its own serialisation layout in its respective synth .c file.
 *
 * @param ctx   Synth context from format_init.
 * @param data  Pointer to binary instrument data.
 * @param len   Length of data in bytes.
 * @return  0 on success, negative error code on failure.
 *
 * Error codes:
 *   -1  NULL ctx or data
 *   -2  len too short (truncated instrument data)
 *   -3  Invalid instrument header / magic bytes
 *   -4  Unsupported instrument version
 */
int format_load_instrument(void* ctx, const uint8_t* data, int len);


/* ─── Note Events ────────────────────────────────────────────────────────── */

/**
 * Trigger a note-on event.
 * @param ctx       Synth context.
 * @param note      MIDI note number (0-127). Middle C = 60.
 * @param velocity  MIDI velocity (1-127). 0 is treated as note-off.
 *                  Velocity >= 100 triggers accent behaviour (for formats that support it).
 */
void format_note_on(void* ctx, int note, int velocity);

/**
 * Trigger a note-off event (begins release phase).
 * @param ctx  Synth context.
 */
void format_note_off(void* ctx);


/* ─── Audio Rendering ────────────────────────────────────────────────────── */

/**
 * Render audio into the provided output buffers.
 *
 * Interleaved stereo output IS NOT used — outL and outR are separate buffers.
 * The caller is responsible for allocating outL and outR on the WASM heap
 * (e.g. via Module._malloc(numSamples * 4)).
 *
 * @param ctx         Synth context.
 * @param outL        Pointer to left-channel float32 output buffer.
 * @param outR        Pointer to right-channel float32 output buffer.
 * @param numSamples  Number of float32 samples to render per channel.
 * @return  Number of samples actually rendered (may be < numSamples at end-of-note).
 *          Returns 0 if ctx is NULL.
 */
int format_render(void* ctx, float* outL, float* outR, int numSamples);


/* ─── Parameter Control ──────────────────────────────────────────────────── */

/**
 * Set a real-time parameter value (0-1 normalised).
 *
 * Parameter IDs are format-specific and defined in each format's own header.
 * Common IDs that most formats support:
 *   0  volume         (0-1 maps to 0-64 internally)
 *   1  attack speed   (0-1)
 *   2  decay speed    (0-1)
 *   3  sustain volume (0-1)
 *   4  release speed  (0-1)
 *   5  vibrato speed  (0-1)
 *   6  vibrato depth  (0-1)
 *   7  vibrato delay  (0-1)
 *   8  arp speed      (0-1)
 *   9  portamento     (0-1)
 *
 * Format-specific IDs start at 16.
 *
 * @param ctx      Synth context.
 * @param paramId  Parameter identifier.
 * @param value    Normalised 0-1 value.
 */
void format_set_param(void* ctx, int paramId, float value);

/**
 * Get the current value of a parameter (0-1 normalised).
 * @return  Current value, or -1.0f if paramId is unknown.
 */
float format_get_param(void* ctx, int paramId);


/* ─── Common Parameter IDs ───────────────────────────────────────────────── */
/* These are shared across all format synths for the base set of controls.    */

#define FSYNTH_PARAM_VOLUME          0
#define FSYNTH_PARAM_ATTACK_SPEED    1
#define FSYNTH_PARAM_DECAY_SPEED     2
#define FSYNTH_PARAM_SUSTAIN_VOL     3
#define FSYNTH_PARAM_RELEASE_SPEED   4
#define FSYNTH_PARAM_VIB_SPEED       5
#define FSYNTH_PARAM_VIB_DEPTH       6
#define FSYNTH_PARAM_VIB_DELAY       7
#define FSYNTH_PARAM_ARP_SPEED       8
#define FSYNTH_PARAM_PORTAMENTO      9
/* IDs 10-15 reserved for future common params */
/* IDs 16+ are format-specific */
#define FSYNTH_PARAM_FORMAT_BASE    16

#ifdef __cplusplus
}
#endif

#endif /* FORMAT_SYNTH_API_H */
