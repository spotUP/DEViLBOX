/**
 * preprocess.ts — Source-level 68k ASM preprocessing before tokenization.
 *
 * Pipeline (in order):
 *   1. Expand REPT/ENDR blocks (N verbatim copies of the body)
 *   2. Collect MACRO/ENDM definitions; strip them from the source
 *   3. Expand macro invocations inline
 *   4. Expand EQU constants in complex displacement expressions
 *      e.g. CINTER_DEGREES/2*2-2(a0) → 16382(a0)
 *   5. Estimate per-instruction byte offsets
 *   6. Resolve  *+N / *-N  branch operands → insert synthetic labels and
 *      rewrite the operand to the label name so the parser sees a normal
 *      label reference.
 *
 * None of these transformations change the semantics of the source — they
 * only make constructs visible that the tokeniser/parser would otherwise
 * silently mis-handle.
 */

export function preProcess(source: string): string {
  let lines = source.split('\n');
  lines = expandRept(lines);
  lines = expandStructures(lines);
  const { macros, stripped } = collectMacros(lines);
  lines = expandMacros(stripped, macros);
  lines = expandEquDisplacements(lines);
  lines = resolveStarOffsets(lines);
  return lines.join('\n');
}

// ── 1. REPT / ENDR expansion ─────────────────────────────────────────────

function expandRept(lines: string[]): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = stripComment(lines[i]).match(/^\s+rept\s+(\d+)\s*$/i);
    if (m) {
      const count = parseInt(m[1], 10);
      i++;
      const body: string[] = [];
      let depth = 1;
      while (i < lines.length) {
        const inner = stripComment(lines[i]);
        if (/^\s+rept\s+\d+/i.test(inner)) depth++;
        if (/^\s+endr\s*$/i.test(inner)) {
          depth--;
          if (depth === 0) { i++; break; }
        }
        body.push(lines[i]);
        i++;
      }
      for (let k = 0; k < count; k++) result.push(...body);
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  return result;
}

// ── 1b. Amiga STRUCTURE offset-macro expansion ───────────────────────────
//
// The Amiga NDK defines struct offsets via a running SOFFSET counter (see
// exec/types.i): `STRUCTURE name,start` seeds it, then WORD/BYTE/APTR/LONG/…
// each emit `label EQU SOFFSET` and bump SOFFSET by the field size. We handle
// these as built-in directives (converting them to plain EQUs) so struct-heavy
// includes (driver.i, maxtrax.i, devices/audio.i) resolve without needing the
// SET-based macro machinery. Runs before macro collection so the field
// keywords are never treated as macro invocations or stray instructions.

const STRUCT_FIELD_SIZE: Record<string, number> = {
  FPTR: 4, APTR: 4, CPTR: 4, LONG: 4, ULONG: 4, FLOAT: 4,
  BOOL: 2, WORD: 2, UWORD: 2, SHORT: 2, USHORT: 2, RPTR: 2,
  BYTE: 1, UBYTE: 1, DOUBLE: 8,
};

function expandStructures(lines: string[]): string[] {
  const out: string[] = [];
  const consts = new Map<string, number>();
  let soffset = 0;
  for (const raw of lines) {
    const code = stripComment(raw).trim();

    // Track plain constants so STRUCT sizes / STRUCTURE starts referencing them resolve.
    let m = code.match(/^([A-Za-z_]\w*)\s+(?:equ|set)\s+(.+)$/i)
         || code.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
    if (m) {
      const v = evalConst(m[2], consts);
      if (!isNaN(v)) consts.set(m[1], v);
      out.push(raw);
      continue;
    }

    // STRUCTURE name,startOffset  → base label = 0, seed SOFFSET
    m = code.match(/^STRUCTURE\s+([A-Za-z_]\w*)\s*,\s*(.+)$/i);
    if (m) {
      const start = evalConst(m[2], consts);
      soffset = isNaN(start) ? 0 : start;
      consts.set(m[1], 0);
      out.push(`${m[1]}\tequ\t0`);
      continue;
    }

    // Fixed-size field directive:  DIR label
    m = code.match(/^(FPTR|APTR|CPTR|LONG|ULONG|FLOAT|BOOL|WORD|UWORD|SHORT|USHORT|RPTR|BYTE|UBYTE|DOUBLE)\s+([A-Za-z_]\w*)\s*$/i);
    if (m) {
      consts.set(m[2], soffset);
      out.push(`${m[2]}\tequ\t${soffset}`);
      soffset += STRUCT_FIELD_SIZE[m[1].toUpperCase()];
      continue;
    }

    // STRUCT label,size  (sub-structure; size may be an expression)
    m = code.match(/^STRUCT\s+([A-Za-z_]\w*)\s*,\s*(.+)$/i);
    if (m) {
      const sz = evalConst(m[2], consts);
      consts.set(m[1], soffset);
      out.push(`${m[1]}\tequ\t${soffset}`);
      soffset += isNaN(sz) ? 0 : sz;
      continue;
    }

    // LABEL label  (mark current offset without bumping — e.g. xxx_SIZEOF)
    m = code.match(/^LABEL\s+([A-Za-z_]\w*)\s*$/i);
    if (m) {
      consts.set(m[1], soffset);
      out.push(`${m[1]}\tequ\t${soffset}`);
      continue;
    }

    if (/^ALIGNWORD\b/i.test(code)) { soffset = (soffset + 1) & ~1; continue; }
    if (/^ALIGNLONG\b/i.test(code)) { soffset = (soffset + 3) & ~3; continue; }

    out.push(raw);
  }
  return out;
}

// ── 2. MACRO / ENDM collection ───────────────────────────────────────────

interface MacroDef { body: string[] }

function collectMacros(lines: string[]): { macros: Map<string, MacroDef>; stripped: string[] } {
  const macros = new Map<string, MacroDef>();
  const stripped: string[] = [];
  let i = 0;
  while (i < lines.length) {
    // "MACRONAME  macro" or "MACRONAME\tmacro" — name at column 0, "macro" keyword follows
    const m = lines[i].match(/^([A-Za-z_][A-Za-z0-9_]*)\s+macro(?:\s.*)?$/i);
    if (m) {
      const name = m[1].toUpperCase();
      i++;
      const body: string[] = [];
      while (i < lines.length) {
        const inner = stripComment(lines[i]);
        if (/^\s*endm\s*$/i.test(inner) || /^endm\s*$/i.test(inner)) { i++; break; }
        body.push(lines[i]);
        i++;
      }
      macros.set(name, { body });
    } else {
      stripped.push(lines[i]);
      i++;
    }
  }
  return { macros, stripped };
}

// ── 3. Macro invocation expansion ────────────────────────────────────────

function expandMacros(lines: string[], macros: Map<string, MacroDef>): string[] {
  const result: string[] = [];
  let uniqueCounter = 0;
  for (const line of lines) {
    // A macro invocation looks like: leading whitespace + MACRONAME (optionally followed by args or comment)
    // Must not look like a label definition (no ':' immediately after name).
    const m = line.match(/^(\s+)([A-Za-z_][A-Za-z0-9_]*)(\s.*)?$/);
    if (m) {
      const name = m[2].toUpperCase();
      if (macros.has(name)) {
        // Parse comma-separated args (strip any trailing comment first).
        const argStr = stripComment(m[3] ?? '').trim();
        const args = argStr.length ? splitMacroArgs(argStr) : [];
        const uniq = `_${(uniqueCounter++).toString(36)}`; // \@ unique suffix per invocation
        for (const bodyLine of macros.get(name)!.body) {
          result.push(substituteMacroArgs(bodyLine, args, uniq));
        }
        continue;
      }
    }
    result.push(line);
  }
  return result;
}

/** Split macro args on top-level commas (68k macros don't nest parens in args here). */
function splitMacroArgs(s: string): string[] {
  return s.split(',').map((a) => a.trim());
}

/** Substitute \1..\9 (positional args), \0 (size suffix — unsupported, blanked),
 *  and \@ (unique per-invocation label suffix) in a macro body line. */
function substituteMacroArgs(line: string, args: string[], uniq: string): string {
  return line
    .replace(/\\@/g, uniq)
    .replace(/\\([1-9])/g, (_full, d: string) => args[Number(d) - 1] ?? '')
    .replace(/\\0/g, '');
}

// ── 4. EQU constant expansion in displacement expressions ────────────────

/**
 * Collect all EQU / SET / `NAME = VALUE` constant definitions and substitute
 * them into complex displacement expressions that the lexer cannot parse on its
 * own (e.g. `CINTER_DEGREES/2*2-2(a0)` → `16382(a0)`).
 *
 * Only operates on arithmetic sub-expressions that precede a `(reg)` group so
 * there is zero risk of corrupting label references or immediate values.
 */
function expandEquDisplacements(lines: string[]): string[] {
  // Pass 1 — collect constants (order matters: process top-to-bottom so
  // derived constants like `c_SIZE rs.w 0` get correct values).
  const equMap = new Map<string, number>();

  for (const line of lines) {
    const code = stripComment(line).trim();
    // CINTER_DEGREES = 16384
    const m1 = code.match(/^([A-Za-z_]\w*)\s*=\s*(.+)/);
    if (m1) { const v = evalConst(m1[2], equMap); if (!isNaN(v)) equMap.set(m1[1].toUpperCase(), v); continue; }
    // NAME EQU expr  /  NAME SET expr
    const m2 = code.match(/^([A-Za-z_]\w*)\s+(?:equ|set)\s+(.+)/i);
    if (m2) { const v = evalConst(m2[2], equMap); if (!isNaN(v)) equMap.set(m2[1].toUpperCase(), v); }
  }

  if (equMap.size === 0) return lines;

  // Pass 2 — rewrite complex displacements.
  return lines.map(line => {
    // Match:  SOME_EXPR_WITH_IDENT (an)  or  SOME_EXPR_WITH_IDENT (an)+
    // The displacement part starts with an identifier and contains arithmetic ops.
    // We must NOT touch things like `label(PC)` or `label(a4)` where the displacement
    // IS the identifier with no arithmetic (the lexer already handles those).
    return line.replace(
      // IDENT followed by at least one arithmetic operator + optional digits/idents,
      // then a (register) group — e.g. CINTER_DEGREES/2*2-2(a0)
      /([A-Za-z_]\w*)([\s]*[/*+\-][\w/*+\-\s]*)(\([A-Za-z][0-9]\)[\+]?)/g,
      (match, ident, ops, regPart) => {
        const name = ident.toUpperCase();
        if (!equMap.has(name)) return match;
        const val = equMap.get(name)!;
        const expr = `${val}${ops}`;
        try {
          if (/^[\d\s+\-*/()]+$/.test(expr)) {
            const result = Math.trunc(
              (new Function(`"use strict"; return (${expr})`))() as number
            );
            return `${result}${regPart}`;
          }
        } catch { /* leave unchanged */ }
        return match;
      }
    );
  });
}

/** Evaluate a constant expression (possibly referencing earlier EQU names). */
function evalConst(expr: string, equMap: Map<string, number>): number {
  let e = expr.trim().replace(/;.*$/, '').trim();
  // Substitute known constants (longest names first to avoid partial matches)
  const names = [...equMap.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) {
    e = e.replace(new RegExp(`\\b${name}\\b`, 'gi'), equMap.get(name)!.toString());
  }
  // Convert hex ($XXXX) and binary (%BBBB) to decimal
  e = e.replace(/\$([0-9A-Fa-f]+)/g, (_, h) => parseInt(h, 16).toString());
  e = e.replace(/%([01]+)/g, (_, b) => parseInt(b, 2).toString());
  try {
    // Allow arithmetic + 68k/C bitwise operators (<< >> & | ^ ~) used in flag/size exprs.
    if (/^[\d\s+\-*/()<>&|^~]+$/.test(e)) {
      return Math.trunc((new Function(`"use strict"; return (${e})`))() as number);
    }
  } catch { /* ignore */ }
  return NaN;
}

// ── 5. Instruction byte-size estimation ──────────────────────────────────

/**
 * Returns the 68000 byte size contributed by one source line.
 * Not perfectly accurate for all instruction forms but handles the common
 * patterns (register-register, (An)/(An)+/-(An), immediate, branches).
 */
function estimateInstructionBytes(line: string): number {
  const code = stripComment(line).trim();
  if (!code) return 0;

  // Label-only line: strip the label and measure the rest (if any)
  const labelStrip = code.match(/^[A-Za-z_.][A-Za-z0-9_.]*:\s*(.*)/);
  if (labelStrip) {
    const rest = labelStrip[1].trim();
    return rest ? estimateInstructionBytes(rest) : 0;
  }

  // Directives that produce no code (assembler meta)
  if (/^(section|even|cnop|org|end|incbin|include)\b/i.test(code)) return 0;
  if (/^(rs\.|rsreset|ifd|ifnd|ifeq|ifne|endc|ifgt|iflt)\b/i.test(code)) return 0;
  if (/^[A-Za-z_][A-Za-z0-9_]*\s+(equ|set)\b/i.test(code)) return 0;
  if (/^(equ|set)\b/i.test(code)) return 0;
  if (/^c_SIZE\b/i.test(code)) return 0;

  // Data directives
  const dcMatch = code.match(/^dc\.([bwl])\s+(.+)/i);
  if (dcMatch) {
    const elem = { b: 1, w: 2, l: 4 }[dcMatch[1].toLowerCase() as 'b' | 'w' | 'l'] ?? 2;
    return elem * countCommaSeparated(dcMatch[2]);
  }
  const dcbMatch = code.match(/^dcb\.([bwl])\s+(\d+)/i);
  if (dcbMatch) {
    const elem = { b: 1, w: 2, l: 4 }[dcbMatch[1].toLowerCase() as 'b' | 'w' | 'l'] ?? 2;
    return elem * parseInt(dcbMatch[2], 10);
  }
  const dsMatch = code.match(/^ds\.([bwl])\s+(\d+)/i);
  if (dsMatch) {
    const elem = { b: 1, w: 2, l: 4 }[dsMatch[1].toLowerCase() as 'b' | 'w' | 'l'] ?? 2;
    return elem * parseInt(dsMatch[2], 10);
  }

  // Branches with explicit short suffix → 2 bytes
  if (/^b[a-z]{2,3}\.(b|s)\b/i.test(code)) return 2;
  if (/^bsr\.(b|s)\b/i.test(code)) return 2;
  // Branches with .W or no suffix → 4 bytes (word displacement)
  if (/^b(ra|eq|ne|mi|pl|cs|cc|vs|vc|gt|ge|lt|le|hi|ls)(\.w)?\b/i.test(code)) return 4;
  if (/^bsr(\.w)?\b/i.test(code)) return 4;
  // DBF / DBRA → 4 bytes
  if (/^db(f|ra)\b/i.test(code)) return 4;

  // Single-word instructions
  if (/^(rts|rte|nop|reset|illegal|trapv|rtd)\b/i.test(code)) return 2;
  if (/^(swap|ext|neg|not|tst|clr|nbcd|tas)\.(b|w|l)\s+d[0-7]\b/i.test(code)) return 2;

  // Instructions with long immediate → 6 bytes
  if (/\.l\b/.test(code) && /#/.test(code)) return 6;
  // Instructions with word immediate → 4 bytes
  if (/#/.test(code)) return 4;

  // Default: 2 bytes (most register+register, (An), (An)+, -(An) forms)
  return 2;
}

function countCommaSeparated(s: string): number {
  let count = 1, depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return count;
}

// ── 5. *+N / *-N resolution ──────────────────────────────────────────────

function resolveStarOffsets(lines: string[]): string[] {
  if (!lines.some(l => /\*[+-]\d+/.test(l))) return lines; // fast path

  // Build cumulative byte offset for each line
  const offsets: number[] = new Array(lines.length).fill(0);
  let running = 0;
  for (let i = 0; i < lines.length; i++) {
    offsets[i] = running;
    running += estimateInstructionBytes(lines[i]);
  }

  // Collect all target absolute offsets referenced by *+N / *-N
  const targetOffsets = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/\*([+-])(\d+)/g)) {
      const delta = m[1] === '+' ? parseInt(m[2], 10) : -parseInt(m[2], 10);
      targetOffsets.add(offsets[i] + delta);
    }
  }

  // Map each target absolute offset → synthetic label name
  const labelForAbsOffset = new Map<number, string>();
  for (const tgt of targetOffsets) {
    const label = `_pc_off_${tgt < 0 ? 'n' : ''}${Math.abs(tgt).toString(16).padStart(4, '0')}`;
    labelForAbsOffset.set(tgt, label);
  }

  // Find which source line each target offset lands on (first line at offset >= target)
  // and record it for label insertion.
  const insertBefore = new Map<number, string[]>(); // line index → labels to prepend
  for (const [tgt, lbl] of labelForAbsOffset) {
    // Binary-search-style scan: find the line whose offset matches tgt
    for (let i = 0; i < lines.length; i++) {
      if (offsets[i] >= tgt) {
        if (!insertBefore.has(i)) insertBefore.set(i, []);
        insertBefore.get(i)!.push(lbl);
        break;
      }
    }
  }

  // Rebuild source: insert labels and rewrite *+N operands
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    // Prepend any synthetic labels needed before this line
    if (insertBefore.has(i)) {
      for (const lbl of insertBefore.get(i)!) {
        result.push(`${lbl}:`);
      }
    }

    // Rewrite *+N and *-N in the current line to label references
    const rewritten = lines[i].replace(/\*([+-])(\d+)/g, (_, sign, n) => {
      const delta = sign === '+' ? parseInt(n, 10) : -parseInt(n, 10);
      const tgt = offsets[i] + delta;
      return labelForAbsOffset.get(tgt) ?? `_pc_off_${tgt.toString(16)}`;
    });
    result.push(rewritten);
  }

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function stripComment(line: string): string {
  return line.replace(/;.*$/, '');
}
