/*
 * ym_render.cpp - the sound of the native Hippel ST player: the player's YM2149 register values,
 * once per 50 Hz tick, into Furnace's YM2149 core (third-party/furnace-master, MAME ay8910), the
 * chip at the Atari ST's 2 MHz. The core steps at clock / 8 = 250 kHz; each voice's output goes
 * through a band-limited step buffer (blip_buf) to the audio rate, so the voices can be muted alone.
 */
#include <cstring>
#include <cstdint>
#include "sound/ay8910.h"

extern "C" {
#include "blip_buf.h"
void hst_tick(void);
void hst_regs(uint8_t *out);
}

namespace {

constexpr int CHIP_RATE = 250000;                 /* 2 MHz / 8 */
constexpr int TICKS_PER_SECOND = 50;
constexpr int STEPS_PER_TICK = CHIP_RATE / TICKS_PER_SECOND;
constexpr int RING = 16384;
constexpr float VOICE_GAIN = 1.0f / 32768.0f;

ym2149_device *chip = nullptr;
blip_t *bb[3] = {nullptr, nullptr, nullptr};
short lastOut[3] = {0, 0, 0};
float ring[3][RING];
int ringHead = 0;            /* samples produced so far, mod RING */
int ringAvail = 0;           /* produced and not yet consumed */
int sampleRate = 44100;
int muteMask = 0;
int keyGate = 1;             /* the keyboard instance's mixer gate; the song instance leaves it open */
float gate = 1.0f;           /* the gate with a short release */
int running = 0;
uint8_t lastRegs[11];
bool haveRegs = false;

void writeReg(int r, uint8_t v)
{
  chip->address_w((unsigned char)r);
  chip->data_w(v);
}

/* One player tick: run the player, load its registers into the chip, step the chip for 20 ms. */
void produceTick()
{
  uint8_t regs[11];
  hst_tick();
  hst_regs(regs);
  /* A volume with bit 4 set is the YM's envelope mode. The player never programs the envelope
   * registers; Wanted Team's Amiga emulation plays it as half amplitude (its volume table entry 16
   * is $20 of 64), which is volume 12 on the chip's 2 dB steps - the level the song is heard at
   * through UADE today. */
  for (int r = 8; r <= 10; r++) if (regs[r] & 0x10) regs[r] = 12;
  for (int r = 0; r < 11; r++) {
    if (!haveRegs || lastRegs[r] != regs[r]) writeReg(r, regs[r]);
    lastRegs[r] = regs[r];
  }
  haveRegs = true;
  for (int t = 0; t < STEPS_PER_TICK; t++) {
    short out[3];
    chip->sound_stream_update(out, 1);
    for (int c = 0; c < 3; c++) {
      if (out[c] != lastOut[c]) { blip_add_delta(bb[c], (unsigned)t, out[c] - lastOut[c]); lastOut[c] = out[c]; }
    }
  }
  int n = 0;
  for (int c = 0; c < 3; c++) {
    blip_end_frame(bb[c], STEPS_PER_TICK);
    short buf[2048];
    n = blip_read_samples(bb[c], buf, 2048, 0);
    for (int i = 0; i < n; i++) ring[c][(ringHead + i) % RING] = buf[i] * VOICE_GAIN;
  }
  ringHead = (ringHead + n) % RING;
  ringAvail += n;
}

} // namespace

extern "C" {

void hst_ym_init(int rate)
{
  sampleRate = rate;
  delete chip;
  chip = new ym2149_device(CHIP_RATE, false);
  chip->device_start();
  chip->device_reset();
  for (int c = 0; c < 3; c++) {
    if (bb[c]) blip_delete(bb[c]);
    bb[c] = blip_new(rate / 10 + 64);
    blip_set_rates(bb[c], CHIP_RATE, rate);
    lastOut[c] = 0;
  }
  ringHead = ringAvail = 0;
  haveRegs = false;
  running = 0;
}

/* Restart the chip's output state (a new subsong or song) without reallocating. */
void hst_ym_reset(void)
{
  chip->device_reset();
  for (int c = 0; c < 3; c++) { blip_clear(bb[c]); lastOut[c] = 0; }
  ringHead = ringAvail = 0;
  haveRegs = false;
}

void hst_set_mute(int mask) { muteMask = mask & 7; }
void hst_set_gate(int open) { keyGate = open ? 1 : 0; }

/* Mono samples (the three voices summed) into out. Ticks the player as the audio needs them. */
int hst_render(float *out, int frames)
{
  int done = 0;
  while (done < frames) {
    while (ringAvail < 1) produceTick();
    int take = ringAvail < frames - done ? ringAvail : frames - done;
    int start = (ringHead - ringAvail + RING) % RING;
    for (int i = 0; i < take; i++) {
      float s = 0;
      for (int c = 0; c < 3; c++) if (!(muteMask & (1 << c))) s += ring[c][(start + i) % RING];
      /* the gate falls over ~20 ms and rises at once */
      float target = keyGate ? 1.0f : 0.0f;
      if (gate > target) { gate -= 1.0f / (0.02f * sampleRate); if (gate < target) gate = target; } else gate = target;
      out[done + i] = s * gate;
    }
    ringAvail -= take;
    done += take;
  }
  return done;
}

}
