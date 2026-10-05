/*
 * psgplay_wasm.c - DEViLBOX bridge to the PSG play library (Fredrik Noring,
 * GPL-2.0; third-party/psgplay).
 *
 * PSG play runs an SNDH file's own 68000 code on an emulated Atari ST/STE:
 * Musashi 68000, YM2149 (cf2149), MFP 68901 timers (cf68901) and STE DMA
 * sound (cf300588). This file only drives its public library API
 * (psgplay.h / stereo.h / digital.h / sndh.h / ice.h):
 *
 *  - load:   ICE!-packed files are decrunched with the library's ice.c first
 *            (psgplay_init takes uncompressed SNDH only).
 *  - render: psgplay_read_stereo, int16 -> interleaved float.
 *  - taps:   the library's digital->stereo and downsample hooks are replaced
 *            by ones that also keep each YM channel's DAC level, so the
 *            oscilloscopes get one buffer per channel in lockstep with the mix.
 *            The stereo path is the library's: psgplay_digital_to_stereo_empiric
 *            and the same 8-tap FIR + decimation as psgplay.c stereo_downsample.
 *  - mute:   a muted YM channel's level is forced to 0 before the empiric DAC.
 *  - grid:   a digital-mode instance (no stereo) steps 1/50 s at a time and
 *            the YM registers are read after each step.
 *
 * One player per wasm instance: Musashi keeps the CPU in globals.
 */

#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <emscripten.h>

#include "toslibc/asm/machine.h"

#include "internal/psgplay.h"
#include "atari/psg.h"

#include "ice/ice.h"
#include "psgplay/digital.h"
#include "psgplay/psgplay.h"
#include "psgplay/sndh.h"
#include "psgplay/stereo.h"

#include "cf2149/module/dac.h"

#define NUM_YM 3
/* psgplay.c reads digital samples in chunks of 4096; the taps never hold more. */
#define CHUNK 4096
#define FIFO_SIZE 16384 /* power of two */

/* Digital (250.33 kHz) samples per 1/50 s grid frame. */
#define DIGITAL_FREQUENCY \
	((double)ATARI_STE_EXT_OSC / (ATARI_STE_SND_PSG_CLK_DIV * ATARI_STE_SND_PSG_MODE8_DIV))

static struct psgplay *pp;
static uint8_t *song;
static size_t song_size;
static int stereo_frequency;
static uint32_t mute_mask = 0x7; /* bit N set = YM channel N audible */

/* Per-channel DAC level of the current digital chunk (filled by to_stereo). */
static float chunk_level[NUM_YM][CHUNK];

/* Per-channel samples at the output rate, in lockstep with PSG play's stereo buffer. */
static float fifo[NUM_YM][FIFO_SIZE];
static uint32_t fifo_wr, fifo_rd;
static float dc[NUM_YM];

static struct {
	uint64_t psg_cycle;
	uint64_t sample_cycle;
	struct { int16_t xn[8]; int k; } lp_left, lp_right;
} ds;

static struct psgplay_stereo stereo_tmp[CHUNK];
static struct psgplay_digital digital_tmp[CHUNK];
static struct psgplay_stereo silent_tmp[CHUNK];
/* Output DC blocker (the ST's AC coupling for what remains: the music's own average). */
static float hp_coef, hp_x[2], hp_y[2];

static double frame_carry;
static uint8_t regs_out[16];

#define DAC_S16_BITS(S) ((S) * 0xffff - 0x8000) /* as psgplay.c psg_dac */
static const int16_t ym_dac[32] = CF2149_DAC_5_BIT_LEVEL(DAC_S16_BITS);

static void to_stereo(struct psgplay *p, struct psgplay_stereo *stereo,
	const struct psgplay_digital *digital, size_t count, void *arg)
{
	(void)arg;
	for (size_t i = 0; i < count; i++) {
		struct psgplay_digital d = digital[i];
		if (!(mute_mask & 1)) d.psg.lva.u8 = 0;
		if (!(mute_mask & 2)) d.psg.lvb.u8 = 0;
		if (!(mute_mask & 4)) d.psg.lvc.u8 = 0;
		digital_tmp[i] = d;
		if (i < CHUNK) {
			chunk_level[0][i] = ym_dac[digital[i].psg.lva.u5] / 32768.0f;
			chunk_level[1][i] = ym_dac[digital[i].psg.lvb.u5] / 32768.0f;
			chunk_level[2][i] = ym_dac[digital[i].psg.lvc.u5] / 32768.0f;
		}
	}
	psgplay_digital_to_stereo_empiric(p, stereo, digital_tmp, count, NULL);

	/*
	 * The YM2149 DAC is unipolar: with every level at 0 the empiric mix sits
	 * at about -0.65 full scale, and the music rides on that. The ST's audio
	 * out is AC-coupled; take off the all-silent level here, before PSG
	 * play's fade-in, so the fade starts from 0 and not with a thump. The
	 * swing above silence is up to ~1.3 full scale, so it is halved to stay
	 * in int16; centred by the output high-pass it peaks near +-0.65.
	 */
	for (size_t i = 0; i < count; i++) {
		digital_tmp[i] = digital[i];
		digital_tmp[i].psg.lva.u8 = 0;
		digital_tmp[i].psg.lvb.u8 = 0;
		digital_tmp[i].psg.lvc.u8 = 0;
		digital_tmp[i].sound.left = 0;
		digital_tmp[i].sound.right = 0;
	}
	psgplay_digital_to_stereo_empiric(p, silent_tmp, digital_tmp, count, NULL);
	for (size_t i = 0; i < count; i++) {
		stereo[i].left  = (stereo[i].left  - silent_tmp[i].left)  / 2;
		stereo[i].right = (stereo[i].right - silent_tmp[i].right) / 2;
	}
}

static int16_t lowpass(int16_t sample, int16_t *xn, int *k)
{
	xn[(*k)++ % 8] = sample;
	int32_t x = 0;
	for (int i = 0; i < 8; i++) x += xn[i]; /* psgplay.c's 8-tap FIR */
	return x / 8;
}

static size_t downsample(struct psgplay_stereo *resample,
	const struct psgplay_stereo *stereo, size_t count, void *arg)
{
	(void)arg;
	size_t r = 0;
	for (size_t i = 0; i < count; i++) {
		const uint64_t n = ((uint64_t)stereo_frequency * ds.psg_cycle) / PSG_FREQUENCY;
		const struct psgplay_stereo s = {
			.left  = lowpass(stereo[i].left,  ds.lp_left.xn,  &ds.lp_left.k),
			.right = lowpass(stereo[i].right, ds.lp_right.xn, &ds.lp_right.k),
		};
		for (; ds.sample_cycle < n; ds.sample_cycle++) {
			resample[r++] = s;
			const uint32_t w = fifo_wr++ & (FIFO_SIZE - 1);
			for (int c = 0; c < NUM_YM; c++)
				fifo[c][w] = i < CHUNK ? chunk_level[c][i] : 0.0f;
		}
		ds.psg_cycle += 8;
	}
	return r;
}

static void release(void)
{
	psgplay_free(pp);
	pp = NULL;
	free(song);
	song = NULL;
	song_size = 0;
}

/* Copy (and ICE!-decrunch) the file. 0 = ok, -1 not SNDH, -2 ICE failed, -4 no memory. */
static int take_file(const uint8_t *data, int len)
{
	release();
	if (len <= 0) return -1;
	if (ice_identify(data, len)) {
		const size_t out = ice_decrunched_size(data, len);
		if (!out) return -2;
		song = malloc(out);
		if (!song) return -4;
		if (ice_decrunch(song, data, len) != (ssize_t)out) { release(); return -2; }
		song_size = out;
	} else {
		song = malloc(len);
		if (!song) return -4;
		memcpy(song, data, len);
		song_size = len;
	}
	if (!sndh_identify(song, song_size)) { release(); return -1; }
	return 0;
}

static int default_track(void)
{
	int t = 1;
	if (!sndh_tag_default_subtune(&t, song, song_size) || t < 1) t = 1;
	return t;
}

/*
 * Load an SNDH (raw or ICE!-packed) and start `track` (1-based; 0 or past
 * the '##' count = the file's default subtune). sample_rate 0 = digital mode for the grid
 * (psgplay_wasm_step_frame). Returns the track started (>= 1) or a negative
 * error: -1 not SNDH, -2 ICE failed, -3 PSG play refused it, -4 no memory.
 */
EMSCRIPTEN_KEEPALIVE
int psgplay_wasm_load(const uint8_t *data, int len, int track, int sample_rate)
{
	const int rc = take_file(data, len);
	if (rc) return rc;
	int subtunes = 1;
	if (!sndh_tag_subtune_count(&subtunes, song, song_size) || subtunes < 1) subtunes = 1;
	if (track <= 0 || track > subtunes) track = default_track();

	pp = psgplay_init(song, song_size, track, sample_rate);
	if (!pp) { release(); return -3; }

	stereo_frequency = sample_rate;
	memset(&ds, 0, sizeof(ds));
	memset(dc, 0, sizeof(dc));
	memset(hp_x, 0, sizeof(hp_x));
	memset(hp_y, 0, sizeof(hp_y));
	/* One-pole high-pass at 5 Hz. */
	hp_coef = sample_rate ? 1.0f - 6.2831853f * 5.0f / sample_rate : 0.0f;
	fifo_wr = fifo_rd = 0;
	frame_carry = 0;
	if (sample_rate) {
		psgplay_digital_to_stereo_callback(pp, to_stereo, NULL);
		psgplay_stereo_downsample_callback(pp, downsample, NULL);
	}
	return track;
}

static int render(float *out, float *ch, int frames, int stride)
{
	if (!pp || !stereo_frequency || frames <= 0) return 0;
	int done = 0;
	while (done < frames) {
		int want = frames - done;
		if (want > CHUNK) want = CHUNK;
		const ssize_t n = psgplay_read_stereo(pp, stereo_tmp, want);
		if (n <= 0) break;
		for (ssize_t i = 0; i < n; i++) {
			const float x[2] = { stereo_tmp[i].left / 32768.0f, stereo_tmp[i].right / 32768.0f };
			for (int k = 0; k < 2; k++) {
				hp_y[k] = x[k] - hp_x[k] + hp_coef * hp_y[k];
				hp_x[k] = x[k];
				out[(done + i) * 2 + k] = hp_y[k];
			}
			const uint32_t r = fifo_rd++ & (FIFO_SIZE - 1);
			for (int c = 0; c < NUM_YM; c++) {
				const float v = fifo[c][r];
				dc[c] += 0.001f * (v - dc[c]); /* the YM DAC is unipolar; scopes want it centred */
				if (ch) ch[c * stride + done + i] = (mute_mask >> c & 1) ? v - dc[c] : 0.0f;
			}
		}
		done += (int)n;
	}
	return done;
}

/* Interleaved stereo float. Returns frames written; 0 once PSG play has stopped. */
EMSCRIPTEN_KEEPALIVE
int psgplay_wasm_render(float *out, int frames)
{
	return render(out, NULL, frames, 0);
}

/* As psgplay_wasm_render, plus YM A/B/C into ch[c * stride + i] (planar, DC-blocked). */
EMSCRIPTEN_KEEPALIVE
int psgplay_wasm_render_channels(float *out, float *ch, int frames, int stride)
{
	return render(out, ch, frames, stride);
}

/* Bit N set = YM channel N (A, B, C) audible; the mixer's solo/mute. */
EMSCRIPTEN_KEEPALIVE
void psgplay_wasm_set_mute_mask(uint32_t mask)
{
	mute_mask = mask & 0x7;
}

/* Fade out over ~10 ms (psgplay_stop), after which render returns 0. */
EMSCRIPTEN_KEEPALIVE
void psgplay_wasm_stop(void)
{
	if (pp) psgplay_stop(pp);
}

EMSCRIPTEN_KEEPALIVE
void psgplay_wasm_free(void)
{
	release();
}

/* Digital mode: run 1/50 s of the tune. 1 = ran, 0 = stopped or failed. */
EMSCRIPTEN_KEEPALIVE
int psgplay_wasm_step_frame(void)
{
	if (!pp || stereo_frequency) return 0;
	frame_carry += DIGITAL_FREQUENCY / 50.0;
	const size_t n = (size_t)frame_carry;
	frame_carry -= n;
	return psgplay_read_digital(pp, NULL, n) > 0;
}

/* The 16 YM2149 registers as the tune last wrote them. */
EMSCRIPTEN_KEEPALIVE
const uint8_t *psgplay_wasm_get_regs(void)
{
	if (pp) memcpy(regs_out, pp->machine.psg.cf2149.state.regs.u8, 16);
	else memset(regs_out, 0, 16);
	return regs_out;
}

/* ---- SNDH tags of the loaded (decrunched) file ---- */

EMSCRIPTEN_KEEPALIVE
int psgplay_wasm_subtune_count(void)
{
	int n = 1;
	if (!song || !sndh_tag_subtune_count(&n, song, song_size) || n < 1) n = 1;
	return n;
}

EMSCRIPTEN_KEEPALIVE
int psgplay_wasm_default_subtune(void)
{
	return song ? default_track() : 1;
}

/* Seconds of `track` from the TIME tag, 0 when the file does not say. */
EMSCRIPTEN_KEEPALIVE
float psgplay_wasm_subtune_time(int track)
{
	float t = 0;
	if (!song || !sndh_tag_subtune_time(&t, track, song, song_size)) return 0;
	return t;
}

static char text[256];

/* which: 0 title, 1 composer, 2 year. Empty string when absent. */
EMSCRIPTEN_KEEPALIVE
const char *psgplay_wasm_tag(int which)
{
	text[0] = 0;
	if (!song) return text;
	bool ok = false;
	switch (which) {
	case 0: ok = sndh_tag_title(text, sizeof(text), song, song_size); break;
	case 1: ok = sndh_tag_composer(text, sizeof(text), song, song_size); break;
	case 2: ok = sndh_tag_year(text, sizeof(text), song, song_size); break;
	}
	if (!ok) text[0] = 0;
	return text;
}
