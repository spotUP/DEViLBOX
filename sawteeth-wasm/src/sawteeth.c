/**
 * sawteeth.c - Sawteeth synthesizer replayer
 *
 * Faithful port of NostalgicPlayer's Sawteeth player (C#) to C.
 * Plays .st files (magic "SWTD") with full synthesis engine:
 * - 8 waveforms (saw, square/PWM, triangle, noise, sine, triU, sinU)
 * - Multi-point amplitude and filter envelopes
 * - State-variable filter (LP/HP/BP/BS) + single-pole + overdriven LP
 * - Hard clip and sine-shaper distortion
 * - Vibrato and PWM LFOs
 * - Instrument arpeggio/waveform sequencer
 * - Per-channel pattern sequencer with effects
 */

#include "sawteeth.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/* ── Global engine state ── */
static st_engine_t g_engine;
static float g_sine_table[ST_SINE_TABLE];
static float g_tri_table[ST_SINE_TABLE];
static bool  g_tables_init = false;
static float g_channel_gains[ST_MAX_CHANNELS];

/* ── Helpers ── */

static inline float clampf(float x, float lo, float hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

static uint16_t read_u16be(const uint8_t *p) {
  return ((uint16_t)p[0] << 8) | p[1];
}

/* ── Init tables ── */

static void init_tables(void) {
  if (g_tables_init) return;
  for (int i = 0; i < ST_SINE_TABLE; i++) {
    g_sine_table[i] = sinf((float)i * 2.0f * (float)M_PI / (float)ST_SINE_TABLE);
    /* Triangle: -1..+1 linear ramp up then down */
    float t = (float)i / (float)ST_SINE_TABLE;
    if (t < 0.25f)      g_tri_table[i] = t * 4.0f;
    else if (t < 0.75f) g_tri_table[i] = 2.0f - t * 4.0f;
    else                g_tri_table[i] = t * 4.0f - 4.0f;
  }
  g_tables_init = true;
}

/* ── Build frequency tables ── */

static void build_freq_tables(st_engine_t *e) {
  float mul = powf(2.0f, 1.0f / 12.0f);

  /* n2f: absolute note-to-frequency */
  float oct_base = 1.02197486445547712033f;
  for (int oct = 0; oct < 22; oct++) {
    float f = oct_base;
    for (int semi = 0; semi < 12; semi++) {
      int idx = oct * 12 + semi;
      if (idx < ST_MAX_NOTES) e->n2f[idx] = f;
      f *= mul;
    }
    oct_base *= 2.0f;
  }

  /* r2f: relative frequency ratios */
  oct_base = 1.0f;
  for (int oct = 0; oct < 22; oct++) {
    float f = oct_base;
    for (int semi = 0; semi < 12; semi++) {
      int idx = oct * 12 + semi;
      if (idx < ST_MAX_NOTES) e->r2f[idx] = f;
      f *= mul;
    }
    oct_base *= 2.0f;
  }

  /* c_mul: channel mix-down coefficients */
  for (int c = 0; c < ST_MAX_CHANNELS; c++) {
    float cc = (float)(c + 1);
    e->c_mul[c] = ((1.0f - 0.1f) / cc) + 0.1f;
  }
}

/* ══════════════════════════════════════════════════════════════════════
 *  LFO
 * ══════════════════════════════════════════════════════════════════════ */

static void lfo_set(st_lfo_t *lfo, float freq) {
  lfo->step = freq * 2.0f * (float)M_PI / (float)ST_SAMPLE_RATE;
}

static float lfo_next(st_lfo_t *lfo) {
  lfo->curr += lfo->step;
  if (lfo->curr > 2.0f * (float)M_PI) lfo->curr -= 2.0f * (float)M_PI;
  return cosf(lfo->curr);
}

/* ══════════════════════════════════════════════════════════════════════
 *  Wave oscillator
 * ══════════════════════════════════════════════════════════════════════ */

static void wave_init(st_wave_t *w) {
  memset(w, 0, sizeof(*w));
  w->jng_seed = 1;
  w->form = ST_WAVE_HOLD;
}

static void wave_set_freq(st_wave_t *w, float freq) {
  w->step = freq / (float)ST_SAMPLE_RATE;
  if (w->step > 1.9f) w->step = 1.9f;
  /* fixed-point step for sin/tri tables */
  w->sin_step = (uint32_t)(w->step * (float)((uint32_t)ST_SINE_TABLE << 23));
}

static void wave_set_amp(st_wave_t *w, float amp) {
  w->amp = amp;
}

static void wave_no_interp(st_wave_t *w) {
  w->from_amp = w->amp;
}

static void wave_set_form(st_wave_t *w, int form) {
  w->form = form;
}

static void wave_set_pwm(st_wave_t *w, float pwm) {
  if (pwm > 0.9f) pwm = 0.9f;
  if (pwm < -0.9f) pwm = -0.9f;
  w->pwm = pwm;
}

/* Park-Miller RNG */
static float wave_noise_next(st_wave_t *w) {
  int seed = w->jng_seed;
  int q = seed / 127773;
  seed = 16807 * (seed - q * 127773) - 2836 * q;
  if (seed < 0) seed += 2147483647;
  w->jng_seed = seed;
  return (float)seed / 1073741823.5f - 1.0f;
}

/* Fill buffer with waveform samples. Returns true if audio produced. */
static bool wave_fill(st_wave_t *w, float *buf, int len) {
  if (w->form == ST_WAVE_HOLD) return false;

  float amp = w->amp;
  float from = w->from_amp;
  float amp_step = (amp - from) / (float)len;
  float a = from;

  switch (w->form) {
    case ST_WAVE_SAW: {
      for (int i = 0; i < len; i++) {
        a += amp_step;
        w->curr += w->step;
        if (w->curr >= 1.0f) {
          w->curr -= 1.0f;
          /* anti-alias at discontinuity */
          float d = w->curr / w->step;
          buf[i] = a * (-2.0f * d + 1.0f);
        } else {
          buf[i] = a * (2.0f * w->curr - 1.0f);
        }
      }
      break;
    }
    case ST_WAVE_SQR: {
      for (int i = 0; i < len; i++) {
        a += amp_step;
        w->curr += w->step;
        if (w->curr >= 1.0f) {
          w->curr -= 1.0f;
          w->pwm_lo = !w->pwm_lo;
        }
        float threshold = 0.5f + w->pwm * 0.5f;
        if (w->pwm_lo) {
          if (w->curr >= threshold) {
            w->pwm_lo = false;
            float d = (w->curr - threshold) / w->step;
            buf[i] = a * (2.0f * d - 1.0f);
          } else {
            buf[i] = -a;
          }
        } else {
          if (w->curr < threshold && w->curr >= w->step) {
            /* shouldn't happen in normal flow, but guard */
            buf[i] = a;
          } else {
            buf[i] = a;
          }
        }
      }
      break;
    }
    case ST_WAVE_TRI: {
      for (int i = 0; i < len; i++) {
        a += amp_step;
        w->curr += w->step;
        if (w->curr >= 1.0f) w->curr -= 1.0f;
        w->curr_val += w->step * 2.0f;
        if (w->curr_val > 1.0f) w->curr_val -= 2.0f;
        float v = w->curr_val;
        if (v < 0) v = -v;
        buf[i] = a * (2.0f * (-v) + 1.0f);
      }
      break;
    }
    case ST_WAVE_NOS: {
      for (int i = 0; i < len; i++) {
        a += amp_step;
        w->curr += w->step;
        if (w->curr >= 1.0f) {
          w->curr -= 1.0f;
          w->noise_val = wave_noise_next(w);
        }
        buf[i] = a * w->noise_val;
      }
      break;
    }
    case ST_WAVE_SIN: {
      for (int i = 0; i < len; i++) {
        a += amp_step;
        w->sin_curr += w->sin_step;
        int idx = (w->sin_curr >> 23) & (ST_SINE_TABLE - 1);
        int idx2 = (idx + 1) & (ST_SINE_TABLE - 1);
        float frac = (float)(w->sin_curr & 0x7FFFFF) / (float)0x800000;
        buf[i] = a * (g_sine_table[idx] * (1.0f - frac) + g_sine_table[idx2] * frac);
      }
      break;
    }
    case ST_WAVE_TRIU: {
      for (int i = 0; i < len; i++) {
        a += amp_step;
        w->sin_curr += w->sin_step;
        int idx = (w->sin_curr >> 23) & (ST_SINE_TABLE - 1);
        buf[i] = a * g_tri_table[idx];
      }
      break;
    }
    case ST_WAVE_SINU: {
      for (int i = 0; i < len; i++) {
        a += amp_step;
        w->sin_curr += w->sin_step;
        int idx = (w->sin_curr >> 23) & (ST_SINE_TABLE - 1);
        buf[i] = a * g_sine_table[idx];
      }
      break;
    }
    default:
      return false;
  }

  w->from_amp = amp;
  return true;
}

/* ══════════════════════════════════════════════════════════════════════
 *  Instrument player
 * ══════════════════════════════════════════════════════════════════════ */

static void ins_ply_init(st_ins_ply_t *ip) {
  memset(ip, 0, sizeof(*ip));
  wave_init(&ip->wave);
  ip->curr_amp = 0;
  ip->curr_f = 1.0f;
  ip->curr_part_freq = 1.0f;
  ip->curr_part_amp = 1.0f;
  ip->curr_part_co = 1.0f;
  ip->ins_freq = 1.0f;
  ip->res = 0;
  ip->adsr = -1;
  ip->f_adsr = -1;
}

static void ins_ply_trig(st_ins_ply_t *ip, st_ins_t *ins, const float *n2f) {
  ip->curr_ins = ins;
  ip->trigged = true;
  ip->step_c = 0;
  ip->next_s = 0;

  /* reset amp envelope */
  ip->curr_amp = 0;
  ip->amp_step = 0;
  ip->adsr = -1;
  ip->next_adsr = 0;

  /* reset filter envelope */
  ip->curr_f = 0;
  ip->f_step = 0;
  ip->f_adsr = -1;
  ip->next_f_adsr = 0;

  /* reset LFOs */
  ip->vib.curr = 0;
  ip->pwm_lfo.curr = 0;
  lfo_set(&ip->vib, (float)ins->vib_s * 50.0f);
  lfo_set(&ip->pwm_lfo, (float)ins->pwm_s * 5.0f);
  ip->v_amp = (float)ins->vib_d / 2000.0f;
  ip->p_amp = (float)ins->pwm_d / 255.1f;

  /* resonance: nonlinear curve */
  float raw_r = (float)ins->res / 255.0f;
  ip->res = 1.0f - (1.0f - raw_r) * (1.0f - raw_r);

  /* reset filter state */
  ip->lo = ip->hi = ip->bp = ip->bs = 0;

  /* reset wave */
  wave_init(&ip->wave);
  ip->pwm_offs = 0;

  (void)n2f;
}

static void ins_ply_set_freq(st_ins_ply_t *ip, float freq) {
  ip->curr_part_freq = freq;
}

static void ins_ply_set_amp(st_ins_ply_t *ip, float amp) {
  ip->curr_part_amp = amp;
}

static void ins_ply_set_cut_off(st_ins_ply_t *ip, float co) {
  ip->curr_part_co = co;
}

static void ins_ply_set_reso(st_ins_ply_t *ip, float r) {
  ip->res = 1.0f - (1.0f - r) * (1.0f - r);
}

static void ins_ply_set_pwm_offs(st_ins_ply_t *ip, float offs) {
  ip->pwm_offs = offs;
}

/* Advance instrument step sequencer and envelopes, then fill buffer */
static bool ins_ply_next(st_ins_ply_t *ip, float *buf, int sps_pal,
                         const float *n2f, const float *r2f) {
  st_ins_t *ins = ip->curr_ins;
  if (!ins) return false;

  /* ── Instrument step sequencer ── */
  if (ip->next_s <= 0) {
    ip->next_s = ins->sps;
    if (ip->step_c < ins->len) {
      st_ins_step_t *is = &ins->steps[ip->step_c];
      wave_set_form(&ip->wave, is->wform);
      if (is->note > 0 && is->note < ST_MAX_NOTES) {
        if (is->relative) {
          ip->ins_freq = r2f[is->note];
        } else {
          ip->ins_freq = n2f[is->note];
        }
      }
      ip->step_c++;
      if (ip->step_c >= ins->len) {
        ip->step_c = ins->loop < ins->len ? ins->loop : 0;
      }
    }
  }
  ip->next_s--;

  /* ── Amplitude envelope ── */
  if (ip->next_adsr <= 0 && ip->adsr < (int)ins->amp_points - 1) {
    ip->adsr++;
    st_timelev_t *tl = &ins->amp[ip->adsr];
    float target = (float)tl->lev / 257.0f;
    int time = tl->time + 1;
    ip->amp_step = (target - ip->curr_amp) / (float)time;
    ip->next_adsr = time;
  }
  if (ip->next_adsr > 0) {
    ip->curr_amp += ip->amp_step;
    ip->next_adsr--;
    if (ip->next_adsr <= 0) ip->amp_step = 0;
  }

  /* ── Filter envelope ── */
  if (ip->next_f_adsr <= 0 && ip->f_adsr < (int)ins->filter_points - 1) {
    ip->f_adsr++;
    st_timelev_t *tl = &ins->filter[ip->f_adsr];
    float raw = (float)tl->lev / 257.0f;
    float target = raw * raw * raw;  /* cubic for perceptual linearity */
    int time = tl->time + 1;
    ip->f_step = (target - ip->curr_f) / (float)time;
    ip->next_f_adsr = time;
  }
  if (ip->next_f_adsr > 0) {
    ip->curr_f += ip->f_step;
    ip->next_f_adsr--;
    if (ip->next_f_adsr <= 0) ip->f_step = 0;
  }

  /* ── Compute final values ── */
  float final_amp = ip->curr_amp * ip->curr_part_amp;
  float final_co  = ip->curr_f * ip->curr_part_co;
  final_co = clampf(final_co, 0.0f, 1.0f);

  /* ── Set frequency with vibrato ── */
  float vib_mod = 1.0f + ip->v_amp * lfo_next(&ip->vib);
  float freq;
  if (ip->trigged && ip->curr_ins->steps[0].relative) {
    freq = ip->curr_part_freq * ip->ins_freq * vib_mod;
  } else {
    /* Check if current instrument step is relative */
    int cur_step = ip->step_c > 0 ? ip->step_c - 1 : 0;
    if (cur_step < ins->len && ins->steps[cur_step].relative) {
      freq = ip->curr_part_freq * ip->ins_freq * vib_mod;
    } else {
      freq = ip->ins_freq * vib_mod;
    }
  }
  wave_set_freq(&ip->wave, freq);

  /* ── PWM ── */
  wave_set_pwm(&ip->wave, ip->pwm_offs + ip->p_amp * lfo_next(&ip->pwm_lfo));

  /* ── Set amplitude ── */
  wave_set_amp(&ip->wave, final_amp);
  if (ip->trigged) {
    wave_no_interp(&ip->wave);
    ip->trigged = false;
  }

  /* ── Generate waveform ── */
  if (!wave_fill(&ip->wave, buf, sps_pal)) {
    memset(buf, 0, sps_pal * sizeof(float));
    return false;
  }

  /* ── Apply filter ── */
  if (ins->filter_mode != ST_FILT_OFF) {
    /* Clamp cutoff for SVF stability (must be < ~1.0 to prevent blowup) */
    float co = clampf(final_co, 0.0f, 0.99f);
    float amp_clamp = final_amp > 0.001f ? final_amp : 0.001f;
    for (int i = 0; i < sps_pal; i++) {
      float f = buf[i];
      switch (ins->filter_mode) {
        case ST_FILT_SLP:
          ip->lo = co * f + ip->lo * (1.0f - co);
          buf[i] = ip->lo;
          break;
        case ST_FILT_OLP:
          ip->lo += (ip->lo - ip->bp) * ip->res;
          ip->lo = co * f + ip->lo * (1.0f - co);
          ip->lo = clampf(ip->lo, -4.0f, 4.0f);
          ip->bp = f;
          buf[i] = ip->lo;
          break;
        case ST_FILT_LP:
        case ST_FILT_HP:
        case ST_FILT_BP:
        case ST_FILT_BS: {
          float t = ip->lo + co * ip->bp;
          ip->hi = f - ip->lo - (1.8f - ip->res * 1.8f) * ip->bp;
          ip->bp += co * ip->hi;
          ip->lo = clampf(t, -amp_clamp, amp_clamp);
          ip->bs = ip->lo + ip->hi;
          /* Clamp filter state to prevent blowup */
          ip->bp = clampf(ip->bp, -4.0f, 4.0f);
          ip->hi = clampf(ip->hi, -4.0f, 4.0f);
          switch (ins->filter_mode) {
            case ST_FILT_LP: buf[i] = ip->lo; break;
            case ST_FILT_HP: buf[i] = ip->hi; break;
            case ST_FILT_BP: buf[i] = ip->bp; break;
            case ST_FILT_BS: buf[i] = ip->bs; break;
          }
          break;
        }
      }
    }
  }

  /* ── Apply distortion/clipping ── */
  if (ins->clip_mode != ST_CLIP_OFF) {
    float boost_mul;
    if (ins->clip_mode == ST_CLIP_HARD) {
      boost_mul = 2.0f * (1.0f + (float)ins->boost);
    } else {
      boost_mul = 0.7f * (1.3f + (float)ins->boost);
    }
    for (int i = 0; i < sps_pal; i++) {
      float v = buf[i] * boost_mul;
      if (ins->clip_mode == ST_CLIP_HARD) {
        if (v > 1.0f) v = 1.0f;
        if (v < -1.0f) v = -1.0f;
      } else {
        v = sinf(v);
      }
      buf[i] = v;
    }
  }

  /* Final per-sample clamp to prevent any blowup from reaching the mixer */
  for (int i = 0; i < sps_pal; i++) {
    if (buf[i] > 1.0f) buf[i] = 1.0f;
    if (buf[i] < -1.0f) buf[i] = -1.0f;
  }

  return true;
}

/* ══════════════════════════════════════════════════════════════════════
 *  Channel player
 * ══════════════════════════════════════════════════════════════════════ */

static void player_init(st_player_t *p, int sps_pal) {
  memset(p, 0, sizeof(*p));
  ins_ply_init(&p->ip);
  p->buffer = (float *)calloc(sps_pal, sizeof(float));
  p->d_amp = 1.0f;
  p->amp = 1.0f;
  p->freq = 1.0f;
  p->target_freq = 1.0f;
  p->cut_off = 1.0f;
  p->cut_off_step = 1.0f;
}

static bool player_next_buffer(st_player_t *p, st_engine_t *e, int ch_idx) {
  st_channel_t *ch = &e->song.channels[ch_idx];
  int sps_pal = e->song.sps_pal;

  /* ── Step boundary? ── */
  if (p->nexts == 0) {
    if (p->seq_count >= ch->len) {
      /* Channel finished */
      memset(p->buffer, 0, sps_pal * sizeof(float));
      return false;
    }

    st_ch_step_t *cs = &ch->steps[p->seq_count];
    p->d_amp = (255.0f - (float)cs->d_amp) / 255.0f;

    st_part_t *part = &e->song.parts[cs->part];
    p->nexts = part->sps;

    if (p->step_c < part->len) {
      st_step_t *step = &part->steps[p->step_c];

      /* Instrument trigger */
      if (step->ins > 0 && step->ins < e->song.num_instruments) {
        ins_ply_trig(&p->ip, &e->song.instruments[step->ins], e->n2f);
        p->amp = 1.0f;
        p->amp_step = 0;
        p->cut_off = 1.0f;
        p->cut_off_step = 1.0f;
      }

      /* Note */
      if (step->note > 0) {
        int note_idx = (int)step->note + (int)cs->transp;
        if (note_idx < 1) note_idx = 1;
        if (note_idx >= ST_MAX_NOTES) note_idx = ST_MAX_NOTES - 1;
        float eff_hi = (float)(step->eff >> 4);
        if ((int)eff_hi != 3) {
          /* Not portamento — set freq immediately */
          p->target_freq = e->n2f[note_idx];
          p->freq = p->target_freq;
          p->freq_step = 1.0f;
        } else {
          /* Portamento — just set target */
          p->target_freq = e->n2f[note_idx];
        }
      }

      /* Process effect */
      uint8_t eff_type = step->eff >> 4;
      uint8_t eff_param = step->eff & 0x0F;
      switch (eff_type) {
        case 0x1: /* pitch slide up */
          p->target_freq = 44100.0f;
          p->freq_step = 1.0f + ((float)eff_param + 1.0f) / (50.0f * 3.0f);
          break;
        case 0x2: /* pitch slide down */
          p->target_freq = 1.0f;
          p->freq_step = 1.0f - ((float)eff_param + 1.0f) / (50.0f * 3.0f);
          break;
        case 0x3: { /* portamento */
          float spd = ((float)eff_param + 1.0f) / (50.0f * 3.0f);
          if (p->target_freq > p->freq) {
            p->freq_step = 1.0f + spd;
          } else {
            p->freq_step = 1.0f - spd;
          }
          break;
        }
        case 0x4: /* PWM offset */
          ins_ply_set_pwm_offs(&p->ip, (float)eff_param / 16.1f);
          break;
        case 0x5: /* resonance */
          ins_ply_set_reso(&p->ip, (float)eff_param / 15.0f);
          break;
        case 0x7: /* filter cutoff down */
          p->cut_off_step = 1.0f - ((float)eff_param + 1.0f) / 256.0f;
          break;
        case 0x8: /* filter cutoff up */
          p->cut_off_step = 1.0f + ((float)eff_param + 1.0f) / 256.0f;
          break;
        case 0x9: { /* filter cutoff set */
          float v = ((float)eff_param + 1.0f) / 16.0f;
          p->cut_off = v * v;
          p->cut_off_step = 1.0f;
          break;
        }
        case 0xA: /* amp fade down */
          p->amp_step = -((float)eff_param + 1.0f) / 256.0f;
          break;
        case 0xB: /* amp fade up */
          p->amp_step = ((float)eff_param + 1.0f) / 256.0f;
          break;
        case 0xC: /* amp set */
          p->amp = (float)eff_param / 15.0f;
          p->amp_step = 0;
          break;
        default:
          break;
      }

      p->step_c++;
      if (p->step_c >= part->len) {
        p->step_c = 0;
        p->seq_count++;
        if (p->seq_count > ch->r_loop) {
          p->seq_count = ch->l_loop;
          p->looped = true;
        }
      }
    }
  }
  p->nexts--;

  /* ── Per-tick updates ── */
  p->cut_off *= p->cut_off_step;
  p->cut_off = clampf(p->cut_off, 0.0f, 1.0f);
  if (p->cut_off >= 1.0f) p->cut_off_step = 1.0f;

  /* Freq glide */
  if (p->freq_step != 1.0f) {
    p->freq *= p->freq_step;
    if (p->freq_step > 1.0f && p->freq >= p->target_freq) {
      p->freq = p->target_freq;
      p->freq_step = 1.0f;
    } else if (p->freq_step < 1.0f && p->freq <= p->target_freq) {
      p->freq = p->target_freq;
      p->freq_step = 1.0f;
    }
  }

  /* Amp */
  p->amp += p->amp_step;
  p->amp = clampf(p->amp, 0.0f, 1.0f);
  if (p->amp <= 0.0f || p->amp >= 1.0f) p->amp_step = 0;

  /* Push to instrument player */
  ins_ply_set_amp(&p->ip, p->amp * p->d_amp);
  ins_ply_set_freq(&p->ip, p->freq);
  ins_ply_set_cut_off(&p->ip, p->cut_off);

  /* Render */
  return ins_ply_next(&p->ip, p->buffer, sps_pal, e->n2f, e->r2f);
}

/* ══════════════════════════════════════════════════════════════════════
 *  File parser
 * ══════════════════════════════════════════════════════════════════════ */

static int parse_file(st_engine_t *e, const uint8_t *data, int len) {
  if (len < 10) return -1;

  /* Magic check */
  if (data[0] != 'S' || data[1] != 'W' || data[2] != 'T' || data[3] != 'D')
    return -1;

  int off = 4;
  st_song_t *s = &e->song;
  memset(s, 0, sizeof(*s));

  /* Version */
  if (off + 2 > len) return -1;
  s->version = read_u16be(data + off); off += 2;

  /* spsPal */
  if (s->version >= 900) {
    if (off + 2 > len) return -1;
    s->sps_pal = read_u16be(data + off); off += 2;
  } else {
    s->sps_pal = 882;
  }
  if (s->sps_pal == 0) s->sps_pal = 882;

  /* Channel count */
  if (off + 1 > len) return -1;
  s->num_channels = data[off++];
  if (s->num_channels < 1 || s->num_channels > ST_MAX_CHANNELS) return -1;

  /* ── Read channels ── */
  for (int c = 0; c < s->num_channels; c++) {
    st_channel_t *ch = &s->channels[c];
    if (off + 2 > len) return -1;
    ch->left = data[off++];
    ch->right = data[off++];

    if (off + 2 > len) return -1;
    ch->len = read_u16be(data + off); off += 2;
    if (ch->len < 1 || ch->len > 8192) return -1;

    if (s->version >= 910) {
      if (off + 2 > len) return -1;
      ch->l_loop = read_u16be(data + off); off += 2;
    } else {
      ch->l_loop = 0;
    }

    if (s->version >= 1200) {
      if (off + 2 > len) return -1;
      ch->r_loop = read_u16be(data + off); off += 2;
    } else {
      ch->r_loop = ch->len - 1;
    }

    /* Clamp loop points */
    if (ch->l_loop >= ch->len) ch->l_loop = 0;
    if (ch->r_loop >= ch->len) ch->r_loop = ch->len - 1;

    /* Allocate and read sequence steps */
    ch->steps = (st_ch_step_t *)calloc(ch->len, sizeof(st_ch_step_t));
    if (!ch->steps) return -1;

    for (int i = 0; i < ch->len; i++) {
      if (off + 3 > len) return -1;
      ch->steps[i].part = data[off++];
      ch->steps[i].transp = (int8_t)data[off++];
      ch->steps[i].d_amp = data[off++];
    }
  }

  /* ── Read parts ── */
  if (off + 1 > len) return -1;
  s->num_parts = data[off++];
  if (s->num_parts == 0) s->num_parts = 1; /* at least one dummy */

  for (int p = 0; p < s->num_parts; p++) {
    st_part_t *part = &s->parts[p];
    if (off + 2 > len) return -1;
    part->sps = data[off++];
    part->len = data[off++];
    if (part->sps < 1) part->sps = 1;
    if (part->len < 1) part->len = 1;

    part->steps = (st_step_t *)calloc(part->len, sizeof(st_step_t));
    if (!part->steps) return -1;

    for (int i = 0; i < part->len; i++) {
      if (off + 3 > len) return -1;
      part->steps[i].ins = data[off++];
      part->steps[i].eff = data[off++];
      part->steps[i].note = data[off++];
    }
  }

  /* ── Read instruments ── */
  if (off + 1 > len) return -1;
  s->num_instruments = data[off++];

  /* Instrument 0 is a dummy */
  memset(&s->instruments[0], 0, sizeof(st_ins_t));

  for (int i = 1; i < s->num_instruments; i++) {
    st_ins_t *ins = &s->instruments[i];
    memset(ins, 0, sizeof(*ins));

    /* Filter envelope */
    if (off + 1 > len) return -1;
    ins->filter_points = data[off++];
    if (ins->filter_points > 0) {
      ins->filter = (st_timelev_t *)calloc(ins->filter_points, sizeof(st_timelev_t));
      if (!ins->filter) return -1;
      for (int j = 0; j < ins->filter_points; j++) {
        if (off + 2 > len) return -1;
        ins->filter[j].time = data[off++];
        ins->filter[j].lev = data[off++];
      }
    }

    /* Amp envelope */
    if (off + 1 > len) return -1;
    ins->amp_points = data[off++];
    if (ins->amp_points > 0) {
      ins->amp = (st_timelev_t *)calloc(ins->amp_points, sizeof(st_timelev_t));
      if (!ins->amp) return -1;
      for (int j = 0; j < ins->amp_points; j++) {
        if (off + 2 > len) return -1;
        ins->amp[j].time = data[off++];
        ins->amp[j].lev = data[off++];
      }
    }

    /* Mode bytes */
    if (off + 8 > len) return -1;
    ins->filter_mode = data[off++];
    uint8_t clip_boost = data[off++];
    ins->clip_mode = clip_boost >> 4;
    ins->boost = clip_boost & 0x0F;
    ins->vib_s = data[off++];
    ins->vib_d = data[off++];
    ins->pwm_s = data[off++];
    ins->pwm_d = data[off++];
    ins->res = data[off++];
    ins->sps = data[off++];
    if (ins->sps < 1) ins->sps = 1;

    /* Len/loop */
    if (s->version < 900) {
      if (off + 1 > len) return -1;
      uint8_t packed = data[off++];
      ins->len = packed & 0x7F;
      ins->loop = (packed & 0x80) ? 0 : ins->len; /* loop flag in bit 7 */
    } else {
      if (off + 2 > len) return -1;
      ins->len = data[off++];
      ins->loop = data[off++];
    }
    if (ins->len < 1) ins->len = 1;
    if (ins->loop >= ins->len) ins->loop = 0;

    /* Instrument steps */
    ins->steps = (st_ins_step_t *)calloc(ins->len, sizeof(st_ins_step_t));
    if (!ins->steps) return -1;

    for (int j = 0; j < ins->len; j++) {
      if (off + 2 > len) return -1;
      uint8_t combined = data[off++];
      ins->steps[j].relative = (combined & 0x80) != 0;
      ins->steps[j].wform = combined & 0x0F;
      ins->steps[j].note = data[off++];
    }
  }

  /* ── Break points (read and discard) ── */
  if (off + 1 <= len) {
    uint8_t bp_count = data[off++];
    off += bp_count * 8;  /* 4 bytes pal + 4 bytes command each */
    if (off > len) off = len;
  }

  /* ── Strings ── */
  /* Helper to read a null/LF-terminated string */
  #define READ_STR(dst, maxlen) do { \
    int _si = 0; \
    while (off < len && data[off] != 0 && data[off] != '\n' && _si < (maxlen)-1) { \
      (dst)[_si++] = (char)data[off++]; \
    } \
    (dst)[_si] = '\0'; \
    if (off < len) off++; /* skip terminator */ \
  } while(0)

  READ_STR(s->name, 256);
  READ_STR(s->author, 256);

  /* Part names — skip (we don't need them for playback) */
  for (int p = 0; p < s->num_parts; p++) {
    while (off < len && data[off] != 0 && data[off] != '\n') off++;
    if (off < len) off++;
  }
  /* Instrument names — skip */
  for (int i = 1; i < s->num_instruments; i++) {
    while (off < len && data[off] != 0 && data[off] != '\n') off++;
    if (off < len) off++;
  }

  #undef READ_STR

  /* Clamp part references in channel sequences */
  for (int c = 0; c < s->num_channels; c++) {
    st_channel_t *ch = &s->channels[c];
    for (int i = 0; i < ch->len; i++) {
      if (ch->steps[i].part >= s->num_parts) {
        ch->steps[i].part = s->num_parts - 1;
      }
    }
  }

  return 0;
}

/* ══════════════════════════════════════════════════════════════════════
 *  Public API
 * ══════════════════════════════════════════════════════════════════════ */

static void free_song(st_song_t *s) {
  for (int c = 0; c < ST_MAX_CHANNELS; c++) {
    free(s->channels[c].steps);
    s->channels[c].steps = NULL;
  }
  for (int p = 0; p < ST_MAX_PARTS; p++) {
    free(s->parts[p].steps);
    s->parts[p].steps = NULL;
  }
  for (int i = 0; i < ST_MAX_INSTR; i++) {
    free(s->instruments[i].amp);
    free(s->instruments[i].filter);
    free(s->instruments[i].steps);
    s->instruments[i].amp = NULL;
    s->instruments[i].filter = NULL;
    s->instruments[i].steps = NULL;
  }
}

static void free_engine_buffers(st_engine_t *e) {
  for (int c = 0; c < ST_MAX_CHANNELS; c++) {
    free(e->players[c].buffer);
    e->players[c].buffer = NULL;
  }
  free(e->mix_buf_l);
  free(e->mix_buf_r);
  free(e->tick_buf_l);
  free(e->tick_buf_r);
  e->mix_buf_l = e->mix_buf_r = NULL;
  e->tick_buf_l = e->tick_buf_r = NULL;
}

int sawteeth_init(const uint8_t *data, int len) {
  init_tables();
  sawteeth_stop();

  st_engine_t *e = &g_engine;
  memset(e, 0, sizeof(*e));
  e->sample_rate = ST_SAMPLE_RATE;

  if (parse_file(e, data, len) != 0) {
    free_song(&e->song);
    return -1;
  }

  build_freq_tables(e);

  int sps = e->song.sps_pal;

  /* Init per-channel players */
  for (int c = 0; c < e->song.num_channels; c++) {
    player_init(&e->players[c], sps);
  }

  /* Allocate tick buffers for resampling */
  e->tick_buf_l = (float *)calloc(sps, sizeof(float));
  e->tick_buf_r = (float *)calloc(sps, sizeof(float));
  e->tick_buf_pos = sps;  /* force first tick on first render */
  e->tick_buf_len = sps;

  e->playing = true;
  e->looped = false;
  e->pals = 0;

  /* Init channel gains */
  for (int c = 0; c < ST_MAX_CHANNELS; c++) {
    g_channel_gains[c] = 1.0f;
  }

  return 0;
}

void sawteeth_stop(void) {
  st_engine_t *e = &g_engine;
  e->playing = false;
  free_engine_buffers(e);
  free_song(&e->song);
}

void sawteeth_set_sample_rate(int rate) {
  /* We always synthesize at 44100 internally; the worklet sample rate
     is handled by the WebAudio context. If needed, we could resample here. */
  g_engine.sample_rate = rate;
}

int sawteeth_get_num_channels(void) {
  return g_engine.song.num_channels;
}

void sawteeth_set_channel_gain(int ch, float gain) {
  if (ch >= 0 && ch < ST_MAX_CHANNELS) {
    g_channel_gains[ch] = gain;
  }
}

/* Render one tick of all channels into the tick buffers */
static void render_tick(st_engine_t *e) {
  int sps = e->song.sps_pal;
  int nch = e->song.num_channels;
  float cm = e->c_mul[nch > 0 ? nch - 1 : 0];

  memset(e->tick_buf_l, 0, sps * sizeof(float));
  memset(e->tick_buf_r, 0, sps * sizeof(float));

  for (int c = 0; c < nch; c++) {
    st_player_t *p = &e->players[c];
    bool has_audio = player_next_buffer(p, e, c);

    if (has_audio && g_channel_gains[c] > 0.0f) {
      st_channel_t *ch = &e->song.channels[c];
      float pan_l = (float)ch->left / 255.0f;
      float pan_r = (float)ch->right / 255.0f;
      float gain = g_channel_gains[c] * cm;

      for (int i = 0; i < sps; i++) {
        float sv = p->buffer[i];
        /* Kill NaN/Inf and clamp extreme values */
        if (sv != sv || sv > 2.0f || sv < -2.0f) sv = 0.0f;
        sv *= gain;
        e->tick_buf_l[i] += sv * pan_l;
        e->tick_buf_r[i] += sv * pan_r;
      }
    }
  }

  /* Detect loop from channel 0 */
  if (nch > 0 && e->players[0].looped) {
    e->looped = true;
  }

  e->pals++;
  e->tick_buf_pos = 0;
}

/* Render interleaved stereo float output (LRLRLR...) */
int sawteeth_render(float *out, int num_samples) {
  st_engine_t *e = &g_engine;
  if (!e->playing) return 0;

  int written = 0;
  while (written < num_samples) {
    /* Need a new tick? */
    if (e->tick_buf_pos >= e->tick_buf_len) {
      render_tick(e);
    }

    /* Copy from tick buffer */
    int avail = e->tick_buf_len - e->tick_buf_pos;
    int need = num_samples - written;
    int copy = avail < need ? avail : need;

    for (int i = 0; i < copy; i++) {
      float l = e->tick_buf_l[e->tick_buf_pos + i];
      float r = e->tick_buf_r[e->tick_buf_pos + i];
      /* Final safety clamp to prevent browser audio blowup */
      if (l > 1.0f) l = 1.0f; else if (l < -1.0f) l = -1.0f;
      if (r > 1.0f) r = 1.0f; else if (r < -1.0f) r = -1.0f;
      out[(written + i) * 2]     = l;
      out[(written + i) * 2 + 1] = r;
    }

    e->tick_buf_pos += copy;
    written += copy;
  }

  return written;
}

/* ══════════════════════════════════════════════════════════════════════
 *  Instrument query/edit API
 * ══════════════════════════════════════════════════════════════════════ */

int sawteeth_get_num_instruments(void) {
  return g_engine.song.num_instruments;
}

static st_ins_t *get_ins(int idx) {
  if (idx < 0 || idx >= g_engine.song.num_instruments) return NULL;
  return &g_engine.song.instruments[idx];
}

int sawteeth_get_param(int ins, int param_id) {
  st_ins_t *p = get_ins(ins);
  if (!p) return -1;
  switch (param_id) {
    case ST_PARAM_FILTER_MODE: return p->filter_mode;
    case ST_PARAM_CLIP_MODE:   return p->clip_mode;
    case ST_PARAM_BOOST:       return p->boost;
    case ST_PARAM_VIB_S:       return p->vib_s;
    case ST_PARAM_VIB_D:       return p->vib_d;
    case ST_PARAM_PWM_S:       return p->pwm_s;
    case ST_PARAM_PWM_D:       return p->pwm_d;
    case ST_PARAM_RES:         return p->res;
    case ST_PARAM_SPS:         return p->sps;
    case ST_PARAM_LEN:         return p->len;
    case ST_PARAM_LOOP:        return p->loop;
    default: return -1;
  }
}

void sawteeth_set_param(int ins, int param_id, int value) {
  st_ins_t *p = get_ins(ins);
  if (!p) return;
  switch (param_id) {
    case ST_PARAM_FILTER_MODE: p->filter_mode = (uint8_t)(value & 0x07); break;
    case ST_PARAM_CLIP_MODE:   p->clip_mode   = (uint8_t)(value & 0x03); break;
    case ST_PARAM_BOOST:       p->boost       = (uint8_t)(value & 0x0F); break;
    case ST_PARAM_VIB_S:       p->vib_s       = (uint8_t)value; break;
    case ST_PARAM_VIB_D:       p->vib_d       = (uint8_t)value; break;
    case ST_PARAM_PWM_S:       p->pwm_s       = (uint8_t)value; break;
    case ST_PARAM_PWM_D:       p->pwm_d       = (uint8_t)value; break;
    case ST_PARAM_RES:         p->res         = (uint8_t)value; break;
    case ST_PARAM_SPS:         p->sps         = (uint8_t)(value < 1 ? 1 : value); break;
    case ST_PARAM_LEN:         p->len         = (uint8_t)(value < 1 ? 1 : value); break;
    case ST_PARAM_LOOP:        if (value < p->len) p->loop = (uint8_t)value; break;
    default: break;
  }
}

int sawteeth_get_amp_points(int ins) {
  st_ins_t *p = get_ins(ins);
  return p ? p->amp_points : 0;
}

int sawteeth_get_filter_points(int ins) {
  st_ins_t *p = get_ins(ins);
  return p ? p->filter_points : 0;
}

void sawteeth_get_amp_env(int ins, uint8_t *out_times, uint8_t *out_levs, int max_points) {
  st_ins_t *p = get_ins(ins);
  if (!p) return;
  int n = p->amp_points < max_points ? p->amp_points : max_points;
  for (int i = 0; i < n; i++) {
    out_times[i] = p->amp[i].time;
    out_levs[i]  = p->amp[i].lev;
  }
}

void sawteeth_get_filter_env(int ins, uint8_t *out_times, uint8_t *out_levs, int max_points) {
  st_ins_t *p = get_ins(ins);
  if (!p) return;
  int n = p->filter_points < max_points ? p->filter_points : max_points;
  for (int i = 0; i < n; i++) {
    out_times[i] = p->filter[i].time;
    out_levs[i]  = p->filter[i].lev;
  }
}

void sawteeth_set_amp_env(int ins, const uint8_t *times, const uint8_t *levs, int count) {
  st_ins_t *p = get_ins(ins);
  if (!p || count < 1 || count > 255) return;
  st_timelev_t *new_env = (st_timelev_t *)malloc(count * sizeof(st_timelev_t));
  if (!new_env) return;
  for (int i = 0; i < count; i++) {
    new_env[i].time = times[i];
    new_env[i].lev  = levs[i];
  }
  free(p->amp);
  p->amp = new_env;
  p->amp_points = (uint8_t)count;
}

void sawteeth_set_filter_env(int ins, const uint8_t *times, const uint8_t *levs, int count) {
  st_ins_t *p = get_ins(ins);
  if (!p || count < 1 || count > 255) return;
  st_timelev_t *new_env = (st_timelev_t *)malloc(count * sizeof(st_timelev_t));
  if (!new_env) return;
  for (int i = 0; i < count; i++) {
    new_env[i].time = times[i];
    new_env[i].lev  = levs[i];
  }
  free(p->filter);
  p->filter = new_env;
  p->filter_points = (uint8_t)count;
}

int sawteeth_get_step_count(int ins) {
  st_ins_t *p = get_ins(ins);
  return p ? p->len : 0;
}

void sawteeth_get_steps(int ins, uint8_t *out_notes, uint8_t *out_wforms, uint8_t *out_relative, int max) {
  st_ins_t *p = get_ins(ins);
  if (!p) return;
  int n = p->len < max ? p->len : max;
  for (int i = 0; i < n; i++) {
    out_notes[i]    = p->steps[i].note;
    out_wforms[i]   = p->steps[i].wform;
    out_relative[i] = p->steps[i].relative ? 1 : 0;
  }
}

void sawteeth_set_step(int ins, int step_idx, uint8_t note, uint8_t wform, uint8_t relative) {
  st_ins_t *p = get_ins(ins);
  if (!p || step_idx < 0 || step_idx >= p->len) return;
  p->steps[step_idx].note     = note;
  p->steps[step_idx].wform    = wform & 0x07;
  p->steps[step_idx].relative = relative != 0;
}
