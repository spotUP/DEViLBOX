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
test('ADD.L d1,d0',  () => { expect(emit('ADD.L d1,d0')).toContain('d0 ='); });
test('SUB.W d1,d0',  () => { expect(emit('SUB.W d1,d0')).toContain('W(d0)'); });
test('MULS d0,d1',   () => { expect(emit('\tMULS d0,d1')).toContain('(int16_t)'); });
test('LSR.L #2,d0',  () => { expect(emit('LSR.L #2,d0')).toBe('d0 >>= 2;'); });
test('ASR.L #1,d0',  () => { expect(emit('ASR.L #1,d0')).toBe('d0 = (uint32_t)((int32_t)d0 >> 1);'); });
test('AND.W d1,d0',  () => { expect(emit('AND.W d1,d0')).toContain('&='); });
test('OR.L d1,d0',   () => { expect(emit('OR.L d1,d0')).toContain('|='); });
test('EOR.L d1,d0',  () => { expect(emit('EOR.L d1,d0')).toContain('^='); });
test('NOT.L d0',     () => { expect(emit('NOT.L d0')).toBe('d0 = ~d0;'); });
test('NEG.L d0',     () => { expect(emit('NEG.L d0')).toBe('d0 = (uint32_t)(-(int32_t)d0);'); });
test('CLR.L d0',     () => { expect(emit('CLR.L d0')).toBe('d0 = 0;'); });
test('BEQ label',    () => { expect(emit('\tBEQ label')).toBe('if (flag_z) goto label;'); });
test('BNE label',    () => { expect(emit('\tBNE label')).toBe('if (!flag_z) goto label;'); });
test('BRA label',    () => { expect(emit('\tBRA label')).toBe('goto label;'); });
test('DBRA d0,loop', () => { expect(emit('\tDBRA d0,loop')).toContain('(int16_t)(--d0) >= 0'); });
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
