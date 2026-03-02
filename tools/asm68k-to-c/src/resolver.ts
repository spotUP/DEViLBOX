import type { AstNode, InstructionNode } from './ast.js';

// Paula register map: address → { channel, register }
// Matches real Amiga Paula hardware registers (channel 0 base = $DFF0A0,
// channel 1 = $DFF0B0, channel 2 = $DFF0C0, channel 3 = $DFF0D0).
const PAULA_REGS: Record<number, { channel: number; register: string }> = {
  // Channel 0 ($DFF0A0 base)
  0xdff0a0: { channel: 0, register: 'lc' },          // AUD0LC: sample pointer
  0xdff0a4: { channel: 0, register: 'len' },          // AUD0LEN: sample length (words)
  0xdff0a6: { channel: 0, register: 'period' },       // AUD0PER: period
  0xdff0a8: { channel: 0, register: 'volume' },       // AUD0VOL: volume (0-64)
  0xdff0aa: { channel: 0, register: 'dat' },          // AUD0DAT: one-shot data
  // Channel 1 ($DFF0B0 base)
  0xdff0b0: { channel: 1, register: 'lc' },
  0xdff0b4: { channel: 1, register: 'len' },
  0xdff0b6: { channel: 1, register: 'period' },
  0xdff0b8: { channel: 1, register: 'volume' },
  0xdff0ba: { channel: 1, register: 'dat' },
  // Channel 2 ($DFF0C0 base)
  0xdff0c0: { channel: 2, register: 'lc' },
  0xdff0c4: { channel: 2, register: 'len' },
  0xdff0c6: { channel: 2, register: 'period' },
  0xdff0c8: { channel: 2, register: 'volume' },
  0xdff0ca: { channel: 2, register: 'dat' },
  // Channel 3 ($DFF0D0 base)
  0xdff0d0: { channel: 3, register: 'lc' },
  0xdff0d4: { channel: 3, register: 'len' },
  0xdff0d6: { channel: 3, register: 'period' },
  0xdff0d8: { channel: 3, register: 'volume' },
  0xdff0da: { channel: 3, register: 'dat' },
};

export interface ResolveResult {
  symbols: Map<string, number | string>;
  labels: Set<string>;
  exports: string[];
  paulaWrites: Array<{ channel: number; register: string; line: number }>;
  warnings: string[];
}

export function resolve(ast: AstNode[]): ResolveResult {
  const symbols = new Map<string, number | string>();
  const labels = new Set<string>();
  const exports: string[] = [];
  const paulaWrites: Array<{ channel: number; register: string; line: number }> = [];
  const warnings: string[] = [];

  for (const node of ast) {
    switch (node.kind) {
      case 'equ':
        symbols.set(node.name, node.value);
        break;
      case 'label':
        labels.add(node.name);
        break;
      case 'xdef':
        exports.push(node.name);
        break;
      case 'instruction': {
        const instr = node as InstructionNode;
        // Check for Paula register writes: MOVE/CLR to $DFFxxx
        if (instr.mnemonic === 'MOVE' || instr.mnemonic === 'MOVEA') {
          const dest = instr.operands[1];
          if (dest?.kind === 'abs_addr' && dest.tag === 'paula') {
            const paulaReg = PAULA_REGS[dest.value];
            if (paulaReg) {
              paulaWrites.push({ ...paulaReg, line: instr.line });
            }
          }
        }
        // CLR to Paula register also counts as a write (value = 0)
        if (instr.mnemonic === 'CLR') {
          const dest = instr.operands[0];
          if (dest?.kind === 'abs_addr' && dest.tag === 'paula') {
            const paulaReg = PAULA_REGS[dest.value];
            if (paulaReg) {
              paulaWrites.push({ ...paulaReg, line: instr.line });
            }
          }
        }
        // Warn about unsupported chip accesses
        for (const op of instr.operands) {
          if (op.kind === 'abs_addr' && op.tag === 'cia') {
            warnings.push(`Line ${instr.line}: CIA register write ${op.raw} — emitted as no-op`);
          }
          if (op.kind === 'abs_addr' && op.tag === 'other' && op.value >= 0xdf0000) {
            warnings.push(`Line ${instr.line}: Custom chip write ${op.raw} — emitted as no-op`);
          }
        }
        break;
      }
    }
  }

  return { symbols, labels, exports, paulaWrites, warnings };
}
