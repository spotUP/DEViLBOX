import type { AstNode, InstructionNode } from './ast.js';

// Paula register map: address → { channel, register }
const PAULA_REGS: Record<number, { channel: number; register: string }> = {
  0xdff0a0: { channel: 0, register: 'sample_ptr' },
  0xdff0a4: { channel: 0, register: 'sample_len' },
  0xdff0a6: { channel: 0, register: 'period' },
  0xdff0a8: { channel: 0, register: 'volume' },
  0xdff0aa: { channel: 0, register: 'repeat_ptr' },
  0xdff0ae: { channel: 0, register: 'repeat_len' },
  0xdff0b0: { channel: 1, register: 'sample_ptr' },
  0xdff0b4: { channel: 1, register: 'sample_len' },
  0xdff0b6: { channel: 1, register: 'period' },
  0xdff0b8: { channel: 1, register: 'volume' },
  0xdff0ba: { channel: 1, register: 'repeat_ptr' },
  0xdff0be: { channel: 1, register: 'repeat_len' },
  0xdff0c0: { channel: 2, register: 'sample_ptr' },
  0xdff0c4: { channel: 2, register: 'sample_len' },
  0xdff0c6: { channel: 2, register: 'period' },
  0xdff0c8: { channel: 2, register: 'volume' },
  0xdff0ca: { channel: 2, register: 'repeat_ptr' },
  0xdff0ce: { channel: 2, register: 'repeat_len' },
  0xdff0d0: { channel: 3, register: 'sample_ptr' },
  0xdff0d4: { channel: 3, register: 'sample_len' },
  0xdff0d6: { channel: 3, register: 'period' },
  0xdff0d8: { channel: 3, register: 'volume' },
  0xdff0da: { channel: 3, register: 'repeat_ptr' },
  0xdff0de: { channel: 3, register: 'repeat_len' },
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
        // Check for Paula register writes: MOVE.W src,$DFFxxx
        if (instr.mnemonic === 'MOVE' || instr.mnemonic === 'MOVEA') {
          const dest = instr.operands[1];
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
