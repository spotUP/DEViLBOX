/*
 * gme_wasm.cpp - bridge from DEViLBOX's GmeEngine worklet to game-music-emu.
 *
 * One song at a time. gme_wasm_load() takes the whole file (NSF/NSFE, GBS,
 * HES, KSS, SPC, VGM/VGZ, GYM; the type is read from the header) and starts
 * one track. The emulator is created multi-channel where libgme supports it
 * (the "classic" emulators: NSF, GBS, HES, KSS, and VGM without FM): it then
 * renders each voice to its own stereo pair (voice i on pair i % 8), the mix
 * is their sum and the oscilloscopes get each voice. SPC, GYM and FM VGM
 * render one stereo mix and have no voice taps.
 *
 * Songs loop: the track-length fade libgme applies by default is off, so a
 * track plays until its own data ends (silence detection still ends it).
 */
#include <emscripten.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <zlib.h>
#include "gme.h"

static const int kPairs = 8;          // libgme multi-channel output: 8 stereo pairs
static const int kChunk = 1024;       // frames per gme_play call

static Music_Emu *emu = 0;
static int multi = 0;                 // 1 = 8 stereo pairs per frame, 0 = one pair
static unsigned mute_mask = 0xFFFFFFFFu; // bit N set = voice N audible
static short pcm[kChunk * 2 * kPairs];
static char text[512];

/*
 * A GYM whose GYMX header has a non-zero "packed" field carries its register
 * stream zlib-deflated (most GYMs on modland). libgme plays only unpacked
 * GYMs, so the bridge inflates the stream and clears the field.
 * Returns a malloc'd file (caller frees) or 0 when `data` is not packed GYM.
 */
static unsigned char *unpack_gym(const unsigned char *data, int len, int *out_len)
{
	enum { kHeader = 428, kPacked = 424 };
	if (len <= kHeader || memcmp(data, "GYMX", 4) != 0) return 0;
	const unsigned long size = data[kPacked] | (data[kPacked + 1] << 8) | (data[kPacked + 2] << 16) | ((unsigned long) data[kPacked + 3] << 24);
	if (!size || size > (64u << 20)) return 0;
	unsigned char *file = (unsigned char *) malloc(kHeader + size);
	if (!file) return 0;
	memcpy(file, data, kHeader);
	memset(file + kPacked, 0, 4);
	uLongf got = size;
	if (uncompress(file + kHeader, &got, data + kHeader, len - kHeader) != Z_OK) { free(file); return 0; }
	*out_len = kHeader + (int) got;
	return file;
}

static void release(void)
{
	if (emu) gme_delete(emu);
	emu = 0;
	multi = 0;
}

static void apply_mute(void)
{
	// gme_mute_voices: bit set = muted.
	if (emu) gme_mute_voices(emu, (int) ~mute_mask);
}

static int load(const unsigned char *data, int len, int track, int sample_rate);

/*
 * Load `data` and start `track` (0-based). Returns the number of tracks
 * (> 0), or -1 unknown file type, -2 out of memory, -3 libgme refused the
 * file, -4 the track would not start.
 */
extern "C" EMSCRIPTEN_KEEPALIVE
int gme_wasm_load(const unsigned char *data, int len, int track, int sample_rate)
{
	release();
	if (!data || len < 4) return -1;
	int unpacked_len = 0;
	unsigned char *unpacked = unpack_gym(data, len, &unpacked_len);
	if (unpacked) { data = unpacked; len = unpacked_len; }
	const int rc = load(data, len, track, sample_rate);
	free(unpacked);
	return rc;
}

static int load(const unsigned char *data, int len, int track, int sample_rate)
{
	gme_type_t type = gme_identify_extension(gme_identify_header(data));
	if (!type) return -1;

	emu = gme_new_emu_multi_channel(type, sample_rate);
	if (emu && !gme_multi_channel(emu)) { gme_delete(emu); emu = 0; }
	if (emu && gme_load_data(emu, data, len)) { gme_delete(emu); emu = 0; }
	if (emu) multi = 1;
	if (!emu) {
		// No multi-channel rendering for this type (SPC, GYM, VGM).
		emu = gme_new_emu(type, sample_rate);
		if (!emu) return -2;
		if (gme_load_data(emu, data, len)) { release(); return -3; }
	}

	gme_set_autoload_playback_limit(emu, 0);
	const int count = gme_track_count(emu);
	if (track < 0 || track >= count) track = 0;
	// Mute before the start: gme_start_track already renders ahead (it skips
	// the track's leading silence), and that audio must honour the mask.
	apply_mute();
	if (gme_start_track(emu, track)) { release(); return -4; }
	return count > 0 ? count : 1;
}

/*
 * Render `frames` of interleaved stereo float (LRLR...) into `out`; with
 * `ch`, also each voice's mono signal planar (voice v at ch + v * stride),
 * for gme_wasm_scope_count() voices. Returns frames rendered (0 = no song).
 */
static int render(float *out, float *ch, int frames, int stride)
{
	if (!emu) return 0;
	const int pairs = multi ? kPairs : 1;
	const int scopes = ch ? (multi ? (gme_voice_count(emu) < kPairs ? gme_voice_count(emu) : kPairs) : 0) : 0;
	const float k = 1.0f / 32768.0f;
	int done = 0;
	while (done < frames) {
		int n = frames - done;
		if (n > kChunk) n = kChunk;
		if (gme_play(emu, n * 2 * pairs, pcm)) break;
		for (int i = 0; i < n; i++) {
			const short *f = pcm + i * 2 * pairs;
			int l = 0, r = 0;
			for (int p = 0; p < pairs; p++) { l += f[p * 2]; r += f[p * 2 + 1]; }
			out[(done + i) * 2] = l * k;
			out[(done + i) * 2 + 1] = r * k;
			for (int v = 0; v < scopes; v++)
				ch[v * stride + done + i] = (f[v * 2] + f[v * 2 + 1]) * (0.5f * k);
		}
		done += n;
	}
	return done;
}

extern "C" EMSCRIPTEN_KEEPALIVE
int gme_wasm_render(float *out, int frames) { return render(out, 0, frames, 0); }

extern "C" EMSCRIPTEN_KEEPALIVE
int gme_wasm_render_channels(float *out, float *ch, int frames, int stride) { return render(out, ch, frames, stride); }

/* Bit N set = voice N audible (DEViLBOX solo/mute). */
extern "C" EMSCRIPTEN_KEEPALIVE
void gme_wasm_set_mute_mask(unsigned mask) { mute_mask = mask; apply_mute(); }

extern "C" EMSCRIPTEN_KEEPALIVE
void gme_wasm_free(void) { release(); }

extern "C" EMSCRIPTEN_KEEPALIVE
int gme_wasm_track_count(void) { return emu ? gme_track_count(emu) : 0; }

extern "C" EMSCRIPTEN_KEEPALIVE
int gme_wasm_voice_count(void) { return emu ? gme_voice_count(emu) : 0; }

extern "C" EMSCRIPTEN_KEEPALIVE
const char *gme_wasm_voice_name(int i)
{
	text[0] = 0;
	if (emu && i >= 0 && i < gme_voice_count(emu)) {
		const char *n = gme_voice_name(emu, i);
		if (n) { strncpy(text, n, sizeof text - 1); text[sizeof text - 1] = 0; }
	}
	return text;
}

/* Voices render_channels writes: one per voice, up to 8, on multi-channel emulators; 0 otherwise. */
extern "C" EMSCRIPTEN_KEEPALIVE
int gme_wasm_scope_count(void)
{
	if (!emu || !multi) return 0;
	const int n = gme_voice_count(emu);
	return n < kPairs ? n : kPairs;
}

/* Track `track`'s tag: 0 system, 1 game, 2 song, 3 author, 4 copyright; 5 = length in ms as text. */
extern "C" EMSCRIPTEN_KEEPALIVE
const char *gme_wasm_info(int track, int which)
{
	text[0] = 0;
	gme_info_t *info = 0;
	if (!emu || gme_track_info(emu, &info, track) || !info) return text;
	const char *s = 0;
	switch (which) {
	case 0: s = info->system; break;
	case 1: s = info->game; break;
	case 2: s = info->song; break;
	case 3: s = info->author; break;
	case 4: s = info->copyright; break;
	case 5: snprintf(text, sizeof text, "%d", info->length); break;
	}
	if (s) { strncpy(text, s, sizeof text - 1); text[sizeof text - 1] = 0; }
	gme_free_info(info);
	return text;
}
