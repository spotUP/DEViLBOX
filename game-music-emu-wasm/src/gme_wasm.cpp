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

/* The track load() or gme_wasm_start_track() started, for gme_wasm_loaded_track(). */
static int loaded_track = 0;
/* The loaded song's sample rate, for the probe in gme_wasm_start_track(). */
static int loaded_rate = 44100;

/*
 * The first track from `from` that sounds, trying at most PROBE_TRACKS; -1
 * when none does. With `music_only`, a track counts only when it is still
 * sounding in the last second of the first PROBE_SECONDS and has not ended:
 * a sound effect (KSS gradius 2, tracks before 40) is a short burst that
 * dies, and the first version, taking any sound at all, opened on an effect
 * that the engine's silence detector then stopped. Without it, any sound in
 * the first PROBE_SECONDS counts: auto-advance to the next subsong plays a
 * short jingle and skips only the empty slots. Probes with every voice audible.
 */
static int first_audible_track(int from, int count, int sample_rate, int music_only)
{
	enum { PROBE_SECONDS = 3, PROBE_TRACKS = 64, PROBE_CHUNK = 1024 };
	const int threshold = 164; /* 0.005 of full scale, as UADE's probe */
	const int pairs = multi ? kPairs : 1;
	const long total = (long) PROBE_SECONDS * sample_rate;
	const long tail = music_only ? total - sample_rate : 0; /* where sound starts to count */
	gme_mute_voices(emu, 0);
	const int last = count < from + PROBE_TRACKS ? count : from + PROBE_TRACKS;
	for (int t = from; t < last; t++) {
		if (gme_start_track(emu, t)) continue;
		int sounding = 0;
		long done = 0;
		for (; done < total; done += PROBE_CHUNK) {
			if (gme_play(emu, PROBE_CHUNK * 2 * pairs, pcm)) break;
			if (done >= tail && !sounding) {
				for (int i = 0; i < PROBE_CHUNK * 2 * pairs; i++) {
					if (pcm[i] > threshold || pcm[i] < -threshold) { sounding = 1; break; }
				}
				if (sounding && !music_only) return t;
			}
		}
		if (done >= total && sounding && !gme_track_ended(emu)) return t;
	}
	return -1;
}

/* The track playing after a load (the first audible from the one asked for). */
extern "C" EMSCRIPTEN_KEEPALIVE
int gme_wasm_loaded_track(void) { return loaded_track; }

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
	// First audible track, from `track` up: KSS and HES have no track list
	// and often hold sound effects or nothing in their first tracks (KSS
	// gradius 2: tracks 0-39), so the song opened silent. The owner's rule for
	// UADE subsongs, 2026-10-05.
	const int audible = first_audible_track(track, count, sample_rate, 1);
	if (audible >= 0) track = audible;
	// Mute before the start: gme_start_track already renders ahead (it skips
	// the track's leading silence), and that audio must honour the mask.
	apply_mute();
	if (gme_start_track(emu, track)) { release(); return -4; }
	loaded_track = track;
	loaded_rate = sample_rate;
	return count > 0 ? count : 1;
}

/*
 * Start `track` (0-based) of the song loaded: the subsong control and the
 * auto-advance when a track ends. With `skip_silent`, the first track from
 * `track` up that makes any sound (a KSS or HES file holds empty slots).
 * Returns the track started, or -1: nothing loaded, `track` out of range,
 * no sound from it on, or libgme would not start it.
 */
extern "C" EMSCRIPTEN_KEEPALIVE
int gme_wasm_start_track(int track, int skip_silent)
{
	if (!emu) return -1;
	const int count = gme_track_count(emu);
	if (track < 0 || track >= count) return -1;
	if (skip_silent) {
		track = first_audible_track(track, count, loaded_rate, 0);
		if (track < 0) return -1;
	}
	apply_mute();
	if (gme_start_track(emu, track)) return -1;
	loaded_track = track;
	return track;
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

/*
 * NSF per-frame state trace (input for the editable NSF import).
 *
 * A second Nsf_Emu, separate from the playback emulator above (playback is
 * untouched: its play_hook stays null). Nsf_Emu calls play_hook each time it
 * sets up a PLAY call; Nsf_Trace::snap then copies every voice's live state
 * into one record of kTraceWords uint16. Record 0 is the state after INIT,
 * record k the state after PLAY call k. Layout (word offsets, T_* below):
 *   2A03 square 1/2, MMC5 square 1/2: regs[4] ($4000-3 / $5000-3 style),
 *     length counter, output volume (envelope or constant, 0 when length 0),
 *     enabled ($4015 bit), period (11 bit, after sweep)
 *   triangle: regs[4], length counter, linear counter, enabled, period
 *   noise: regs[4], length counter, output volume, enabled, 0
 *   DMC: regs[4] ($4010-3), bytes remaining, next read address, DAC (0-127), enabled
 *   MMC5 PCM: DAC ($5011)
 *   VRC6 pulse 1/2, saw: regs[3] ($9000-2 / $A000-2 / $B000-2), period (12 bit + 1)
 *   FDS: $4040-$4092 as written (wave RAM 64, then $4080-$4092), mod table 64
 *     (two entries per $4088 write), volume envelope gain, mod (sweep) gain, mod position
 *   N163: internal RAM 128 (wave RAM + channel registers at $40-$7F)
 *   VRC7: custom patch regs $00-$07, channel regs $10-$15 / $20-$25 / $30-$35 (by channel)
 *   S5B (FME-7): regs $00-$0D
 * T_CHIPS holds the NSF header expansion flags (bit 0 VRC6, 1 VRC7, 2 FDS,
 * 3 MMC5, 4 N163, 5 S5B); sections of absent chips are 0.
 */
#include <vector>
#include <stdint.h>
#include "Nsf_Emu.h"
#include "Nes_Vrc6_Apu.h"
#include "Nes_Namco_Apu.h"
#include "Nes_Fme7_Apu.h"
#include "Nes_Fds_Apu.h"
#include "Nes_Mmc5_Apu.h"
#include "Nes_Vrc7_Apu.h"

enum {
	T_CHIPS = 0,
	T_SQ1 = 2, T_SQ2 = 10, T_TRI = 18, T_NOISE = 26, T_DMC = 34,
	T_VRC6 = 42,                        // 3 voices x 4
	T_MMC5 = 54,                        // 2 squares x 8, then PCM DAC
	T_FDS = 71,                         // 0x53 regs, 64 mod, env gain, mod gain, mod pos
	T_N163 = 221,                       // 128
	T_VRC7 = 349,                       // 8 patch, 6 x 3 channel regs
	T_S5B = 375,                        // 14
	kTraceWords = 390
};

static Music_Emu *trace_emu = 0;
static std::vector<uint16_t> trace;

struct Nsf_Trace {
	static void square(uint16_t *o, Nes_Square const &s, int enabled)
	{
		for (int i = 0; i < 4; i++) o[i] = s.regs[i];
		o[4] = s.length_counter; o[5] = s.volume(); o[6] = enabled; o[7] = s.period();
	}
	static void apu2a03(uint16_t *o, Nes_Apu &a)
	{
		square(o + T_SQ1, a.square1, a.osc_enables & 1);
		square(o + T_SQ2, a.square2, (a.osc_enables >> 1) & 1);
		uint16_t *t = o + T_TRI;
		for (int i = 0; i < 4; i++) t[i] = a.triangle.regs[i];
		t[4] = a.triangle.length_counter; t[5] = a.triangle.linear_counter;
		t[6] = (a.osc_enables >> 2) & 1; t[7] = a.triangle.period();
		uint16_t *n = o + T_NOISE;
		for (int i = 0; i < 4; i++) n[i] = a.noise.regs[i];
		n[4] = a.noise.length_counter; n[5] = a.noise.volume(); n[6] = (a.osc_enables >> 3) & 1;
		uint16_t *d = o + T_DMC;
		for (int i = 0; i < 4; i++) d[i] = a.dmc.regs[i];
		d[4] = a.dmc.length_counter; d[5] = a.dmc.address; d[6] = a.dmc.dac; d[7] = a.dmc.length_counter > 0;
	}
	static void snap(Nsf_Emu *e, void *)
	{
		const nes_time_t now = e->time();
		e->apu.run_until_(now); // catch envelopes / length counters up to this PLAY call
		const size_t at = trace.size();
		trace.resize(at + kTraceWords, 0);
		uint16_t *o = &trace[at];
		o[T_CHIPS] = e->header_.chip_flags;
		apu2a03(o, e->apu);
		if (e->vrc6) {
			for (int v = 0; v < 3; v++) {
				Nes_Vrc6_Apu::Vrc6_Osc const &s = e->vrc6->oscs[v];
				for (int i = 0; i < 3; i++) o[T_VRC6 + v * 4 + i] = s.regs[i];
				o[T_VRC6 + v * 4 + 3] = (uint16_t) s.period();
			}
		}
		if (e->mmc5) {
			Nes_Apu &m = *e->mmc5;
			m.run_until_(now);
			square(o + T_MMC5, m.square1, m.osc_enables & 1);
			square(o + T_MMC5 + 8, m.square2, (m.osc_enables >> 1) & 1);
			o[T_MMC5 + 16] = m.dmc.dac;
		}
		if (e->fds) {
			Nes_Fds_Apu &f = *e->fds;
			f.run_until(now);
			for (unsigned i = 0; i < Nes_Fds_Apu::io_size; i++) o[T_FDS + i] = f.regs_[i];
			for (unsigned i = 0; i < Nes_Fds_Apu::wave_size; i++) o[T_FDS + 0x53 + i] = f.mod_wave[i];
			o[T_FDS + 0x93] = f.env_gain; o[T_FDS + 0x94] = f.sweep_gain; o[T_FDS + 0x95] = f.mod_pos;
		}
		if (e->namco)
			for (int i = 0; i < Nes_Namco_Apu::reg_count; i++) o[T_N163 + i] = e->namco->reg[i];
		if (e->vrc7) {
			for (int i = 0; i < 8; i++) o[T_VRC7 + i] = e->vrc7->inst[i];
			for (int c = 0; c < 6; c++)
				for (int i = 0; i < 3; i++) o[T_VRC7 + 8 + c * 3 + i] = e->vrc7->oscs[c].regs[i];
		}
		if (e->fme7)
			for (unsigned i = 0; i < fme7_apu_state_t::reg_count; i++) o[T_S5B + i] = e->fme7->regs[i];
	}
	static int read(Nsf_Emu *e, int addr) { return Nsf_Emu::pcm_read(e, (nes_addr_t) addr); }
	static void arm(Nsf_Emu *e) { e->play_hook = snap; }
	static int chips(Nsf_Emu *e) { return e->header_.chip_flags; }
	// 12 = clock_divisor in Nsf_Emu.cpp
	static double play_hz(Nsf_Emu *e) { return e->clock_rate_ * 12.0 / e->play_period; }
};

static Nsf_Emu *trace_nsf(void)
{
	if (!trace_emu) return 0;
	gme_type_t t = gme_type(trace_emu);
	return (t == gme_nsf_type || t == gme_nsfe_type) ? static_cast<Nsf_Emu *>(trace_emu) : 0;
}

/* Words per record (kTraceWords). */
extern "C" EMSCRIPTEN_KEEPALIVE
int gme_wasm_trace_words(void) { return kTraceWords; }

/*
 * Open an NSF/NSFE for tracing and start `track` (0-based, no silence skip,
 * no fade). Returns the header expansion flags (>= 0), or -1 not NSF/NSFE,
 * -2 out of memory, -3 libgme refused the file, -4 the track would not start.
 */
extern "C" EMSCRIPTEN_KEEPALIVE
int gme_wasm_trace_open(const unsigned char *data, int len, int track)
{
	if (trace_emu) gme_delete(trace_emu);
	trace_emu = 0;
	std::vector<uint16_t>().swap(trace);
	if (!data || len < 4) return -1;
	gme_type_t type = gme_identify_extension(gme_identify_header(data));
	if (type != gme_nsf_type && type != gme_nsfe_type) return -1;
	trace_emu = gme_new_emu(type, 44100);
	if (!trace_emu) return -2;
	if (gme_load_data(trace_emu, data, len)) { gme_delete(trace_emu); trace_emu = 0; return -3; }
	gme_set_autoload_playback_limit(trace_emu, 0);
	gme_ignore_silence(trace_emu, 1); // no look-ahead: record 0 is the state right after INIT
	Nsf_Emu *e = trace_nsf();
	Nsf_Trace::arm(e);
	if (gme_start_track(trace_emu, track)) { gme_delete(trace_emu); trace_emu = 0; return -4; }
	return Nsf_Trace::chips(e);
}

/*
 * Run the traced song until at least `frames` records exist in total (the
 * emulator runs in audio chunks, so a few more may land). Returns the record
 * count; it stops early when the track ends.
 */
extern "C" EMSCRIPTEN_KEEPALIVE
int gme_wasm_trace_run(int frames)
{
	if (!trace_nsf()) return 0;
	while ((int) (trace.size() / kTraceWords) < frames && !gme_track_ended(trace_emu))
		if (gme_play(trace_emu, kChunk * 2, pcm)) break;
	return (int) (trace.size() / kTraceWords);
}

/* Record `i` (kTraceWords uint16), or 0 past the end. */
extern "C" EMSCRIPTEN_KEEPALIVE
const uint16_t *gme_wasm_trace_frame(int i)
{
	return i >= 0 && (size_t) (i + 1) * kTraceWords <= trace.size() ? &trace[(size_t) i * kTraceWords] : 0;
}

/* A byte as the DMC reads it (current bank mapping), for DPCM sample extraction. */
extern "C" EMSCRIPTEN_KEEPALIVE
int gme_wasm_trace_read(int addr)
{
	Nsf_Emu *e = trace_nsf();
	return e && addr >= 0x8000 && addr <= 0xFFFF ? Nsf_Trace::read(e, addr) : -1;
}

/* NSF PLAY rate in Hz (header speed for the region GME plays), 0 when no trace is open. */
extern "C" EMSCRIPTEN_KEEPALIVE
double gme_wasm_trace_play_hz(void)
{
	Nsf_Emu *e = trace_nsf();
	return e ? Nsf_Trace::play_hz(e) : 0;
}

extern "C" EMSCRIPTEN_KEEPALIVE
void gme_wasm_trace_close(void)
{
	if (trace_emu) gme_delete(trace_emu);
	trace_emu = 0;
	std::vector<uint16_t>().swap(trace);
}
