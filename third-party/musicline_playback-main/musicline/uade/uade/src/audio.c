 /*
  * UADE's audio state machine emulation
  *
  * Copyright 1995, 1996, 1997 Bernd Schmidt
  * Copyright 1996 Marcus Sundberg
  * Copyright 1996 Manfred Thole
  * Copyright 2005 Heikki Orsila
  * Copyright 2005 Antti S. Lankila
  */

#ifdef _WIN32
#define _USE_MATH_DEFINES
#endif

#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#include "sysconfig.h"
#include "sysdeps.h"

#include "options.h"
#include "memory.h"
#include "custom.h"
#include "gensound.h"
#include "sd-sound.h"
#include "events.h"
#include "cia.h"
#include "audio.h"
#include <uade/amigafilter.h>
#include "uadectl.h"
#include <uade/compilersupport.h>

#include "sinctable.h"

#include "text_scope.h"

#include <stdint.h>
#include <stdlib.h>

struct audio_channel_data audio_channel[4];
static void (*sample_handler) (void);
static void (*sample_prehandler) (unsigned long best_evtime);
static int audio_mutemask;

// ML hack: Suppress audio until the init glitch completes
// The player does: VOL=63 (audio starts) -> VOL=0 (silence) -> VOL=63 (resume)
// We suppress until we see VOL=63 AFTER seeing VOL=0 that followed VOL=63
// State machine: 0=waiting for first VOL=63, 1=seen VOL=63, 2=seen VOL=0 after VOL=63, 3=enabled
// Note: state 2->3 requires a minimum sample gap to prevent premature transition
// when different channels write vol>0 and vol=0 within the same tick.
static int ml_init_state = 0;
static int ml_init_state2_count = 0;  // perchan_count when state 2 was entered

/* Average time in bus cycles to output a new sample */
static float sample_evtime_interval;
static float next_sample_evtime;

int sound_available;

static int use_text_scope;

struct uade_write_audio *write_audio_state;

static int sound_use_filter = FILTER_MODEL_A500;

/* denormals are very small floating point numbers that force FPUs into slow
   mode. All lowpass filters using floats are suspectible to denormals unless
   a small offset is added to avoid very small floating point numbers. */
#define DENORMAL_OFFSET (1E-10)

static unsigned long last_audio_cycles;

static int audperhack;

/* ML timing: global sample counter for timing comparison with MLINE C++ port */
unsigned long long ml_total_samples = 0;

/* Per-tick sample count log: records how many WAV output samples were produced
   between successive player tick boundaries (CIA-B timer A overflow or VBlank).
   Only counts samples when uadecore_audio_output is true (after startup).
   This allows MLINE to use the exact same tick sizes as UADE.
   Two logs: CIA (bovfla) and VBlank (vsync). main.cpp picks whichever fired. */
#define ML_TICK_SAMPLES_MAX 65536
int ml_tick_samples_log[ML_TICK_SAMPLES_MAX];      /* CIA tick log */
int ml_tick_samples_count = 0;
int ml_vtick_samples_log[ML_TICK_SAMPLES_MAX];     /* VBlank tick log */
int ml_vtick_samples_count = 0;
int ml_aud_tick_samples_log[ML_TICK_SAMPLES_MAX];  /* Audio interrupt tick log (8ch mode) */
int ml_aud_tick_count = 0;
static unsigned long long ml_aud_tick_wav_start = 0;
int ml_skipped_ticks = 0;  /* CIA ticks before audio output started */

/* Per-tick DMA byte stream position log: records ml_dma_byte_count at each tick
   boundary.  This allows MLINE to advance dmaByteStreamPos using actual DMA byte
   positions rather than WAV sample counts, which can diverge due to the startup
   gap between when WAV samples and DMA bytes begin recording. */
int ml_tick_dma_byte_pos_log[ML_TICK_SAMPLES_MAX];
int ml_tick_dma_byte_pos_count = 0;

/* Per-channel volume change log */
int ml_vol_log_pos[4][ML_VOL_LOG_MAX];
int ml_vol_log_val[4][ML_VOL_LOG_MAX];
int ml_vol_log_count[4] = {0, 0, 0, 0};
static unsigned long long ml_tick_wav_samples = 0;  /* counts only output samples */
static unsigned long long ml_tick_wav_start = 0;
static unsigned long long ml_vtick_wav_start = 0;

/* Per-tick DMA byte offset log: records byte position within pair buffer at tick boundaries.
   Layout: [tick0_ch0, tick0_ch1, tick0_ch2, tick0_ch3, tick1_ch0, ...] */
int ml_tick_dma_offset_log[ML_TICK_SAMPLES_MAX * 4];
int ml_tick_dma_offset_count = 0;
int ml_vtick_dma_offset_log[ML_TICK_SAMPLES_MAX * 4];
int ml_vtick_dma_offset_count = 0;

/* Per-tick pair buffer snapshots: captures the actual pair buffer bytes from chip memory
   at each tick boundary. Layout: flat array, 4 * mix_len bytes per tick.
   [tick0_pair0[0..mix_len-1], tick0_pair1[...], tick0_pair2[...], tick0_pair3[...], tick1_pair0[...], ...] */
static int8_t *ml_tick_pair_buf = NULL;
int ml_tick_pair_buf_count = 0;
int ml_tick_pair_buf_mix_len = 0;      /* bytes per pair per tick */
static int ml_tick_pair_buf_max = 0;   /* max ticks allocated */
static int8_t *ml_vtick_pair_buf = NULL;
int ml_vtick_pair_buf_count = 0;
int ml_vtick_pair_buf_mix_len = 0;
static int ml_vtick_pair_buf_max = 0;

/* Per-tick ch_Play state log: records bit 0 of ch_Play for all 8 channels at each
   Play8channels call (before Play8ch clears the bits).  Recorded via trap $f0ff18.
   Layout: [tick0_ch0..tick0_ch7, tick1_ch0..tick1_ch7, ...] */
int ml_chplay_log[ML_TICK_SAMPLES_MAX * 8];
int ml_chplay_count = 0;

void ml_record_chplay(int vals[8])
{
    /* Only record after audio output starts, so chPlayLog indices stay
       aligned with the audio interrupt tick sample log. */
    if (!uadecore_audio_output) return;

    /* Record per-tick sample count at the audio interrupt rate.
       In 8ch mode, PlayMusic fires at audio DMA completion rate (~1.51x VBlank),
       so we need tick sizes at this rate, not VBlank. */
    if (ml_aud_tick_count < ML_TICK_SAMPLES_MAX) {
        int delta = (int)(ml_tick_wav_samples - ml_aud_tick_wav_start);
        ml_aud_tick_samples_log[ml_aud_tick_count] = delta;
        ml_aud_tick_count++;
    }
    ml_aud_tick_wav_start = ml_tick_wav_samples;

    if (ml_chplay_count < ML_TICK_SAMPLES_MAX) {
        int base = ml_chplay_count * 8;
        for (int i = 0; i < 8; i++)
            ml_chplay_log[base + i] = vals[i];
        ml_chplay_count++;
    }
}

/* Per-sample DMA byte stream: records current_sample for each channel at every
   output sample point. This captures the EXACT byte the DMA is outputting,
   including correct buffer-wrap behavior across double-buffered pair buffers. */
static int8_t *ml_dma_byte_stream[4] = {NULL, NULL, NULL, NULL};
static int ml_dma_byte_count = 0;
static int ml_dma_byte_max = 0;

/* Per-channel capture buffers for A/B comparison */
static int16_t *ml_perchan_buf[4] = {NULL, NULL, NULL, NULL};
static int ml_perchan_count = 0;
static int ml_perchan_max = 0;

static struct filter_state {
    float rc1, rc2, rc3, rc4, rc5;
} sound_filter_state[2];

static float a500e_filter1_a0;
static float a500e_filter2_a0;
static float filter_a0; /* a500 and a1200 use the same */


static inline int clamp_sample(int o)
{
    if (unlikely(o > 32767 || o < -32768)) {
	if (o > 32767) {
	    return 32767;
	} else {
	    return -32768;
	}
    }
    return o;
}

static inline int ismuted(int i)
{
    return audio_mutemask & (1 << i);
}


/* Amiga has two separate filtering circuits per channel, a static RC filter
 * on A500 and the LED filter. This code emulates both.
 * 
 * The Amiga filtering circuitry depends on Amiga model. Older Amigas seem
 * to have a 6 dB/oct RC filter with cutoff frequency such that the -6 dB
 * point for filter is reached at 6 kHz, while newer Amigas have no filtering.
 *
 * The LED filter is complicated, and we are modelling it with a pair of
 * RC filters, the other providing a highboost. The LED starts to cut
 * into signal somewhere around 5-6 kHz, and there's some kind of highboost
 * in effect above 12 kHz. Better measurements are required.
 *
 * The current filtering should be accurate to 2 dB with the filter on,
 * and to 1 dB with the filter off.
*/

static int filter(int input, struct filter_state *fs)
{
    float tmp, normal_output, led_output;

    switch (sound_use_filter) {
    case FILTER_MODEL_A500: 
	fs->rc1 = a500e_filter1_a0 * input + (1 - a500e_filter1_a0) * fs->rc1 + DENORMAL_OFFSET;
	fs->rc2 = a500e_filter2_a0 * fs->rc1 + (1-a500e_filter2_a0) * fs->rc2;
	normal_output = fs->rc2;

	fs->rc3 = filter_a0 * normal_output + (1 - filter_a0) * fs->rc3;
	fs->rc4 = filter_a0 * fs->rc3       + (1 - filter_a0) * fs->rc4;
	fs->rc5 = filter_a0 * fs->rc4       + (1 - filter_a0) * fs->rc5;

	led_output = fs->rc5;
        break;

    case FILTER_MODEL_A1200:
        normal_output = input;

        fs->rc2 = filter_a0 * normal_output + (1 - filter_a0) * fs->rc2 + DENORMAL_OFFSET;
        fs->rc3 = filter_a0 * fs->rc2       + (1 - filter_a0) * fs->rc3;
        fs->rc4 = filter_a0 * fs->rc3       + (1 - filter_a0) * fs->rc4;

        led_output = fs->rc4;
        break;

    default:
	fprintf(stderr, "Unknown filter mode\n");
	exit(1);
    }

    return clamp_sample(gui_ledstate ? led_output : normal_output);
}


static void check_sound_buffers (void)
{
    intptr_t bytes;

    if (uadecore_reboot)
	return;

    assert(uadecore_read_size > 0);

    bytes = ((intptr_t) sndbufpt) - ((intptr_t) sndbuffer);

    if (uadecore_audio_output) {
	/*
	 * The argument passed for UADE_COMMAND_READ IPC determines how much
	 * audio data is produced before sending the results back to the
	 * frontend.
	 */
	if (bytes == uadecore_read_size) {
	    uadecore_check_sound_buffers(uadecore_read_size);
	    sndbufpt = sndbuffer;
	}
	if (uadecore_audio_start_slow <= 1) {
		char ast[256];
		snprintf(ast, sizeof(ast), "{'uadecore:audio_start_time': "
			 "%.2f}",
			 ((double) uadecore_audio_skip) / (
				 sound_bytes_per_second));
		if (uade_send_string(UADE_COMMAND_SEND_UADECORE_LOGS, ast,
				     &uadecore_ipc)) {
			fprintf(stderr, "uadecore: Unable to send logs: %s\n",
				ast);
			exit(1);
		}
		uadecore_audio_start_slow = 2;
	}
    } else {
	uadecore_audio_skip += bytes;
	/*
	 * If sound core doesn't report audio output start in 600 (virtual) seconds from
	 * the reboot, begin audio output anyway.
	 */
	if (uadecore_audio_start_slow == 0 &&
	    uadecore_audio_skip >= (sound_bytes_per_second * 600)) {
		fprintf(stderr, "Warning: slow audio output start\n");
		uadecore_audio_start_slow = 1;
		if (uade_send_string(UADE_COMMAND_SEND_UADECORE_LOGS,
				     "{'uadecore:audio_start_slow': True}",
				     &uadecore_ipc)) {
			fprintf(stderr, "uadecore: Unable to send logs: "
				"audio start slow\n");
			exit(1);
		}
	}
	sndbufpt = sndbuffer;
    }
}

static inline void write_left_right(int left, int right)
{
    if (write_audio_state != NULL)
	uade_write_audio_write_left_right(write_audio_state, left, right);

    *(sndbufpt++) = left;
    *(sndbufpt++) = right;

    /* ML timing: increment sample counters */
    ml_total_samples++;
    if (uadecore_audio_output)
        ml_tick_wav_samples++;

    check_sound_buffers();
}

static inline void sample_backend(int left, int right)
{
#if AUDIO_DEBUG
    int nr;
    for (nr = 0; nr < 4; nr++) {
	struct audio_channel_data *cdp = audio_channel + nr;
	if (cdp->state != 0 && cdp->datpt != 0 && (dmacon & (1 << nr)) && cdp->datpt >= cdp->datptend) {
	    fprintf(stderr, "Audio output overrun on channel %d: %.8x/%.8x\n", nr, cdp->datpt, cdp->datptend);
	}
    }
#endif

    /* samples are in range -16384 (-128*64*2) and 16256 (127*64*2) */
    left <<= 16 - 14 - 1;
    right <<= 16 - 14 - 1;
    /* [-32768, 32512] */

    if (sound_use_filter) {
	left = filter(left, &sound_filter_state[0]);
	right = filter(right, &sound_filter_state[1]);
    }

    write_left_right(left, right);
}


static void sample16s_handler (void)
{
    int output[4];
    int i;

    for (i = 0; i < 4; i++) {
	output[i] = audio_channel[i].current_sample * audio_channel[i].vol;
	output[i] &= audio_channel[i].adk_mask;
    }

    /* Per-channel capture: store raw output before stereo mix.
       Only record after uadecore_audio_output to align with tick sample log
       and stereo output timing. */
    if (uadecore_audio_output && ml_perchan_buf[0] && ml_perchan_count < ml_perchan_max) {
	for (i = 0; i < 4; i++) {
	    ml_perchan_buf[i][ml_perchan_count] = (int16_t)(output[i] << 1);
	    /* Trace first non-zero per-channel value */
	    (void)0;
	}
	ml_perchan_count++;
    }

    /* Per-sample DMA byte stream: record current_sample for each channel.
       Only record after uadecore_audio_output to align with tick sample log. */
    if (uadecore_audio_output && ml_dma_byte_stream[0] && ml_dma_byte_count < ml_dma_byte_max) {
	/* On first sample, capture initial volumes for all channels.
	   Volumes set before uadecore_audio_output are not in the vol log,
	   so MLINE would otherwise start with vol=0. */
	if (ml_dma_byte_count == 0) {
	    for (i = 0; i < 4; i++) {
		if (ml_vol_log_count[i] == 0 && audio_channel[i].vol != 0) {
		    ml_vol_log_pos[i][0] = 0;
		    ml_vol_log_val[i][0] = audio_channel[i].vol;
		    ml_vol_log_count[i] = 1;
		}
	    }
	}

	for (i = 0; i < 4; i++)
	    ml_dma_byte_stream[i][ml_dma_byte_count] = audio_channel[i].current_sample;

	ml_dma_byte_count++;
    }

    sample_backend(output[0] * !ismuted(0) + output[3] * !ismuted(3),
		   output[1] * !ismuted(1) + output[2] * !ismuted(2));
}


/* This interpolator examines sample points when Paula switches the output
 * voltage and computes the average of Paula's output */
static void sample16si_anti_handler (void)
{
    int i;
    int output[4];

    for (i = 0; i < 4; i += 1) {
	/* Take the integrated value of the previous time window */
	output[i] = (audio_channel[i].sample_accum /
		    audio_channel[i].sample_accum_time);
	/* Reset accumulator to start a new time window */
        audio_channel[i].sample_accum = 0;
	audio_channel[i].sample_accum_time = 0;
    }

    sample_backend(output[0] * !ismuted(0) + output[3] * !ismuted(3),
		   output[1] * !ismuted(1) + output[2] * !ismuted(2));
}

/* this interpolator performs BLEP mixing (bleps are shaped like integrated sinc
 * functions) with a type of BLEP that matches the filtering configuration. */
static void sample16si_sinc_handler (void)
{
    int i, n;
    int const *winsinc;
    int output[4];

    if (sound_use_filter) {
	n = (sound_use_filter == FILTER_MODEL_A500) ? 0 : 2;
        if (gui_ledstate)
            n += 1;
    } else {
	n = 4;
    }
    winsinc = winsinc_integral[n];
    
    for (i = 0; i < 4; i += 1) {
        int j;
        struct audio_channel_data *acd = &audio_channel[i];
        /* The sum rings with harmonic components up to infinity... */
	int sum = acd->output_state << 17;
        /* ...but we cancel them through mixing in BLEPs instead */
        int offsetpos = acd->sinc_queue_head & (SINC_QUEUE_LENGTH - 1);
        for (j = 0; j < SINC_QUEUE_LENGTH; j += 1) {
            int age = acd->sinc_queue_time - acd->sinc_queue[offsetpos].time;
            if (age >= SINC_QUEUE_MAX_AGE)
                break;
            sum -= winsinc[age] * acd->sinc_queue[offsetpos].output;
            offsetpos = (offsetpos + 1) & (SINC_QUEUE_LENGTH - 1);
        }
        output[i] = sum >> 16;
    }

    const int left = clamp_sample(
	output[0] * !ismuted(0) + output[3] * !ismuted(3));
    const int right = clamp_sample(
        output[1] * !ismuted(1) + output[2] * !ismuted(2));

    write_left_right(left, right);
}


static void anti_prehandler(unsigned long best_evtime)
{
    int i;

    /* Handle accumulator antialiasiation */
    for (i = 0; i < 4; i++) {
	struct audio_channel_data *acd = &audio_channel[i];
	const int output = (acd->current_sample * acd->vol) & acd->adk_mask;
	acd->sample_accum += output * best_evtime;
	acd->sample_accum_time += best_evtime;
    }
}

static void uade_write_audio_handler(unsigned long best_evtime)
{
    int i;
    int output[4];

    /* Handle accumulator antialiasiation */
    for (i = 0; i < 4; i++) {
	struct audio_channel_data *acd = &audio_channel[i];
	output[i] = (acd->current_sample * acd->vol * !ismuted(i)) & acd->adk_mask;
    }

    uade_write_audio_write(write_audio_state, output, best_evtime);
}

static void sinc_prehandler(unsigned long best_evtime)
{
    int i;

    for (i = 0; i < 4; i++) {
	struct audio_channel_data *acd = &audio_channel[i];
	const int output = (acd->current_sample * acd->vol) & acd->adk_mask;

        /* if output state changes, record the state change and also
         * write data into sinc queue for mixing in the BLEP */
        if (acd->output_state != output) {
            acd->sinc_queue_head = (acd->sinc_queue_head - 1) & (
		SINC_QUEUE_LENGTH - 1);
            acd->sinc_queue[acd->sinc_queue_head].time = acd->sinc_queue_time;
            acd->sinc_queue[acd->sinc_queue_head].output = (
		output - acd->output_state);
            acd->output_state = output;
        }
        
        acd->sinc_queue_time += best_evtime;
    }
}


static void audio_handler (int nr)
{
    struct audio_channel_data *cdp = audio_channel + nr;

    switch (cdp->state) {
     case 0:
	fprintf(stderr, "Bug in sound code\n");
	break;

     case 1:
	/* We come here at the first hsync after DMA was turned on. */
	cdp->evtime = maxhpos;

	cdp->state = 5;
	INTREQ(0x8000 | (0x80 << nr));
	if (cdp->wlen != 1)
	    cdp->wlen = (cdp->wlen - 1) & 0xFFFF;
	cdp->nextdat = chipmem_bank.wget(cdp->pt);

	if (write_audio_state != NULL && cdp->pt == cdp->lc)
	    uade_write_audio_set_state(write_audio_state, nr, PET_LOOP, 0);

	cdp->nextdatpt = cdp->pt;
	cdp->nextdatptend = cdp->ptend;

	/* BUG in UAE. Only hsync handler should increase DMA pointer
	   cdp->pt += 2;
	*/
	break;

     case 5:
	/* We come here at the second hsync after DMA was turned on. */
	cdp->evtime = cdp->per;
	cdp->dat = cdp->nextdat;

	cdp->datpt = cdp->nextdatpt;
	cdp->datptend = cdp->nextdatptend;

	cdp->current_sample = (uae_s8) (cdp->dat >> 8);

	cdp->state = 2;
	{
	    int audav = adkcon & (1 << nr);
	    int audap = adkcon & (16 << nr);
	    int napnav = (!audav && !audap) || audav;
	    if (napnav)
		cdp->data_written = 2;
	}
	break;

     case 2:
	/* We come here when a 2->3 transition occurs */
	cdp->current_sample = (uae_s8)(cdp->dat & 0xFF);
	cdp->evtime = cdp->per;

	cdp->state = 3;

	/* Period attachment? */
	if (adkcon & (0x10 << nr)) {
	    if (cdp->intreq2 && cdp->dmaen) {
		INTREQ(0x8000 | (0x80 << nr));
	    }
	    cdp->intreq2 = 0;

	    cdp->dat = cdp->nextdat;

	    cdp->datpt = cdp->nextdatpt;
	    cdp->datptend = cdp->nextdatptend;

	    if (cdp->dmaen)
		cdp->data_written = 2;
	    if (nr < 3) {
		if (cdp->dat == 0)
		    (cdp+1)->per = 65535;
		else
		    (cdp+1)->per = cdp->dat;
	    }
	}
	break;

     case 3:
	/* We come here when a 3->2 transition occurs */
	cdp->evtime = cdp->per;

	if ((INTREQR() & (0x80 << nr)) && !cdp->dmaen) {
	    cdp->state = 0;
	    cdp->current_sample = 0;
	    break;
	} else {
	    int audav = adkcon & (1 << nr);
	    int audap = adkcon & (16 << nr);
	    int napnav = (!audav && !audap) || audav;
	    cdp->state = 2;

	    if ((cdp->intreq2 && cdp->dmaen && napnav)
		|| (napnav && !cdp->dmaen)) {
		INTREQ(0x8000 | (0x80 << nr));
	    }
	    cdp->intreq2 = 0;

	    cdp->dat = cdp->nextdat;

	    cdp->datpt = cdp->nextdatpt;
	    cdp->datptend = cdp->nextdatptend;

	    cdp->current_sample = (uae_s8) (cdp->dat >> 8);

	    if (cdp->dmaen && napnav)
		cdp->data_written = 2;

	    /* Volume attachment? */
	    if (audav) {
		if (nr < 3) {
		    (cdp+1)->vol = cdp->dat;
		}
	    }
	}
	break;

     default:
	cdp->state = 0;
	break;
    }
}


void audio_reset (void)
{
    memset (audio_channel, 0, sizeof audio_channel);
    audio_channel[0].per = 65535;
    audio_channel[1].per = 65535;
    audio_channel[2].per = 65535;
    audio_channel[3].per = 65535;

    last_audio_cycles = 0;
    next_sample_evtime = sample_evtime_interval;

    /* ML timing: reset sample counter and per-tick log */
    ml_total_samples = 0;
    ml_tick_samples_count = 0;
    ml_vtick_samples_count = 0;
    ml_tick_dma_byte_pos_count = 0;
    ml_tick_wav_samples = 0;
    ml_tick_wav_start = 0;
    ml_vtick_wav_start = 0;
    ml_tick_dma_offset_count = 0;
    ml_vtick_dma_offset_count = 0;
    ml_tick_pair_buf_count = 0;
    ml_vtick_pair_buf_count = 0;
    ml_chplay_count = 0;
    ml_aud_tick_count = 0;
    ml_aud_tick_wav_start = 0;
    ml_skipped_ticks = 0;
    for (int ch = 0; ch < 4; ch++)
        ml_vol_log_count[ch] = 0;

    audperhack = 0;

    memset(sound_filter_state, 0, sizeof sound_filter_state);

    audio_set_resampler("none");  // Use linear/direct output to match C++ port
    sound_use_filter = 0;  // Disable A500/A1200 reconstruction filter for raw Paula output

    use_text_scope = 0;
    audio_mutemask = 0;

    // ML hack: Reset the init glitch state machine for new song
    ml_init_state = 0;
    ml_init_state2_count = 0;
}

void audio_set_write_audio_fname(const char *fname)
{
    write_audio_state = uade_write_audio_init(fname, -1);
    if (write_audio_state == NULL)
	fprintf(stderr, "Could not open uade_write_audio\n");
}

void audio_set_write_audio_fd(const int fd)
{
    write_audio_state = uade_write_audio_init(NULL, fd);
    if (write_audio_state == NULL)
	fprintf(stderr, "Could not open uade_write_audio\n");
}

/* This computes the 1st order low-pass filter term b0.
 * The a1 term is 1.0 - b0. The center frequency marks the -3 dB point. */
static float rc_calculate_a0(int sample_rate, int cutoff_freq)
{
    float omega;

    /* The BLT correction formula below blows up if the cutoff is above nyquist. */
    if (cutoff_freq >= sample_rate / 2)
        return 1.0;

    omega = 2 * M_PI * cutoff_freq / sample_rate;
    /* Compensate for the bilinear transformation. This allows us to specify the
     * stop frequency more exactly, but the filter becomes less steep further
     * from stopband. */
    omega = tan(omega / 2) * 2;
    return 1 / (1 + 1/omega);
}


void audio_set_mutemask(const int newmutemask)
{
	audio_mutemask = newmutemask;
}

void audio_set_filter(int filter_type, int filter_force)
{
  /* If filter_type is zero, filtering is disabled, but if it's
     non-zero, it contains the filter type (a500 or a1200) */
  if (filter_type < 0 || filter_type >= FILTER_MODEL_UPPER_BOUND) {
    fprintf(stderr, "Invalid filter number: %d\n", filter_type);
    exit(1);
  }
  sound_use_filter = filter_type;

  if (filter_force & 2) {
    gui_ledstate_forced = filter_force & 3;
    gui_ledstate = gui_ledstate_forced & 1;
  } else {
    gui_ledstate_forced = 0;
    gui_ledstate = (~ciaapra & 2) >> 1;
  }
}


void audio_set_rate(int rate)
{
    sample_evtime_interval = ((float) SOUNDTICKS) / rate;

    /* Although these numbers are in Hz, these values should not be taken to
     * be the true filter cutoff values of Amiga 500 and Amiga 1200.
     * This is because these filters are composites. The true values are
     * 5 kHz (or 4.5 kHz possibly on some models) for A500 fixed lowpass filter
     * and 1.7 kHz 12 db/oct Butterworth for the LED filter.
     */
    a500e_filter1_a0 = rc_calculate_a0(rate, 6200);
    a500e_filter2_a0 = rc_calculate_a0(rate, 20000);
    filter_a0 = rc_calculate_a0(rate, 7000);
}


void audio_set_resampler(char *name)
{
    sample_handler = sample16si_anti_handler;
    sample_prehandler = anti_prehandler;

    if (name == NULL || strcasecmp(name, "default") == 0)
	return;

    if (strcasecmp(name, "sinc") == 0) {
	sample_handler = sample16si_sinc_handler;
	sample_prehandler = sinc_prehandler;
    } else if (strcasecmp(name, "none") == 0) {
	sample_handler = sample16s_handler;
	sample_prehandler = NULL;
    } else {
	fprintf(stderr, "\nUnknown resampling method: %s. Using the default.\n", name);
    }
}


void audio_use_text_scope(void)
{
    use_text_scope = 1;
}


/* update_audio() emulates actions of audio state machine since it was last
   time called. One can assume it is called at least once per horizontal
   line and possibly more often. */
void update_audio (void)
{
    /* Number of cycles that has passed since last call to update_audio() */
    unsigned long n_cycles = cycles - last_audio_cycles;

    while (n_cycles > 0) {
	unsigned long best_evtime = n_cycles + 1;
	int i;
	unsigned long rounded;
	float f;

	for (i = 0; i < 4; i++) {
	    if (audio_channel[i].state != 0 && (
		    best_evtime > audio_channel[i].evtime)) {
		best_evtime = audio_channel[i].evtime;
	    }
	}

	/* next_sample_evtime >= 0 so floor() behaves as expected */
	rounded = floorf(next_sample_evtime);
	if ((next_sample_evtime - rounded) >= 0.5)
	    rounded++;

	if (best_evtime > rounded)
	    best_evtime = rounded;

	if (best_evtime > n_cycles)
	    best_evtime = n_cycles;

	/* Decrease time-to-wait counters */
	next_sample_evtime -= best_evtime;

	/* sample_prehandler makes it possible to compute effects with
	   accuracy of one bus cycle. sample_handler is only called when
	   a sample is outputted. */
	if (sample_prehandler != NULL) {
	    sample_prehandler(best_evtime);

	    if (write_audio_state != NULL)
		uade_write_audio_handler(best_evtime);
	}

	for (i = 0; i < 4; i++)
	    audio_channel[i].evtime -= best_evtime;

	n_cycles -= best_evtime;

	/* Test if new sample needs to be outputted */
	if (rounded == best_evtime) {
	    /* Before the following addition, next_sample_evtime is in range
	       [-0.5, 0.5) */
	    next_sample_evtime += sample_evtime_interval;
	    (*sample_handler) ();
	}

	/* Call audio state machines if needed */
	for (i = 0; i < 4; i++) {
	    if (audio_channel[i].evtime == 0 && audio_channel[i].state != 0)
		audio_handler(i);
	}
    }

    last_audio_cycles = cycles - n_cycles;
}


void AUDxDAT (int nr, uae_u16 v)
{
    struct audio_channel_data *cdp = audio_channel + nr;

    TEXT_SCOPE(cycles, nr, PET_DAT, v);

    if (write_audio_state != NULL)
	uade_write_audio_set_state(write_audio_state, nr, PET_DAT, v);

    update_audio ();

    cdp->dat = v;
    cdp->datpt = 0;

    if (cdp->state == 0 && !(INTREQR() & (0x80 << nr))) {
	cdp->state = 2;
	INTREQ(0x8000 | (0x80 << nr));
	/* data_written = 2 ???? */
	cdp->evtime = cdp->per;
    }
}


void AUDxLCH (int nr, uae_u16 v)
{
    TEXT_SCOPE(cycles, nr, PET_LCH, v);

    if (write_audio_state != NULL)
	uade_write_audio_set_state(write_audio_state, nr, PET_LCH, v);

    update_audio ();

    audio_channel[nr].lc = (audio_channel[nr].lc & 0xffff) | ((uae_u32)v << 16);
}


void AUDxLCL (int nr, uae_u16 v)
{
    TEXT_SCOPE(cycles, nr, PET_LCL, v);

    if (write_audio_state != NULL)
	uade_write_audio_set_state(write_audio_state, nr, PET_LCL, v);

    update_audio ();

    audio_channel[nr].lc = (audio_channel[nr].lc & ~0xffff) | (v & 0xFFFE);
}


void AUDxPER (int nr, uae_u16 v)
{
    TEXT_SCOPE(cycles, nr, PET_PER, v);

    if (write_audio_state != NULL)
	uade_write_audio_set_state(write_audio_state, nr, PET_PER, v);

    update_audio ();

    if (v == 0)
	v = 65535;
    else if (v < 16) {
	/* With the risk of breaking super-cool players,
	   we limit the value to 16 to save cpu time on not so powerful
	   machines. robocop customs use low values for example. */
	if (!audperhack) {
	    audperhack = 1;
	    uadecore_send_debug("Eagleplayer inserted %d into aud%dper.",
				v, nr);
	}
	v = 16;
    }

    audio_channel[nr].per = v;
}


void AUDxLEN (int nr, uae_u16 v)
{
    TEXT_SCOPE(cycles, nr, PET_LEN, v);

    if (write_audio_state != NULL)
	uade_write_audio_set_state(write_audio_state, nr, PET_LEN, v);

    update_audio ();


    audio_channel[nr].len = v;
}


void AUDxVOL (int nr, uae_u16 v)
{
    int v2 = v & 64 ? 63 : v & 63;

    TEXT_SCOPE(cycles, nr, PET_VOL, v);

    if (write_audio_state != NULL)
	uade_write_audio_set_state(write_audio_state, nr, PET_VOL, v);

    update_audio ();

    // ML hack: State machine to skip the init glitch (audio->silence->audio)
    // State: 0=waiting, 1=seen VOL>0, 2=seen VOL=0 after VOL>0, 3=enabled
    // The 2->3 transition requires a minimum sample gap (300 samples ~= half a tick)
    // to prevent premature transition when different channels write vol>0 and vol=0
    // within the same tick's PlaySongEffects batch.
    // Init glitch suppression disabled — only needed for --no-effects A/B comparison.
    // With effects enabled, ADSR/tremolo can prevent the VOL>0→VOL=0→VOL>0 pattern
    // from completing, causing permanent silence.
    // if (ml_init_state < 3) { ... }

    audio_channel[nr].vol = v2;

    /* Record volume change position for MLINE timing alignment */
    if (uadecore_audio_output && nr < 4 && ml_vol_log_count[nr] < ML_VOL_LOG_MAX) {
        int idx = ml_vol_log_count[nr];
        ml_vol_log_pos[nr][idx] = ml_dma_byte_count;
        ml_vol_log_val[nr][idx] = v2;
        ml_vol_log_count[nr]++;
    }
}


/* Per-tick sample count recording — called from CIA_update when bovfla fires.
   Only records entries once audio output has started (uadecore_audio_output=1),
   so tick sizes correspond to actual WAV output samples. */
void ml_record_tick_samples(void)
{
    if (!uadecore_audio_output)  {
        /* Reset baseline each tick during startup so first real entry is clean */
        ml_tick_wav_start = ml_tick_wav_samples;
        ml_skipped_ticks++;
        return;
    }
    int delta = (int)(ml_tick_wav_samples - ml_tick_wav_start);
    if (ml_tick_samples_count < ML_TICK_SAMPLES_MAX) {
        ml_tick_samples_log[ml_tick_samples_count] = delta;
        ml_tick_dma_byte_pos_log[ml_tick_samples_count] = ml_dma_byte_count;
    }
    ml_tick_samples_count++;
    ml_tick_wav_start = ml_tick_wav_samples;
}

/* VBlank tick recording — called from vsync_handler for VBlank-timed songs */
void ml_record_vtick_samples(void)
{
    if (!uadecore_audio_output) {
        ml_vtick_wav_start = ml_tick_wav_samples;
        return;
    }
    int delta = (int)(ml_tick_wav_samples - ml_vtick_wav_start);
    if (ml_vtick_samples_count < ML_TICK_SAMPLES_MAX) {
        ml_vtick_samples_log[ml_vtick_samples_count++] = delta;
    }
    ml_vtick_wav_start = ml_tick_wav_samples;
}

/* Per-tick DMA byte offset recording — captures (pt - lc) for each channel
   at tick boundaries, allowing MLINE to know where Paula's DMA read pointer
   is within each pair buffer at the start of each tick. */
void ml_record_tick_dma_offsets(void)
{
    if (!uadecore_audio_output) return;
    if (ml_tick_dma_offset_count < ML_TICK_SAMPLES_MAX) {
        int base = ml_tick_dma_offset_count * 4;
        int i;
        for (i = 0; i < 4; i++) {
            struct audio_channel_data *cdp = &audio_channel[i];
            if (cdp->state != 0 && cdp->dmaen) {
                /* Compute byte offset within DMA buffer from wlen countdown.
                   len is AUDxLEN (words), wlen counts down from len.
                   Bytes consumed = (len - wlen) * 2. */
                int bytes_consumed = ((int)cdp->len - cdp->wlen) * 2;
                int buf_size = (int)cdp->len * 2;  /* total buffer bytes */
                if (buf_size > 0)
                    ml_tick_dma_offset_log[base + i] = ((bytes_consumed % buf_size) + buf_size) % buf_size;
                else
                    ml_tick_dma_offset_log[base + i] = 0;
            } else {
                ml_tick_dma_offset_log[base + i] = -1;
            }
        }
        ml_tick_dma_offset_count++;
    }
}

void ml_record_vtick_dma_offsets(void)
{
    if (!uadecore_audio_output) return;
    if (ml_vtick_dma_offset_count < ML_TICK_SAMPLES_MAX) {
        int base = ml_vtick_dma_offset_count * 4;
        int i;
        for (i = 0; i < 4; i++) {
            struct audio_channel_data *cdp = &audio_channel[i];
            if (cdp->state != 0 && cdp->dmaen) {
                int bytes_consumed = ((int)cdp->len - cdp->wlen) * 2;
                int buf_size = (int)cdp->len * 2;
                if (buf_size > 0)
                    ml_vtick_dma_offset_log[base + i] = ((bytes_consumed % buf_size) + buf_size) % buf_size;
                else
                    ml_vtick_dma_offset_log[base + i] = 0;
            } else {
                ml_vtick_dma_offset_log[base + i] = -1;
            }
        }
        ml_vtick_dma_offset_count++;
    }
}

/* Per-tick pair buffer snapshot API */
void ml_pair_buf_init(int max_ticks, int mix_len)
{
    free(ml_tick_pair_buf);
    free(ml_vtick_pair_buf);
    ml_tick_pair_buf = (int8_t *)calloc((size_t)max_ticks * 4 * mix_len, 1);
    ml_tick_pair_buf_count = 0;
    ml_tick_pair_buf_mix_len = mix_len;
    ml_tick_pair_buf_max = max_ticks;
    ml_vtick_pair_buf = (int8_t *)calloc((size_t)max_ticks * 4 * mix_len, 1);
    ml_vtick_pair_buf_count = 0;
    ml_vtick_pair_buf_mix_len = mix_len;
    ml_vtick_pair_buf_max = max_ticks;
}

void ml_pair_buf_free(void)
{
    free(ml_tick_pair_buf);
    ml_tick_pair_buf = NULL;
    ml_tick_pair_buf_count = 0;
    ml_tick_pair_buf_max = 0;
    free(ml_vtick_pair_buf);
    ml_vtick_pair_buf = NULL;
    ml_vtick_pair_buf_count = 0;
    ml_vtick_pair_buf_max = 0;
}

void ml_record_tick_pair_bufs(void)
{
    if (!uadecore_audio_output || !ml_tick_pair_buf) return;
    if (ml_tick_pair_buf_count >= ml_tick_pair_buf_max) return;
    int mix_len = ml_tick_pair_buf_mix_len;
    int base = ml_tick_pair_buf_count * 4 * mix_len;
    int i, j;
    for (i = 0; i < 4; i++) {
        struct audio_channel_data *cdp = &audio_channel[i];
        int8_t *dst = ml_tick_pair_buf + base + i * mix_len;
        if (cdp->state != 0 && cdp->dmaen) {
            /* Always read from where the DMA is actually reading.
               Compute buffer base from pt and wlen (not lc, which may
               point to a different buffer half after Dma4/_DoubleBuf). */
            uaecptr buf_base = cdp->pt - (uaecptr)((int)cdp->len - cdp->wlen) * 2;
            for (j = 0; j < mix_len; j++)
                dst[j] = (int8_t)chipmem_bank.bget(buf_base + j);
        } else {
            memset(dst, 0, mix_len);
        }
    }
    ml_tick_pair_buf_count++;
}

void ml_record_vtick_pair_bufs(void)
{
    if (!uadecore_audio_output || !ml_vtick_pair_buf) return;
    if (ml_vtick_pair_buf_count >= ml_vtick_pair_buf_max) return;
    int mix_len = ml_vtick_pair_buf_mix_len;
    int base = ml_vtick_pair_buf_count * 4 * mix_len;
    int i, j;
    for (i = 0; i < 4; i++) {
        struct audio_channel_data *cdp = &audio_channel[i];
        int8_t *dst = ml_vtick_pair_buf + base + i * mix_len;
        if (cdp->state != 0 && cdp->dmaen) {
            /* Always read from where the DMA is actually reading.
               pt may be in a different buffer half than lc if Dma4 toggled
               _DoubleBuf since the last DMA wrap. Compute the buffer base
               from pt and wlen to get the correct half. */
            uaecptr buf_base = cdp->pt - (uaecptr)((int)cdp->len - cdp->wlen) * 2;
            for (j = 0; j < mix_len; j++)
                dst[j] = (int8_t)chipmem_bank.bget(buf_base + j);
        } else {
            memset(dst, 0, mix_len);
        }
    }
    ml_vtick_pair_buf_count++;
}

int8_t *ml_pair_buf_get_tick(int tick) { return ml_tick_pair_buf; }
int8_t *ml_pair_buf_get_vtick(int tick) { return ml_vtick_pair_buf; }

/* Per-channel capture API */
void ml_perchan_init(int max_samples)
{
    int i;
    ml_perchan_free();
    ml_perchan_max = max_samples;
    ml_perchan_count = 0;
    for (i = 0; i < 4; i++) {
	ml_perchan_buf[i] = (int16_t *)calloc(max_samples, sizeof(int16_t));
    }
}

void ml_perchan_free(void)
{
    int i;
    for (i = 0; i < 4; i++) {
	free(ml_perchan_buf[i]);
	ml_perchan_buf[i] = NULL;
    }
    ml_perchan_count = 0;
    ml_perchan_max = 0;
}

int ml_perchan_get_count(void)
{
    return ml_perchan_count;
}

int16_t *ml_perchan_get_channel(int ch)
{
    if (ch < 0 || ch > 3) return NULL;
    return ml_perchan_buf[ch];
}

/* Per-sample DMA byte stream API */
void ml_dma_byte_init(int max_samples)
{
    int i;
    ml_dma_byte_free();
    ml_dma_byte_max = max_samples;
    ml_dma_byte_count = 0;
    for (i = 0; i < 4; i++)
	ml_dma_byte_stream[i] = (int8_t *)calloc(max_samples, 1);
}

void ml_dma_byte_free(void)
{
    int i;
    for (i = 0; i < 4; i++) {
	free(ml_dma_byte_stream[i]);
	ml_dma_byte_stream[i] = NULL;
    }
    ml_dma_byte_count = 0;
    ml_dma_byte_max = 0;
}

int ml_dma_byte_get_count(void)
{
    return ml_dma_byte_count;
}

int8_t *ml_dma_byte_get_channel(int ch)
{
    if (ch < 0 || ch > 3) return NULL;
    return ml_dma_byte_stream[ch];
}
