 /*
  * UAE - The Un*x Amiga Emulator
  *
  * Sound emulation stuff
  *
  * Copyright 1995, 1996, 1997 Bernd Schmidt
  */

#ifndef _UADE_AUDIO_H_
#define _UADE_AUDIO_H_

#include "sinctable.h"
#include "write_audio.h"

#define AUDIO_DEBUG 0
/* Queue length 256 implies minimum emulated period of 8. This should be
 * sufficient for all imaginable purposes. This must be power of two. */
#define SINC_QUEUE_LENGTH 256

typedef struct {
    int time, output;
} sinc_queue_t;

extern struct audio_channel_data {
    unsigned long adk_mask;
    unsigned long evtime;
    unsigned char dmaen, intreq2, data_written;
    uaecptr lc, pt;

    int state, wper, wlen;
    int current_sample;
    int sample_accum, sample_accum_time;
    int output_state;
    sinc_queue_t sinc_queue[SINC_QUEUE_LENGTH];
    int sinc_queue_time;
    int sinc_queue_head;
    int vol;
    uae_u16 dat, nextdat, per, len;    

    /* Debug variables */
    uaecptr ptend, nextdatpt, nextdatptend, datpt, datptend;
} audio_channel[4];

extern struct uade_write_audio *write_audio_state;

extern void AUDxDAT (int nr, uae_u16 value);
extern void AUDxVOL (int nr, uae_u16 value);
extern void AUDxPER (int nr, uae_u16 value);
extern void AUDxLCH (int nr, uae_u16 value);
extern void AUDxLCL (int nr, uae_u16 value);
extern void AUDxLEN (int nr, uae_u16 value);

void audio_reset (void);
void audio_set_filter(int filter_type, int filter_force);
void audio_set_mutemask(int newmutemask);
void audio_set_rate (int rate);
void audio_set_resampler(char *name);
void audio_set_write_audio_fd(const int fd);
void audio_set_write_audio_fname(const char *fname);
void audio_use_text_scope(void);
void update_audio (void);

/* Per-channel capture for A/B comparison */
void ml_perchan_init(int max_samples);
void ml_perchan_free(void);
int ml_perchan_get_count(void);
int16_t *ml_perchan_get_channel(int ch);

/* Per-tick sample count log for A/B comparison with MLINE */
void ml_record_tick_samples(void);   /* CIA-B timer ticks */
void ml_record_vtick_samples(void);  /* VBlank ticks */
extern int ml_tick_samples_log[];
extern int ml_tick_samples_count;
extern int ml_vtick_samples_log[];
extern int ml_vtick_samples_count;
extern int ml_skipped_ticks;  /* CIA ticks before audio output started */
extern int ml_tick_dma_byte_pos_log[];
extern int ml_tick_dma_byte_pos_count;

/* Per-tick DMA byte offset log for A/B comparison with MLINE */
void ml_record_tick_dma_offsets(void);
void ml_record_vtick_dma_offsets(void);
extern int ml_tick_dma_offset_log[];
extern int ml_tick_dma_offset_count;
extern int ml_vtick_dma_offset_log[];
extern int ml_vtick_dma_offset_count;

/* Per-tick ch_Play state log: 8 values per tick (ch1..ch8), recorded via trap $f0ff18 */
void ml_record_chplay(int vals[8]);
extern int ml_chplay_log[];
extern int ml_chplay_count;

/* Audio interrupt tick sample log: per-tick sample counts at PlayMusic rate (8ch mode) */
extern int ml_aud_tick_samples_log[];
extern int ml_aud_tick_count;

/* Per-sample DMA byte stream API: records actual current_sample bytes per channel */
void ml_dma_byte_init(int max_samples);
void ml_dma_byte_free(void);
int ml_dma_byte_get_count(void);
int8_t *ml_dma_byte_get_channel(int ch);

/* Per-channel volume change log: records DMA byte position and volume for each
   AUDxVOL hardware write. Used to align MLINE's per-channel capture timing
   with UADE's intra-tick CPU processing delay. */
#define ML_VOL_LOG_MAX 16384
extern int ml_vol_log_pos[4][ML_VOL_LOG_MAX];   /* DMA byte position of vol write */
extern int ml_vol_log_val[4][ML_VOL_LOG_MAX];   /* volume value (0-63) */
extern int ml_vol_log_count[4];                  /* entries per channel */

/* Per-tick pair buffer snapshot API for A/B comparison with MLINE (8-channel songs) */
void ml_pair_buf_init(int max_ticks, int mix_len);
void ml_pair_buf_free(void);
void ml_record_tick_pair_bufs(void);
void ml_record_vtick_pair_bufs(void);
extern int ml_tick_pair_buf_count;
extern int ml_tick_pair_buf_mix_len;
extern int ml_vtick_pair_buf_count;
extern int ml_vtick_pair_buf_mix_len;

#endif
