/**
 * SWP00Synth.cpp - Yamaha SWP00 AWM2 Rompler/DSP for WebAssembly
 * Based on MAME's swp00 emulator by Olivier Galibert
 *
 * The SWP00 (TC170C120SF / XQ036A00) is Yamaha's rompler/DSP combo used
 * in the MU50 tone generator. It combines AWM2 (Advanced Wave Memory 2)
 * sample playback with MEG (Multiple Effects Generator) DSP.
 *
 * Hardware features:
 * - 32 voices with multi-format sample streaming (16-bit, 12-bit, 8-bit, 8-bit DPCM)
 * - Per-voice LFO with amplitude/frequency/filter modulation
 * - Chamberlin-configuration LPF with sweep
 * - Attack/Decay envelope generator (12-bit attenuation, 4.8 FP)
 * - Volume/pan ramping with 7-output mixer (dry L/R, reverb, chorus L/R, variation L/R)
 * - Clock: 33.9MHz, output: 44100Hz stereo
 *
 * This WASM version adds:
 * - MIDI note-on/off with velocity
 * - Per-voice volume and panning via register writes
 * - ROM/sample loading via pointer
 * - Stereo mixdown (dry path only — MEG effects deferred)
 *
 * License: BSD-3-Clause (MAME license)
 */

#include <cstdint>
#include <cmath>
#include <cstring>
#include <algorithm>
#include <array>
#include <utility>
#include <tuple>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace devilbox {

// ============================================================================
// Fixed-width types matching MAME conventions
// ============================================================================
using u8  = uint8_t;
using u16 = uint16_t;
using u32 = uint32_t;
using u64 = uint64_t;
using s16 = int16_t;
using s32 = int32_t;
using s8  = int8_t;
using s64 = int64_t;

// ============================================================================
// Utility: make_bitmask (from MAME util/coretmpl.h)
// ============================================================================
template <typename T>
static constexpr T make_bitmask(unsigned int N) {
    return N >= (8 * sizeof(T)) ? T(~T(0)) : (T(1) << N) - T(1);
}

// ============================================================================
// Constants
// ============================================================================
static constexpr int NUM_VOICES = 32;

// ============================================================================
// Interpolation speed subblock (from MAME swp00.cpp)
//
// A generic interpolation subblock used by envelopes, filter and LFO.
// Provides a step value based on speed (00-7f) and sample counter.
// ============================================================================
static u16 interpolation_step(u32 speed, u32 sample_counter)
{
    if(speed >= 0x78)
        return 0x1f;

    u32 k0 = speed >> 3;
    u32 k1 = speed & 7;

    if(speed >= 0x58) {
        k0 -= 10;
        u32 a = (2 << k0) - 1;
        u32 b = (1 << k0) - 1;
        constexpr u8 mx[8] = { 0x00, 0x80, 0x88, 0xa8, 0xaa, 0xea, 0xee, 0xfe };
        return ((mx[k1] << (sample_counter & 7)) & 0x80) ? a : b;
    } else {
        k0 = 10 - k0;

        if(sample_counter & make_bitmask<u32>(k0))
            return 0;

        constexpr u16 mx[8] = { 0xaaaa, 0xeaaa, 0xeaea, 0xeeea, 0xeeee, 0xfeee, 0xfefe, 0xfffe };
        return (mx[k1] << ((sample_counter >> k0) & 0xf)) & 0x8000 ? 1 : 0;
    }
}


// ============================================================================
// Streaming block — multi-format sample decoding
// Exact port from MAME swp00_device::streaming_block
// ============================================================================
struct streaming_block {
    // DPCM delta expansion table — computed exactly as in MAME
    static const std::array<s16, 256> dpcm_expand;
    static const std::array<s32, 8> max_value;

    u16 m_phase;
    u16 m_start;
    u16 m_loop;
    u32 m_address;
    u16 m_pitch;
    u8  m_format;

    s32 m_pos;
    s32 m_pos_dec;
    s16 m_dpcm_s0, m_dpcm_s1;
    u32 m_dpcm_pos;
    s32 m_dpcm_delta;

    bool m_first, m_done;
    s16 m_last;

    void clear() {
        m_phase = 0x8000;
        m_start = 0;
        m_loop = 0;
        m_address = 0;
        m_pitch = 0;
        m_format = 0;
        m_pos = 0;
        m_pos_dec = 0;
        m_dpcm_s0 = m_dpcm_s1 = 0;
        m_dpcm_pos = 0;
        m_dpcm_delta = 0;
        m_first = false;
        m_done = false;
        m_last = 0;
    }

    void keyon() {
        m_pos = -m_start;
        m_pos_dec = (m_phase << 1) & 0x7ffe;
        m_dpcm_s0 = m_dpcm_s1 = 0;
        m_dpcm_pos = m_pos + 1;
        m_dpcm_delta = 0;
        m_first = true;
        m_done = false;
    }

    // ROM access helper — reads from flat byte array
    void read_16(const u8* rom, u32 rom_size, s16 &val0, s16 &val1) {
        u32 adr = m_address + (m_pos << 1);
        auto rb = [&](u32 a) -> u8 { return (a < rom_size) ? rom[a] : 0; };
        // Little-endian 16-bit reads
        val0 = (s16)(rb(adr) | (rb(adr + 1) << 8));
        val1 = (s16)(rb(adr + 2) | (rb(adr + 3) << 8));
    }

    void read_12(const u8* rom, u32 rom_size, s16 &val0, s16 &val1) {
        u32 adr = m_address + (m_pos >> 2) * 6;
        auto rw = [&](u32 a) -> u16 { return (a + 1 < rom_size) ? (u16)(rom[a] | (rom[a+1] << 8)) : 0; };

        switch(m_pos & 3) {
        case 0: {
            u16 w0 = rw(adr);
            u16 w1 = rw(adr + 2);
            val0 = w0 << 4;
            val1 = ((w0 >> 8) | (w1 << 8)) & 0xfff0;
            break;
        }
        case 1: {
            u16 w0 = rw(adr);
            u16 w1 = rw(adr + 2);
            u16 w2 = rw(adr + 4);
            val0 = ((w0 >> 8) | (w1 << 8)) & 0xfff0;
            val1 = ((w1 >> 4) & 0x0ff0) | (w2 << 12);
            break;
        }
        case 2: {
            u16 w1 = rw(adr + 2);
            u16 w2 = rw(adr + 4);
            val0 = ((w1 >> 4) & 0x0ff0) | (w2 << 12);
            val1 = w2 & 0xfff0;
            break;
        }
        case 3: {
            u16 w2 = rw(adr + 4);
            u16 w3 = rw(adr + 6);
            val0 = w2 & 0xfff0;
            val1 = w3 << 4;
            break;
        }
        }
    }

    void read_8(const u8* rom, u32 rom_size, s16 &val0, s16 &val1) {
        u32 adr = m_address + m_pos;
        val0 = ((adr < rom_size) ? (s16)((s8)rom[adr]) : 0) << 8;
        val1 = ((adr + 1 < rom_size) ? (s16)((s8)rom[adr + 1]) : 0) << 8;
    }

    void dpcm_step(u8 input) {
        u32 mode = m_format & 3;
        u32 scale = (m_format >> 2) & 7;
        s32 limit = max_value[scale];

        m_dpcm_s0 = m_dpcm_s1;

        s32 delta = m_dpcm_delta + dpcm_expand[input];
        s32 sample = m_dpcm_s1 + (delta << scale);

        if(sample < -0x8000) {
            sample = -0x8000;
            delta = 0;
        } else if(sample > limit) {
            sample = limit;
            delta = 0;
        }
        m_dpcm_s1 = sample;

        switch(mode) {
        case 0: delta = delta * 7 / 8; break;
        case 1: delta = delta * 3 / 4; break;
        case 2: delta = delta     / 2; break;
        case 3: delta = 0; break;
        }
        m_dpcm_delta = delta;
    }

    void read_8c(const u8* rom, u32 rom_size, s16 &val0, s16 &val1) {
        while(m_dpcm_pos != m_pos + 2) {
            u32 adr = m_address + m_dpcm_pos;
            u8 byte = (adr < rom_size) ? rom[adr] : 0;
            dpcm_step(byte);
            m_dpcm_pos++;
        }
        val0 = m_dpcm_s0;
        val1 = m_dpcm_s1;
    }

    std::pair<s16, bool> step(const u8* rom, u32 rom_size, s32 fmod) {
        if(m_done)
            return std::make_pair(m_last, false);

        s16 val0, val1;

        switch(m_format >> 6) {
        case 0: read_16(rom, rom_size, val0, val1); break;
        case 1: read_12(rom, rom_size, val0, val1); break;
        case 2: read_8 (rom, rom_size, val0, val1); break;
        case 3: read_8c(rom, rom_size, val0, val1); break;
        }

        u32 step_val = ((m_pitch & 0xfff) << (8 + (s16(m_pitch) >> 12))) >> 4;
        s32 interp = (m_pos_dec >> 6) & 0x1ff;
        s32 result = val0 + ((((val1 - val0) * interp) >> 10) << 1);

        m_pos_dec += step_val + (fmod << 4);
        if(m_pos_dec >= 0x8000) {
            m_first = false;
            m_pos += m_pos_dec >> 15;
            m_pos_dec &= 0x7fff;
            if(m_pos >= m_loop) {
                if(m_loop) {
                    m_pos -= m_loop;
                    if((m_format & 0xc0) != 0xc0) {
                        m_pos_dec += (m_format << 9) & 0x7e00;
                        if(m_pos_dec >= 0x8000)
                            m_pos++;
                        m_pos_dec &= 0x7fff;
                    }
                    m_dpcm_pos = 1;
                } else {
                    m_done = true;
                    m_last = result;
                    return std::make_pair(m_last, true);
                }
            }
        }
        return std::make_pair(result, false);
    }
};

// Static DPCM expansion table — exact copy from MAME
const std::array<s16, 256> streaming_block::dpcm_expand = []() {
    std::array<s16, 256> deltas;
    constexpr s16 offset[4] = { 0, 0x20, 0x60, 0xe0 };
    for(u32 i = 0; i != 128; i++) {
        u32 e = i >> 5;
        s16 base = ((i & 0x1f) << e) + offset[e];
        deltas[i] = base;
        deltas[i + 128] = -base;
    }
    deltas[0x80] = 0x88; // Not actually used by samples, but tested on swp30 hardware
    return deltas;
}();

const std::array<s32, 8> streaming_block::max_value = {
    0x7fff, 0x7ffe, 0x7ffc, 0x7ff8, 0x7ff0, 0x7fe0, 0x7fc0, 0x7f80
};


// ============================================================================
// Envelope block — attack/decay with variable/constant speed modes
// Exact port from MAME swp00_device::envelope_block
// ============================================================================
struct envelope_block {
    enum {
        ATTACK     = 0,
        DECAY      = 2,
        DECAY_DONE = 3,
    };

    u8  m_attack_speed;
    u8  m_attack_level;
    u8  m_decay_speed;
    u8  m_decay_level;
    s32 m_envelope_level;
    u8  m_envelope_mode;

    void clear() {
        m_attack_speed = 0;
        m_attack_level = 0;
        m_decay_speed = 0;
        m_decay_level = 0;
        m_envelope_level = 0xfff;
        m_envelope_mode = DECAY_DONE;
    }

    void keyon() {
        if(m_decay_speed & 0x80) {
            m_envelope_level = 0;
            m_envelope_mode = DECAY;
        } else {
            if(m_attack_speed & 0x80)
                m_envelope_level = m_attack_level << 4;
            else
                m_envelope_level = 0;
            m_envelope_mode = ATTACK;
        }
    }

    u8 status() const {
        return (m_envelope_mode << 6) | (m_envelope_level >> 6);
    }

    bool active() const {
        return m_envelope_mode != DECAY_DONE || m_envelope_level < 0x800;
    }

    u16 step(u32 sample_counter) {
        u16 result = m_envelope_level;
        switch(m_envelope_mode) {
        case ATTACK: {
            if(m_attack_speed & 0x80) {
                // normal mode
                s32 level = m_envelope_level - interpolation_step((m_attack_speed & 0x7f) + ((m_envelope_level >> 7) << 2), sample_counter);
                if(level <= 0) {
                    level = 0;
                    m_envelope_mode = DECAY;
                }
                m_envelope_level = level;
            } else {
                s32 level = m_envelope_level + interpolation_step(m_attack_speed, sample_counter);
                if(m_attack_level) {
                    // decay-like mode
                    s32 limit = m_attack_level << 4;
                    if(level >= limit) {
                        m_envelope_mode = DECAY;
                        if(level >= 0xfff)
                            level = 0xfff;
                    }
                } else {
                    // timed mode
                    if(level >= 0x800) {
                        level = 0;
                        m_envelope_mode = DECAY;
                    }
                    result = 0;
                }
                m_envelope_level = level;
            }
            break;
        }

        case DECAY: {
            u32 key = m_decay_speed >= 0xe0 ? m_decay_speed - 0x90 + ((m_envelope_level >> 7) << 2) : m_decay_speed & 0x7f;
            s32 limit = m_decay_level << 4;
            s32 level = m_envelope_level;
            if(level < limit) {
                level += interpolation_step(key, sample_counter);
                if(level > limit) {
                    m_envelope_mode = DECAY_DONE;
                    if(level > 0xfff)
                        level = 0xfff;
                }
            } else if(level > limit) {
                level -= interpolation_step(key, sample_counter);
                if(level < limit) {
                    m_envelope_mode = DECAY_DONE;
                    if(level < 0)
                        level = 0;
                }
            } else
                m_envelope_mode = DECAY_DONE;
            m_envelope_level = level;
            break;
        }

        case DECAY_DONE:
            break;
        }

        return result;
    }

    void trigger_release() {
        m_envelope_mode = DECAY;
    }
};


// ============================================================================
// Filter block — Chamberlin LPF with sweep
// Exact port from MAME swp00_device::filter_block
// ============================================================================
struct filter_block {
    enum {
        SWEEP_NONE,
        SWEEP_UP,
        SWEEP_DONE,
    };

    s32 m_q, m_b, m_l;
    u16 m_k, m_k_target;
    u16 m_info;
    u8  m_speed, m_sweep;

    void clear() {
        m_info = 0x27ff;
        m_speed = 0x00;
        m_sweep = SWEEP_NONE;
        m_k_target = 0x7ff;
        m_k = 0xfff;
        m_q = 0x80;
        m_b = 0;
        m_l = 0;
    }

    void keyon() {
        m_b = 0;
        m_l = 0;
        if(m_speed & 0x80) {
            m_sweep = SWEEP_UP;
            m_k = 0x800;
        } else
            m_k = m_k_target;
    }

    s32 step(s16 input, s32 lmod, u32 sample_counter) {
        s32 km = std::max((s32)m_k - lmod, (s32)0);
        s64 k = (s64)((0x101 + (km & 0xff)) << (km >> 8));
        s32 h = (input << 6) - m_l - ((s64(m_q) * m_b) >> 7);
        m_b = m_b + (s32)((k * h) >> 24);
        m_l = m_l + (s32)((k * m_b) >> 24);

        switch(m_sweep) {
        case SWEEP_NONE:
            if(m_k < m_k_target) {
                m_k += interpolation_step(m_speed & 0x7f, sample_counter);
                if(m_k > m_k_target)
                    m_k = m_k_target;
            } else if(m_k > m_k_target) {
                m_k -= interpolation_step(m_speed & 0x7f, sample_counter);
                if(m_k < m_k_target)
                    m_k = m_k_target;
            }
            break;
        case SWEEP_UP:
            m_k += interpolation_step(m_speed & 0x7f, sample_counter);
            if(m_k >= 0xfff) {
                m_k = m_k_target;
                m_sweep = SWEEP_DONE;
            }
            break;
        }

        return m_l;
    }

    void info_w_hi(u8 data) {
        m_info = (m_info & 0xff) | (data << 8);
        s32 q = (m_info >> 11) + 4;
        m_q = (0x10 - (q & 7)) << (4 - (q >> 3));
        m_k_target = m_info & 0x7ff;
        if(m_k_target)
            m_k_target |= 0x800;
    }

    void info_w_lo(u8 data) {
        m_info = (m_info & 0xff00) | data;
        m_k_target = m_info & 0x7ff;
        if(m_k_target)
            m_k_target |= 0x800;
    }

    void speed_w(u8 data) { m_speed = data; }
};


// ============================================================================
// LFO block — counter-based with optional triangle shaping
// Exact port from MAME swp00_device::lfo_block
// ============================================================================
struct lfo_block {
    u32 m_counter;
    u8  m_speed, m_lamod, m_fmod;

    void clear() {
        m_counter = 0;
        m_lamod = 0;
        m_fmod = 0;
        m_speed = 0x80;
    }

    void keyon() {
        // LFO does not reset on keyon in MAME
    }

    std::tuple<u32, s32, s32> step() {
        u32 e = (m_speed >> 3) & 7;
        u32 step_val;
        if(e < 7)
            step_val = (8 | (m_speed & 7)) << e;
        else
            step_val = (8 + 2 * (m_speed & 7)) << 7;

        m_counter = (m_counter + step_val) & 0x3fffff;

        u32 amod = 0;
        s32 fmod_out = 0;
        s32 lmod = 0;

        if(!(m_speed & 0x80)) {
            s32 shaped;
            if(m_speed & 0x40)
                shaped = ((m_counter << 1) & 0x3fffff) ^ (m_counter & 0x200000 ? 0x3fffff : 0);
            else
                shaped = m_counter;

            amod = (shaped * (m_lamod & 0x1f)) >> 16;
            fmod_out = ((shaped - 0x200000) * m_fmod) >> 21;
            lmod = (shaped * (m_lamod & 0xe0)) >> 20;
        }

        return std::make_tuple(amod, fmod_out, lmod);
    }
};


// ============================================================================
// Mixer block — volume/pan ramping with multi-output dispatch
// Exact port from MAME swp00_device::mixer_block
// ============================================================================
struct mixer_block {
    u16 m_cglo, m_cpanl, m_cpanr;
    u16 m_tglo, m_tpanl, m_tpanr;
    u8  m_glo, m_pan, m_dry, m_rev, m_cho, m_var;

    void clear() {
        m_cglo = m_cpanl = m_cpanr = 0xfff;
        m_tglo = m_tpanl = m_tpanr = 0xfff;
        m_glo = m_pan = m_dry = m_rev = m_cho = m_var = 0xff;
    }

    void keyon() {
        m_cglo = m_tglo;
        m_cpanl = m_tpanl;
        m_cpanr = m_tpanr;
    }

    static s32 volume_apply(s32 level, s32 sample) {
        if(level >= 0xfff)
            return 0;
        s32 e = level >> 8;
        s32 m = level & 0xff;
        s64 mul = (0x1000000 - (m << 15)) >> e;
        return (s32)((sample * mul) >> 24);
    }

    void step(s32 sample, u16 envelope, u16 amod,
              s32 &dry_l, s32 &dry_r, s32 &rev, s32 &cho_l, s32 &cho_r, s32 &var_l, s32 &var_r)
    {
        u16 base = envelope + amod + m_cglo;
        dry_l += volume_apply(base + (m_dry << 4) + m_cpanl, sample);
        dry_r += volume_apply(base + (m_dry << 4) + m_cpanr, sample);
        rev   += volume_apply(base + (m_rev << 4),           sample);
        cho_l += volume_apply(base + (m_cho << 4) + m_cpanl, sample);
        cho_r += volume_apply(base + (m_cho << 4) + m_cpanr, sample);
        var_l += volume_apply(base + (m_var << 4) + m_cpanl, sample);
        var_r += volume_apply(base + (m_var << 4) + m_cpanr, sample);

        if(m_cglo < m_tglo)
            m_cglo++;
        else if(m_cglo > m_tglo)
            m_cglo--;
        if(m_cpanl < m_tpanl)
            m_cpanl++;
        else if(m_cpanl > m_tpanl)
            m_cpanl--;
        if(m_cpanr < m_tpanr)
            m_cpanr++;
        else if(m_cpanr > m_tpanr)
            m_cpanr--;
    }

    void glo_w(u8 data) {
        m_glo = data;
        m_tglo = data << 4;
    }

    void pan_w(u8 data) {
        m_pan = data;
        m_tpanl = (data << 2) & 0x3c0;
        m_tpanr = (data << 6) & 0x3c0;
        if(m_tpanl == 0x3c0)
            m_tpanl = 0xfff;
        if(m_tpanr == 0x3c0)
            m_tpanr = 0xfff;
    }

    void dry_w(u8 data) { m_dry = data; }
    void rev_w(u8 data) { m_rev = data; }
    void cho_w(u8 data) { m_cho = data; }
    void var_w(u8 data) { m_var = data; }
};


// ============================================================================
// SWP00Synth — Main synthesis class
// ============================================================================

class SWP00Synth {
public:
    static constexpr int MAX_POLY = NUM_VOICES;

    SWP00Synth() {
        m_sampleRate = 44100.0;
        m_romData = nullptr;
        m_romSize = 0;
        m_sample_counter = 0;
        m_globalVolume = 200;
        m_pitchBendFactor = 1.0;

        for(int i = 0; i < MAX_POLY; i++) {
            m_streaming[i].clear();
            m_envelope[i].clear();
            m_filter[i].clear();
            m_lfo[i].clear();
            m_mixer[i].clear();
            m_voice_active[i] = false;
            m_voice_midi_note[i] = -1;
            m_voice_velocity[i] = 0.0f;
            m_voice_in_release[i] = false;
        }
    }

    void setSampleRate(int sr) {
        m_sampleRate = static_cast<double>(sr);
    }

    int getSampleRate() const {
        return static_cast<int>(m_sampleRate);
    }

    // ── ROM / Sample loading ────────────────────────────────────────────

    void loadROM(uintptr_t dataPtr, int size) {
        m_romData = reinterpret_cast<const u8*>(dataPtr);
        m_romSize = size;
    }

    void loadSample(int voice, uintptr_t dataPtr, int sizeBytes) {
        if(voice < 0 || voice >= MAX_POLY) return;
        // Load sample data — use it as ROM and set address range
        m_romData = reinterpret_cast<const u8*>(dataPtr);
        m_romSize = sizeBytes;
        auto &s = m_streaming[voice];
        s.m_address = 0;
        s.m_start = 0;
        s.m_loop = 0; // No loop = one-shot
        s.m_format = 0; // 16-bit by default
    }

    void loadSampleAll(uintptr_t dataPtr, int sizeBytes) {
        m_romData = reinterpret_cast<const u8*>(dataPtr);
        m_romSize = sizeBytes;
        for(int i = 0; i < MAX_POLY; i++) {
            auto &s = m_streaming[i];
            s.m_address = 0;
            s.m_start = 0;
            s.m_loop = 0;
            s.m_format = 0;
        }
    }

    // ── MIDI control ────────────────────────────────────────────────────

    void noteOn(int note, int velocity) {
        if(velocity == 0) { noteOff(note); return; }

        int vi = findFreeVoice(note);
        auto &stream = m_streaming[vi];
        auto &env = m_envelope[vi];
        auto &filt = m_filter[vi];
        auto &lfo = m_lfo[vi];
        auto &mix = m_mixer[vi];

        m_voice_active[vi] = true;
        m_voice_midi_note[vi] = note;
        m_voice_velocity[vi] = velocity / 127.0f;
        m_voice_in_release[vi] = false;

        // Set pitch from MIDI note
        // SWP00 pitch register: mantissa.exponent format
        // Base pitch (middle C = note 60) corresponds to 1x playback speed
        double semitones = note - 60.0;
        double pitchRatio = std::pow(2.0, semitones / 12.0) * m_pitchBendFactor;

        // Convert to SWP00 pitch format: eeee mmmm mmmm mmmm
        // step = (mantissa << (8 + exponent)) >> 4
        // For 1x: step should give 0x8000 pos_dec advance per sample at 44100Hz
        // Simplest: encode as exponent=0, mantissa = ratio * 0x1000
        int rawPitch;
        if(pitchRatio >= 1.0) {
            // Find suitable exponent
            int exp = 0;
            double adjusted = pitchRatio;
            while(adjusted >= 2.0 && exp < 7) {
                adjusted /= 2.0;
                exp++;
            }
            int mantissa = (int)(adjusted * 0x1000);
            if(mantissa > 0xfff) mantissa = 0xfff;
            rawPitch = (exp << 12) | (mantissa & 0xfff);
        } else {
            // Negative exponent for sub-unity rates
            int exp = 0;
            double adjusted = pitchRatio;
            while(adjusted < 1.0 && exp > -8) {
                adjusted *= 2.0;
                exp--;
            }
            int mantissa = (int)(adjusted * 0x1000);
            if(mantissa > 0xfff) mantissa = 0xfff;
            rawPitch = ((exp & 0xf) << 12) | (mantissa & 0xfff);
        }
        stream.m_pitch = rawPitch;

        // Set sample ROM region — whole ROM unless overridden
        if(m_romData && m_romSize > 0) {
            // Calculate number of samples based on format
            u32 numSamples;
            switch(stream.m_format >> 6) {
            case 0: numSamples = m_romSize / 2; break; // 16-bit
            case 1: numSamples = (m_romSize * 2) / 3; break; // 12-bit
            case 2: numSamples = m_romSize; break; // 8-bit
            case 3: numSamples = m_romSize; break; // 8-bit compressed
            default: numSamples = m_romSize / 2; break;
            }

            if(stream.m_loop == 0 && stream.m_start == 0) {
                // One-shot: set start = number of samples before loop point
                stream.m_start = (u16)std::min(numSamples, (u32)0xffff);
            }
        }

        // Configure envelope for MIDI
        // Normal attack mode (bit 7 set), moderate speed
        env.m_attack_speed = 0xf0; // Fast attack
        env.m_attack_level = 0x00; // Start from max attenuation
        env.m_decay_speed = 0x00;  // No decay
        env.m_decay_level = 0x00;  // Stay at 0 attenuation

        // Configure filter — wide open
        filt.info_w_hi(0x27); // Low Q, high K
        filt.info_w_lo(0xff);
        filt.speed_w(0x00);

        // Configure mixer
        // Global volume from velocity
        u8 gloVol = (u8)(m_voice_velocity[vi] * 0x60); // Scale to reasonable range
        mix.glo_w(gloVol);
        mix.pan_w(0x77); // Center pan
        mix.dry_w(0x00); // Dry level = full (0 = no attenuation)
        mix.rev_w(0xff); // Rev off
        mix.cho_w(0xff); // Chorus off
        mix.var_w(0xff); // Variation off

        // Key on — triggers all blocks
        stream.keyon();
        env.keyon();
        filt.keyon();
        lfo.keyon();
        mix.keyon();
    }

    void noteOff(int note) {
        for(int i = 0; i < MAX_POLY; i++) {
            if(m_voice_active[i] && m_voice_midi_note[i] == note && !m_voice_in_release[i]) {
                m_voice_in_release[i] = true;
                // Trigger envelope release — set decay speed with bit 7 and target to max attenuation
                m_envelope[i].m_decay_speed = 0xe8; // Variable-speed release, moderate speed
                m_envelope[i].m_decay_level = 0xff; // Full attenuation
                m_envelope[i].trigger_release();
            }
        }
    }

    void allNotesOff() {
        for(int i = 0; i < MAX_POLY; i++) {
            m_voice_active[i] = false;
            m_voice_midi_note[i] = -1;
            m_streaming[i].clear();
            m_envelope[i].clear();
            m_filter[i].clear();
            m_lfo[i].clear();
            m_mixer[i].clear();
        }
    }

    // ── Parameters ──────────────────────────────────────────────────────

    void setParameter(int paramId, double value) {
        switch(paramId) {
        case 0: // VOLUME
            m_globalVolume = (u8)std::max(0.0, std::min(255.0, value));
            break;
        case 1: // FILTER_CUTOFF — set for all active voices
            for(int i = 0; i < MAX_POLY; i++) {
                if(m_voice_active[i]) {
                    u8 k_lo = (u8)(value * 255.0);
                    u8 k_hi = 0x27; // Default Q
                    m_filter[i].info_w_lo(k_lo);
                    m_filter[i].info_w_hi(k_hi);
                }
            }
            break;
        case 2: // ATTACK
            for(int i = 0; i < MAX_POLY; i++)
                m_envelope[i].m_attack_speed = 0x80 | (u8)(value * 127.0);
            break;
        case 3: // RELEASE
            for(int i = 0; i < MAX_POLY; i++)
                m_envelope[i].m_decay_speed = (u8)(value * 127.0);
            break;
        }
    }

    void controlChange(int cc, int value) {
        switch(cc) {
        case 7: // Volume
            m_globalVolume = value * 2;
            break;
        case 10: // Pan
            for(int i = 0; i < MAX_POLY; i++) {
                u8 panVal = (u8)((value / 127.0) * 0xff);
                // Split into left/right nibbles
                u8 left = (u8)((1.0 - value / 127.0) * 0x0f);
                u8 right = (u8)((value / 127.0) * 0x0f);
                m_mixer[i].pan_w((left << 4) | right);
            }
            break;
        case 71: // Filter resonance
            for(int i = 0; i < MAX_POLY; i++) {
                u8 hi = (u8)((int)((value / 127.0) * 0x1f) << 3) | (m_filter[i].m_info & 0x07);
                m_filter[i].info_w_hi(hi);
            }
            break;
        case 74: // Filter cutoff
            for(int i = 0; i < MAX_POLY; i++) {
                u8 lo = (u8)((value / 127.0) * 0xff);
                m_filter[i].info_w_lo(lo);
            }
            break;
        }
    }

    void pitchBend(int value) {
        m_pitchBendFactor = std::pow(2.0, (value / 8192.0) * 2.0 / 12.0);
    }

    void programChange(int program) {
        // Could select sample banks / formats
    }

    void writeRegister(int offset, int value) {
        // Direct register access placeholder
    }

    // ── Audio rendering ─────────────────────────────────────────────────

    void process(uintptr_t outLPtr, uintptr_t outRPtr, int numSamples) {
        float* outL = reinterpret_cast<float*>(outLPtr);
        float* outR = reinterpret_cast<float*>(outRPtr);

        if(!m_romData || m_romSize == 0) {
            std::memset(outL, 0, numSamples * sizeof(float));
            std::memset(outR, 0, numSamples * sizeof(float));
            return;
        }

        const float masterScale = m_globalVolume / 255.0f;

        for(int i = 0; i < numSamples; i++) {
            s32 dry_l = 0, dry_r = 0;
            s32 rev = 0;
            s32 cho_l = 0, cho_r = 0;
            s32 var_l = 0, var_r = 0;

            for(int chan = 0; chan < NUM_VOICES; chan++) {
                auto [amod, fmod, lmod] = m_lfo[chan].step();

                if(!m_envelope[chan].active()) {
                    // Deactivate voice when envelope is done
                    if(m_voice_active[chan] && m_voice_in_release[chan]) {
                        m_voice_active[chan] = false;
                        m_voice_midi_note[chan] = -1;
                    }
                    continue;
                }

                auto [sample1, trigger_release] = m_streaming[chan].step(m_romData, m_romSize, fmod);
                if(trigger_release)
                    m_envelope[chan].trigger_release();

                s32 sample2 = m_filter[chan].step(sample1, lmod, m_sample_counter);
                u32 envelope_level = m_envelope[chan].step(m_sample_counter);
                m_mixer[chan].step(sample2, envelope_level, amod, dry_l, dry_r, rev, cho_l, cho_r, var_l, var_r);
            }

            // Output dry path only (MEG effects deferred)
            // Scale from internal 22-bit fixed-point to float
            // MAME does: stream.put_int_clamp(0, i, dry_l >> 6, 0x20000)
            // which means dry is 24-bit, shifted right 6 = 18-bit, clamped to 17-bit signed
            float fL = (dry_l >> 6) / 131072.0f; // 0x20000
            float fR = (dry_r >> 6) / 131072.0f;

            // Clamp
            if(fL > 1.0f) fL = 1.0f;
            if(fL < -1.0f) fL = -1.0f;
            if(fR > 1.0f) fR = 1.0f;
            if(fR < -1.0f) fR = -1.0f;

            outL[i] = fL * masterScale;
            outR[i] = fR * masterScale;

            m_sample_counter++;
        }
    }

    void getVoiceStatus(uintptr_t outPtr, int maxVoices) {
        int* out = reinterpret_cast<int*>(outPtr);
        int count = std::min(maxVoices, MAX_POLY);
        for(int i = 0; i < count; i++) {
            out[i * 4 + 0] = m_voice_active[i] ? 1 : 0;
            out[i * 4 + 1] = m_voice_midi_note[i];
            out[i * 4 + 2] = m_envelope[i].active() ? (0xff - (m_envelope[i].m_envelope_level >> 4)) : 0;
            out[i * 4 + 3] = m_voice_in_release[i] ? 1 : 0;
        }
    }

private:
    double m_sampleRate;
    u8     m_globalVolume;
    double m_pitchBendFactor;
    u32    m_sample_counter;

    const u8* m_romData;
    u32       m_romSize;

    std::array<streaming_block, NUM_VOICES> m_streaming;
    std::array<envelope_block,  NUM_VOICES> m_envelope;
    std::array<filter_block,    NUM_VOICES> m_filter;
    std::array<lfo_block,       NUM_VOICES> m_lfo;
    std::array<mixer_block,     NUM_VOICES> m_mixer;

    // MIDI state per voice
    bool  m_voice_active[NUM_VOICES];
    int   m_voice_midi_note[NUM_VOICES];
    float m_voice_velocity[NUM_VOICES];
    bool  m_voice_in_release[NUM_VOICES];

    int findFreeVoice(int midiNote) {
        // Reuse voice already playing this note
        for(int i = 0; i < MAX_POLY; i++)
            if(m_voice_midi_note[i] == midiNote) return i;
        // Find free voice
        for(int i = 0; i < MAX_POLY; i++)
            if(!m_voice_active[i]) return i;
        // Steal releasing voice with highest envelope (most attenuated)
        int best = 0;
        s32 bestLevel = -1;
        for(int i = 0; i < MAX_POLY; i++) {
            if(m_voice_in_release[i] && m_envelope[i].m_envelope_level > bestLevel) {
                best = i;
                bestLevel = m_envelope[i].m_envelope_level;
            }
        }
        if(bestLevel >= 0) return best;
        // Last resort — steal oldest voice
        return 0;
    }
};

} // namespace devilbox


#ifdef __EMSCRIPTEN__
using namespace devilbox;
EMSCRIPTEN_BINDINGS(SWP00Synth) {
    emscripten::class_<SWP00Synth>("SWP00Synth")
        .constructor<>()
        .function("setSampleRate", &SWP00Synth::setSampleRate)
        .function("getSampleRate", &SWP00Synth::getSampleRate)
        .function("noteOn", &SWP00Synth::noteOn)
        .function("noteOff", &SWP00Synth::noteOff)
        .function("allNotesOff", &SWP00Synth::allNotesOff)
        .function("setParameter", &SWP00Synth::setParameter)
        .function("controlChange", &SWP00Synth::controlChange)
        .function("pitchBend", &SWP00Synth::pitchBend)
        .function("programChange", &SWP00Synth::programChange)
        .function("writeRegister", &SWP00Synth::writeRegister)
        .function("loadROM", &SWP00Synth::loadROM)
        .function("loadSample", &SWP00Synth::loadSample)
        .function("loadSampleAll", &SWP00Synth::loadSampleAll)
        .function("process", &SWP00Synth::process)
        .function("getVoiceStatus", &SWP00Synth::getVoiceStatus);
}
#endif
