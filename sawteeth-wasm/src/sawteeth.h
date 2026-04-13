/**
 * sawteeth.h - Sawteeth synthesizer replayer (ported from NostalgicPlayer C#)
 *
 * Plays .st files (magic "SWTD"). Fully synthesized (no PCM samples).
 * Waveforms: saw, square (PWM), triangle, noise, sine, triU, sinU.
 * Filters: SLP, OLP, LP, HP, BP, BS (state-variable).
 * Effects: pitch slide, portamento, PWM offset, resonance, cutoff, amplitude.
 */

#ifndef SAWTEETH_H
#define SAWTEETH_H

#include <stdint.h>
#include <stdbool.h>

#define ST_MAX_CHANNELS  12
#define ST_MAX_PARTS     256
#define ST_MAX_INSTR     256
#define ST_MAX_NOTES     264   /* 22 octaves * 12 semitones */
#define ST_SINE_TABLE    512
#define ST_SAMPLE_RATE   44100

/* Waveform types */
enum {
  ST_WAVE_HOLD  = 0,
  ST_WAVE_SAW   = 1,
  ST_WAVE_SQR   = 2,
  ST_WAVE_TRI   = 3,
  ST_WAVE_NOS   = 4,
  ST_WAVE_SIN   = 5,
  ST_WAVE_TRIU  = 6,
  ST_WAVE_SINU  = 7,
};

/* Filter modes */
enum {
  ST_FILT_OFF = 0,
  ST_FILT_SLP = 1,   /* single-pole lowpass */
  ST_FILT_OLP = 2,   /* overdriven lowpass */
  ST_FILT_LP  = 3,   /* 2-pole state-variable LP */
  ST_FILT_HP  = 4,
  ST_FILT_BP  = 5,
  ST_FILT_BS  = 6,   /* band-stop / notch */
};

/* Clip modes */
enum {
  ST_CLIP_OFF  = 0,
  ST_CLIP_HARD = 1,
  ST_CLIP_SIN  = 2,
};

/* ── Envelope breakpoint ── */
typedef struct {
  uint8_t time;
  uint8_t lev;
} st_timelev_t;

/* ── Instrument step (arpeggio/waveform row) ── */
typedef struct {
  uint8_t note;
  bool    relative;
  uint8_t wform;
} st_ins_step_t;

/* ── Instrument definition ── */
typedef struct {
  st_timelev_t  *amp;           /* amplitude envelope breakpoints */
  st_timelev_t  *filter;        /* filter envelope breakpoints */
  st_ins_step_t *steps;         /* arpeggio/waveform sequence */
  uint8_t  amp_points;
  uint8_t  filter_points;
  uint8_t  filter_mode;         /* 0-6 */
  uint8_t  clip_mode;           /* 0-2 */
  uint8_t  boost;               /* 0-15 */
  uint8_t  sps;                 /* ticks per instrument step */
  uint8_t  res;                 /* resonance 0-255 */
  uint8_t  vib_s, vib_d;        /* vibrato speed/depth */
  uint8_t  pwm_s, pwm_d;        /* PWM speed/depth */
  uint8_t  len, loop;           /* step count, loop point */
} st_ins_t;

/* ── Pattern row ── */
typedef struct {
  uint8_t note;
  uint8_t ins;
  uint8_t eff;
} st_step_t;

/* ── Part (pattern) ── */
typedef struct {
  st_step_t *steps;
  uint8_t    sps;               /* ticks per step */
  uint8_t    len;               /* number of rows */
} st_part_t;

/* ── Channel sequence entry ── */
typedef struct {
  uint8_t  part;
  int8_t   transp;
  uint8_t  d_amp;
} st_ch_step_t;

/* ── Channel definition ── */
typedef struct {
  st_ch_step_t *steps;
  uint8_t       left, right;    /* panning */
  uint16_t      len;
  uint16_t      l_loop, r_loop;
} st_channel_t;

/* ── LFO state ── */
typedef struct {
  float curr;
  float step;
} st_lfo_t;

/* ── Wave oscillator state ── */
typedef struct {
  int   form;
  float curr;                   /* phase accumulator */
  float step;                   /* freq / sample_rate */
  float curr_val;               /* triangle accumulator */
  float pwm;
  bool  pwm_lo;
  float amp, from_amp;
  /* fixed-point for sin/triU/sinU */
  uint32_t sin_curr;
  uint32_t sin_step;
  float noise_val;
  int   jng_seed;
} st_wave_t;

/* ── Instrument player state ── */
typedef struct {
  st_lfo_t  vib;
  st_lfo_t  pwm_lfo;
  float     v_amp, p_amp;
  float     pwm_offs;
  st_wave_t wave;

  /* instrument step sequencer */
  uint8_t step_c;
  int     next_s;

  /* amp ADSR */
  float   curr_amp, amp_step;
  int8_t  adsr;
  int     next_adsr;

  /* filter ADSR */
  float   curr_f, f_step;
  int8_t  f_adsr;
  int     next_f_adsr;

  /* freq sources */
  float   ins_freq;
  float   curr_part_freq;
  float   curr_part_amp;
  float   curr_part_co;

  /* resolved filter */
  float   res;
  float   amp_out;
  float   cut_off;

  /* SVF state */
  float   lo, hi, bp, bs;

  bool    trigged;
  st_ins_t *curr_ins;
} st_ins_ply_t;

/* ── Per-channel player state ── */
typedef struct {
  st_ins_ply_t ip;
  float    *buffer;             /* spsPal float samples */
  uint32_t  nexts;              /* ticks remaining in current step */
  uint32_t  seq_count;          /* position in channel sequence */
  uint8_t   step_c;             /* position within current part */
  float     d_amp;              /* amplitude from ChStep.DAmp */
  float     amp, amp_step;
  float     freq, freq_step, target_freq;
  float     cut_off, cut_off_step;
  bool      looped;
} st_player_t;

/* ── Song data ── */
typedef struct {
  st_channel_t  channels[ST_MAX_CHANNELS];
  st_part_t     parts[ST_MAX_PARTS];
  st_ins_t      instruments[ST_MAX_INSTR];
  uint8_t       num_channels;
  uint8_t       num_parts;
  uint8_t       num_instruments;
  uint16_t      sps_pal;        /* samples per PAL tick */
  uint16_t      version;
  char          name[256];
  char          author[256];
} st_song_t;

/* ── Engine state ── */
typedef struct {
  st_song_t     song;
  st_player_t   players[ST_MAX_CHANNELS];
  float         n2f[ST_MAX_NOTES];    /* note-to-freq table */
  float         r2f[ST_MAX_NOTES];    /* relative freq table */
  float         c_mul[ST_MAX_CHANNELS]; /* channel mix coefficients */
  float        *mix_buf_l;            /* stereo output buffer */
  float        *mix_buf_r;
  uint32_t      pals;                 /* global tick counter */
  bool          playing;
  bool          looped;
  int           sample_rate;
  /* render state for fractional tick output */
  float        *tick_buf_l;
  float        *tick_buf_r;
  int           tick_buf_pos;         /* current read position in tick buffer */
  int           tick_buf_len;         /* = sps_pal */
} st_engine_t;

/* ── API ── */
int  sawteeth_init(const uint8_t *data, int len);
void sawteeth_stop(void);
int  sawteeth_render(float *out, int num_samples);
void sawteeth_set_sample_rate(int rate);
int  sawteeth_get_num_channels(void);
void sawteeth_set_channel_gain(int ch, float gain);

#endif /* SAWTEETH_H */
