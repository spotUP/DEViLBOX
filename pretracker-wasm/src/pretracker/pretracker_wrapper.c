/* pretracker_wrapper.c — WASM harness for emoon's PreTracker C replayer */

#include "pretracker.h"
#include "pretracker_internal.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

static struct PreSong* g_song = NULL;
static int g_playing = 0;
static uint8_t* g_raw_file_data = NULL;
static uint32_t g_raw_file_size = 0;

/* Channel gain (applied as post-mix volume scaling) */
static float g_channel_gains[4] = {1.0f, 1.0f, 1.0f, 1.0f};

/* Scope buffers for per-channel level metering */
static float* g_scope_bufs[4] = {NULL, NULL, NULL, NULL};
static int g_scope_buf_size = 0;
static float g_channel_levels[4] = {0.0f, 0.0f, 0.0f, 0.0f};

static void ensure_scope_bufs(int frames) {
    if (frames <= g_scope_buf_size) return;
    for (int i = 0; i < 4; i++) {
        free(g_scope_bufs[i]);
        g_scope_bufs[i] = (float*)calloc(frames, sizeof(float));
    }
    g_scope_buf_size = frames;
}

static void update_channel_levels(int frames) {
    for (int ch = 0; ch < 4; ch++) {
        float peak = 0.0f;
        if (g_scope_bufs[ch]) {
            for (int i = 0; i < frames; i++) {
                float v = fabsf(g_scope_bufs[ch][i]);
                if (v > peak) peak = v;
            }
        }
        g_channel_levels[ch] = peak;
    }
}

EXPORT int player_init(const uint8_t* module_data, uint32_t module_size) {
    if (g_song) {
        pre_song_destroy(g_song);
        g_song = NULL;
    }
    g_playing = 0;

    free(g_raw_file_data);
    g_raw_file_data = (uint8_t*)malloc(module_size);
    if (g_raw_file_data) {
        memcpy(g_raw_file_data, module_data, module_size);
        g_raw_file_size = module_size;
    }

    g_song = pre_song_create(module_data, module_size);
    if (!g_song) return -1;

    pre_song_set_sample_rate(g_song, 48000);
    pre_song_set_interp_mode(g_song, PRE_INTERP_BLEP);
    pre_song_start(g_song);
    g_playing = 1;

    return 0;
}

EXPORT int player_render(float* buf, int frames) {
    if (!g_song || !g_playing) {
        memset(buf, 0, frames * 2 * sizeof(float));
        return 0;
    }

    ensure_scope_bufs(frames);
    int rendered = pre_song_decode_with_scopes(g_song, buf, frames, g_scope_bufs, 4);
    if (rendered > 0) {
        update_channel_levels(rendered);
    }

    if (pre_song_is_finished(g_song)) {
        g_playing = 0;
    }

    return rendered;
}

EXPORT void player_stop(void) {
    g_playing = 0;
}

EXPORT void player_set_sample_rate(int rate) {
    if (g_song) {
        pre_song_set_sample_rate(g_song, (uint32_t)rate);
    }
}

EXPORT int player_is_finished(void) {
    if (!g_song) return 1;
    return pre_song_is_finished(g_song) ? 1 : 0;
}

EXPORT int player_get_subsong_count(void) {
    if (!g_song) return 1;
    const PreSongMetadata* meta = pre_song_get_metadata(g_song);
    return meta ? (meta->num_subsongs > 0 ? meta->num_subsongs : 1) : 1;
}

EXPORT void player_set_subsong(int n) {
    if (g_song) {
        pre_song_set_subsong(g_song, n);
        pre_song_start(g_song);
        g_playing = 1;
    }
}

EXPORT void player_set_channel_gain(int ch, float gain) {
    if (ch >= 0 && ch < 4) g_channel_gains[ch] = gain;
}

EXPORT void player_get_channel_levels(float* out) {
    memcpy(out, g_channel_levels, 4 * sizeof(float));
}

EXPORT float* player_get_scope_buffer(int ch) {
    if (ch < 0 || ch >= 4) return NULL;
    return g_scope_bufs[ch];
}

EXPORT int player_get_scope_buffer_size(void) {
    return g_scope_buf_size;
}

EXPORT void player_set_solo_channel(int ch) {
    if (g_song) pre_song_set_solo_channel(g_song, ch);
}

EXPORT void player_set_stereo_mix(float mix) {
    if (g_song) pre_song_set_stereo_mix(g_song, mix);
}

EXPORT void player_set_interp_mode(int mode) {
    if (g_song) pre_song_set_interp_mode(g_song, (PreInterpMode)mode);
}

/* ── Metadata queries ──────────────────────────────────────────────── */

EXPORT const char* player_get_title(void) {
    if (!g_song) return "PreTracker";
    const PreSongMetadata* meta = pre_song_get_metadata(g_song);
    return meta ? meta->song_name : "PreTracker";
}

EXPORT const char* player_get_author(void) {
    if (!g_song) return "";
    const PreSongMetadata* meta = pre_song_get_metadata(g_song);
    return meta ? meta->author : "";
}

EXPORT int player_get_num_waves(void) {
    if (!g_song) return 0;
    const PreSongMetadata* meta = pre_song_get_metadata(g_song);
    return meta ? meta->num_waves : 0;
}

EXPORT int player_get_num_instruments(void) {
    if (!g_song) return 0;
    const PreSongMetadata* meta = pre_song_get_metadata(g_song);
    return meta ? meta->num_instruments : 0;
}

EXPORT int player_get_num_positions(void) {
    if (!g_song) return 0;
    const PreSongMetadata* meta = pre_song_get_metadata(g_song);
    return meta ? meta->num_positions : 0;
}

EXPORT int player_get_num_steps(void) {
    if (!g_song) return 0;
    const PreSongMetadata* meta = pre_song_get_metadata(g_song);
    return meta ? meta->num_steps : 0;
}

EXPORT const char* player_get_wave_name(int idx) {
    if (!g_song || idx < 0 || idx >= PRE_MAX_WAVES) return "";
    const PreSongMetadata* meta = pre_song_get_metadata(g_song);
    return meta ? meta->wave_names[idx] : "";
}

EXPORT const char* player_get_instrument_name(int idx) {
    if (!g_song || idx < 0 || idx >= PRE_MAX_INSTRUMENTS) return "";
    const PreSongMetadata* meta = pre_song_get_metadata(g_song);
    return meta ? meta->instrument_names[idx] : "";
}

/* ── Track cell query ──────────────────────────────────────────────── */

static PreTrackCell g_last_cell;

EXPORT int player_get_track_cell(int track, int row) {
    if (!g_song) return 0;
    return pre_song_get_track_cell(g_song, (uint8_t)track, (uint8_t)row, &g_last_cell) ? 1 : 0;
}

EXPORT int player_cell_note(void) { return g_last_cell.note; }
EXPORT int player_cell_instrument(void) { return g_last_cell.instrument; }
EXPORT int player_cell_has_arpeggio(void) { return g_last_cell.has_arpeggio ? 1 : 0; }
EXPORT int player_cell_effect_cmd(void) { return g_last_cell.effect_cmd; }
EXPORT int player_cell_effect_data(void) { return g_last_cell.effect_data; }

/* ── Position entry query ──────────────────────────────────────────── */

static uint8_t g_pos_track_num;
static int8_t g_pos_pitch_shift;

EXPORT int player_get_position_entry(int position, int channel) {
    if (!g_song) return 0;
    return pre_song_get_position_entry(g_song, (uint16_t)position, (uint8_t)channel,
                                        &g_pos_track_num, &g_pos_pitch_shift) ? 1 : 0;
}

EXPORT int player_pos_track_num(void) { return g_pos_track_num; }
EXPORT int player_pos_pitch_shift(void) { return g_pos_pitch_shift; }

/* ── Live playback state ───────────────────────────────────────────── */

EXPORT int player_get_position(void) {
    if (!g_song) return 0;
    const PrePlaybackState* st = pre_song_get_playback_state(g_song);
    return st ? st->position : 0;
}

EXPORT int player_get_row(void) {
    if (!g_song) return 0;
    const PrePlaybackState* st = pre_song_get_playback_state(g_song);
    return st ? st->row : 0;
}

EXPORT int player_get_speed(void) {
    if (!g_song) return 6;
    const PrePlaybackState* st = pre_song_get_playback_state(g_song);
    return st ? st->speed : 6;
}

EXPORT int player_get_channel_instrument(int ch) {
    if (!g_song || ch < 0 || ch >= 4) return 0;
    const PrePlaybackState* st = pre_song_get_playback_state(g_song);
    return st ? st->channels[ch].instrument : 0;
}

EXPORT int player_get_channel_volume(int ch) {
    if (!g_song || ch < 0 || ch >= 4) return 0;
    const PrePlaybackState* st = pre_song_get_playback_state(g_song);
    return st ? st->channels[ch].volume : 0;
}

EXPORT int player_get_channel_wave(int ch) {
    if (!g_song || ch < 0 || ch >= 4) return 0;
    const PrePlaybackState* st = pre_song_get_playback_state(g_song);
    return st ? st->channels[ch].wave : 0;
}

EXPORT int player_get_channel_adsr_phase(int ch) {
    if (!g_song || ch < 0 || ch >= 4) return 0;
    const PrePlaybackState* st = pre_song_get_playback_state(g_song);
    return st ? st->channels[ch].adsr_phase : 0;
}

/* ── Wave info query (synth params) ────────────────────────────────── */

EXPORT int player_get_wave_info(int wave_idx, float* out32) {
    if (!g_song || wave_idx < 0 || wave_idx >= PRE_MAX_WAVES) return 0;
    /* Access internal MySong to read WaveInfo */
    struct PreSong* ps = g_song;
    /* PreSong starts with MySong as first field */
    MySong* ms = (MySong*)ps;
    if (wave_idx >= ms->num_waves) return 0;
    WaveInfo* wi = ms->waveinfo_table[wave_idx];
    if (!wi) return 0;

    /* Pack 30 WaveInfo fields into float array for JS to read */
    out32[0]  = (float)wi->loop_start;
    out32[1]  = (float)wi->loop_end;
    out32[2]  = (float)wi->subloop_len;
    out32[3]  = (float)wi->allow_9xx;
    out32[4]  = (float)wi->subloop_wait;
    out32[5]  = (float)wi->subloop_step;
    out32[6]  = (float)wi->chipram;
    out32[7]  = (float)wi->loop_offset;
    out32[8]  = (float)wi->chord_note1;
    out32[9]  = (float)wi->chord_note2;
    out32[10] = (float)wi->chord_note3;
    out32[11] = (float)wi->chord_shift;
    out32[12] = (float)wi->osc_phase_spd;
    out32[13] = (float)(wi->flags & WI_FLAG_OSC_TYPE_MASK);
    out32[14] = (float)wi->osc_phase_min;
    out32[15] = (float)wi->osc_phase_max;
    out32[16] = (float)wi->osc_basenote;
    out32[17] = (float)wi->osc_gain;
    out32[18] = (float)wi->sam_len;
    out32[19] = (float)wi->mix_wave;
    out32[20] = (float)wi->vol_attack;
    out32[21] = (float)wi->vol_delay;
    out32[22] = (float)wi->vol_decay;
    out32[23] = (float)wi->vol_sustain;
    out32[24] = (float)wi->flt_type;
    out32[25] = (float)wi->flt_resonance;
    out32[26] = (float)wi->pitch_ramp;
    out32[27] = (float)wi->flt_start;
    out32[28] = (float)wi->flt_min;
    out32[29] = (float)wi->flt_max;
    out32[30] = (float)wi->flt_speed;
    out32[31] = (float)wi->mod_wetness;
    out32[32] = (float)wi->mod_length;
    out32[33] = (float)wi->mod_predelay;
    out32[34] = (float)wi->mod_density;
    out32[35] = (float)(wi->flags & WI_FLAG_BOOST ? 1 : 0);
    out32[36] = (float)(wi->flags & WI_FLAG_PITCH_LINEAR ? 1 : 0);
    out32[37] = (float)(wi->flags & WI_FLAG_VOL_FAST ? 1 : 0);
    out32[38] = (float)(wi->flags & WI_FLAG_EXTRA_OCTAVES ? 1 : 0);
    return 1;
}

/* ── Instrument info query ─────────────────────────────────────────── */

EXPORT int player_get_inst_info(int inst_idx, float* out8) {
    if (!g_song || inst_idx < 0 || inst_idx >= PRE_MAX_INSTRUMENTS) return 0;
    MySong* ms = (MySong*)g_song;
    UnpackedInstrumentInfo* uii = &ms->inst_infos[inst_idx];

    out8[0] = (float)uii->vibrato_delay;
    out8[1] = (float)uii->vibrato_depth;
    out8[2] = (float)uii->vibrato_speed;
    out8[3] = (float)uii->adsr_attack;
    out8[4] = (float)uii->adsr_decay;
    out8[5] = (float)uii->adsr_sustain;
    out8[6] = (float)uii->adsr_release;
    out8[7] = (float)uii->pattern_steps;
    return 1;
}

/* ── Wave info WRITE (synth param live editing) ───────────────────── */

EXPORT int player_set_wave_info(int wave_idx, const float* in32) {
    if (!g_song || wave_idx < 0 || wave_idx >= PRE_MAX_WAVES) return 0;
    MySong* ms = (MySong*)g_song;
    if (wave_idx >= ms->num_waves) return 0;
    WaveInfo* wi = ms->waveinfo_table[wave_idx];
    if (!wi) return 0;

    wi->loop_start    = (u16)in32[0];
    wi->loop_end      = (u16)in32[1];
    wi->subloop_len   = (u16)in32[2];
    wi->allow_9xx     = (u8)in32[3];
    wi->subloop_wait  = (u8)in32[4];
    wi->subloop_step  = (u16)in32[5];
    wi->chipram       = (u16)in32[6];
    wi->loop_offset   = (u16)in32[7];
    wi->chord_note1   = (u8)in32[8];
    wi->chord_note2   = (u8)in32[9];
    wi->chord_note3   = (u8)in32[10];
    wi->chord_shift   = (u8)in32[11];
    wi->osc_phase_spd = (u8)in32[12];
    /* Rebuild flags byte from individual booleans */
    u8 oscType        = (u8)in32[13] & WI_FLAG_OSC_TYPE_MASK;
    u8 flags = oscType;
    if ((int)in32[38]) flags |= WI_FLAG_EXTRA_OCTAVES;
    if ((int)in32[35]) flags |= WI_FLAG_BOOST;
    if ((int)in32[36]) flags |= WI_FLAG_PITCH_LINEAR;
    if ((int)in32[37]) flags |= WI_FLAG_VOL_FAST;
    wi->flags         = flags;
    wi->osc_phase_min = (u8)in32[14];
    wi->osc_phase_max = (u8)in32[15];
    wi->osc_basenote  = (u8)in32[16];
    wi->osc_gain      = (u8)in32[17];
    wi->sam_len       = (u8)in32[18];
    wi->mix_wave      = (u8)in32[19];
    wi->vol_attack    = (u8)in32[20];
    wi->vol_delay     = (u8)in32[21];
    wi->vol_decay     = (u8)in32[22];
    wi->vol_sustain   = (u8)in32[23];
    wi->flt_type      = (u8)in32[24];
    wi->flt_resonance = (u8)in32[25];
    wi->pitch_ramp    = (u8)in32[26];
    wi->flt_start     = (u8)in32[27];
    wi->flt_min       = (u8)in32[28];
    wi->flt_max       = (u8)in32[29];
    wi->flt_speed     = (u8)in32[30];
    wi->mod_wetness   = (u8)in32[31];
    wi->mod_length    = (u8)in32[32];
    wi->mod_predelay  = (u8)in32[33];
    wi->mod_density   = (u8)in32[34];
    return 1;
}

/* ── Instrument info WRITE ────────────────────────────────────────── */

EXPORT int player_set_inst_info(int inst_idx, const float* in8) {
    if (!g_song || inst_idx < 0 || inst_idx >= PRE_MAX_INSTRUMENTS) return 0;
    MySong* ms = (MySong*)g_song;
    UnpackedInstrumentInfo* uii = &ms->inst_infos[inst_idx];

    uii->vibrato_delay  = (i16)in8[0];
    uii->vibrato_depth  = (i16)in8[1];
    uii->vibrato_speed  = (i16)in8[2];
    uii->adsr_attack    = (i16)in8[3];
    uii->adsr_decay     = (i16)in8[4];
    uii->adsr_sustain   = (i16)in8[5];
    uii->adsr_release   = (u8)in8[6];
    uii->pattern_steps  = (u8)in8[7];
    return 1;
}

/* ── Raw instrument info (8 bytes, lookup table indices) ──────────── */

static const u8 vib_delay_table[16] = { 0, 4, 8, 10, 12, 14, 16, 18, 20, 24, 32, 40, 56, 96, 150, 255 };
static const u8 vib_depth_table[16] = { 0, 8, 9, 10, 11, 12, 13, 14, 18, 20, 28, 40, 50, 70, 160, 255 };
static const u8 vib_speed_table[16] = { 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 20, 40, 80 };
static const i16 fast_roll_off[16] = { 0x400,0x200,0x80,0x64,0x50,0x40,0x30,0x20,0x10,14,12,10,8,4,2,1 };
static const u8 ramp_up[16] = { 0, 1, 3, 6, 7, 9, 10, 11, 12, 13, 14, 16, 19, 35, 55, 143 };

static u8 reverse_lookup_u8(const u8* table, int len, int value) {
    int best = 0;
    int bestDist = abs((int)table[0] - value);
    for (int i = 1; i < len; i++) {
        int d = abs((int)table[i] - value);
        if (d < bestDist) { bestDist = d; best = i; }
    }
    return (u8)best;
}

static u8 reverse_lookup_i16(const i16* table, int len, int value) {
    int best = 0;
    int bestDist = abs((int)table[0] - value);
    for (int i = 1; i < len; i++) {
        int d = abs((int)table[i] - value);
        if (d < bestDist) { bestDist = d; best = i; }
    }
    return (u8)best;
}

EXPORT int player_get_raw_inst_info(int inst_idx, uint8_t* out8) {
    if (!g_song || inst_idx < 0 || inst_idx >= PRE_MAX_INSTRUMENTS) return 0;
    MySong* ms = (MySong*)g_song;
    UnpackedInstrumentInfo* uii = &ms->inst_infos[inst_idx];

    /* Reverse-map unpacked values back to raw table indices */
    out8[0] = reverse_lookup_u8(vib_delay_table, 16, (int)uii->vibrato_delay - 1);
    out8[1] = reverse_lookup_u8(vib_depth_table, 16, (int)uii->vibrato_depth);
    /* vibrato_speed = (speed_table[vs] * depth) >> 4, reverse: vs_raw such that speed_table[vs] ≈ (stored_speed << 4) / depth */
    if (uii->vibrato_depth > 0) {
        int raw_speed = ((int)uii->vibrato_speed << 4) / (int)uii->vibrato_depth;
        out8[2] = reverse_lookup_u8(vib_speed_table, 16, raw_speed);
    } else {
        out8[2] = 0;
    }
    out8[3] = reverse_lookup_i16(fast_roll_off, 16, (int)uii->adsr_attack);
    out8[4] = reverse_lookup_u8(ramp_up, 16, (int)uii->adsr_decay);
    /* sustain: raw = unpacked >> 6, clamped; if raw==16 then stored as 15 */
    int sus_raw = (int)uii->adsr_sustain >> 6;
    if (sus_raw >= 16) sus_raw = 15;
    out8[5] = (u8)sus_raw;
    out8[6] = reverse_lookup_u8(ramp_up, 16, (int)uii->adsr_release);
    out8[7] = uii->pattern_steps;
    return 1;
}

EXPORT int player_set_raw_inst_info(int inst_idx, const uint8_t* in8) {
    if (!g_song || inst_idx < 0 || inst_idx >= PRE_MAX_INSTRUMENTS) return 0;
    MySong* ms = (MySong*)g_song;
    UnpackedInstrumentInfo* uii = &ms->inst_infos[inst_idx];

    u8 vd = in8[0] & 0x0F;
    u8 vdp = in8[1] & 0x0F;
    u8 vs = in8[2] & 0x0F;
    u8 atk = in8[3] & 0x0F;
    u8 dec = in8[4] & 0x0F;
    u8 sus = in8[5] & 0x0F;
    u8 rel = in8[6] & 0x0F;

    uii->vibrato_delay = (i16)(vib_delay_table[vd] + 1);
    uii->vibrato_depth = (i16)vib_depth_table[vdp];
    uii->vibrato_speed = (i16)(((i16)vib_speed_table[vs] * uii->vibrato_depth) >> 4);
    uii->adsr_attack = fast_roll_off[atk];
    uii->adsr_decay = (i16)ramp_up[dec];
    u8 s = sus;
    if (s == 15) s = 16;
    uii->adsr_sustain = (i16)((u16)s << 6);
    uii->adsr_release = ramp_up[rel];
    uii->pattern_steps = in8[7];
    return 1;
}

/* ── Instrument pattern step WRITE ────────────────────────────────── */

EXPORT int player_set_inst_pattern_step(int inst_idx, int step, int pitch_byte, int cmd_byte, int cmd_data) {
    if (!g_song || inst_idx < 0 || inst_idx >= PRE_MAX_INSTRUMENTS) return 0;
    MySong* ms = (MySong*)g_song;
    u8* pat = ms->inst_patterns_table[inst_idx];
    if (!pat) return 0;
    int steps = (int)ms->inst_infos[inst_idx].pattern_steps;
    if (step < 0 || step >= steps) return 0;

    u8* p = pat + step * 3;
    p[0] = (u8)pitch_byte;
    p[1] = (u8)cmd_byte;
    p[2] = (u8)cmd_data;
    return 1;
}

/* ── Pattern cell WRITE (3-byte packed format) ────────────────────── */

EXPORT int player_set_track_cell(int track, int row, int pitch_ctrl, int inst_effect, int effect_data) {
    if (!g_song) return 0;
    MySong* ms = (MySong*)g_song;
    if (track < 1) return 0;
    u8* cell = ms->patterns_ptr + (track - 1) * (ms->num_steps * 3) + row * 3;
    cell[0] = (u8)pitch_ctrl;
    cell[1] = (u8)inst_effect;
    cell[2] = (u8)effect_data;
    return 1;
}

/* ── Position table WRITE ─────────────────────────────────────────── */

EXPORT int player_set_position_entry(int position, int channel, int track_num, int pitch_shift) {
    if (!g_song || channel < 0 || channel >= 4) return 0;
    MySong* ms = (MySong*)g_song;
    if (position < 0 || position >= ms->pat_pos_len) return 0;
    u8* entry = ms->pos_data_adr + (position * 4 + channel) * 2;
    entry[0] = (u8)track_num;
    entry[1] = (u8)(int8_t)pitch_shift;
    return 1;
}

/* ── Instrument pattern step query ─────────────────────────────────── */

EXPORT int player_get_inst_pattern_steps(int inst_idx) {
    if (!g_song || inst_idx < 0 || inst_idx >= PRE_MAX_INSTRUMENTS) return 0;
    MySong* ms = (MySong*)g_song;
    return (int)ms->inst_infos[inst_idx].pattern_steps;
}

EXPORT int player_get_inst_pattern_step(int inst_idx, int step, int* out3) {
    if (!g_song || inst_idx < 0 || inst_idx >= PRE_MAX_INSTRUMENTS) return 0;
    MySong* ms = (MySong*)g_song;
    u8* pat = ms->inst_patterns_table[inst_idx];
    if (!pat) return 0;
    int steps = (int)ms->inst_infos[inst_idx].pattern_steps;
    if (step < 0 || step >= steps) return 0;

    u8* p = pat + step * 3;
    out3[0] = (int)p[0]; // pitch_byte (bits: 7=stitch, 6=pin, 5-0=note)
    out3[1] = (int)p[1]; // cmd_byte (lower nibble = command)
    out3[2] = (int)p[2]; // cmd_data
    return 1;
}

/* ── Full song data export (for .prt serialization) ───────────────── */

EXPORT int player_get_num_tracks(void) {
    if (!g_song) return 0;
    MySong* ms = (MySong*)g_song;
    /* Count unique tracks by scanning position table */
    int max_track = 0;
    for (int pos = 0; pos < ms->pat_pos_len; pos++) {
        for (int ch = 0; ch < 4; ch++) {
            u8* entry = ms->pos_data_adr + (pos * 4 + ch) * 2;
            int t = (int)entry[0];
            if (t > max_track) max_track = t;
        }
    }
    return max_track;
}

EXPORT int player_get_raw_file_size(void) {
    if (!g_song) return 0;
    /* prt_data_size is at a known offset in PreSong — use the public API
       to get a pointer and walk to the data. Since PreSong layout is:
       MySong, MyPlayer, MixerState, PreSongMetadata, PrePlaybackState,
       f32*, u8*, u32, ... we use the pre_song_get_metadata trick to verify
       song is valid, then access the raw data through the opaque pointer. */
    /* Actually, the raw file was passed to player_init. We save our own copy. */
    return (int)g_raw_file_size;
}

EXPORT const uint8_t* player_get_raw_file_data(void) {
    if (!g_song) return NULL;
    return g_raw_file_data;
}

EXPORT double player_detect_duration(void) { return 0.0; }
