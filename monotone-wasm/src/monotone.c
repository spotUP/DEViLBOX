// SPDX-License-Identifier: Unlicense
// C port of MONOTONE (Jim Leonard / Trixter, Unlicense).
//   MT_PLAY.PAS  TPlayerEngine.Init / CalcAllChannels, TMTV1Player.CalcAllChannels
//   MT_OUTP.PAS  TPCSpeakerSimple.setAllChannels / updateAllChannels
//   MT_EDIT.PAS:205 creates the speaker with equalShare=false.
//
// Tick structure of the original (interrupt at 60 Hz, handler in TInterrupts,
// which is not in the repo): player.CalcAllChannels, then
// output.setAllChannels. setAllChannels first programs the PIT with the
// frequency chosen on the PREVIOUS tick (lastFreqWritten) and only then picks
// the new one: the output is one tick late. mt_tick() is exactly that pair.
//
// PITfreq UNVERIFIED: the constant lives in Trixter's TInterrupts unit, which
// is not in the repo and was not found online. 1193182 Hz (the standard PC PIT
// input clock, 14.31818 MHz / 12) is used. The other candidate, $1234DD =
// 1193181, differs by under 1 ppm (inaudible); only the divisor can differ by
// one count for a handful of frequencies. Divisor = PITfreq div frequency
// (integer), as the dump path in MT_OUTP.PAS:394 does with PITdivs.

#include "monotone.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

// MT_GLOB.PAS
#define NOTE_END 127
#define IBO 12
#define IBN 8
#define NUM_OCTAVES 8
#define MAX_NOTE (3 + NUM_OCTAVES * IBO + 1)   // 100
#define MAX_ROWS 64
#define MAX_CHANNELS 12
#define NUM_ORDERS 256
#define NOTES_HZ_SIZE (MAX_NOTE * IBN + 1)     // TNoteIntervalType 0..maxNote*IBN

// MT_PLAY.PAS
#define DEFAULT_TEMPO 4
#define PLAYER_HZ 60
#define VIB_TABLE_SIZE 32
#define VIB_TABLE_DEPTH (IBN * 8)
#define MIN_HZ 20
#define MAX_HZ (65535 - 63)

// MT_OUTP.PAS
#define SILENT 0xFFFF
#define NUM_PHYSICAL_CHANNELS 4
#define PIT_FREQ 1193182u  // UNVERIFIED, see header comment

#define HEADER_SIZE 351
#define OUTPUT_AMPLITUDE 0.3

enum { PA_IDLE, PA_STOP, PA_PLAYPATTERN, PA_PLAYSONGTOP };

typedef struct {
    bool active;
    uint16_t note_interval;
    uint16_t frequency;
} VChan;

typedef struct {
    uint8_t note, effect, parm1, parm2, last_note_played;
    uint16_t effectraw;
    uint16_t porta_stop_hz;
    uint8_t porta_delta, vib_speed, vib_depth, vib_index;
} VData;

struct MtModule {
    uint8_t header[HEADER_SIZE];
    int num_tracks, num_patterns;
    uint8_t orders[NUM_ORDERS];
    uint16_t* cells;            // patterns * 64 * tracks
    char title[41], comment[41];

    // player
    uint16_t notes_hz[NOTES_HZ_SIZE];
    int8_t vib_table[VIB_TABLE_SIZE];
    int num_vchannels;
    VChan vchan[MAX_CHANNELS];
    VData vdata[MAX_CHANNELS];
    uint8_t tick_count, tempo;
    int cur_action;
    bool song_ip, pat_ip;
    bool looping;
    bool manual_pat_break, manual_pat_jump;
    int cur_order, cur_pattern, cur_row;   // TSong.currentOrder / currentLoc

    // speaker
    uint8_t dominant;
    uint16_t last_freq_written;
    uint32_t channel_mask;

    // inspection
    int shown_order, shown_row, shown_pattern;
    int sounding_track;
    bool ended;

    // synthesis
    float sample_rate;
    double tick_frac;      // output samples left in the current tick
    double phase;          // square-wave phase in cycles
    uint16_t out_freq;     // frequency being played this tick (SILENT = none)
    uint32_t out_div;
};

static uint16_t rd16(const uint8_t* p) { return (uint16_t)(p[0] | (p[1] << 8)); }

// Turbo Pascal round(): half away from zero.
static long pas_round(double x) { return (long)(x < 0 ? ceil(x - 0.5) : floor(x + 0.5)); }

static void init_note_table(MtModule* m) {
    // TPlayerEngine.Init. temphz is a Pascal real, accumulated unrounded.
    double interval = exp(log(2.0) / (IBO * IBN));
    m->notes_hz[0] = 440;
    double hz = 27.5;
    for (int n = IBN - 1; n >= 1; n--) {
        hz = hz / interval;
        if (hz < 19) hz = 19;
        m->notes_hz[n] = (uint16_t)pas_round(hz);
    }
    hz = 27.5;
    m->notes_hz[IBN] = (uint16_t)pas_round(hz);
    for (int n = IBN + 1; n <= MAX_NOTE * IBN; n++) {
        hz = hz * interval;
        m->notes_hz[n] = (uint16_t)pas_round(hz);
    }
    for (int b = 0; b < VIB_TABLE_SIZE; b++)
        m->vib_table[b] = (int8_t)pas_round(VIB_TABLE_DEPTH * sin(b * M_PI / VIB_TABLE_SIZE * 2));
}

// Out-of-range note-table reads (arpeggio/vibrato past the top of the table, or
// a slide target on a never-played channel) are undefined behaviour in the
// Pascal (range checks off, reads whatever memory follows). Clamped here.
static uint16_t hz_at(const MtModule* m, long idx) {
    if (idx < 0) idx = 0;
    if (idx > MAX_NOTE * IBN) idx = MAX_NOTE * IBN;
    return m->notes_hz[idx];
}

static const uint16_t* row_ptr(const MtModule* m, int pattern, int row) {
    return m->cells + ((size_t)pattern * MAX_ROWS + row) * m->num_tracks;
}

static void update_notes_per_row(MtModule* m) {
    static const uint8_t eff_to_visual[8] = {0x0, 0x1, 0x2, 0x3, 0x4, 0xb, 0xd, 0xf};
    m->tick_count = 0;
    m->shown_order = m->cur_order;
    m->shown_row = m->cur_row;
    m->shown_pattern = m->cur_pattern;
    int pat = m->cur_pattern, row = m->cur_row;
    bool valid = pat >= 0 && pat < m->num_patterns && row >= 0 && row < MAX_ROWS;
    const uint16_t* cur = valid ? row_ptr(m, pat, row) : NULL;

    for (int ch = 0; ch < m->num_vchannels; ch++) {
        uint16_t w = cur ? cur[ch] : 0;
        VData* d = &m->vdata[ch];
        d->note = (uint8_t)(w >> 9);
        uint16_t ax = w & 0x1FF;   // 0000000e eedddddd
        if (ax == 0) {
            d->effectraw = 0; d->effect = 0; d->parm1 = 0; d->parm2 = 0;
        } else {
            uint8_t e = (uint8_t)((ax >> 6) & 7), data = (uint8_t)(ax & 63);
            d->effectraw = (uint16_t)((eff_to_visual[e] << 8) | data);
            d->effect = eff_to_visual[e];
            d->parm1 = data;
            if (d->effect == 0 || d->effect == 4) {
                d->parm1 = data >> 3;
                d->parm2 = data & 7;
            }
            // other effects: parm2 keeps its previous value, as in the Pascal
        }
    }

    for (int ch = 0; ch < m->num_vchannels; ch++) {
        VChan* v = &m->vchan[ch];
        VData* d = &m->vdata[ch];
        if (d->note == NOTE_END) {
            v->active = false;
        } else if (d->note >= 1 && d->note <= MAX_NOTE && d->effect != 0x3) {
            v->active = true;
            v->note_interval = (uint16_t)(d->note * IBN);
            v->frequency = m->notes_hz[v->note_interval];
            d->last_note_played = d->note;
            d->vib_index = 0;
        }
    }

    m->manual_pat_break = false;
    m->manual_pat_jump = false;
    for (int ch = 0; ch < m->num_vchannels; ch++) {
        VData* d = &m->vdata[ch];
        if (d->effectraw == 0) continue;
        switch (d->effect) {
            case 0x3:
                if (d->note >= 1 && d->note <= MAX_NOTE) d->porta_stop_hz = m->notes_hz[d->note * IBN];
                if (d->parm1 != 0) d->porta_delta = d->parm1;
                break;
            case 0x4:
                if (d->parm1 != 0) d->vib_speed = d->parm1;
                if (d->parm2 != 0) d->vib_depth = d->parm2;
                d->vib_index = (uint8_t)((d->vib_index + d->vib_speed) & (VIB_TABLE_SIZE - 1));
                break;
            case 0xb:
                if (m->looping) {
                    m->cur_order = d->parm1;
                    m->cur_row = -1;
                    if (m->cur_order > NUM_ORDERS) m->cur_order = 0;
                    m->manual_pat_jump = true;
                    m->cur_pattern = m->orders[m->cur_order & 0xFF];
                } else {
                    m->song_ip = false;
                    m->cur_action = PA_STOP;
                }
                break;
            case 0xd:
                m->cur_row = d->parm1 - 1;
                if (m->cur_row >= MAX_ROWS) m->cur_row = -1;
                if (!m->manual_pat_break && !m->manual_pat_jump) m->cur_order++;
                if (m->cur_order > NUM_ORDERS) m->cur_order = 0;
                m->manual_pat_break = true;
                if (m->cur_order < NUM_ORDERS && m->orders[m->cur_order] != 0xFF)
                    m->cur_pattern = m->orders[m->cur_order];
                break;
            case 0xf:
                m->tempo = d->parm1;
                break;
        }
    }
}

static void update_effects_per_tick(MtModule* m) {
    for (int ch = 0; ch < m->num_vchannels; ch++) {
        VData* d = &m->vdata[ch];
        VChan* v = &m->vchan[ch];
        if (d->effectraw == 0) continue;
        switch (d->effect) {
            case 0x0: {
                switch (m->tick_count % 3) {
                    case 0: v->note_interval = (uint16_t)(d->last_note_played * IBN); break;
                    case 1: v->note_interval = (uint16_t)((d->last_note_played + d->parm1) * IBN); break;
                    case 2: v->note_interval = (uint16_t)((d->last_note_played + d->parm2) * IBN); break;
                }
                v->frequency = hz_at(m, v->note_interval);
                break;
            }
            case 0x1: {
                int f = (int)v->frequency + d->parm1;
                v->frequency = f > MAX_HZ ? MAX_HZ : (uint16_t)f;
                break;
            }
            case 0x2: {
                int f = (int)v->frequency - d->parm1;
                v->frequency = f < MIN_HZ ? MIN_HZ : (uint16_t)f;
                break;
            }
            case 0x3:
                if (v->frequency < d->porta_stop_hz) {
                    v->frequency = (uint16_t)(v->frequency + d->porta_delta);
                    if (v->frequency > d->porta_stop_hz) v->frequency = d->porta_stop_hz;
                }
                if (v->frequency > d->porta_stop_hz) {
                    v->frequency = (uint16_t)(v->frequency - d->porta_delta);
                    if (v->frequency < d->porta_stop_hz) v->frequency = d->porta_stop_hz;
                }
                break;
            case 0x4: {
                // Pascal div truncates toward zero, as C does.
                long idx = (long)v->note_interval + ((long)m->vib_table[d->vib_index] * d->vib_depth) / VIB_TABLE_DEPTH;
                v->frequency = hz_at(m, idx);
                d->vib_index = (uint8_t)((d->vib_index + d->vib_speed) & (VIB_TABLE_SIZE - 1));
                break;
            }
        }
    }
}

// TMTV1Player.CalcAllChannels (the inherited part only matters for pa_Stop).
static void calc_all_channels(MtModule* m) {
    if (m->cur_action == PA_STOP) {
        for (int i = 0; i < m->num_vchannels; i++) m->vchan[i].active = false;
        m->song_ip = false;
        m->pat_ip = false;
        m->tick_count = 0;
        m->cur_action = PA_IDLE;
        m->ended = true;
    }
    // Pascal CASE: the branch is chosen once; PlaySongTop only arms the player.
    switch (m->cur_action) {
        case PA_PLAYPATTERN:
            if (!m->pat_ip) {
                m->pat_ip = true;
                m->cur_row = 0;
                m->tick_count = m->tempo;
            }
            m->tick_count++;   // byte arithmetic
            if (m->tick_count >= m->tempo) {
                m->tick_count = 0;
                if (m->cur_row >= MAX_ROWS) {
                    if (m->song_ip) {
                        m->cur_order++;
                        if (m->cur_order >= NUM_ORDERS || m->orders[m->cur_order] == 0xFF) {
                            if (m->cur_order > 0) m->cur_order--;
                            m->song_ip = false;
                            m->cur_action = PA_STOP;
                        }
                        m->cur_pattern = m->orders[m->cur_order];
                    }
                    m->cur_row = 0;
                }
                update_notes_per_row(m);
                m->cur_row++;
            } else {
                update_effects_per_tick(m);
            }
            if (m->orders[m->cur_order & 0xFF] == 0xFF) {
                if (m->cur_order > 0) m->cur_order--;
                m->song_ip = false;
                m->cur_action = PA_STOP;
            }
            break;
        case PA_PLAYSONGTOP:
            m->song_ip = true;
            m->cur_order = 0;
            m->cur_pattern = m->orders[0];
            m->cur_row = 0;
            m->tick_count = m->tempo;
            m->cur_action = PA_PLAYPATTERN;
            break;
        default:
            break;
    }
}

// TPCSpeakerSimple.updateAllChannels, equalShare = false.
static void update_all_channels(MtModule* m) {
    VChan* d = &m->vchan[m->dominant];
    bool dom_active = d->active && (m->channel_mask >> m->dominant & 1);
    if (dom_active) {
        m->last_freq_written = d->frequency;
        m->sounding_track = m->dominant;
    } else {
        int active = 0;
        for (int b = 0; b < m->num_vchannels; b++)
            active += (m->vchan[b].active && (m->channel_mask >> b & 1)) ? 1 : 0;
        if (active == 0) {
            m->last_freq_written = SILENT;
            m->sounding_track = -1;
        }
    }
    m->dominant++;
    if (m->dominant > m->num_vchannels - 1 || m->tick_count == 0) m->dominant = 0;
}

static void program_pit(MtModule* m, uint16_t freq) {
    // Chan2SquarewaveChange(lastFreqWritten): value programmed now is the one
    // chosen on the previous tick.
    m->out_freq = freq;
    if (freq == SILENT || freq == 0) {
        m->out_div = 0;
    } else {
        uint32_t div = PIT_FREQ / freq;
        if (div > 0xFFFF) div = 0xFFFF;
        if (div < 1) div = 1;
        m->out_div = div;
    }
}

void mt_tick(MtModule* m) {
    calc_all_channels(m);
    // setAllChannels
    program_pit(m, m->last_freq_written);
    update_all_channels(m);
}

void mt_restart(MtModule* m) {
    m->cur_action = PA_PLAYSONGTOP;
    m->song_ip = false; m->pat_ip = false;
    m->cur_order = 0; m->cur_pattern = m->orders[0]; m->cur_row = 0;
    m->tick_count = 0;
    m->dominant = 0;
    m->last_freq_written = SILENT;
    m->sounding_track = -1;
    m->shown_order = 0; m->shown_row = 0; m->shown_pattern = m->orders[0];
    m->ended = false;
    m->tempo = (uint8_t)(m->num_tracks < DEFAULT_TEMPO ? DEFAULT_TEMPO : m->num_tracks);
    memset(m->vchan, 0, sizeof(m->vchan));
    memset(m->vdata, 0, sizeof(m->vdata));
    m->tick_frac = 0;
    m->phase = 0;
    m->out_freq = SILENT;
    m->out_div = 0;
}

MtModule* mt_create(const uint8_t* data, size_t size, float sample_rate) {
    if (!data || size < HEADER_SIZE) return NULL;
    if (data[0] != 8 || memcmp(data + 1, "MONOTONE", 8) != 0) return NULL;
    if (data[91] != 1 || data[94] != 2) return NULL;
    int pats = data[92], tracks = data[93];
    if (pats < 1 || tracks < 1 || tracks > MAX_CHANNELS) return NULL;
    size_t cell_bytes = (size_t)pats * MAX_ROWS * tracks * 2;
    if (size < HEADER_SIZE + cell_bytes) return NULL;

    MtModule* m = (MtModule*)calloc(1, sizeof(MtModule));
    if (!m) return NULL;
    m->cells = (uint16_t*)malloc(cell_bytes);
    if (!m->cells) { free(m); return NULL; }
    memcpy(m->header, data, HEADER_SIZE);
    memcpy(m->orders, data + 95, NUM_ORDERS);
    m->num_tracks = tracks;
    m->num_patterns = pats;
    for (size_t i = 0; i < cell_bytes / 2; i++) m->cells[i] = rd16(data + HEADER_SIZE + i * 2);
    for (int i = 0; i < 40; i++) { m->title[i] = (char)data[10 + i]; m->comment[i] = (char)data[51 + i]; }
    { int l = data[9] > 40 ? 40 : data[9]; m->title[l] = 0; l = data[50] > 40 ? 40 : data[50]; m->comment[l] = 0; }

    m->sample_rate = sample_rate > 0 ? sample_rate : 48000.0f;
    m->looping = true;
    m->channel_mask = 0xFFFFFFFFu;
    init_note_table(m);
    // Output init caps the player to 4 channels after the player computed its tempo.
    m->num_vchannels = tracks > NUM_PHYSICAL_CHANNELS ? NUM_PHYSICAL_CHANNELS : tracks;
    mt_restart(m);
    return m;
}

void mt_destroy(MtModule* m) {
    if (!m) return;
    free(m->cells);
    free(m);
}

int mt_track_count(const MtModule* m) { return m ? m->num_tracks : 0; }
int mt_channel_count(const MtModule* m) { return m ? m->num_vchannels : 0; }
void mt_set_channel_mask(MtModule* m, uint32_t mask) { if (m) m->channel_mask = mask; }

// Mean of a +/-1 square wave (period 1 cycle, high for the first half) over
// the phase interval [p0, p1].
static double tri(double p) {
    double f = p - floor(p);
    return f <= 0.5 ? f : 1.0 - f;
}

size_t mt_render(MtModule* m, float* out, size_t frames) {
    if (!m || !out) return 0;
    const double spt = (double)m->sample_rate / PLAYER_HZ;   // samples per tick
    for (size_t i = 0; i < frames; i++) {
        if (m->tick_frac <= 0) {
            mt_tick(m);
            m->tick_frac += spt;
        }
        double v = 0;
        if (m->out_div) {
            double cps = (double)PIT_FREQ / m->out_div;       // cycles per second
            double dp = cps / m->sample_rate;
            double p1 = m->phase + dp;
            // integral of square over [phase, p1] = 2*(tri(p1)-tri(p0)) mapped to +/-1
            double avg = 2.0 * (tri(p1) - tri(m->phase)) / dp;
            // tri integrates +1 on the first half and -1 on the second; with
            // tri(p)=f (f<=.5) else 1-f the slope is +1 then -1: correct.
            v = avg * OUTPUT_AMPLITUDE;
            m->phase = p1 - floor(p1);
            // keep avg bounded to [-1,1]
            if (avg > 1.0 || avg < -1.0) v = (avg > 0 ? 1 : -1) * OUTPUT_AMPLITUDE;
        }
        out[i] = (float)v;
        m->tick_frac -= 1.0;
    }
    return frames;
}

size_t mt_render_stereo(MtModule* m, float* lr, size_t frames) {
    if (!m || !lr) return 0;
    // render mono into the second half, then spread forward (writes 2i,2i+1 never reach unread mono[j>i])
    float* mono = lr + frames;
    mt_render(m, mono, frames);
    for (size_t i = 0; i < frames; i++) { lr[2 * i] = mono[i]; lr[2 * i + 1] = mono[i]; }
    return frames;
}

bool mt_has_ended(const MtModule* m) { return m ? m->ended : true; }
int mt_get_position(const MtModule* m) { return m ? m->shown_order : 0; }
int mt_get_row(const MtModule* m) { return m ? m->shown_row : 0; }
int mt_get_rows(const MtModule* m) { return m ? MAX_ROWS : 0; }
int mt_get_pattern(const MtModule* m) { return m ? m->shown_pattern : 0; }
int mt_get_sounding_track(const MtModule* m) { return m ? m->sounding_track : -1; }
int mt_get_divisor(const MtModule* m) { return m ? (int)m->out_div : 0; }
float mt_get_frequency(const MtModule* m) { return (m && m->out_div) ? (float)((double)PIT_FREQ / m->out_div) : 0.0f; }
int mt_tick_in_row(const MtModule* m) { return m ? m->tick_count : 0; }
int mt_get_speed(const MtModule* m) { return m ? m->tempo : 0; }
int mt_get_channel_frequency(const MtModule* m, int t) { return (m && t >= 0 && t < m->num_vchannels) ? m->vchan[t].frequency : 0; }
int mt_get_channel_active(const MtModule* m, int t) { return (m && t >= 0 && t < m->num_vchannels) ? m->vchan[t].active : 0; }

int mt_get_pattern_count(const MtModule* m) { return m ? m->num_patterns : 0; }
int mt_get_order(const MtModule* m, int i) { return (m && i >= 0 && i < NUM_ORDERS) ? m->orders[i] : 255; }
int mt_set_order(MtModule* m, int i, int pat) {
    if (!m || i < 0 || i >= NUM_ORDERS || pat < 0 || pat > 255) return 0;
    m->orders[i] = (uint8_t)pat;
    return 1;
}
uint16_t mt_get_cell(const MtModule* m, int p, int r, int t) {
    if (!m || p < 0 || p >= m->num_patterns || r < 0 || r >= MAX_ROWS || t < 0 || t >= m->num_tracks) return 0;
    return row_ptr(m, p, r)[t];
}
int mt_set_cell(MtModule* m, int p, int r, int t, uint16_t cell) {
    if (!m || p < 0 || p >= m->num_patterns || r < 0 || r >= MAX_ROWS || t < 0 || t >= m->num_tracks) return 0;
    m->cells[((size_t)p * MAX_ROWS + r) * m->num_tracks + t] = cell;
    return 1;
}
const char* mt_get_title(const MtModule* m) { return m ? m->title : ""; }
const char* mt_get_comment(const MtModule* m) { return m ? m->comment : ""; }

size_t mt_export(const MtModule* m, uint8_t* out, size_t max_size) {
    if (!m) return 0;
    size_t cell_bytes = (size_t)m->num_patterns * MAX_ROWS * m->num_tracks * 2;
    size_t total = HEADER_SIZE + cell_bytes;
    if (!out) return total;
    if (max_size < total) return 0;
    memcpy(out, m->header, HEADER_SIZE);
    memcpy(out + 95, m->orders, NUM_ORDERS);
    for (size_t i = 0; i < cell_bytes / 2; i++) {
        out[HEADER_SIZE + i * 2] = (uint8_t)(m->cells[i] & 0xFF);
        out[HEADER_SIZE + i * 2 + 1] = (uint8_t)(m->cells[i] >> 8);
    }
    return total;
}

// Swap in an edited .MON while playing: cells, orders and header are replaced,
// playback state (order, row, tick, channel state) is kept. The track and
// pattern counts must match; a different shape is refused (returns 0).
int mt_replace_song(MtModule* m, const uint8_t* data, size_t size) {
    if (!m || !data || size < HEADER_SIZE) return 0;
    if (data[0] != 8 || memcmp(data + 1, "MONOTONE", 8) != 0) return 0;
    if (data[92] != m->num_patterns || data[93] != m->num_tracks) return 0;
    size_t cell_bytes = (size_t)m->num_patterns * MAX_ROWS * m->num_tracks * 2;
    if (size < HEADER_SIZE + cell_bytes) return 0;
    memcpy(m->header, data, HEADER_SIZE);
    memcpy(m->orders, data + 95, NUM_ORDERS);
    for (size_t i = 0; i < cell_bytes / 2; i++) m->cells[i] = rd16(data + HEADER_SIZE + i * 2);
    return 1;
}
