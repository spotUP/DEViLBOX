import type { AstNode, DataNode, Size } from './ast.js';
import type { ResolveResult } from './resolver.js';
import { emitInstruction, emitOperand } from './instr-map.js';

const PREAMBLE = `\
#include "paula_soft.h"
#include <stdint.h>

/* Register file */
static uint32_t d0,d1,d2,d3,d4,d5,d6,d7;
static uint32_t a0,a1,a2,a3,a4,a5,a6,sp,pc;
static int flag_z=0, flag_n=0, flag_c=0, flag_v=0, flag_x=0;

/* Size helpers */
#define W(r)  (*((uint16_t*)&(r)))
#define B(r)  (*((uint8_t*)&(r)))

/* Memory access — 68k is big-endian; byte-swap on little-endian hosts.
 * Uses memcpy for alignment-safe access (68k allows unaligned word/long). */
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

/* Rotation helpers */
#define ROL32(v,n)  (((v)<<(n))|((v)>>(32-(n))))
#define ROR32(v,n)  (((v)>>(n))|((v)<<(32-(n))))
`;

const C_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Sanitize 68k local labels (e.g. '.SetVoice') to valid C identifiers.
function sanitizeLabel(name: string): string {
  return name.startsWith('.') ? '_' + name.slice(1) : name;
}

function emitData(node: DataNode, label: string | undefined, knownLabels: Set<string>): string {
  const typeStr: Record<string, string> = { B: 'uint8_t', W: 'uint16_t', L: 'uint32_t', S: 'uint16_t' };
  const t = typeStr[node.size ?? 'B'] ?? 'uint8_t';
  const name = label ?? `_data_${node.line}`;

  // DS (Define Storage) — reserve N bytes/words/longs of zero-initialized writable memory.
  // The single value is the element COUNT, not a content value.
  if (node.directive === 'DS') {
    const count = typeof node.values[0] === 'number' ? node.values[0] : 1;
    return `static ${t} ${name}[${count}];`;
  }

  // DC (Define Constant) — emit initializer list.
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
 * Packed data section — emits all data labels into a single contiguous
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
        // DC values — store in big-endian byte order
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
              // Label or symbol reference — resolve if possible, otherwise 0
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

  lines.push('/* Packed data section — contiguous byte array matching 68k memory layout */');
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

/** Collect every string-valued operand reference that is not already a known symbol or label.
 *  These come from include files not available to the transpiler; emit as zero-valued stubs
 *  so the generated C compiles (values are wrong but the structure is correct). */
function collectUnresolved(ast: AstNode[], resolved: ResolveResult): Set<string> {
  // known: symbols (EQU), labels (functions/data), exports
  const known = new Set([...resolved.symbols.keys(), ...resolved.labels, ...resolved.exports]);
  const stubs = new Set<string>();
  const validIdent = /^[A-Za-z_][A-Za-z0-9_]*$/;
  for (const node of ast) {
    if (node.kind === 'instruction') {
      for (const op of node.operands) {
        if (op.kind === 'label_ref' && !known.has(op.name) && validIdent.test(op.name)) {
          stubs.add(op.name);
        }
        if (op.kind === 'pc_rel' && !known.has(op.label) && validIdent.test(op.label)) {
          stubs.add(op.label);
        }
        if (op.kind === 'disp' && typeof op.offset === 'string' && !known.has(op.offset) && validIdent.test(op.offset)) {
          stubs.add(op.offset);
        }
        if (op.kind === 'immediate' && op.raw.startsWith('#') && !op.raw.slice(1).match(/^[\$%0-9-]/)) {
          const name = op.raw.slice(1);
          if (!known.has(name) && validIdent.test(name)) stubs.add(name);
        }
      }
    }
    if (node.kind === 'data') {
      // Identifier values in data arrays (e.g. dc.l DTP_InitSound, InitSound)
      // Labels (functions) are already declared; only stub truly unknown constants.
      for (const v of node.values) {
        if (typeof v === 'string' && validIdent.test(v) && !known.has(v)) {
          stubs.add(v);
        }
      }
    }
  }
  return stubs;
}

export function emit(ast: AstNode[], resolved: ResolveResult): string {
  const lines: string[] = [PREAMBLE];

  // EQU constants as #defines
  lines.push('/* EQU constants */');
  for (const [name, value] of resolved.symbols) {
    lines.push(`#define ${name} ${value}`);
  }
  lines.push('');

  // Unresolved symbol stubs (from missing include files)
  const stubs = collectUnresolved(ast, resolved);
  if (stubs.size > 0) {
    lines.push('/* Unresolved symbol stubs — from include files not available to transpiler */');
    for (const name of stubs) {
      lines.push(`#ifndef ${name}\n#define ${name} 0 /* unresolved */\n#endif`);
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
  // Exports are entry points that external code calls directly — they must be functions.
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
    // Recompute label → funcLabel scope with current funcLabels.
    const labelScope = new Map<string, string | null>();
    {
      let scope: string | null = null;
      for (const node of ast) {
        if (node.kind === 'label') {
          if (funcLabels.has(node.name)) scope = node.name;
          else labelScope.set(node.name, scope);
        }
      }
    }
    // Scan all branch instructions.
    let scope: string | null = null;
    for (const node of ast) {
      if (node.kind === 'label' && funcLabels.has(node.name)) { scope = node.name; continue; }
      if (node.kind !== 'instruction') continue;
      // Pick the operand that holds the branch target label.
      let targetOp = BRANCH_MNEMS.has(node.mnemonic)  ? node.operands[0]
                   : DBRANCH_MNEMS.has(node.mnemonic) ? node.operands[1]
                   : undefined;
      const lbl = targetOp?.kind === 'label_ref' ? targetOp.name
                : targetOp?.kind === 'pc_rel'    ? targetOp.label
                : null;
      if (!lbl || !labelScope.has(lbl)) continue;
      // Local labels (starting with '.') are scoped per global label in 68k.
      // Multiple functions can have a '.SetVoice' and each one is a different label.
      // Promoting local labels to cross-function C functions causes duplicate definitions.
      // Skip them — they will remain as inline goto labels within their containing function.
      if (lbl.startsWith('.')) continue;
      if (labelScope.get(lbl) !== scope && !crossFuncGotos.has(lbl)) {
        crossFuncGotos.add(lbl);
        funcLabels.add(lbl);   // promote to its own C function
        cfgChanged = true;
      }
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
    lines.push('/* Forward declarations */');
    for (const name of funcFwdDecls) {
      // Apply sanitizeLabel so local labels (.SetVoice → _SetVoice) are valid C identifiers.
      const safe = sanitizeLabel(name);
      if (!resolved.labels.has(name)) {
        // Label is not defined in this file — must be from an include file.
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
  let inFunction = false;
  let pendingLabel: string | undefined;
  let anonCount = 0;

  // Close the current function. If the last line is a bare goto label (ends with ':'),
  // a C99/C11 compound statement cannot end on a label — add a null statement first.
  function closeFunction(): void {
    const last = lines[lines.length - 1];
    if (last && /^[A-Za-z_][A-Za-z0-9_]*:$/.test(last.trimStart())) {
      lines.push('  ;');
    }
    lines.push('}');
    inFunction = false;
  }

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
        lines.push(`\n/* SECTION ${node.name} */`);
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
            // sanitizeLabel handles local labels like '.SetVoice' → '_SetVoice'.
            lines.push(`\n${qualifier}void ${sanitizeLabel(node.name)}(void) {`);
            inFunction = true;
          } else {
            // Inline goto label (branch target within current function)
            lines.push(`${sanitizeLabel(node.name)}:`);
          }
          pendingLabel = undefined;
        } else {
          // Data label or end-of-file label — store for data emission
          pendingLabel = node.name;
        }
        break;
      }

      case 'instruction': {
        if (!inFunction) {
          lines.push(`\nstatic void _anon${anonCount++}(void) {`);
          inFunction = true;
        }
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
        if (xfLabel && crossFuncGotos.has(xfLabel)) {
          const safe = sanitizeLabel(xfLabel);
          const cnt = node.operands[0] ? emitOperand(node.operands[0], 'W') : '';
          if (mn === 'BRA' || mn === 'JMP') {
            c = `${safe}(); return;`;
          } else if (DBRANCH_MNEMS.has(mn)) {
            // DBRA: decrement counter, if still >= 0 call the target then return.
            c = `if ((int16_t)(--${cnt}) >= 0) { ${safe}(); return; }`;
          } else {
            // Conditional branch: call target then return, only if condition holds.
            c = `if (${COND_BRANCH_CONDS[mn]}) { ${safe}(); return; }`;
          }
        } else {
          c = emitInstruction(node);
        }
        lines.push(`  ${c}`);
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
