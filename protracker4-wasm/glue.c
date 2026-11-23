/*
 * ProTracker 4 playback for DEViLBOX: one song at a time on top of libpt4
 * (https://github.com/akustikrausch/protracker4, libpt4/, zlib licence).
 * The exports mirror the single-instance player the PumaTracker worklet drives.
 */
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "pt4.h"

static pt4_song *g_song;
static unsigned g_rate = 48000;
static uint32_t g_muted; /* bit N set = channel N silent; survives a reload */

static void apply_mutes(void) {
    int n = pt4_channels(g_song);
    for (int c = 0; c < n && c < 32; c++) pt4_mute(g_song, c, (g_muted >> c) & 1);
}

/* 0 = loaded, otherwise the libpt4 error code. The previous song stays if the new one does not open. */
int player_load(const uint8_t *data, int len) {
    int err = 0;
    pt4_song *s = pt4_open(data, (size_t)len, NULL, &err);
    if (!s) return err ? err : -1;
    if (g_song) pt4_close(g_song);
    g_song = s;
    pt4_set_loop(g_song, 1); /* play on after the end, as the tracker does */
    pt4_set_option(g_song, PT4_OPT_STEREO, 2); /* stereo 50 %: the tracker's own first-start setting (PT41_FORMAT.md 7.4); hard left/right is too wide on headphones */
    apply_mutes();
    return 0;
}

void player_set_sample_rate(int rate) { if (rate >= 8000 && rate <= 192000) g_rate = (unsigned)rate; }

int player_render(float *out, int frames) {
    if (!g_song || frames <= 0) return 0;
    int n = (int)pt4_render_f32(g_song, out, (size_t)frames, g_rate);
    /* +3 dB: the PT4 engine plays about 4 dB under the app's MOD path. Soft knee above 0.8 keeps hard-panned songs from clipping. */
    for (int i = 0; i < n * 2; i++) {
        float x = out[i] * 1.4125f, a = x < 0 ? -x : x;
        if (a > 0.8f) { float t = (a - 0.8f) / 0.2f; a = 0.8f + 0.2f * (t / (1.0f + t)) * 1.0f; x = x < 0 ? -a : a; }
        out[i] = x;
    }
    return n;
}

void player_stop(void) { if (g_song) { pt4_seek_ms(g_song, 0); apply_mutes(); } }

void player_set_channel_gain(int chan, float gain) {
    if (chan < 0 || chan >= 32) return;
    if (gain == 0.0f) g_muted |= 1u << chan; else g_muted &= ~(1u << chan);
    if (g_song) pt4_mute(g_song, chan, gain == 0.0f);
}

int player_voice_peak(int chan) { return g_song ? pt4_voice_peak(g_song, chan) : 0; }
void player_voice_scope(int chan, int16_t *out256) { if (g_song) pt4_voice_scope(g_song, chan, out256); }

int player_get_channels(void) { return g_song ? pt4_channels(g_song) : 0; }

/* (order << 8) | row, -1 with no song */
int player_get_position(void) {
    int order = 0, row = 0;
    if (!g_song) return -1;
    pt4_position(g_song, &order, &row);
    return (order << 8) | (row & 0xff);
}
