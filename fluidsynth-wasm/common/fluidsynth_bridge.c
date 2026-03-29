/*
 * FluidSynth WASM Bridge
 * Thin C wrapper around FluidSynth API for Emscripten/AudioWorklet use.
 */

#include <fluidsynth.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

static fluid_settings_t *g_settings = NULL;
static fluid_synth_t *g_synth = NULL;
static int g_sfont_id = -1;

EXPORT void *fluidsynth_create(int sampleRate) {
    if (g_synth) return g_synth;

    g_settings = new_fluid_settings();
    fluid_settings_setnum(g_settings, "synth.sample-rate", (double)sampleRate);
    fluid_settings_setint(g_settings, "synth.polyphony", 64);
    fluid_settings_setint(g_settings, "synth.midi-channels", 16);
    fluid_settings_setstr(g_settings, "synth.reverb.active", "yes");
    fluid_settings_setstr(g_settings, "synth.chorus.active", "yes");
    /* No audio driver in WASM — we pull samples manually */
    fluid_settings_setstr(g_settings, "audio.driver", "none");

    g_synth = new_fluid_synth(g_settings);
    return g_synth;
}

EXPORT void fluidsynth_destroy(void) {
    if (g_synth) {
        delete_fluid_synth(g_synth);
        g_synth = NULL;
    }
    if (g_settings) {
        delete_fluid_settings(g_settings);
        g_settings = NULL;
    }
    g_sfont_id = -1;
}

EXPORT int fluidsynth_load_sf2(const char *path) {
    if (!g_synth) return -1;
    g_sfont_id = fluid_synth_sfload(g_synth, path, 1);
    return g_sfont_id;
}

EXPORT void fluidsynth_process(float *left, float *right, int nframes) {
    if (!g_synth) return;
    fluid_synth_write_float(g_synth, nframes, left, 0, 1, right, 0, 1);
}

EXPORT void fluidsynth_note_on(int channel, int key, int velocity) {
    if (!g_synth) return;
    fluid_synth_noteon(g_synth, channel, key, velocity);
}

EXPORT void fluidsynth_note_off(int channel, int key) {
    if (!g_synth) return;
    fluid_synth_noteoff(g_synth, channel, key);
}

EXPORT void fluidsynth_program_change(int channel, int program) {
    if (!g_synth) return;
    fluid_synth_program_change(g_synth, channel, program);
}

EXPORT void fluidsynth_bank_select(int channel, int bank) {
    if (!g_synth) return;
    fluid_synth_bank_select(g_synth, channel, bank);
}

EXPORT void fluidsynth_cc(int channel, int ctrl, int val) {
    if (!g_synth) return;
    fluid_synth_cc(g_synth, channel, ctrl, val);
}

EXPORT void fluidsynth_pitch_bend(int channel, int val) {
    if (!g_synth) return;
    fluid_synth_pitch_bend(g_synth, channel, val);
}

EXPORT void fluidsynth_pitch_wheel_sens(int channel, int val) {
    if (!g_synth) return;
    fluid_synth_pitch_wheel_sens(g_synth, channel, val);
}

EXPORT void fluidsynth_channel_pressure(int channel, int val) {
    if (!g_synth) return;
    fluid_synth_channel_pressure(g_synth, channel, val);
}

EXPORT void fluidsynth_all_notes_off(int channel) {
    if (!g_synth) return;
    fluid_synth_all_notes_off(g_synth, channel);
}

EXPORT void fluidsynth_all_sounds_off(int channel) {
    if (!g_synth) return;
    fluid_synth_all_sounds_off(g_synth, channel);
}

/*
 * Parameter IDs:
 *   0  = reverb room size     (0.0 – 1.0)
 *   1  = reverb damping       (0.0 – 1.0)
 *   2  = reverb width         (0.0 – 100.0)
 *   3  = reverb level         (0.0 – 1.0)
 *   4  = chorus voice count   (0 – 99)
 *   5  = chorus level         (0.0 – 10.0)
 *   6  = chorus speed Hz      (0.1 – 5.0)
 *   7  = chorus depth ms      (0.0 – 256.0)
 *   8  = chorus type          (0 = sine, 1 = triangle)
 *   9  = gain / master volume (0.0 – 10.0)
 *  10  = polyphony             (1 – 256)
 *  11  = program               (0 – 127, applied to channel 0)
 *  12  = bank                  (0 – 16383, applied to channel 0)
 */
EXPORT void fluidsynth_set_param(int id, float value) {
    if (!g_synth) return;

    switch (id) {
        case 0:
            fluid_synth_set_reverb_group_roomsize(g_synth, -1, (double)value);
            break;
        case 1:
            fluid_synth_set_reverb_group_damp(g_synth, -1, (double)value);
            break;
        case 2:
            fluid_synth_set_reverb_group_width(g_synth, -1, (double)value);
            break;
        case 3:
            fluid_synth_set_reverb_group_level(g_synth, -1, (double)value);
            break;
        case 4:
            fluid_synth_set_chorus_group_nr(g_synth, -1, (int)value);
            break;
        case 5:
            fluid_synth_set_chorus_group_level(g_synth, -1, (double)value);
            break;
        case 6:
            fluid_synth_set_chorus_group_speed(g_synth, -1, (double)value);
            break;
        case 7:
            fluid_synth_set_chorus_group_depth(g_synth, -1, (double)value);
            break;
        case 8:
            fluid_synth_set_chorus_group_type(g_synth, -1, (int)value);
            break;
        case 9:
            fluid_synth_set_gain(g_synth, value);
            break;
        case 10:
            fluid_synth_set_polyphony(g_synth, (int)value);
            break;
        case 11:
            fluid_synth_program_change(g_synth, 0, (int)value);
            break;
        case 12:
            fluid_synth_bank_select(g_synth, 0, (int)value);
            break;
        default:
            break;
    }
}

EXPORT float fluidsynth_get_param(int id) {
    if (!g_synth) return 0.0f;

    double val = 0.0;
    int ival = 0;

    switch (id) {
        case 0:
            fluid_synth_get_reverb_group_roomsize(g_synth, -1, &val);
            return (float)val;
        case 1:
            fluid_synth_get_reverb_group_damp(g_synth, -1, &val);
            return (float)val;
        case 2:
            fluid_synth_get_reverb_group_width(g_synth, -1, &val);
            return (float)val;
        case 3:
            fluid_synth_get_reverb_group_level(g_synth, -1, &val);
            return (float)val;
        case 4:
            fluid_synth_get_chorus_group_nr(g_synth, -1, &ival);
            return (float)ival;
        case 5:
            fluid_synth_get_chorus_group_level(g_synth, -1, &val);
            return (float)val;
        case 6:
            fluid_synth_get_chorus_group_speed(g_synth, -1, &val);
            return (float)val;
        case 7:
            fluid_synth_get_chorus_group_depth(g_synth, -1, &val);
            return (float)val;
        case 8:
            fluid_synth_get_chorus_group_type(g_synth, -1, &ival);
            return (float)ival;
        case 9:
            return fluid_synth_get_gain(g_synth);
        case 10:
            return (float)fluid_synth_get_polyphony(g_synth);
        default:
            return 0.0f;
    }
}

EXPORT int fluidsynth_get_sfont_id(void) {
    return g_sfont_id;
}

/* Query preset name for a given bank+program (channel 0) */
EXPORT const char *fluidsynth_get_preset_name(int bank, int program) {
    if (!g_synth || g_sfont_id < 0) return "";
    fluid_sfont_t *sfont = fluid_synth_get_sfont_by_id(g_synth, (unsigned int)g_sfont_id);
    if (!sfont) return "";
    fluid_preset_t *preset = fluid_sfont_get_preset(sfont, bank, program);
    if (!preset) return "";
    return fluid_preset_get_name(preset);
}
