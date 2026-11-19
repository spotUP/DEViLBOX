/*
 * Nsf_Trace: per-PLAY-call state snapshot of every NSF voice, shared by the
 * GME wasm bridge (gme_wasm.cpp, gme_wasm_trace_*) and the NSF to .fur
 * converter in furnace-fileops-wasm (nsfToFur.cpp). Layout documented in
 * gme_wasm.cpp above its trace exports.
 */
#ifndef NSF_TRACE_H
#define NSF_TRACE_H
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
	// play_hook: data is the std::vector<uint16_t> that collects the records
	static void snap(Nsf_Emu *e, void *data)
	{
		std::vector<uint16_t> &trace = *static_cast<std::vector<uint16_t> *>(data);
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
	static void arm(Nsf_Emu *e, void (*hook)(Nsf_Emu *, void *), void *data)
	{
		e->play_hook = hook; e->play_hook_data = data;
	}
	static int chips(Nsf_Emu *e) { return e->header_.chip_flags; }
	// 12 = clock_divisor in Nsf_Emu.cpp
	static double play_hz(Nsf_Emu *e) { return e->clock_rate_ * 12.0 / e->play_period; }
};

#endif
