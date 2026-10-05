import { emitInstruction } from '../src/instr-map.js';
import { parse } from '../src/parser.js';
import { tokenize } from '../src/lexer.js';

function emit(asm: string): string {
  const ast = parse(tokenize(asm));
  const instr = ast[0] as any;
  return emitInstruction(instr).trim();
}

test('MOVE.L d0,d1', () => { expect(emit('MOVE.L d0,d1')).toContain('d1 = _mv;'); });
test('MOVE.W d0,d1', () => { expect(emit('MOVE.W d0,d1')).toContain('W(d1) = (uint16_t)_mv;'); });
test('MOVE.B d0,d1', () => { expect(emit('MOVE.B d0,d1')).toContain('B(d1) = (uint8_t)_mv;'); });
// MOVE to an address register is a MOVEA — must NOT set condition codes (Cinter one-shot
// repeat bug: `move.l (a5),a4` clobbered the Z that the following `beq` needed).
test('MOVE.L (a5),a4 does not set flags (MOVEA)', () => {
  const c = emit('MOVE.L (a5),a4');
  expect(c).toContain('a4 =');
  expect(c).not.toContain('flag_z');
});
test('MOVE.W d0,a0 does not set flags (MOVEA)', () => {
  expect(emit('MOVE.W d0,a0')).not.toContain('flag_z');
});
test('MOVE.L d0,d1 still sets flags', () => { expect(emit('MOVE.L d0,d1')).toContain('flag_z'); });
test('ADD.L d1,d0',  () => { expect(emit('ADD.L d1,d0')).toContain('d0 ='); });
test('SUB.W d1,d0',  () => { expect(emit('SUB.W d1,d0')).toContain('W(d0)'); });
test('MULS d0,d1',   () => { expect(emit('\tMULS d0,d1')).toContain('(int16_t)'); });
test('LSR.L #2,d0',  () => { expect(emit('LSR.L #2,d0')).toBe('d0 >>= 2;'); });
test('ASR.L #1,d0',  () => { expect(emit('ASR.L #1,d0')).toBe('d0 = (uint32_t)((int32_t)d0 >> 1);'); });
// ASR is arithmetic — .W/.B MUST sign-extend (not (int32_t)W() which zero-extends
// and detunes negative values). Regression for the Cinter period-slide bug.
test('ASR.W #7,d0 sign-extends', () => { expect(emit('ASR.W #7,d0')).toContain('(int16_t)W(d0) >> 7'); });
test('ASR.W #7,d0 not zero-extend', () => { expect(emit('ASR.W #7,d0')).not.toContain('(int32_t)W(d0)'); });
test('ASR.B #2,d0 sign-extends', () => { expect(emit('ASR.B #2,d0')).toContain('(int8_t)B(d0) >> 2'); });
// ADD/SUB must set X (carry/borrow) so a following ADDX/SUBX reads the right extend
// bit (the Cinter period-table off-by-one).
test('ADD.W d2,d2 sets flag_x', () => { expect(emit('ADD.W d2,d2')).toContain('flag_x ='); });
test('SUB.W d3,d1 sets flag_x', () => { expect(emit('SUB.W d3,d1')).toContain('flag_x ='); });
test('AND.W d1,d0',  () => { expect(emit('AND.W d1,d0')).toContain('(uint16_t)(W(d0) & W(d1))'); });
test('OR.L d1,d0',   () => { expect(emit('OR.L d1,d0')).toContain('(uint32_t)(d0 | d1)'); });
test('EOR.L d1,d0',  () => { expect(emit('EOR.L d1,d0')).toContain('(uint32_t)(d0 ^ d1)'); });

// PumaTracker: `Moveq #-$20,D0 / And.B (A0)+,D0 / Bne` — the branch reads Z
// from the AND. Without it every note took the wrong path and the channel
// volume stayed 0 (silent song).
test('AND.B (a0)+,d0 sets Z and N from the byte result, clears V and C', () => {
  const c = emit('AND.B (a0)+,d0');
  expect(c).toContain('uint8_t _lr = (uint8_t)(B(d0) & READ8_POST(a0));');
  expect(c).toContain('B(d0) = (uint8_t)_lr;');
  expect(c).toContain('flag_z = (_lr == 0); flag_n = ((int8_t)_lr < 0); flag_v = 0; flag_c = 0;');
});

// ADDA.L adds all 32 bits; only ADDA.W sign-extends a word. PumaTracker's
// `ADD.L MusicData(PC),A5` builds sample pointers from the module base; the
// word truncation kept only its low 16 bits.
test('ADD.L to an address register adds the full long', () => {
  expect(emit('ADD.L d0,a5')).toBe('a5 = (uint32_t)((int32_t)a5 + (int32_t)(d0));');
  expect(emit('SUBA.L d0,a5')).toBe('a5 = (uint32_t)((int32_t)a5 - (int32_t)(d0));');
});
test('ADDA.W (and unsized ADDA) still sign-extend the word', () => {
  expect(emit('ADDA.W d0,a5')).toBe('a5 = (uint32_t)((int32_t)a5 + (int32_t)(int16_t)(W(d0)));');
  expect(emit('\tADDA d0,a5')).toContain('(int32_t)(int16_t)(');
});

// BSET/BCLR/BCHG set Z to the OLD bit inverted (`Bclr #0,D7 / Beq` picks
// PumaTracker's slide init vs step); on memory they act on the BYTE, bit mod 8.
test('BCLR #0,d7 tests the old bit into Z before clearing it', () => {
  const c = emit('\tBCLR #0,d7');
  expect(c).toContain('uint32_t _bv = (uint32_t)(d7);');
  expect(c).toContain('flag_z = ((_bv & (1u << ((0) & 31))) == 0);');
  expect(c).toContain('d7 = (_bv & ~(1u << ((0) & 31)));');
});
test('BSET #2,34(a0) is a byte operation on the addressed byte', () => {
  const c = emit('\tBSET #2,34(a0)');
  expect(c).toContain('READ8(a0 + 34)');
  expect(c).toContain('hw_write8(a0 + 34,');
  expect(c).toContain('(1u << ((2) & 7))');
  expect(c).not.toContain('32(');
});
test('BTST #6,$BFE001 reads a byte, bit mod 8', () => {
  expect(emit('\tBTST #6,$BFE001')).toBe('flag_z = ((hw_read8(0xBFE001) & (1u << ((6) & 7))) == 0);');
});

// DIVS overflow sets V and leaves the destination alone (PumaTracker's
// `Divs D1,D2 / Bvs`); a zero divisor must not reach a C division, which
// traps the WASM instance.
test('DIVS sets V on overflow, guards a zero divisor, sets N/Z from the quotient', () => {
  const c = emit('\tDIVS d1,d2');
  expect(c).toContain('int64_t _dd = (int32_t)d2, _ds_ = (int16_t)(d1);');
  expect(c).toContain('if (_ds_ != 0) {');
  expect(c).toContain('if (_q >= -32768 && _q <= 32767) {');
  expect(c).toContain('flag_v = 0; flag_z = ((uint16_t)_q == 0); flag_n = ((int16_t)_q < 0);');
});
test('DIVU overflows above 0xFFFF', () => {
  expect(emit('\tDIVU d1,d2')).toContain('if (_q <= 0xFFFF) {');
});
test('NOT.L d0',     () => { expect(emit('NOT.L d0')).toBe('d0 = ~d0;'); });
test('NEG.L d0',     () => { expect(emit('NEG.L d0')).toBe('d0 = (uint32_t)(-(int32_t)d0);'); });
test('CLR.L d0',     () => { expect(emit('CLR.L d0')).toBe('d0 = 0;'); });
test('BEQ label',    () => { expect(emit('\tBEQ label')).toBe('if (flag_z) goto label;'); });
test('BNE label',    () => { expect(emit('\tBNE label')).toBe('if (!flag_z) goto label;'); });
test('BRA label',    () => { expect(emit('\tBRA label')).toBe('goto label;'); });
test('DBRA d0,loop', () => { expect(emit('\tDBRA d0,loop')).toContain('(int16_t)(--d0) >= 0'); });
// BHS/BLO are unsigned-branch aliases of BCC/BCS. Missing them silently dropped a
// conditional branch in MaxTrax IntAlg (BHS.S) — the "sounds totally weird" bug.
test('BHS label (alias of BCC)', () => { expect(emit('\tBHS label')).toBe('if (!flag_c) goto label;'); });
test('BLO label (alias of BCS)', () => { expect(emit('\tBLO label')).toBe('if (flag_c) goto label;'); });
test('BHS.S label with size suffix', () => { expect(emit('\tBHS.S label')).toBe('if (!flag_c) goto label;'); });
// EXG exchanges two full 32-bit registers. Missing it left FreeSample freeing the wrong
// pointer → double-free → maxtrax_stop() abort → the "plays once then needs reload" bug.
test('EXG A1,A2 swaps both registers', () => {
  expect(emit('\tEXG a1,a2')).toBe('{ uint32_t _exg = a1; a1 = a2; a2 = _exg; }');
});
test('EXG.L D3,A3 swaps data/address register', () => {
  expect(emit('\tEXG.L d3,a3')).toBe('{ uint32_t _exg = d3; d3 = a3; a3 = _exg; }');
});
test('BSR func',     () => { expect(emit('\tBSR func')).toBe('func();'); });
test('RTS',          () => { expect(emit('\tRTS')).toBe('return;'); });
test('NOP',          () => { expect(emit('\tNOP')).toBe('/* NOP */'); });
test('MOVE.W d0,$DFF0A6 (Paula period ch0)', () => {
  expect(emit('MOVE.W d0,$DFF0A6')).toContain('paula_set_period(0,');
});
test('MOVE.W d0,$DFF0A8 (Paula volume ch0)', () => {
  expect(emit('MOVE.W d0,$DFF0A8')).toContain('paula_set_volume(0,');
});
test('MOVE.W #$8200,$DFF096 (DMACON)', () => {
  expect(emit('MOVE.W #$8200,$DFF096')).toContain('paula_dma_write(');
});
