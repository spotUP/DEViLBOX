import type { Token } from './token.js';
import type { AstNode, Operand, Size } from './ast.js';

function tagAddress(addr: number): 'paula' | 'dmacon' | 'cia' | 'other' {
  if (addr >= 0xdff0a0 && addr <= 0xdff0df) return 'paula';
  if (addr === 0xdff096) return 'dmacon';
  if ((addr & 0xffff00) === 0xbfe000 || (addr & 0xffff00) === 0xbfd000) return 'cia';
  return 'other';
}

function parseNumber(raw: string): number {
  if (raw.startsWith('$')) return parseInt(raw.slice(1), 16);
  if (raw.startsWith('%')) return parseInt(raw.slice(1), 2);
  if (raw.startsWith('0') && raw.length > 1 && /^[0-7]+$/.test(raw.slice(1)))
    return parseInt(raw, 8);
  return parseInt(raw, 10);
}

function parseOperand(tokens: Token[]): Operand {
  const t = tokens[0];
  switch (t.kind) {
    case 'REGISTER':
      return { kind: 'register', name: t.value };
    case 'IMMEDIATE': {
      const raw = t.value.slice(1); // remove '#'
      return { kind: 'immediate', value: parseNumber(raw), raw: t.value };
    }
    case 'ADDRESS': {
      if (t.value.startsWith('-')) {
        const reg = t.value.match(/\((\w+)\)/)?.[1] ?? 'sp';
        return { kind: 'address', mode: 'pre_dec', reg };
      }
      const reg = t.value.match(/\((\w+)\)/)?.[1] ?? 'a0';
      const mode = t.value.endsWith('+') ? 'post_inc' : 'indirect';
      return { kind: 'address', mode, reg };
    }
    case 'DISP_REG': {
      const m = t.value.match(/^(-?[^(]+)\((\w+)(?:,(\w+\.\w+))?\)$/);
      if (m) {
        const offset = /^\d+$/.test(m[1]) ? parseInt(m[1]) : m[1];
        return { kind: 'disp', offset, base: m[2], index: m[3] };
      }
      return { kind: 'label_ref', name: t.value };
    }
    case 'ABS_ADDR': {
      const val = parseNumber(t.value);
      return { kind: 'abs_addr', value: val, raw: t.value, tag: tagAddress(val) };
    }
    case 'IDENTIFIER':
      return { kind: 'label_ref', name: t.value };
    case 'NUMBER':
      return { kind: 'immediate', value: parseNumber(t.value), raw: t.value };
    default:
      return { kind: 'label_ref', name: t.value };
  }
}

export function parse(tokens: Token[]): AstNode[] {
  const nodes: AstNode[] = [];
  let i = 0;

  function peek(): Token { return tokens[i]; }
  function consume(): Token { return tokens[i++]; }

  while (i < tokens.length) {
    const t = peek();

    if (t.kind === 'EOF') break;
    if (t.kind === 'NEWLINE') { i++; continue; }
    if (t.kind === 'COMMENT') {
      nodes.push({ kind: 'comment', text: t.value, line: t.line });
      i++;
      continue;
    }

    // Collect tokens until end of logical line
    const lineTokens: Token[] = [];
    const startLine = t.line;
    while (i < tokens.length && peek().kind !== 'NEWLINE' && peek().kind !== 'EOF') {
      lineTokens.push(consume());
    }

    if (lineTokens.length === 0) continue;

    let j = 0;
    const lt = lineTokens;

    // Label at start of logical line
    if (lt[j]?.kind === 'LABEL') {
      nodes.push({ kind: 'label', name: lt[j].value, line: startLine });
      j++;
    }

    if (j >= lt.length) continue;

    // Skip inline comment at this position
    while (lt[j]?.kind === 'COMMENT') j++;
    if (j >= lt.length) continue;

    const first = lt[j];

    // XDEF / XREF
    if (first.kind === 'DIRECTIVE' && (first.value === 'XDEF' || first.value === 'XREF')) {
      j++;
      const name = lt[j]?.value ?? '';
      nodes.push({ kind: 'xdef', name, line: startLine });
      continue;
    }

    // EQU — identifier followed by EQU directive
    if (
      first.kind === 'IDENTIFIER' &&
      lt[j + 1]?.kind === 'DIRECTIVE' &&
      lt[j + 1]?.value === 'EQU'
    ) {
      const name = first.value;
      const valToken = lt[j + 2];
      const val =
        valToken
          ? valToken.kind === 'NUMBER' || valToken.kind === 'ABS_ADDR'
            ? parseNumber(valToken.value)
            : valToken.value
          : 0;
      nodes.push({ kind: 'equ', name, value: val, line: startLine });
      continue;
    }

    // SECTION
    if (first.kind === 'DIRECTIVE' && first.value === 'SECTION') {
      j++;
      const name = lt[j]?.value ?? '';
      nodes.push({ kind: 'section', name, line: startLine });
      continue;
    }

    // DC / DS data
    if (first.kind === 'DIRECTIVE' && (first.value === 'DC' || first.value === 'DS')) {
      const directive = first.value as 'DC' | 'DS';
      j++; // advance past DC/DS
      const sizeToken = lt[j];
      let size: Size = 'W';
      if (sizeToken?.kind === 'SIZE') {
        size = sizeToken.value.slice(1) as Size;
        j++;
      }
      const values: (number | string)[] = [];
      while (j < lt.length && lt[j]?.kind !== 'COMMENT') {
        if (lt[j].kind === 'COMMA') { j++; continue; }
        const v = lt[j].value;
        if (lt[j].kind === 'STRING') {
          values.push(v);
        } else {
          values.push(parseNumber(v));
        }
        j++;
      }
      nodes.push({ kind: 'data', directive, size, values, line: startLine });
      continue;
    }

    // Instruction
    if (first.kind === 'MNEMONIC') {
      j++;
      let size: Size = null;
      if (lt[j]?.kind === 'SIZE') {
        size = lt[j].value.slice(1) as Size;
        j++;
      }
      const operands: Operand[] = [];
      while (j < lt.length && lt[j]?.kind !== 'COMMENT') {
        if (lt[j].kind === 'COMMA') { j++; continue; }
        operands.push(parseOperand([lt[j]]));
        j++;
      }
      nodes.push({
        kind: 'instruction',
        mnemonic: first.value,
        size,
        operands,
        line: startLine,
      });
      continue;
    }
  }

  return nodes;
}
