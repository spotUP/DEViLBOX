import type { AstNode, DataNode, Size } from './ast.js';
import type { ResolveResult } from './resolver.js';
import { emitInstruction, emitOperand, reconstructAsm } from './instr-map.js';

/* ========================================================================
 * Preamble -- emitted at the top of every generated C file.
 *
 * Provides:
 *   - 68k register file (D0-D7, A0-A6, SP, PC, flags)
 *   - Sub-register accessors W(r) and B(r) for word/byte writes
 *   - Big-endian memory access (READ/WRITE macros with byte-swap)
 *   - Post-increment and pre-decrement variants for (An)+ / -(An)
 *   - Rotation helpers ROL32/ROR32
 * ======================================================================== */

const PREAMBLE = `\
#include "paula_soft.h"
#include <stdint.h>

/* -- 68k Register File ------------------------------------------------
 * Data registers D0-D7:  general-purpose 32-bit registers.
 * Address registers A0-A6: pointer registers (32-bit).
 * SP (A7): stack pointer.  PC: program counter (unused in transpiled code).
 * Flags: Z (zero), N (negative), C (carry), V (overflow), X (extend).
 * -------------------------------------------------------------------- */
static uint32_t d0,d1,d2,d3,d4,d5,d6,d7;
static uint32_t a0,a1,a2,a3,a4,a5,a6,sp,pc;
#define a7 sp  /* A7 is the stack pointer */
static int flag_z=0, flag_n=0, flag_c=0, flag_v=0, flag_x=0;
static uint16_t ccr = 0;  /* condition code register (for MOVE SR/CCR) */
static uint16_t sr = 0;   /* status register (interrupt mask bits etc.) */

/* -- Sub-register Accessors -------------------------------------------
 * W(d0) -- access the low 16 bits of d0 (read/write).
 * B(d0) -- access the low 8 bits of d0 (read/write).
 * Example: W(d0) = 0x1234;  // sets d0.w, leaves upper 16 bits unchanged
 * -------------------------------------------------------------------- */
#define W(r)  (*((uint16_t*)&(r)))
#define B(r)  (*((uint8_t*)&(r)))

/* -- Memory Access (Big-Endian) ---------------------------------------
 * The 68k is big-endian; these macros byte-swap on little-endian hosts.
 * Uses memcpy for alignment-safe access (68k allows unaligned word/long).
 *
 * READ8(addr)       -- read  byte from address
 * READ16(addr)      -- read  big-endian word from address
 * READ32(addr)      -- read  big-endian longword from address
 * WRITE8(addr,v)    -- write byte to address
 * WRITE16(addr,v)   -- write big-endian word to address
 * WRITE32(addr,v)   -- write big-endian longword to address
 * READ16_POST(reg)  -- read word, then reg += 2  (simulates (An)+ mode)
 * WRITE16_PRE(reg,v)-- reg -= 2, then write word (simulates -(An) mode)
 * -------------------------------------------------------------------- */
#include <string.h>
#define READ8(addr)   (*((const uint8_t*)(uintptr_t)(addr)))
#define WRITE8(addr,v)  (*((uint8_t*)(uintptr_t)(addr)) = (uint8_t)(v))
static inline uint16_t _rd16(uintptr_t a) { uint16_t v; memcpy(&v,(void*)a,2); return v; }
static inline uint32_t _rd32(uintptr_t a) { uint32_t v; memcpy(&v,(void*)a,4); return v; }
static inline void _wr16(uintptr_t a,uint16_t v) { memcpy((void*)a,&v,2); }
static inline void _wr32(uintptr_t a,uint32_t v) { memcpy((void*)a,&v,4); }
#if defined(__BYTE_ORDER__) && __BYTE_ORDER__ == __ORDER_BIG_ENDIAN__
#define READ16(addr)  _rd16((uintptr_t)(addr))
#define READ32(addr)  _rd32((uintptr_t)(addr))
#define WRITE16(addr,v) _wr16((uintptr_t)(addr),(uint16_t)(v))
#define WRITE32(addr,v) _wr32((uintptr_t)(addr),(uint32_t)(v))
#else
#define READ16(addr)  __builtin_bswap16(_rd16((uintptr_t)(addr)))
#define READ32(addr)  __builtin_bswap32(_rd32((uintptr_t)(addr)))
#define WRITE16(addr,v) _wr16((uintptr_t)(addr),__builtin_bswap16((uint16_t)(v)))
#define WRITE32(addr,v) _wr32((uintptr_t)(addr),__builtin_bswap32((uint32_t)(v)))
#endif
#define READ8_POST(r)   ({ uint32_t _r=(r); (r)+=1; READ8(_r); })
#define READ16_POST(r)  ({ uint32_t _r=(r); (r)+=2; READ16(_r); })
#define READ32_POST(r)  ({ uint32_t _r=(r); (r)+=4; READ32(_r); })
#define READ8_PRE(r)    ({ (r)-=1; READ8(r); })
#define READ16_PRE(r)   ({ (r)-=2; READ16(r); })
#define READ32_PRE(r)   ({ (r)-=4; READ32(r); })
#define WRITE8_POST(r,v)  ({ WRITE8(r,v);  (r)+=1; })
#define WRITE16_POST(r,v) ({ WRITE16(r,v); (r)+=2; })
#define WRITE32_POST(r,v) ({ WRITE32(r,v); (r)+=4; })
#define WRITE8_PRE(r,v)   ({ (r)-=1; WRITE8(r,v); })
#define WRITE16_PRE(r,v)  ({ (r)-=2; WRITE16(r,v); })
#define WRITE32_PRE(r,v)  ({ (r)-=4; WRITE32(r,v); })

/* -- Rotation Helpers -------------------------------------------------
 * ROL32(v,n) -- rotate 32-bit value left by n bits
 * ROR32(v,n) -- rotate 32-bit value right by n bits
 * -------------------------------------------------------------------- */
#define ROL32(v,n)  (((v)<<(n))|((v)>>(32-(n))))
#define ROR32(v,n)  (((v)>>(n))|((v)<<(32-(n))))

/* -- Hardware Write Interception --------------------------------------
 * Many 68k replayers load $DFF000 into a register and then write to
 * channel offsets (e.g. MOVE.W d0,$A8(a0) for volume on channel 0).
 * These runtime checks intercept writes to the Paula/DMACON address
 * range and route them to the paula_soft API instead of memory.
 * -------------------------------------------------------------------- */
static inline void hw_write8(uint32_t addr, uint8_t val) {
  if (addr >= 0xDFF000 && addr < 0xE00000) return; /* ignore byte writes to custom chips */
  WRITE8(addr, val);
}
static inline void hw_write16(uint32_t addr, uint16_t val) {
  if (addr >= 0xDFF0A0 && addr <= 0xDFF0DF) {
    int ch = (addr - 0xDFF0A0) >> 4;
    int reg = (addr & 0x0F);
    switch (reg) {
      case 0x06: paula_set_period(ch, val); return;
      case 0x08: paula_set_volume(ch, (uint8_t)val); return;
      case 0x04: paula_set_length(ch, val); return;
      default: return; /* AUDxDAT or unknown */
    }
  }
  if (addr == 0xDFF096) { paula_dma_write(val); return; }
  if (addr >= 0xDFF000 && addr < 0xE00000) return; /* other custom chip writes */
  if (addr >= 0xBF0000 && addr < 0xC00000) return; /* CIA writes */
  WRITE16(addr, val);
}
static inline void hw_write32(uint32_t addr, uint32_t val) {
  if (addr >= 0xDFF0A0 && addr <= 0xDFF0DF) {
    int ch = (addr - 0xDFF0A0) >> 4;
    int reg = (addr & 0x0F);
    if (reg == 0x00) { paula_set_sample_ptr(ch, (const int8_t*)(uintptr_t)val); return; }
  }
  if (addr >= 0xDFF000 && addr < 0xE00000) {
    /* Fallback: treat as two word writes (big-endian high word first) */
    hw_write16(addr, (uint16_t)(val >> 16));
    hw_write16(addr + 2, (uint16_t)val);
    return;
  }
  if (addr >= 0xBF0000 && addr < 0xC00000) return; /* CIA writes */
  WRITE32(addr, val);
}
`;

const C_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Sanitize 68k local labels (e.g. '.SetVoice') to valid C identifiers.
const C_KEYWORDS = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
  'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
  'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while',
  // Common C library names that clash
  'inline', 'restrict', 'asm', 'bool', 'true', 'false', 'NULL',
]);

function sanitizeLabel(name: string): string {
  let safe = name.startsWith('.') ? '_' + name.slice(1) : name;
  // Escape C keywords by prefixing with underscore
  if (C_KEYWORDS.has(safe)) safe = '_' + safe;
  return safe;
}

function emitData(node: DataNode, label: string | undefined, knownLabels: Set<string>): string {
  const typeStr: Record<string, string> = { B: 'uint8_t', W: 'uint16_t', L: 'uint32_t', S: 'uint16_t' };
  const t = typeStr[node.size ?? 'B'] ?? 'uint8_t';
  const name = label ?? `_data_${node.line}`;

  // DS (Define Storage) -- reserve N bytes/words/longs of zero-initialized writable memory.
  // The single value is the element COUNT, not a content value.
  if (node.directive === 'DS') {
    const count = typeof node.values[0] === 'number' ? node.values[0] : 1;
    return `static ${t} ${name}[${count}];`;
  }

  // DC (Define Constant) -- emit initializer list.
  // For DC.B, expand string literals to individual character bytes to avoid
  // "excess elements in char array initializer" warnings.
  const isBytes = node.size === 'B' || node.size === null;
  const vals: string[] = [];
  for (const v of node.values) {
    if (typeof v === 'string') {
      if (C_IDENT.test(v)) {
        // Label address → emit as 0 (can't be a compile-time integer constant).
        vals.push(knownLabels.has(v) ? `0 /* ${v} */` : v);
      } else if (isBytes) {
        // String literal in DC.B → expand to individual char byte values.
        for (const c of v) vals.push(`0x${c.charCodeAt(0).toString(16)}`);
      } else {
        vals.push(`"${v}"`);
      }
    } else {
      vals.push(`0x${v.toString(16)}`);
    }
  }
  return `static ${t} ${name}[] = { ${vals.join(', ')} };`;
}

/* ========================================================================
 * Packed data section -- emits all data labels into a single contiguous
 * uint8_t array with big-endian byte values, matching 68k memory layout.
 * This guarantees correct relative addressing between data symbols.
 * ======================================================================== */
interface PackedEntry {
  label: string | undefined;
  offset: number;
  node: DataNode;
}

function sizeBytes(s: Size): number {
  if (s === 'W' || s === 'S') return 2;
  if (s === 'L') return 4;
  return 1;
}

function collectPackedData(
  ast: AstNode[],
  isFunctionLabel: Set<string>,
  knownLabels: Set<string>,
  symbols: Map<string, number | string>
): { entries: PackedEntry[]; bytes: number[]; labelOffsets: Map<string, { offset: number; cType: string }>; labelPatches: { offset: number; targetLabel: string; elemSize: number }[] } {
  const entries: PackedEntry[] = [];
  const bytes: number[] = [];
  const labelOffsets = new Map<string, { offset: number; cType: string }>();
  const labelPatches: { offset: number; targetLabel: string; elemSize: number }[] = [];
  const typeStr: Record<string, string> = { B: 'uint8_t', W: 'uint16_t', L: 'uint32_t', S: 'uint16_t' };

  let pendingLabel: string | undefined;

  for (const node of ast) {
    if (node.kind === 'label') {
      if (!isFunctionLabel.has(node.name)) {
        pendingLabel = node.name;
      } else {
        pendingLabel = undefined;
      }
    } else if (node.kind === 'data') {
      const dn = node as DataNode;
      const elemSize = sizeBytes(dn.size);
      const cType = typeStr[dn.size ?? 'B'] ?? 'uint8_t';

      // Align to even address for W/L (68k requires word alignment)
      if (elemSize >= 2 && (bytes.length & 1)) bytes.push(0);

      const offset = bytes.length;
      const label = pendingLabel;
      entries.push({ label, offset, node: dn });
      if (label) labelOffsets.set(label, { offset, cType });

      if (dn.directive === 'DS') {
        // Zero-initialized storage
        const count = typeof dn.values[0] === 'number' ? dn.values[0] : 1;
        for (let j = 0; j < count * elemSize; j++) bytes.push(0);
      } else {
        // DC values -- store in big-endian byte order
        for (const v of dn.values) {
          if (typeof v === 'number') {
            if (elemSize === 1) {
              bytes.push(v & 0xFF);
            } else if (elemSize === 2) {
              bytes.push((v >> 8) & 0xFF, v & 0xFF);
            } else {
              bytes.push((v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);
            }
          } else if (typeof v === 'string') {
            if (C_IDENT.test(v)) {
              // Label or symbol reference -- resolve if possible, otherwise 0
              const resolved = symbols.get(v);
              const numVal = typeof resolved === 'number' ? resolved : 0;
              // Track label references that need runtime patching (address not known at compile time)
              if (typeof resolved !== 'number' && knownLabels.has(v)) {
                labelPatches.push({ offset: bytes.length, targetLabel: v, elemSize });
              }
              if (elemSize === 1) {
                bytes.push(numVal & 0xFF);
              } else if (elemSize === 2) {
                bytes.push((numVal >> 8) & 0xFF, numVal & 0xFF);
              } else {
                bytes.push((numVal >> 24) & 0xFF, (numVal >> 16) & 0xFF, (numVal >> 8) & 0xFF, numVal & 0xFF);
              }
            } else {
              // String literal in DC.B
              for (const c of v) bytes.push(c.charCodeAt(0));
            }
          }
        }
      }
      pendingLabel = undefined;
    } else if (node.kind !== 'comment') {
      pendingLabel = undefined;
    }
  }

  return { entries, bytes, labelOffsets, labelPatches };
}

function emitPackedDataSection(
  bytes: number[],
  labelOffsets: Map<string, { offset: number; cType: string }>,
  labelPatches: { offset: number; targetLabel: string; elemSize: number }[],
  isFunctionLabel: Set<string>
): string[] {
  const lines: string[] = [];
  if (bytes.length === 0) return lines;

  lines.push('/* -- Packed Data Section -------------------------------------------- */');
  lines.push('/* All data labels packed into a single contiguous byte array matching');
  lines.push(' * 68k memory layout. Accessor macros provide typed pointer access. */');
  // Emit the byte array in rows of 16
  lines.push(`static uint8_t _ds[${bytes.length}] = {`);
  for (let i = 0; i < bytes.length; i += 16) {
    const row = bytes.slice(i, Math.min(i + 16, bytes.length));
    const hex = row.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(',');
    // Find any labels at offsets in this row for a comment
    const labels: string[] = [];
    for (const [name, info] of labelOffsets) {
      if (info.offset >= i && info.offset < i + 16) {
        labels.push(`${name}@${info.offset}`);
      }
    }
    const comment = labels.length > 0 ? ` /* ${labels.join(', ')} */` : '';
    lines.push(`  ${hex},${comment}`);
  }
  lines.push('};');

  // Emit accessor macros for labeled entries
  for (const [name, info] of labelOffsets) {
    lines.push(`#define ${name} ((${info.cType}*)(_ds + ${info.offset}))`);
  }
  lines.push('');

  // _ds_init lines are returned separately to be emitted at end of file
  // (after all function definitions are available for forward references)
  return lines;
}

function emitDsInit(
  labelPatches: { offset: number; targetLabel: string; elemSize: number }[],
  isFunctionLabel: Set<string>,
  labelOffsets: Map<string, { offset: number; cType: string }>,
  funcLabels: Set<string>
): string[] {
  // Filter to only patches we can actually resolve: labels that are either
  // defined as C functions or exist as data labels in the _ds array.
  // Skip unresolvable references.
  const patches = labelPatches.filter(p => {
    // Data labels in _ds are already accessible as pointer macros
    if (labelOffsets.has(p.targetLabel)) return true;
    // Function labels with actual definitions
    if (funcLabels.has(p.targetLabel)) return true;
    return false;
  });
  if (patches.length === 0) return [];
  const lines: string[] = [];
  lines.push('/* Patch DC.L label references with runtime addresses */');
  lines.push('static void _ds_init(void) {');
  for (const p of patches) {
    const target = p.targetLabel;
    if (p.elemSize === 4) {
      lines.push(`  WRITE32((uintptr_t)(_ds + ${p.offset}), (uint32_t)(uintptr_t)${target});`);
    } else if (p.elemSize === 2) {
      lines.push(`  WRITE16((uintptr_t)(_ds + ${p.offset}), (uint16_t)(uintptr_t)${target});`);
    }
  }
  lines.push('}');
  lines.push('');
  return lines;
}

/** Resolve dc.w offset jump table targets for a JMP label(PC,Dn) instruction.
 *  Scans AST for dc.w entries after the table label and extracts target names. */
function resolveJumpTableTargets(ast: AstNode[], tableLabel: string): string[] {
  const targets: string[] = [];
  let inTable = false;
  for (const n of ast) {
    if (n.kind === 'label' && n.name === tableLabel) { inTable = true; continue; }
    if (inTable) {
      if (n.kind === 'data' && n.directive === 'DC' && n.size === 'W') {
        for (const v of n.values) {
          const vstr = String(v);
          const dashIdx = vstr.indexOf('-');
          if (dashIdx > 0) {
            targets.push(vstr.slice(0, dashIdx));
          }
        }
      } else if (n.kind === 'label' || (n.kind === 'data' && !(n.directive === 'DC' && n.size === 'W'))) {
        break;
      }
    }
  }
  return targets;
}

/** Collect every string-valued operand reference that is not already a known symbol or label.
 *  These come from include files not available to the transpiler; emit as zero-valued stubs
 *  so the generated C compiles (values are wrong but the structure is correct). */
function collectUnresolved(ast: AstNode[], resolved: ResolveResult): Set<string> {
  // known: symbols (EQU), labels (functions/data), exports
  const known = new Set([...resolved.symbols.keys(), ...resolved.labels, ...resolved.exports]);
  const stubs = new Set<string>();
  const validIdent = /^[A-Za-z_][A-Za-z0-9_]*$/;

  // Check a string that may be a simple ident or a compound expression (A+B-C).
  // Stub each unknown identifier part individually.
  const checkAndStub = (s: string) => {
    if (validIdent.test(s)) {
      if (!known.has(s)) stubs.add(s);
    } else {
      // Split compound expression on +/- and check each identifier part
      const parts = s.split(/[+\-]/);
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed && validIdent.test(trimmed) && !known.has(trimmed)) {
          stubs.add(trimmed);
        }
      }
    }
  };

  for (const node of ast) {
    if (node.kind === 'instruction') {
      for (const op of node.operands) {
        if (op.kind === 'label_ref') checkAndStub(op.name);
        if (op.kind === 'pc_rel') checkAndStub(op.label);
        if (op.kind === 'disp' && typeof op.offset === 'string') checkAndStub(op.offset);
        if (op.kind === 'immediate' && op.raw.startsWith('#') && !op.raw.slice(1).match(/^[\$%0-9-]/)) {
          checkAndStub(op.raw.slice(1));
        }
      }
    }
    if (node.kind === 'data') {
      for (const v of node.values) {
        if (typeof v === 'string') checkAndStub(v);
      }
    }
  }
  return stubs;
}

export function emit(ast: AstNode[], resolved: ResolveResult, sourceFile?: string): string {
  // ── Case-normalization pass ─────────────────────────────────────────────
  // The 68k assembler is case-insensitive, but C is not.  Build a map from
  // lowercase label/symbol name → actual casing as defined, then rewrite all
  // operand references to match the definition casing.
  {
    const ciMap = new Map<string, string>();
    for (const name of resolved.labels) ciMap.set(name.toLowerCase(), name);
    for (const name of resolved.symbols.keys()) ciMap.set(name.toLowerCase(), name);

    for (const node of ast) {
      if (node.kind !== 'instruction') continue;
      for (const op of node.operands) {
        if (op.kind === 'label_ref') {
          const canon = ciMap.get(op.name.toLowerCase());
          if (canon && canon !== op.name) op.name = canon;
        }
        if (op.kind === 'pc_rel') {
          const canon = ciMap.get(op.label.toLowerCase());
          if (canon && canon !== op.label) op.label = canon;
        }
      }
    }
  }

  const lines: string[] = [];

  // File header
  lines.push('/* ====================================================================');
  lines.push(' * Auto-generated by asm68k-to-c transpiler');
  if (sourceFile) lines.push(` * Source: ${sourceFile}`);
  lines.push(' *');
  lines.push(' * This file was mechanically translated from Motorola 68000 assembly.');
  lines.push(' * Original ASM instructions appear as inline comments.');
  lines.push(' * ==================================================================== */');
  lines.push('');
  lines.push(PREAMBLE);

  // EQU constants as #defines, grouped by prefix
  if (resolved.symbols.size > 0) {
    lines.push('/* -- EQU Constants ------------------------------------------------- */');
    // Group by common prefix (DTP_, EP_, MI_, UPS_, etc.)
    const groups = new Map<string, [string, number | string][]>();
    for (const [name, value] of resolved.symbols) {
      const m = name.match(/^([A-Za-z]+_)/);
      const prefix = m ? m[1] : '_other';
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix)!.push([name, value]);
    }
    for (const [prefix, entries] of groups) {
      if (groups.size > 1 && entries.length > 1) {
        lines.push(`/* ${prefix}* */`);
      }
      for (const [name, value] of entries) {
        lines.push(`#define ${name} ${value}`);
      }
    }
    lines.push('');
  }

  // Unresolved symbol stubs (from missing include files)
  const stubs = collectUnresolved(ast, resolved);
  // Split stubs: BSR/JSR targets become no-op function stubs, rest become #define 0.
  const callTargets = new Set<string>();
  for (const node of ast) {
    if (node.kind !== 'instruction') continue;
    if (node.mnemonic !== 'BSR' && node.mnemonic !== 'JSR') continue;
    const t = node.operands[0];
    if (t?.kind === 'label_ref' && stubs.has(t.name)) callTargets.add(t.name);
    if (t?.kind === 'pc_rel' && stubs.has(t.label)) callTargets.add(t.label);
  }
  const valueStubs = new Set([...stubs].filter(n => !callTargets.has(n)));
  if (valueStubs.size > 0 || callTargets.size > 0) {
    lines.push('/* -- Unresolved Symbols -------------------------------------------- */');
    lines.push('/* These symbols come from include files not available to the transpiler. */');
    // Function stubs (BSR/JSR targets)
    for (const name of callTargets) {
      lines.push(`static inline void ${name}(void) {} /* unresolved BSR target — no-op */`);
    }
    // Value stubs
    const stubGroups = new Map<string, string[]>();
    for (const name of valueStubs) {
      const m = name.match(/^([A-Za-z]+_)/);
      const prefix = m ? m[1] : '_other';
      if (!stubGroups.has(prefix)) stubGroups.set(prefix, []);
      stubGroups.get(prefix)!.push(name);
    }
    for (const [prefix, names] of stubGroups) {
      if (stubGroups.size > 1 && names.length > 1) {
        lines.push(`/* ${prefix}* */`);
      }
      for (const name of names) {
        lines.push(`#ifndef ${name}\n#define ${name} 0\n#endif`);
      }
    }
    lines.push('');
  }

  // Pre-classify every label as a function label (followed by instruction) or data label.
  // Only function labels can become C functions; data labels become array names.
  const isFunctionLabel = new Set<string>();
  for (let i = 0; i < ast.length; i++) {
    if (ast[i].kind !== 'label') continue;
    let nextIdx = i + 1;
    while (nextIdx < ast.length && ast[nextIdx].kind === 'comment') nextIdx++;
    const nxt = ast[nextIdx];
    if (nxt?.kind === 'instruction' || nxt?.kind === 'label') {
      isFunctionLabel.add((ast[i] as { kind: 'label'; name: string }).name);
    }
  }

  // Pre-scan: collect data label → { type, directive, count } for forward declarations.
  // Data labels defined after they're referenced in code (LEA, etc.) need a
  // forward declaration so the generated C compiles without reordering.
  const dataLabelInfo = new Map<string, { type: string; directive: string; count: number }>();
  {
    const typeStr: Record<string, string> = { B: 'uint8_t', W: 'uint16_t', L: 'uint32_t', S: 'uint16_t' };
    let pendingLbl: string | undefined;
    for (const node of ast) {
      if (node.kind === 'label') {
        pendingLbl = node.name;
      } else if (node.kind === 'data' && pendingLbl) {
        const dn = node as DataNode;
        const type = typeStr[dn.size ?? 'B'] ?? 'uint8_t';
        const count = dn.directive === 'DS'
          ? (typeof dn.values[0] === 'number' ? dn.values[0] : 1)
          : dn.values.length;
        dataLabelInfo.set(pendingLbl, { type, directive: dn.directive, count });
        pendingLbl = undefined;
      } else if (node.kind !== 'comment') {
        pendingLbl = undefined;
      }
    }
  }
  // Build packed data section: all data entries in a single contiguous byte array.
  // This guarantees correct relative addressing between data symbols (68k layout).
  const packed = collectPackedData(ast, isFunctionLabel, resolved.labels, resolved.symbols);
  const packedLabels = packed.labelOffsets;  // Map<name, { offset, cType }>
  lines.push(...emitPackedDataSection(packed.bytes, packed.labelOffsets, packed.labelPatches, isFunctionLabel));

  // Labels that start real C functions: BSR/JSR call targets + XDEF exports.
  // Exports are entry points that external code calls directly -- they must be functions.
  const funcLabels = new Set<string>();
  for (const name of resolved.exports) {
    if (isFunctionLabel.has(name)) funcLabels.add(name);
  }
  for (const node of ast) {
    if (node.kind !== 'instruction') continue;
    if (node.mnemonic !== 'BSR' && node.mnemonic !== 'JSR') continue;
    const t = node.operands[0];
    if (t?.kind === 'label_ref' && isFunctionLabel.has(t.name)) funcLabels.add(t.name);
    if (t?.kind === 'pc_rel'    && isFunctionLabel.has(t.label)) funcLabels.add(t.label);
  }

  // Any instruction that loads a function label's address (LEA, MOVEA, MOVE) also
  // requires the label to be a real C function so `fn` (decay to pointer) works.
  const addrRefLabels = new Set<string>();
  const ADDR_REF_MNEMONICS = new Set(['LEA', 'MOVEA', 'MOVE']);
  for (const node of ast) {
    if (node.kind !== 'instruction') continue;
    if (!ADDR_REF_MNEMONICS.has(node.mnemonic)) continue;
    for (const t of node.operands) {
      if (t.kind === 'label_ref' && isFunctionLabel.has(t.name) && !funcLabels.has(t.name)) {
        addrRefLabels.add(t.name);
        funcLabels.add(t.name);  // promote to full C function
      }
      if (t.kind === 'pc_rel'    && isFunctionLabel.has(t.label) && !funcLabels.has(t.label)) {
        addrRefLabels.add(t.label);
        funcLabels.add(t.label);  // promote to full C function
      }
      // #label (immediate address) also takes the address of a code label
      if (t.kind === 'immediate' && Number.isNaN(t.value)) {
        const name = t.raw.startsWith('#') ? t.raw.slice(1) : t.raw;
        if (isFunctionLabel.has(name) && !funcLabels.has(name)) {
          addrRefLabels.add(name);
          funcLabels.add(name);
        }
      }
    }
  }

  // Pre-pass: simulate the emitter's function boundary logic to find labels that
  // will start functions due to !inFunction (after data/section nodes or after RTS).
  // These implicit function entries must be in funcLabels for cross-function goto detection.
  {
    let simInFunc = false;
    for (let i = 0; i < ast.length; i++) {
      const node = ast[i];
      if (node.kind === 'data' || node.kind === 'section') {
        simInFunc = false;
        continue;
      }
      // After RTS or tail-call return, the function closes → next label starts a new function
      if (node.kind === 'instruction') {
        const mn = node.mnemonic.toUpperCase();
        if (mn === 'RTS') {
          // Peek ahead for label
          let peekIdx = i + 1;
          while (peekIdx < ast.length && ast[peekIdx].kind === 'comment') peekIdx++;
          if (peekIdx < ast.length && ast[peekIdx].kind === 'label') {
            simInFunc = false;  // function closed after RTS
          }
        }
        // Tail calls: BRA/JMP to a function label that emits "return;"
        if ((mn === 'BRA' || mn === 'JMP') && 'label' in (node.operands[0] ?? {}) && (node.operands[0] as any).label) {
          const target = (node.operands[0] as any).label as string;
          if (funcLabels.has(target)) {
            let peekIdx = i + 1;
            while (peekIdx < ast.length && ast[peekIdx].kind === 'comment') peekIdx++;
            if (peekIdx < ast.length && ast[peekIdx].kind === 'label') {
              simInFunc = false;  // function closed after tail call
            }
          }
        }
        simInFunc = true;
      }
      if (node.kind === 'label' && isFunctionLabel.has(node.name)) {
        if (!simInFunc && !funcLabels.has(node.name)) {
          // This label will start a function due to !inFunction
          funcLabels.add(node.name);
        }
        simInFunc = true;
      }
    }
  }

  // Detect cross-function goto targets: branch instructions in one C-function scope that
  // target a label defined in a DIFFERENT C-function scope.  These cannot use C `goto`
  // (which requires the label to be in the same function), so we promote the target label
  // to its own C function and replace `goto X` with `X(); return;` at each use site.
  //
  // We iterate until fixed-point because promoting a label to a function may create new
  // scope boundaries that expose additional cross-function gotos.
  const crossFuncGotos = new Set<string>();
  const BRANCH_MNEMS  = new Set(['BRA','JMP','BEQ','BNE','BMI','BPL','BCS','BCC',
                                  'BVS','BVC','BGT','BGE','BLT','BLE','BHI','BLS']);
  const DBRANCH_MNEMS = new Set(['DBRA','DBF','DBEQ','DBNE']);

  let cfgChanged = true;
  while (cfgChanged) {
    cfgChanged = false;

    // Helper: run a scope-tracking pass over the AST, returning label→scope map.
    // Accounts for RTS-close and indirect JMP boundaries.
    function buildLabelScope(): Map<string, string | null> {
      const ls = new Map<string, string | null>();
      let sc: string | null = null;
      let lwr = false;
      for (let si = 0; si < ast.length; si++) {
        const node = ast[si];
        if (node.kind === 'comment') continue;
        if (node.kind === 'data' || node.kind === 'section') { sc = null; lwr = false; continue; }
        if (node.kind === 'label') {
          if (funcLabels.has(node.name) || lwr) {
            if (!funcLabels.has(node.name) && lwr && isFunctionLabel.has(node.name)) {
              funcLabels.add(node.name);
              cfgChanged = true;
            }
            sc = node.name;
          } else {
            ls.set(node.name, sc);
          }
          lwr = false;
          continue;
        }
        if (node.kind === 'instruction') {
          const mn = node.mnemonic.toUpperCase();
          if (mn === 'RTS') {
            let pi = si + 1;
            while (pi < ast.length && ast[pi].kind === 'comment') pi++;
            lwr = pi < ast.length && ast[pi].kind === 'label';
          } else if (mn === 'BRA' || mn === 'JMP') {
            const op0 = node.operands[0];
            const isIndirect = op0?.kind === 'address';
            const tgtLabel = op0?.kind === 'label_ref' ? op0.name : op0?.kind === 'pc_rel' ? op0.label : null;
            const isToFunc = tgtLabel && (funcLabels.has(tgtLabel) || crossFuncGotos.has(tgtLabel));
            if (isIndirect || isToFunc) {
              let pi = si + 1;
              while (pi < ast.length && ast[pi].kind === 'comment') pi++;
              lwr = pi < ast.length && ast[pi].kind === 'label';
            } else { lwr = false; }
          } else { lwr = false; }
        }
      }
      return ls;
    }

    // Pass 1: Build label→scope map (full forward pass so all labels are mapped)
    const labelScope = buildLabelScope();

    // Pass 2: Scan all branches, using the COMPLETE labelScope for cross-function detection
    let scope: string | null = null;
    let lastWasReturn = false;
    for (let si = 0; si < ast.length; si++) {
      const node = ast[si];
      if (node.kind === 'comment') continue;
      if (node.kind === 'data' || node.kind === 'section') { scope = null; lastWasReturn = false; continue; }
      if (node.kind === 'label') {
        if (funcLabels.has(node.name) || lastWasReturn) { scope = node.name; }
        lastWasReturn = false;
        continue;
      }
      if (node.kind === 'instruction') {
        const mn = node.mnemonic.toUpperCase();
        if (mn === 'RTS') {
          let pi = si + 1;
          while (pi < ast.length && ast[pi].kind === 'comment') pi++;
          lastWasReturn = pi < ast.length && ast[pi].kind === 'label';
        } else if (mn === 'BRA' || mn === 'JMP') {
          const op0 = node.operands[0];
          const isIndirect = op0?.kind === 'address';
          const tgtLabel = op0?.kind === 'label_ref' ? op0.name : op0?.kind === 'pc_rel' ? op0.label : null;
          const isToFunc = tgtLabel && (funcLabels.has(tgtLabel) || crossFuncGotos.has(tgtLabel));
          if (isIndirect || isToFunc) {
            let pi = si + 1;
            while (pi < ast.length && ast[pi].kind === 'comment') pi++;
            lastWasReturn = pi < ast.length && ast[pi].kind === 'label';
          } else { lastWasReturn = false; }
        } else { lastWasReturn = false; }
      }
      if (node.kind !== 'instruction') continue;
      // Pick the operand that holds the branch target label.
      let targetOp = BRANCH_MNEMS.has(node.mnemonic)  ? node.operands[0]
                   : DBRANCH_MNEMS.has(node.mnemonic) ? node.operands[1]
                   : undefined;
      const lbl = targetOp?.kind === 'label_ref' ? targetOp.name
                : targetOp?.kind === 'pc_rel'    ? targetOp.label
                : null;
      if (!lbl) continue;
      // Local labels (starting with '.') are scoped per global label in 68k.
      // Multiple functions can have a '.SetVoice' and each one is a different label.
      // Promoting local labels to cross-function C functions causes duplicate definitions.
      // Skip them ONLY if the label name appears more than once in the file.
      if (lbl.startsWith('.')) {
        const count = ast.filter(n => n.kind === 'label' && n.name === lbl).length;
        if (count > 1) continue;
      }

      // Case 1: Branch to a non-function label in a different function scope.
      // Only promote labels that are code labels (in isFunctionLabel).
      // Data labels (dc.w, dc.l, etc.) cannot become functions.
      if (labelScope.has(lbl)) {
        if (labelScope.get(lbl) !== scope && !crossFuncGotos.has(lbl) && isFunctionLabel.has(lbl)) {
          crossFuncGotos.add(lbl);
          funcLabels.add(lbl);   // promote to its own C function
          cfgChanged = true;
        }
      }
      // Case 2: Branch to a label that's already a function (funcLabels).
      // If it's not the CURRENT function, it's a cross-function goto → must be a call.
      else if (funcLabels.has(lbl) && lbl !== scope && !crossFuncGotos.has(lbl)) {
        crossFuncGotos.add(lbl);
        cfgChanged = true;
      }

      // Case 3: JMP label(PC,Dn.W) — indexed jump through dc.w offset table.
      // The table entries target labels that may be in other function scopes.
      if (node.mnemonic === 'JMP' && node.operands[0]?.kind === 'pc_rel' &&
          (node.operands[0] as any).index && !isFunctionLabel.has(node.operands[0].label)) {
        const jtTargets = resolveJumpTableTargets(ast, node.operands[0].label);
        for (const t of jtTargets) {
          if (labelScope.has(t) && labelScope.get(t) !== scope && !crossFuncGotos.has(t) && isFunctionLabel.has(t)) {
            crossFuncGotos.add(t);
            funcLabels.add(t);
            cfgChanged = true;
          } else if (funcLabels.has(t) && t !== scope && !crossFuncGotos.has(t)) {
            crossFuncGotos.add(t);
            cfgChanged = true;
          }
        }
      }
    }
  }

  // Post-fixpoint pass: simulate the EXACT emission logic to find labels that will
  // become functions due to !inFunction after data/section or other emission-only splits.
  // Any goto to such a label from a different emission-function is a cross-function goto.
  {
    let simInFunc = false;
    let simScope: string | null = null;
    const emitLabelScope = new Map<string, string | null>();
    for (let i = 0; i < ast.length; i++) {
      const node = ast[i];
      if (node.kind === 'comment') continue;
      if (node.kind === 'data' || node.kind === 'section') { simInFunc = false; simScope = null; continue; }
      if (node.kind === 'label') {
        let nextIdx = i + 1;
        while (nextIdx < ast.length && ast[nextIdx].kind === 'comment') nextIdx++;
        const next = ast[nextIdx];
        if (next?.kind === 'instruction' || next?.kind === 'label') {
          const willStartFunc = funcLabels.has(node.name) || !simInFunc;
          if (willStartFunc) {
            simScope = node.name;
            simInFunc = true;
            // Promote to funcLabels if not already there
            if (!funcLabels.has(node.name) && isFunctionLabel.has(node.name)) {
              funcLabels.add(node.name);
            }
          } else {
            emitLabelScope.set(node.name, simScope);
          }
        }
        continue;
      }
      if (node.kind === 'instruction') {
        if (!simInFunc) simInFunc = true;
        const mn = node.mnemonic.toUpperCase();
        // Mirror emission close logic
        const closesFunc = mn === 'RTS'
          || (mn === 'JMP' && node.operands[0]?.kind === 'address')
          || (emitInstruction(node).includes('return;'));
        if (closesFunc) {
          let pi = i + 1;
          while (pi < ast.length && ast[pi].kind === 'comment') pi++;
          if (pi < ast.length && ast[pi].kind === 'label') simInFunc = false;
        }
      }
    }
    // Check all branches against the emission-accurate scope
    for (const node of ast) {
      if (node.kind !== 'instruction') continue;
      const mn = node.mnemonic.toUpperCase();
      const op = BRANCH_MNEMS.has(mn) ? node.operands[0]
               : DBRANCH_MNEMS.has(mn) ? node.operands[1]
               : undefined;
      const lbl = op?.kind === 'label_ref' ? op.name : op?.kind === 'pc_rel' ? op.label : null;
      if (!lbl || crossFuncGotos.has(lbl)) continue;
      if (emitLabelScope.has(lbl)) {
        // Label is inline in a function — check if it moved to a different function in emission
        if (funcLabels.has(lbl)) {
          // Was inline, now a function — all gotos from other functions are cross-function
          crossFuncGotos.add(lbl);
        }
      }
    }
  }

  // Orphan labels: labels in the ASM that are referenced but have no C definition.
  // These typically come from INCBIN directives (external binary data includes) that
  // the transpiler skips.  Emit as uint8_t* NULL pointers so the code compiles;
  // the host must set them to point at the actual data before calling the replayer.
  {
    const referencedLabels = new Set<string>();
    for (const node of ast) {
      if (node.kind !== 'instruction') continue;
      for (const op of node.operands) {
        if (op.kind === 'label_ref') referencedLabels.add(op.name);
        if (op.kind === 'pc_rel') referencedLabels.add(op.label);
      }
    }
    // Collect BSR/JSR call targets so we don't orphan-stub them
    const bsrTargets = new Set<string>();
    for (const node of ast) {
      if (node.kind !== 'instruction') continue;
      if (node.mnemonic !== 'BSR' && node.mnemonic !== 'JSR') continue;
      const t = node.operands[0];
      if (t?.kind === 'label_ref') bsrTargets.add(t.name);
      if (t?.kind === 'pc_rel') bsrTargets.add(t.label);
    }
    const orphans: string[] = [];
    for (const lbl of referencedLabels) {
      if (!resolved.labels.has(lbl)) continue;  // not a label in this file
      if (funcLabels.has(lbl)) continue;         // will get a function definition
      if (packedLabels.has(lbl)) continue;       // will get a data #define
      if (resolved.symbols.has(lbl)) continue;   // EQU constant
      if (crossFuncGotos.has(lbl)) continue;     // promoted to function
      if (bsrTargets.has(lbl)) continue;         // called as function — stub as no-op fn instead
      orphans.push(lbl);
    }
    if (orphans.length > 0) {
      lines.push('/* -- External Data Placeholders (INCBIN / external data) ------------- */');
      lines.push('/* Host must set these pointers to actual module data before playback. */');
      for (const name of orphans) {
        lines.push(`static uint8_t* ${sanitizeLabel(name)} = NULL;`);
      }
      lines.push('');
    }
  }

  // Function forward declarations: only labels that are actually function labels,
  // not data labels (which are already forward-declared in the data section above).
  // Also include function labels referenced by DC.L data entries (used in _ds_init).
  // Data labels are already #defined as macros into _ds and don't need forward declarations.
  const dsInitFuncRefs = packed.labelPatches
    .filter(p => isFunctionLabel.has(p.targetLabel) && !packed.labelOffsets.has(p.targetLabel))
    .map(p => p.targetLabel);
  const allFwdDecls = new Set([...funcLabels, ...addrRefLabels, ...crossFuncGotos, ...dsInitFuncRefs]);
  const funcFwdDecls = [...allFwdDecls].filter(n => !dataLabelInfo.has(n));
  if (funcFwdDecls.length > 0) {
    lines.push('/* -- Forward Declarations -------------------------------------------- */');
    for (const name of funcFwdDecls) {
      // Apply sanitizeLabel so local labels (.SetVoice → _SetVoice) are valid C identifiers.
      const safe = sanitizeLabel(name);
      if (!resolved.labels.has(name)) {
        // Label is not defined in this file -- must be from an include file.
        // Declare as extern so the compiler doesn't expect a local definition.
        lines.push(`extern void ${safe}(void);`);
      } else {
        const qualifier = resolved.exports.includes(name) ? '' : 'static ';
        lines.push(`${qualifier}void ${safe}(void);`);
      }
    }
    lines.push('');
  }

  // Walk AST
  lines.push('\n/* ====================================================================');
  lines.push(' * Code Section -- Transpiled Functions');
  lines.push(' * ==================================================================== */');
  let inFunction = false;
  let pendingLabel: string | undefined;
  let anonCount = 0;

  // Semantic labels for 68k branch conditions
  const BRANCH_SEMANTICS: Record<string, string> = {
    BEQ: 'equal / zero',          BNE: 'not equal / nonzero',
    BMI: 'minus / negative',      BPL: 'plus / positive',
    BCS: 'carry set / below',     BCC: 'carry clear / above-or-equal',
    BVS: 'overflow set',          BVC: 'overflow clear',
    BGT: 'greater than (signed)', BGE: 'greater or equal (signed)',
    BLT: 'less than (signed)',    BLE: 'less or equal (signed)',
    BHI: 'higher (unsigned)',     BLS: 'lower or same (unsigned)',
  };

  // Close the current function. If the last line is a bare goto label (ends with ':'),
  // a C99/C11 compound statement cannot end on a label -- add a null statement first.
  function closeFunction(): void {
    const last = lines[lines.length - 1];
    if (last && /^[A-Za-z_][A-Za-z0-9_]*:$/.test(last.trimStart())) {
      lines.push('  ;');
    }
    lines.push('}');
    lines.push('');
    inFunction = false;
  }

  let currentFuncName: string | null = null;  // Track current function for self-branch detection

  for (let i = 0; i < ast.length; i++) {
    const node = ast[i];

    switch (node.kind) {
      case 'comment':
        if (!inFunction) lines.push(`/* ${node.text.replace(/^[;*]\s*/, '')} */`);
        else lines.push(`  /* ${node.text.replace(/^[;*]\s*/, '')} */`);
        break;

      case 'equ':
        // Already emitted as #define above
        break;

      case 'xdef':
        break;

      case 'section':
        if (inFunction) { closeFunction(); inFunction = false; }
        lines.push(`\n/* -- SECTION ${node.name} ------------------------------------------ */`);
        break;

      case 'data': {
        if (inFunction) { closeFunction(); inFunction = false; }
        // Data is already emitted in the packed _ds array; skip individual emission.
        pendingLabel = undefined;
        break;
      }

      case 'label': {
        // Peek at the next non-comment node
        let nextIdx = i + 1;
        while (nextIdx < ast.length && ast[nextIdx].kind === 'comment') nextIdx++;
        const next = ast[nextIdx];

        if (next?.kind === 'instruction' || next?.kind === 'label') {
          // Start a new function only if: this label is a BSR/JSR target (funcLabels)
          // OR we are not currently inside any function.
          // Otherwise emit as a C goto label within the current function body.
          const startsFunction = funcLabels.has(node.name) || !inFunction;

          if (startsFunction) {
            if (inFunction) closeFunction();
            const isExported = resolved.exports.includes(node.name);
            const qualifier = isExported ? '' : 'static ';
            const safe = sanitizeLabel(node.name);
            // Function banner
            const tags: string[] = [];
            if (isExported) tags.push('PUBLIC');
            if (addrRefLabels.has(node.name)) tags.push('address-referenced');
            if (crossFuncGotos.has(node.name)) tags.push('cross-function goto target');
            const tagStr = tags.length > 0 ? `  (${tags.join(', ')})` : '';
            lines.push(`\n/* --- ${safe} ---${tagStr} */`);
            lines.push(`${qualifier}void ${safe}(void) {`);
            currentFuncName = node.name;
            // Emit a _top label for self-referencing branches (loops back to function start)
            lines.push(`_top: ;`);
            inFunction = true;
          } else {
            // Inline goto label (branch target within current function)
            lines.push(`${sanitizeLabel(node.name)}:`);
          }
          pendingLabel = undefined;
        } else {
          // Data label or end-of-file label -- store for data emission
          pendingLabel = node.name;
        }
        break;
      }

      case 'instruction': {
        if (!inFunction) {
          lines.push(`\nstatic void _anon${anonCount++}(void) {`);
          inFunction = true;
        }
        // Reconstruct original ASM for inline comment
        const asmComment = `  /* ${reconstructAsm(node)} */`;

        // Check if this is a branch to a cross-function goto target.
        // Those labels are now C functions; emit as a function call instead of a goto.
        const COND_BRANCH_CONDS: Record<string, string> = {
          BEQ: 'flag_z',   BNE: '!flag_z',
          BMI: 'flag_n',   BPL: '!flag_n',
          BCS: 'flag_c',   BCC: '!flag_c',
          BVS: 'flag_v',   BVC: '!flag_v',
          BGT: '!flag_z && (flag_n==flag_v)', BGE: 'flag_n==flag_v',
          BLT: 'flag_n!=flag_v', BLE: 'flag_z||(flag_n!=flag_v)',
          BHI: '!flag_c&&!flag_z', BLS: 'flag_c||flag_z',
        };
        const mn = node.mnemonic;
        // For Bcc/BRA/JMP the target is operands[0]; for DBRA/DBF/etc. it's operands[1].
        const xfOp = BRANCH_MNEMS.has(mn)  ? node.operands[0]
                   : DBRANCH_MNEMS.has(mn) ? node.operands[1]
                   : undefined;
        const xfLabel = xfOp?.kind === 'label_ref' ? xfOp.name
                      : xfOp?.kind === 'pc_rel'    ? xfOp.label
                      : null;
        let c: string;
        // Self-referencing branch: branch to the current function's own name → goto _top
        if (xfLabel && xfLabel === currentFuncName) {
          if (mn === 'BRA' || mn === 'JMP') {
            c = `goto _top;`;
          } else if (DBRANCH_MNEMS.has(mn)) {
            const cnt = node.operands[0] ? emitOperand(node.operands[0], 'W') : '';
            c = `if ((int16_t)(--${cnt}) >= 0) goto _top;`;
          } else {
            c = `if (${COND_BRANCH_CONDS[mn]}) goto _top;`;
          }
        } else if (xfLabel && crossFuncGotos.has(xfLabel)) {
          const safe = sanitizeLabel(xfLabel);
          const cnt = node.operands[0] ? emitOperand(node.operands[0], 'W') : '';
          if (mn === 'BRA' || mn === 'JMP') {
            c = `${safe}(); return;`;
          } else if (DBRANCH_MNEMS.has(mn)) {
            c = `if ((int16_t)(--${cnt}) >= 0) { ${safe}(); return; }`;
          } else {
            c = `if (${COND_BRANCH_CONDS[mn]}) { ${safe}(); return; }`;
          }
        } else if (mn === 'JMP' && node.operands[0]?.kind === 'pc_rel' &&
                   (node.operands[0] as any).index && !isFunctionLabel.has(node.operands[0].label)) {
          // JMP label(PC,Dn.W) where label is a data label — dc.w offset jump table.
          const jtLabel = node.operands[0].label;
          const jtIndex = ((node.operands[0] as any).index as string).split('.')[0].toLowerCase();
          const targets = resolveJumpTableTargets(ast, jtLabel).map(t => sanitizeLabel(t));
          if (targets.length > 0) {
            const cases = targets.map((t, i) => {
              if (crossFuncGotos.has(t)) return `    case ${i}: ${t}(); return;`;
              return `    case ${i}: goto ${t};`;
            }).join('\n');
            c = `switch ((uint16_t)(${jtIndex}) / 2) {\n${cases}\n  }`;
          } else {
            c = emitInstruction(node);  // fallback
          }
        } else {
          c = emitInstruction(node);
        }
        // Add semantic branch comment for conditional branches
        const sem = BRANCH_SEMANTICS[mn];
        const branchSuffix = sem ? `  /* ${sem} */` : '';
        // For multi-line blocks, put ASM comment on the first line
        if (c.includes('\n')) {
          const cLines = c.split('\n');
          lines.push(`  ${cLines[0]}${asmComment}`);
          for (let k = 1; k < cLines.length; k++) {
            lines.push(`  ${cLines[k]}`);
          }
        } else {
          lines.push(`  ${c}${branchSuffix}${asmComment}`);
        }

        // After RTS or tail-call (JMP/BRA that emits `return;`): close the current
        // function so the next label starts a new function. This prevents EaglePlayer
        // labels (InitPlayer, InitSound, etc.) from being emitted as goto labels
        // inside a parent function.
        // After RTS, tail-call return, or indirect JMP: close the current function
        // so the next label starts a new one. Don't close for BRA/JMP to local labels.
        const isUnconditionalExit = mn === 'RTS' || c.includes('return;')
          || ((mn === 'JMP') && node.operands[0]?.kind === 'address');  // JMP (An)
        if (isUnconditionalExit && inFunction) {
          // Peek ahead: if the next meaningful node is a label, close this function
          // so the label becomes a new function.
          let peekIdx = i + 1;
          while (peekIdx < ast.length && ast[peekIdx].kind === 'comment') peekIdx++;
          if (peekIdx < ast.length && ast[peekIdx].kind === 'label') {
            closeFunction();
          }
        }

        break;
      }
    }
  }

  if (inFunction) closeFunction();

  // Emit _ds_init at end of file (needs all function/data labels to be defined)
  lines.push(...emitDsInit(packed.labelPatches, isFunctionLabel, packed.labelOffsets, funcLabels));

  if (resolved.warnings.length > 0) {
    lines.push('\n/* TRANSPILER WARNINGS:');
    for (const w of resolved.warnings) lines.push(` * ${w}`);
    lines.push(' */');
  }

  return lines.join('\n');
}
