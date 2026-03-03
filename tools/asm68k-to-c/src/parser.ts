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

function parseOperand(t: Token): Operand {
  switch (t.kind) {
    case 'REGISTER':
      return { kind: 'register', name: t.value };
    case 'IMMEDIATE': {
      const raw = t.value.slice(1); // remove '#'
      return { kind: 'immediate', value: parseNumber(raw), raw: t.value };
    }
    case 'ADDRESS': {
      if (t.value.startsWith('-')) {
        const reg = (t.value.match(/\((\w+)\)/)?.[1] ?? 'sp').toLowerCase();
        return { kind: 'address', mode: 'pre_dec', reg };
      }
      const reg = (t.value.match(/\((\w+)\)/)?.[1] ?? 'a0').toLowerCase();
      const mode = t.value.endsWith('+') ? 'post_inc' : 'indirect';
      return { kind: 'address', mode, reg };
    }
    case 'DISP_REG': {
      const m = t.value.match(/^(-?[^(]+)\((\w+)(?:,(\w+\.\w+))?\)$/);
      if (m) {
        const rawOff = m[1];
        const offset: number | string =
          /^-?\d+$/.test(rawOff) ? parseInt(rawOff) :
          /^\$[0-9A-Fa-f]+$/.test(rawOff) ? parseInt(rawOff.slice(1), 16) :
          /^-\$[0-9A-Fa-f]+$/.test(rawOff) ? -parseInt(rawOff.slice(2), 16) :
          rawOff;
        // PC-relative addressing: label(PC) → pc_rel node
        if (m[2].toUpperCase() === 'PC' && typeof offset === 'string') {
          return { kind: 'pc_rel', label: offset };
        }
        return { kind: 'disp', offset, base: m[2].toLowerCase(), index: m[3] };
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
  let rsOffset = 0; // RS.x offset counter (reset by RSRESET)
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

    // RSRESET — reset RS offset counter to 0
    if (first.kind === 'DIRECTIVE' && first.value === 'RSRESET') {
      rsOffset = 0;
      continue;
    }

    // RS.B / RS.W / RS.L — assign current offset to label, then advance
    // Format: label RS.size count (e.g. "it_name RS.B 31")
    if (
      (first.kind === 'IDENTIFIER' || first.kind === 'LABEL') &&
      lt[j + 1]?.kind === 'DIRECTIVE' && lt[j + 1]?.value === 'RS' &&
      lt[j + 2]?.kind === 'SIZE'
    ) {
      const name = first.value;
      const sizeChar = lt[j + 2].value.slice(1).toUpperCase(); // B, W, L
      const elemSize = sizeChar === 'B' ? 1 : sizeChar === 'W' ? 2 : 4;
      const countToken = lt[j + 3];
      const count = countToken && (countToken.kind === 'NUMBER' || countToken.kind === 'IMMEDIATE')
        ? parseNumber(countToken.value.replace(/^#/, ''))
        : 0;
      nodes.push({ kind: 'equ', name, value: rsOffset, line: startLine });
      rsOffset += elemSize * count;
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
      const rawSize = sizeToken?.kind === 'SIZE' ? sizeToken.value.slice(1) : 'W';
      const size: Size = (rawSize === 'B' || rawSize === 'W' || rawSize === 'L' || rawSize === 'S') ? rawSize : 'W';
      if (sizeToken?.kind === 'SIZE') j++;
      const values: (number | string)[] = [];
      while (j < lt.length && lt[j]?.kind !== 'COMMENT') {
        if (lt[j].kind === 'COMMA') { j++; continue; }
        const v = lt[j].value;
        if (lt[j].kind === 'STRING' || lt[j].kind === 'IDENTIFIER') {
          // String literals and symbolic references stored as strings
          values.push(v);
        } else {
          const n = parseNumber(v);
          // Non-numeric tokens (e.g. label refs not caught above) → keep as string
          values.push(Number.isNaN(n) ? v : n);
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
        const raw = lt[j].value.slice(1);
        size = (raw === 'B' || raw === 'W' || raw === 'L' || raw === 'S') ? raw : null;
        j++;
      }
      const operands: Operand[] = [];
      while (j < lt.length && lt[j]?.kind !== 'COMMENT') {
        if (lt[j].kind === 'COMMA') { j++; continue; }
        if (lt[j] === undefined) { j++; continue; }
        // Expand register ranges: D0 RANGE D3 → D0,D1,D2,D3
        if (lt[j].kind === 'RANGE' && j > 0 && lt[j+1]?.kind === 'REGISTER') {
          j++; // skip RANGE token
          const prevReg = operands[operands.length - 1];
          if (prevReg?.kind === 'register') {
            const prefix = prevReg.name[0]; // 'd' or 'a'
            const startNum = parseInt(prevReg.name.slice(1));
            const endReg = lt[j].value.toLowerCase();
            const endNum = parseInt(endReg.slice(1));
            // Fill in the intermediate registers
            for (let k = startNum + 1; k <= endNum; k++) {
              operands.push({ kind: 'register', name: `${prefix}${k}` });
            }
            j++; // skip the end register (already added by range expansion)
            continue;
          }
        }
        if (lt[j].kind === 'RANGE') { j++; continue; } // skip stray RANGE tokens
        // NUMBER + DISP_REG: combine displacement arithmetic, e.g. 12-12(A4) → 0(A4)
        if ((lt[j].kind === 'NUMBER' || lt[j].kind === 'IMMEDIATE') && lt[j + 1]?.kind === 'DISP_REG') {
          const numVal = parseNumber(lt[j].value.replace(/^#/, ''));
          const dispRaw = lt[j + 1].value;  // e.g. "-12(A4)"
          const m = dispRaw.match(/^(-?[^(]+)\((.+)\)$/);
          if (m) {
            const dispVal = /^-?\d+$/.test(m[1]) ? parseInt(m[1]) :
                            /^-?\$[0-9A-Fa-f]+$/i.test(m[1]) ? parseInt(m[1].replace('$','0x')) : 0;
            const combined = numVal + dispVal;
            const base = m[2].toLowerCase();
            if (base === 'pc') {
              operands.push({ kind: 'pc_rel', label: `${combined}` });
            } else {
              operands.push({ kind: 'disp', offset: combined, base });
            }
            j += 2;
            continue;
          }
        }
        // #'SMUS' → character constant immediate (lexer splits '#' and 'SMUS' separately)
        if (lt[j].kind === 'IMMEDIATE' && lt[j].value === '#' && lt[j + 1]?.kind === 'STRING') {
          const chars = lt[j + 1].value;
          let val = 0;
          for (const c of chars) val = (((val << 8) | c.charCodeAt(0)) >>> 0);
          operands.push({ kind: 'immediate', value: val, raw: '#$' + val.toString(16) });
          j += 2;
          continue;
        }
        operands.push(parseOperand(lt[j]));
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
