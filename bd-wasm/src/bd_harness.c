/*
 * Ben Daglish WASM harness
 * Wraps RetrovertApp/playback_plugins C API into player_* exports for the worklet.
 */

#include "bd/ben_daglish.h"
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

static BdModule *g_module = NULL;
static float g_sample_rate = 44100.0f;

EXPORT int player_init(const uint8_t *module_data, uint32_t module_size) {
    if (g_module) {
        bd_destroy(g_module);
        g_module = NULL;
    }
    g_module = bd_create(module_data, (size_t)module_size, g_sample_rate);
    return g_module ? 0 : -1;
}

EXPORT int player_render(float *buf, int frames) {
    if (!g_module) return 0;
    return (int)bd_render(g_module, buf, (size_t)frames);
}

EXPORT void player_stop(void) {
    if (g_module) {
        bd_destroy(g_module);
        g_module = NULL;
    }
}

EXPORT void player_set_sample_rate(int rate) {
    g_sample_rate = (float)rate;
}

EXPORT int player_is_finished(void) {
    if (!g_module) return 1;
    return bd_has_ended(g_module) ? 1 : 0;
}

EXPORT int player_get_subsong_count(void) {
    if (!g_module) return 1;
    return bd_subsong_count(g_module);
}

EXPORT void player_set_subsong(int n) {
    if (g_module) bd_select_subsong(g_module, n);
}

EXPORT const char *player_get_title(void) {
    return "Ben Daglish";
}

EXPORT double player_detect_duration(void) {
    return 0.0;
}

EXPORT void player_set_channel_gain(int ch, float gain) {
    if (!g_module || ch < 0 || ch >= 4) return;
    static float s_gains[4] = {1.0f, 1.0f, 1.0f, 1.0f};
    s_gains[ch] = gain;
    uint32_t mask = 0;
    for (int i = 0; i < 4; i++) {
        if (s_gains[i] > 0.0f) mask |= (1U << i);
    }
    bd_set_channel_mask(g_module, mask);
}

/* ── Instrument parameter API ─────────────────────────────────────────── */

typedef struct {
    int16_t sample_number;
    int8_t* sample_data;
    uint16_t length;
    uint32_t loop_offset;
    uint16_t loop_length;
    uint16_t volume;
    int16_t volume_fade_speed;
    int16_t portamento_duration;
    int16_t portamento_add_value;
    uint16_t vibrato_depth;
    uint16_t vibrato_add_value;
    int16_t note_transpose;
    uint16_t fine_tune_period;
} BdSampleLayout;

EXPORT int bd_get_instrument_count(void) {
    if (!g_module) return 0;
    return bd_sample_count(g_module);
}

EXPORT float bd_get_instrument_param(int inst, const char *param) {
    if (!g_module) return 0.0f;
    BdSampleLayout *s = (BdSampleLayout *)bd_get_sample(g_module, inst);
    if (!s) return 0.0f;

    if (strcmp(param, "sampleNumber") == 0)       return (float)s->sample_number;
    if (strcmp(param, "length") == 0)              return (float)s->length;
    if (strcmp(param, "loopOffset") == 0)          return (float)s->loop_offset;
    if (strcmp(param, "loopLength") == 0)          return (float)s->loop_length;
    if (strcmp(param, "volume") == 0)              return (float)s->volume;
    if (strcmp(param, "volumeFadeSpeed") == 0)     return (float)s->volume_fade_speed;
    if (strcmp(param, "portamentoDuration") == 0)  return (float)s->portamento_duration;
    if (strcmp(param, "portamentoAddValue") == 0)  return (float)s->portamento_add_value;
    if (strcmp(param, "vibratoDepth") == 0)        return (float)s->vibrato_depth;
    if (strcmp(param, "vibratoAddValue") == 0)     return (float)s->vibrato_add_value;
    if (strcmp(param, "noteTranspose") == 0)       return (float)s->note_transpose;
    if (strcmp(param, "fineTunePeriod") == 0)      return (float)s->fine_tune_period;
    return 0.0f;
}

EXPORT void bd_set_instrument_param(int inst, const char *param, float value) {
    if (!g_module) return;
    BdSampleLayout *s = (BdSampleLayout *)bd_get_sample(g_module, inst);
    if (!s) return;

    if (strcmp(param, "sampleNumber") == 0)        { s->sample_number       = (int16_t)value; return; }
    if (strcmp(param, "length") == 0)               { s->length              = (uint16_t)value; return; }
    if (strcmp(param, "loopOffset") == 0)           { s->loop_offset         = (uint32_t)value; return; }
    if (strcmp(param, "loopLength") == 0)           { s->loop_length         = (uint16_t)value; return; }
    if (strcmp(param, "volume") == 0)               { s->volume              = (uint16_t)value; return; }
    if (strcmp(param, "volumeFadeSpeed") == 0)      { s->volume_fade_speed   = (int16_t)value; return; }
    if (strcmp(param, "portamentoDuration") == 0)   { s->portamento_duration = (int16_t)value; return; }
    if (strcmp(param, "portamentoAddValue") == 0)   { s->portamento_add_value = (int16_t)value; return; }
    if (strcmp(param, "vibratoDepth") == 0)         { s->vibrato_depth       = (uint16_t)value; return; }
    if (strcmp(param, "vibratoAddValue") == 0)      { s->vibrato_add_value   = (uint16_t)value; return; }
    if (strcmp(param, "noteTranspose") == 0)        { s->note_transpose      = (int16_t)value; return; }
    if (strcmp(param, "fineTunePeriod") == 0)       { s->fine_tune_period    = (uint16_t)value; return; }
}
