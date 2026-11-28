// Tape hiss and modulation noise for a tape-echo feedback loop.
//
// Shared by every tape-style echo (re201-wasm, another-delay-wasm,
// re-tape-echo-wasm). Call next() on the playback-head signal INSIDE the
// loop and add the result to it before it goes to the output and back to the
// record head. Each pass then lays fresh noise over the noise the earlier
// passes already recorded, while the signal itself decays: the noise floor
// rises against the signal with every repeat, which is what tape does.
//
// Two parts:
//   - hiss: a fixed floor (about -64 dBFS RMS), the tape and playback amp;
//   - modulation noise: noise in proportion to the signal on the tape
//     (about -42 dB under it), the grain that rides on a recorded sound.
//
// The hiss floor is gated by a slow follower of the playback signal (60 dB
// in 2.5 s): an echo that was never fed is digitally silent, and the hiss
// fades away shortly after the last audible repeat instead of droning on a
// muted bus. The gate is squared under GATE_REF, so hiss going round the loop
// cannot hold its own gate open at any loop gain below self-oscillation.
#pragma once
#include <cmath>
#include <cstdint>

struct TapeHiss {
  static constexpr float FLOOR    = 1.6e-3f;  // peak of the hiss before colouring
  static constexpr float MOD      = 0.02f;    // modulation noise per unit of signal peak
  static constexpr float GATE_REF = 5.0e-3f;  // playback level (-46 dBFS) where hiss is full

  explicit TapeHiss(uint32_t seed = 0x2545F491u) : state(seed ? seed : 1u) {}

  void prepare(float sr) {
    if (sr == rate || sr <= 0.0f) return;
    rate = sr;
    fastRel = expf(-1.0f / (0.003f * sr));        // 3 ms: follows the envelope of one repeat
    slowRel = expf(-6.9078f / (2.5f * sr));       // 60 dB in 2.5 s
    colour  = 1.0f - expf(-6.2832f * 9000.0f / sr); // playback-amp roll-off of the hiss
  }

  inline float next(float playback) {
    const float a = fabsf(playback);
    fast = a > fast ? a : fast * fastRel;
    slow = a > slow ? a : slow * slowRel;
    if (!(slow >= 1.0e-7f)) { slow = 0.0f; fast = 0.0f; lp = 0.0f; return 0.0f; }
    state ^= state << 13; state ^= state >> 17; state ^= state << 5;
    const float white = (float)(int32_t)state * (1.0f / 2147483648.0f);
    lp += colour * (white - lp);
    float gate = slow * (1.0f / GATE_REF);
    gate = gate >= 1.0f ? 1.0f : gate * gate;
    return lp * (FLOOR * gate + MOD * fast);
  }

 private:
  uint32_t state;
  float rate = 0.0f, fastRel = 0.0f, slowRel = 0.0f, colour = 1.0f;
  float fast = 0.0f, slow = 0.0f, lp = 0.0f;
};
