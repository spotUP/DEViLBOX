import { Token, TokenKind } from './token.js';

// ---------------------------------------------------------------------------
// Sets / constants
// ---------------------------------------------------------------------------

const DIRECTIVES = new Set([
  'EQU', 'DC', 'DS', 'SECTION', 'INCLUDE', 'MACRO', 'ENDM', 'XDEF', 'XREF',
  'EVEN', 'CNOP', 'RSRESET', 'RS', 'SET', 'ORG', 'END', 'INCBIN', 'REPT',
  'ENDR', 'IFD', 'IFND', 'IFC', 'IFNC', 'IFEQ', 'IFNE', 'IFLT', 'IFLE',
  'IFGT', 'IFGE', 'ENDC', 'ENDIF', 'ELSE', 'ELSEIF',
]);

// Registers recognized by the lexer (lowercase normalized).
const REGISTERS = new Set([
  'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7',
  'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
  'sp', 'pc', 'sr', 'ccr',
]);

// Size suffixes
const SIZE_SUFFIXES = new Set(['.B', '.W', '.L', '.S']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if `ch` can start an identifier (letter or _ or .) */
function isIdentStart(ch: string): boolean {
  return /[A-Za-z_.]/.test(ch);
}

/** Returns true if `ch` can continue an identifier */
function isIdentContinue(ch: string): boolean {
  return /[A-Za-z0-9_.]/.test(ch);
}

/** Returns true if `ch` is a decimal digit */
function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/** Returns true if `ch` is a hex digit */
function isHexDigit(ch: string): boolean {
  return /[0-9A-Fa-f]/.test(ch);
}

/** Returns true if `ch` is a binary digit */
function isBinDigit(ch: string): boolean {
  return ch === '0' || ch === '1';
}

// ---------------------------------------------------------------------------
// Per-line tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize a single line. `lineNum` is 1-based.
 * Returns tokens NOT including the NEWLINE (caller adds it).
 */
function tokenizeLine(src: string, lineNum: number): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  function peek(): string { return i < src.length ? src[i] : ''; }
  function advance(): string { return src[i++]; }

  function tok(kind: TokenKind, value: string, col: number): Token {
    return { kind, value, line: lineNum, col };
  }

  // -- Skip horizontal whitespace --
  function skipWS(): void {
    while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i++;
  }

  // -- Read an identifier-like sequence (letters, digits, _, .) --
  function readIdent(): string {
    const start = i;
    while (i < src.length && isIdentContinue(src[i])) i++;
    return src.slice(start, i);
  }

  // -- Read a hex sequence --
  function readHex(): string {
    const start = i;
    while (i < src.length && isHexDigit(src[i])) i++;
    return src.slice(start, i);
  }

  // -- Read a decimal sequence --
  function readDecimal(): string {
    const start = i;
    while (i < src.length && isDigit(src[i])) i++;
    return src.slice(start, i);
  }

  // -- Read a binary sequence --
  function readBin(): string {
    const start = i;
    while (i < src.length && isBinDigit(src[i])) i++;
    return src.slice(start, i);
  }

  /**
   * Try to read a register name at the current position.
   * Returns the normalized (lowercase) register name if found, else null.
   * Does NOT consume input if not found.
   */
  function tryReadRegister(): string | null {
    // Registers: d0-d7, a0-a7, sp, pc, sr, ccr
    // They must NOT be followed by an ident-continue char (so "data" != register)
    const saved = i;
    let name = '';
    // Read up to 3 chars that look register-like
    while (i < src.length && i - saved < 3 && /[A-Za-z0-9]/.test(src[i])) {
      name += src[i++];
    }
    const lower = name.toLowerCase();
    const after = i < src.length ? src[i] : '';
    if (REGISTERS.has(lower) && !/[A-Za-z0-9_.]/.test(after)) {
      return lower;
    }
    i = saved;
    return null;
  }

  /**
   * Read an addressing mode that starts with '(':
   *   (reg)        → ADDRESS
   *   (reg)+       → ADDRESS
   *   (reg,idx)    → ADDRESS
   * Returns the full token string including parens.
   */
  function readParenAddr(col: number): Token {
    const start = i; // points at '('
    i++; // consume '('
    // read inner content up to matching ')'
    let depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
      i++;
    }
    // optionally consume '+'
    if (i < src.length && src[i] === '+') i++;
    return tok('ADDRESS', src.slice(start, i), col);
  }

  /**
   * Read a numeric literal that may be followed by a paren → DISP_REG, or standalone.
   * `prefix` is the text already consumed before this call (e.g. "-" for negative displacements).
   * `startCol` is the column where the literal began.
   */
  function readNumericOrDisp(prefix: string, startCol: number): Token {
    const numStart = i;
    let numStr = prefix;

    // Read the numeric part
    if (peek() === '$') {
      advance();
      numStr += '$' + readHex();
    } else if (peek() === '%') {
      advance();
      numStr += '%' + readBin();
    } else {
      numStr += readDecimal();
    }

    // Check if followed immediately by '(' → DISP_REG
    if (peek() === '(') {
      const parenStart = i;
      i++; // consume '('
      let depth = 1;
      while (i < src.length && depth > 0) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') depth--;
        i++;
      }
      // optionally consume size suffix after paren close
      if (peek() === '.') {
        const dot = i;
        i++;
        while (i < src.length && /[A-Za-z]/.test(src[i])) i++;
        // keep it as part of the DISP_REG value
      }
      return tok('DISP_REG', src.slice(numStart - prefix.length, i), startCol);
    }

    // Standalone numeric
    if (numStr.startsWith('$') || numStr.startsWith('-$')) {
      // Hex literal: 5+ digits → ABS_ADDR (hardware address), fewer → NUMBER (data)
      const hexDigits = numStr.replace(/^-?\$/, '');
      const kind: TokenKind = hexDigits.length >= 5 ? 'ABS_ADDR' : 'NUMBER';
      return tok(kind, numStr, startCol);
    }
    return tok('NUMBER', numStr, startCol);
  }

  // -------------------------------------------------------------------------
  // Main per-line scan
  // -------------------------------------------------------------------------
  skipWS();
  if (i >= src.length) return tokens; // blank line

  // Asterisk at start of (trimmed) line → whole-line comment
  if (src[i] === '*') {
    tokens.push(tok('COMMENT', src.slice(i), i + 1));
    return tokens;
  }

  let isFirstToken = true;

  while (i < src.length) {
    skipWS();
    if (i >= src.length) break;

    const col = i + 1; // 1-based column
    const ch = src[i];

    // -- Semicolon comment (;; or ;) --
    if (ch === ';') {
      tokens.push(tok('COMMENT', src.slice(i), col));
      break;
    }

    // -- Comma --
    if (ch === ',') {
      advance();
      tokens.push(tok('COMMA', ',', col));
      isFirstToken = false;
      continue;
    }

    // -- Equals sign: SET / assignment EQU (e.g. LoadSize = 12) --
    if (ch === '=') {
      advance();
      tokens.push(tok('DIRECTIVE', 'EQU', col));
      isFirstToken = false;
      continue;
    }

    // -- String literal (DC.B "hello" or DC.B 'hello') --
    if (ch === '"' || ch === "'") {
      const closing = ch;
      advance(); // consume opening quote
      const start = i;
      while (i < src.length && src[i] !== closing) {
        if (src[i] === '\\') i++; // skip escape
        i++;
      }
      const str = src.slice(start, i);
      if (i < src.length) i++; // consume closing quote
      tokens.push(tok('STRING', str, col));
      isFirstToken = false;
      continue;
    }

    // -- Immediate: #... --
    if (ch === '#') {
      advance(); // consume '#'
      const immStart = i - 1; // include '#' in value
      let immVal = '#';
      if (peek() === '$') {
        advance();
        immVal += '$' + readHex();
      } else if (peek() === '%') {
        advance();
        immVal += '%' + readBin();
      } else if (peek() === '-' || isDigit(peek())) {
        if (peek() === '-') { advance(); immVal += '-'; }
        immVal += readDecimal();
      } else {
        // #identifier (e.g. #DMACON)
        immVal += readIdent();
      }
      tokens.push(tok('IMMEDIATE', immVal, col));
      isFirstToken = false;
      continue;
    }

    // -- Pre-decrement addressing: -(reg) --
    if (ch === '-' && i + 1 < src.length && src[i + 1] === '(') {
      advance(); // consume '-'
      const inner = readParenAddr(col);
      tokens.push(tok('ADDRESS', '-' + inner.value, col));
      isFirstToken = false;
      continue;
    }

    // -- Negative displacement: -$xx(reg) or -N(reg) --
    if (ch === '-' && i + 1 < src.length && (src[i + 1] === '$' || isDigit(src[i + 1]))) {
      advance(); // consume '-'
      const t = readNumericOrDisp('-', col);
      tokens.push(t);
      isFirstToken = false;
      continue;
    }

    // -- Indirect / plain paren: (reg), (reg)+, (reg,idx) --
    if (ch === '(') {
      tokens.push(readParenAddr(col));
      isFirstToken = false;
      continue;
    }

    // -- Hex literal: $... --
    if (ch === '$') {
      advance(); // consume '$'
      const digits = readHex();
      const fullVal = '$' + digits;
      // If followed by '(' → DISP_REG (e.g. $10(a4))
      if (peek() === '(') {
        const parenStart = i;
        i++; // '('
        let depth = 1;
        while (i < src.length && depth > 0) {
          if (src[i] === '(') depth++;
          else if (src[i] === ')') depth--;
          i++;
        }
        tokens.push(tok('DISP_REG', fullVal + src.slice(parenStart, i), col));
      } else {
        // Heuristic: 5+ hex digits → hardware address (ABS_ADDR), e.g. $DFF0A6, $C00000
        // 4 or fewer digits → data literal (NUMBER), e.g. $0358, $FF
        const kind: TokenKind = digits.length >= 5 ? 'ABS_ADDR' : 'NUMBER';
        tokens.push(tok(kind, fullVal, col));
      }
      isFirstToken = false;
      continue;
    }

    // -- Binary literal: %... --
    if (ch === '%') {
      advance();
      const digits = readBin();
      tokens.push(tok('NUMBER', '%' + digits, col));
      isFirstToken = false;
      continue;
    }

    // -- Decimal number possibly followed by paren (DISP_REG) --
    if (isDigit(ch)) {
      const t = readNumericOrDisp('', col);
      tokens.push(t);
      isFirstToken = false;
      continue;
    }

    // -- Identifier, label, mnemonic, directive, register --
    if (isIdentStart(ch)) {
      const identStart = i;
      const raw = readIdent();
      const upper = raw.toUpperCase();
      const lower = raw.toLowerCase();

      // Check for size suffix separately attached right after the word
      // (handled below in mnemonic processing; here we handle the token itself)

      // Check for label: identifier immediately followed by ':'
      if (peek() === ':') {
        advance(); // consume ':'
        tokens.push(tok('LABEL', raw, col));
        // Do NOT reset isFirstToken — an instruction may immediately follow on the same line
        // (e.g. "myLabel: RTS" or the Devpac bare-label form "myLabel  RTS").
        continue;
      }

      // Check if this is a size suffix token that got swept up in an ident read.
      // This can happen if the ident starts with '.'. Normalize: .b .w .l .s
      if (raw.startsWith('.') && SIZE_SUFFIXES.has(upper)) {
        tokens.push(tok('SIZE', upper, col));
        isFirstToken = false;
        continue;
      }

      // Check for mnemonic+size run-together like "MOVE.L" already consumed as one ident
      // because '.' is in isIdentContinue. Split on the first '.'.
      const dotIdx = raw.indexOf('.');
      if (dotIdx > 0) {
        const word = raw.slice(0, dotIdx);
        const suf = raw.slice(dotIdx).toUpperCase();
        const wordUpper = word.toUpperCase();
        const wordLower = word.toLowerCase();

        if (REGISTERS.has(wordLower)) {
          // e.g. d0.w in an index — treat as REGISTER + SIZE
          tokens.push(tok('REGISTER', wordLower, col));
          if (SIZE_SUFFIXES.has(suf)) {
            tokens.push(tok('SIZE', suf, col + dotIdx));
          }
        } else if (DIRECTIVES.has(wordUpper)) {
          tokens.push(tok('DIRECTIVE', wordUpper, col));
          if (SIZE_SUFFIXES.has(suf)) {
            tokens.push(tok('SIZE', suf, col + dotIdx));
          }
        } else {
          // Mnemonic with size suffix
          tokens.push(tok('MNEMONIC', wordUpper, col));
          if (SIZE_SUFFIXES.has(suf)) {
            tokens.push(tok('SIZE', suf, col + dotIdx));
          }
        }
        isFirstToken = false;
        continue;
      }

      // No dot in raw — classify the whole token

      // Identifier immediately followed by '(' → DISP_REG (e.g. PlayTick(PC), label(a5))
      if (!REGISTERS.has(lower) && !DIRECTIVES.has(upper) && peek() === '(') {
        const parenStart = i;
        i++; // consume '('
        let depth = 1;
        while (i < src.length && depth > 0) {
          if (src[i] === '(') depth++;
          else if (src[i] === ')') depth--;
          i++;
        }
        tokens.push(tok('DISP_REG', raw + src.slice(parenStart, i), col));
        isFirstToken = false;
        continue;
      }

      if (REGISTERS.has(lower)) {
        tokens.push(tok('REGISTER', lower, col));
      } else if (DIRECTIVES.has(upper)) {
        tokens.push(tok('DIRECTIVE', upper, col));
      } else if (col === 1 && isFirstToken) {
        // Column-0 bare label (Devpac/AsmOne/VASM convention):
        // Any non-register, non-directive identifier at column 1 (no leading whitespace)
        // is a label unless followed by a directive keyword (EQU/SET/= LHS context).
        const savedI = i;
        skipWS();
        const nextCh = i < src.length ? src[i] : '';
        let nextWord = '';
        while (i < src.length && isIdentContinue(src[i])) nextWord += src[i++];
        i = savedI; // restore
        if (DIRECTIVES.has(nextWord.toUpperCase()) || nextCh === '=') {
          tokens.push(tok('IDENTIFIER', raw, col)); // EQU/SET name (or = assignment)
        } else {
          tokens.push(tok('LABEL', raw, col));       // bare label
          // Do NOT reset isFirstToken — an instruction may follow on the same line
          // (e.g. Devpac convention "lbC001A28\tRTS" with label and mnemonic on same line).
          continue;
        }
      } else if (isFirstToken) {
        // First token on a (non-label) line: could be a mnemonic if it looks like one
        // (all alphabetic). Otherwise IDENTIFIER.
        if (/^[A-Za-z]+$/.test(raw)) {
          // If it's the very first thing and NOT recognized as directive/register,
          // it's either a mnemonic (instruction) or an IDENTIFIER (EQU LHS etc.)
          // We disambiguate by looking ahead: if followed by a known directive, it's IDENTIFIER.
          // Otherwise treat as MNEMONIC.
          // Peek ahead to see if next non-ws token is a directive
          const savedI = i;
          skipWS();
          let nextWord = '';
          while (i < src.length && isIdentContinue(src[i])) nextWord += src[i++];
          i = savedI; // restore

          const nextUpper = nextWord.toUpperCase();
          if (DIRECTIVES.has(nextUpper)) {
            tokens.push(tok('IDENTIFIER', raw, col));
          } else {
            tokens.push(tok('MNEMONIC', upper, col));
          }
        } else {
          tokens.push(tok('IDENTIFIER', raw, col));
        }
      } else {
        // Not first token: if all-alpha and looks instruction-y → still could be mnemonic
        // but in operand position it's an IDENTIFIER (label reference, macro param, etc.)
        tokens.push(tok('IDENTIFIER', raw, col));
      }

      isFirstToken = false;
      continue;
    }

    // -- Hyphen between registers: emit RANGE token for MOVEM register range expansion.
    // Only emit RANGE if the PREVIOUS token was a REGISTER (avoids breaking
    // displacement arithmetic like 12-12(A4) where '-' is subtraction). --
    if (ch === '-' && !isFirstToken && tokens.length > 0 && tokens[tokens.length - 1].kind === 'REGISTER') {
      advance();
      tokens.push(tok('RANGE', '-', col));
      continue;
    }

    // -- Unknown character: skip --
    advance();
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Tokenize a complete 68000 assembly source string.
 * Returns a flat array of tokens ending with a single EOF token.
 */
export function tokenize(source: string): Token[] {
  const lines = source.split('\n');
  const result: Token[] = [];
  let lineNum = 1;

  for (const line of lines) {
    const lineTokens = tokenizeLine(line, lineNum);
    result.push(...lineTokens);
    result.push({ kind: 'NEWLINE', value: '\n', line: lineNum, col: line.length + 1 });
    lineNum++;
  }

  result.push({ kind: 'EOF', value: '', line: lineNum, col: 1 });
  return result;
}
