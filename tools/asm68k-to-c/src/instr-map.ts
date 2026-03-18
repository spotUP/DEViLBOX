import type { InstructionNode, Operand, Size } from './ast.js';

/** Check if a name is a 68k register (d0-d7, a0-a7, sp, pc). */
function is68kReg(name: string): boolean {
  return /^[da][0-7]$|^sp$|^pc$/i.test(name);
}

function sizeStr(size: Size): string {
  switch (size) { case 'B': return '8'; case 'W': return '16'; default: return '32'; }
}

/** Cast a label-offset expression to intptr_t.  For compound expressions like
 *  `label1-label2` or `label1+label2+N`, cast each identifier part individually
 *  so C can perform pointer arithmetic: `((intptr_t)label1 - (intptr_t)label2)`. */
function castOffsetExpr(expr: string): string {
  const validIdent = /^[A-Za-z_][A-Za-z0-9_]*$/;
  // Split on + and - while keeping the operators
  const parts = expr.split(/([+\-])/);
  const hasCompound = parts.length > 1;
  const result = parts.map(p => {
    const trimmed = p.trim();
    if (trimmed === '+' || trimmed === '-') return ` ${trimmed} `;
    if (validIdent.test(trimmed)) return `(intptr_t)${trimmed}`;
    // Numeric literal or other expression — leave as-is
    return trimmed;
  }).join('');
  return hasCompound ? `(${result})` : result;
}

/* ── ASM reconstruction ────────────────────────────────────────────── */

/** Reconstruct an operand back to 68k assembly syntax (best-effort). */
function asmOperand(op: Operand): string {
  switch (op.kind) {
    case 'register':  return op.name.toUpperCase();
    case 'immediate': return `#${op.raw.startsWith('#') ? op.raw.slice(1) : op.raw}`;
    case 'address':
      if (op.mode === 'pre_dec') return `-(${op.reg.toUpperCase()})`;
      if (op.mode === 'post_inc') return `(${op.reg.toUpperCase()})+`;
      return `(${op.reg.toUpperCase()})`;
    case 'disp': {
      const off = typeof op.offset === 'number'
        ? (op.offset < 0 ? `${op.offset}` : `${op.offset}`)
        : op.offset;
      return `${off}(${op.base.toUpperCase()})`;
    }
    case 'abs_addr':  return op.raw.startsWith('$') ? `$${op.raw.slice(1).toUpperCase()}` : op.raw;
    case 'label_ref': return op.name;
    case 'pc_rel':    return `${op.label}(PC)`;
    default:          return '?';
  }
}

/** Reconstruct the original 68k assembly text from an InstructionNode. */
export function reconstructAsm(node: InstructionNode): string {
  const sizeSuffix = node.size ? `.${node.size}` : '';
  const ops = node.operands.map(asmOperand).join(',');
  return ops ? `${node.mnemonic}${sizeSuffix}\t${ops}` : `${node.mnemonic}${sizeSuffix}`;
}

// Returns true if the value string is a simple identifier (register name or plain label)
// that doesn't need extra parens when used in a cast.
function isSimpleIdent(v: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v);
}

// Wrap value in parens only if not a simple identifier.
function maybeParens(v: string): string {
  return isSimpleIdent(v) ? v : `(${v})`;
}

// Emit an immediate's value in its original base (hex stays hex, decimal stays decimal).
function immValue(op: { value: number; raw: string }): string {
  // raw is e.g. '#$8200' or '#42' or '$8200' (ABS_ADDR). Strip leading '#' if present.
  const stripped = op.raw.startsWith('#') ? op.raw.slice(1) : op.raw;
  if (stripped.startsWith('-$')) return `-0x${stripped.slice(2)}`;
  if (stripped.startsWith('$')) return `0x${stripped.slice(1)}`;
  if (stripped.startsWith('-%')) return `-0b${stripped.slice(2)}`;
  if (stripped.startsWith('%')) return `0b${stripped.slice(1)}`;
  // Symbolic identifier (e.g. #EPR_CorruptModule) — value is NaN, use the name directly.
  // Compound expressions (#label+16, #label1-label2) need each identifier cast.
  if (Number.isNaN(op.value)) {
    if (/[+\-]/.test(stripped) && /[A-Za-z_]/.test(stripped)) {
      return castOffsetExpr(stripped);
    }
    return stripped;
  }
  return `${op.value}`;
}

// For sub-expressions: emit a register with the appropriate width accessor.
function emitRegSized(name: string, size: Size): string {
  // Address registers (a0-a6, sp) always operate on the full 32 bits,
  // even with .W/.B instructions (68k sign-extends and adds to full reg).
  if (name.startsWith('a') || name === 'sp') return name;
  if (size === 'W') return `W(${name})`;
  if (size === 'B') return `B(${name})`;
  return name;
}

// Sanitize 68k local labels (starting with '.') to valid C identifiers.
const C_KEYWORDS = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
  'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
  'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while',
  'inline', 'restrict', 'asm', 'bool', 'true', 'false', 'NULL',
]);

function sanitizeLabel(name: string): string {
  let safe = name.startsWith('.') ? '_' + name.slice(1) : name;
  if (C_KEYWORDS.has(safe)) safe = '_' + safe;
  return safe;
}

// Emit a source operand with the correct sub-word width.
// Unlike emitRegSized(string), this works for immediate/register/memory.
function sizedSrc(op: Operand, size: Size): string {
  if (op.kind === 'immediate') {
    const v = immValue(op);
    if (size === 'W') return `(uint16_t)(${v})`;
    if (size === 'B') return `(uint8_t)(${v})`;
    return v;
  }
  if (op.kind === 'register') return emitRegSized(op.name, size);
  return emitOperandRead(op, size); // label_ref/pc_rel need READ wrapping
}

/** Compute the effective address of an operand (for LEA, PEA, etc.) without reading memory. */
function emitEffectiveAddr(op: Operand): string {
  switch (op.kind) {
    case 'register': return op.name;
    case 'address': return op.reg;
    case 'disp': {
      let addr = typeof op.offset === 'number' ? `${op.base} + ${op.offset}` : `${op.base} + ${castOffsetExpr(String(op.offset))}`;
      if (op.index) {
        const idxParts = op.index.split('.');
        const idxReg = idxParts[0].toLowerCase();
        const idxSize = (idxParts[1] || 'W').toUpperCase();
        const idxExpr = idxSize === 'L' ? idxReg : `(int16_t)W(${idxReg})`;
        addr += ` + ${idxExpr}`;
      }
      return addr;
    }
    case 'abs_addr': {
      return op.raw.startsWith('$') ? `0x${op.raw.slice(1)}` : op.raw;
    }
    case 'label_ref': return `(uint32_t)(uintptr_t)${sanitizeLabel(op.name)}`;
    case 'pc_rel': {
      let addr = `(uint32_t)(uintptr_t)${sanitizeLabel(op.label)}`;
      if (op.index) {
        const idxParts = op.index.split('.');
        const idxReg = idxParts[0].toLowerCase();
        const idxSize = (idxParts[1] || 'W').toUpperCase();
        const idxExpr = idxSize === 'L' ? idxReg : `(int16_t)W(${idxReg})`;
        addr += ` + ${idxExpr}`;
      }
      return addr;
    }
    default: return '/* unknown_ea */';
  }
}

export function emitOperand(op: Operand, size: Size = 'L'): string {
  switch (op.kind) {
    case 'register': return emitRegSized(op.name, size);
    case 'immediate': return immValue(op);
    case 'address': {
      const bits = sizeStr(size);
      if (op.mode === 'post_inc') return `READ${bits}_POST(${op.reg})`;
      if (op.mode === 'pre_dec') return `READ${bits}_PRE(${op.reg})`;
      return `READ${bits}(${op.reg})`;
    }
    case 'disp': {
      const bits = sizeStr(size);
      let addr = typeof op.offset === 'number' ? `${op.base} + ${op.offset}` : `${op.base} + ${castOffsetExpr(String(op.offset))}`;
      if (op.index) {
        const idxParts = op.index.split('.');
        const idxReg = idxParts[0].toLowerCase();
        const idxSize = (idxParts[1] || 'W').toUpperCase();
        const idxExpr = idxSize === 'L' ? idxReg : `(int16_t)W(${idxReg})`;
        addr += ` + ${idxExpr}`;
      }
      return `READ${bits}(${addr})`;
    }
    case 'abs_addr': {
      const addrC = op.raw.startsWith('$') ? `0x${op.raw.slice(1)}` : op.raw;
      return `READ${sizeStr(size)}(${addrC})`;
    }
    case 'label_ref': return sanitizeLabel(op.name);
    case 'pc_rel': {
      if (op.index) {
        const idxParts = op.index.split('.');
        const idxReg = idxParts[0].toLowerCase();
        const idxSize = (idxParts[1] || 'W').toUpperCase();
        const idxExpr = idxSize === 'L' ? idxReg : `(int16_t)W(${idxReg})`;
        return `READ${sizeStr(size)}((uintptr_t)${sanitizeLabel(op.label)} + ${idxExpr})`;
      }
      return sanitizeLabel(op.label);
    }
    default: return '/* unknown_operand */';
  }
}

function regWrite(op: Operand, value: string, size: Size): string {
  if (op.kind === 'register') {
    if (size === 'W') return `W(${op.name}) = (uint16_t)${maybeParens(value)};`;
    if (size === 'B') return `B(${op.name}) = (uint8_t)${maybeParens(value)};`;
    return `${op.name} = ${value};`;
  }
  const bits = sizeStr(size);
  if (op.kind === 'address') {
    if (op.mode === 'post_inc') return `WRITE${bits}_POST(${op.reg}, ${value});`;
    if (op.mode === 'pre_dec') return `WRITE${bits}_PRE(${op.reg}, ${value});`;
    // Only use hw_write for actual 68k registers (may point to hardware).
    // Data labels used in address mode (e.g. (SUBSONG)) use plain WRITE.
    if (is68kReg(op.reg)) {
      return `hw_write${bits}(${op.reg}, ${value});`;
    }
    return `WRITE${bits}((uintptr_t)${sanitizeLabel(op.reg)}, ${value});`;
  }
  if (op.kind === 'disp') {
    // PC-relative writes are self-modifying code (patching MOVEQ immediates).
    // In C, we can't modify code. The pattern is: MOVEQ #0,Dn; MOVE.B val,-N(PC)
    // which patches the MOVEQ immediate. The net effect: Dn.b = val.
    // We approximate this by writing to a scratch variable that has no effect.
    if (op.base === 'pc') return `/* self-modify pc${op.offset}: */ (void)(${value});`;
    let addr = typeof op.offset === 'number' ? `${op.base} + ${op.offset}` : `${op.base} + ${castOffsetExpr(String(op.offset))}`;
    if (op.index) {
      const idxParts = op.index.split('.');
      const idxReg = idxParts[0].toLowerCase();
      const idxSize = (idxParts[1] || 'W').toUpperCase();
      const idxExpr = idxSize === 'L' ? idxReg : `(int16_t)W(${idxReg})`;
      addr += ` + ${idxExpr}`;
    }
    // Only use hw_write when base is a 68k register (may point to hardware)
    if (is68kReg(op.base)) {
      return `hw_write${bits}(${addr}, ${value});`;
    }
    return `WRITE${bits}(${addr}, ${value});`;
  }
  if (op.kind === 'label_ref') {
    // Filter out parser artifacts like '_W' from '4.W' address mode
    if (/^_[BWLS]$/.test(op.name)) return `/* hw write to ${op.name} */ (void)(${value});`;
    return `WRITE${bits}((uintptr_t)${sanitizeLabel(op.name)}, ${value});`;
  }
  if (op.kind === 'pc_rel') {
    return `WRITE${bits}((uintptr_t)${sanitizeLabel(op.label)}, ${value});`;
  }
  if (op.kind === 'abs_addr') {
    if (op.tag === 'paula') return emitPaula(op.value, value, size);
    if (op.tag === 'dmacon') return `paula_dma_write((uint16_t)(${value}));`;
    return `/* hw ${op.raw} */ (void)(${value});`;
  }
  return `/* write unknown */ (void)(${value});`;
}

// Paula register addresses
const PAULA_PERIOD = [0xdff0a6, 0xdff0b6, 0xdff0c6, 0xdff0d6];
const PAULA_VOLUME = [0xdff0a8, 0xdff0b8, 0xdff0c8, 0xdff0d8];
const PAULA_LEN    = [0xdff0a4, 0xdff0b4, 0xdff0c4, 0xdff0d4];
const PAULA_LC     = [0xdff0a0, 0xdff0b0, 0xdff0c0, 0xdff0d0];
const PAULA_DAT    = [0xdff0aa, 0xdff0ba, 0xdff0ca, 0xdff0da];

function emitPaula(addr: number, value: string, _size: Size): string {
  const v16 = `(uint16_t)${maybeParens(value)}`;
  const v8  = `(uint8_t)${maybeParens(value)}`;
  for (let ch = 0; ch < 4; ch++) {
    if (addr === PAULA_PERIOD[ch]) return `paula_set_period(${ch}, ${v16});`;
    if (addr === PAULA_VOLUME[ch]) return `paula_set_volume(${ch}, ${v8});`;
    if (addr === PAULA_LEN[ch])    return `paula_set_length(${ch}, ${v16});`;
    if (addr === PAULA_LC[ch])     return `paula_set_sample_ptr(${ch}, (const int8_t*)(uintptr_t)${maybeParens(value)});`;
    if (addr === PAULA_DAT[ch])    return `/* AUD${ch}DAT ${value} */`;
  }
  return `/* paula $${addr.toString(16)} */ (void)(${value});`;
}

// Like emitOperand but wraps label_ref/pc_rel in READ (for value access, not address)
function emitOperandRead(op: Operand, size: Size): string {
  if (op.kind === 'label_ref') return `READ${sizeStr(size)}((uintptr_t)${sanitizeLabel(op.name)})`;
  if (op.kind === 'pc_rel') {
    // If index is present, emitOperand already wraps in READ with index arithmetic
    if (op.index) return emitOperand(op, size);
    return `READ${sizeStr(size)}((uintptr_t)${sanitizeLabel(op.label)})`;
  }
  return emitOperand(op, size);
}

/**
 * Format a compound block as indented multi-line.
 * Input:  ['uint8_t _mv = (uint8_t)(val);', 'dst = _mv;', 'flag_z = (_mv==0);']
 * Output: '{\n    uint8_t _mv = ...;\n    dst = _mv;\n    flag_z = ...;\n  }'
 * The 4-space indent inside the block keeps it visually distinct from function body (2-space).
 */
function block(stmts: string[]): string {
  return '{\n' + stmts.map(s => `    ${s}`).join('\n') + '\n  }';
}

export function emitInstruction(node: InstructionNode): string {
  const { mnemonic, size, operands: ops } = node;
  const s = size ?? 'L';
  const src = ops[0] ? emitOperand(ops[0], s) : '';
  const srcRead = ops[0] ? emitOperandRead(ops[0], s) : '';  // value-reading version (wraps label_ref in READ)
  const dst = ops[1] ?? null;

  switch (mnemonic) {
    case 'MOVE':
    case 'MOVEA': {
      if (!dst) return `/* MOVE no dest */`;
      let moveVal = src;
      if (ops[0].kind === 'label_ref' || ops[0].kind === 'pc_rel') {
        // label_ref and pc_rel are memory reads (MOVE.x label,dst reads from memory).
        // Address loads use LEA or immediate (#label).
        moveVal = `READ${sizeStr(s)}((uintptr_t)${src})`;
      }
      // MOVEA does NOT affect condition codes.
      // For immediate label addresses (#label → load address), cast pointer to uint32_t.
      if (mnemonic === 'MOVEA') {
        if (ops[0].kind === 'immediate' && Number.isNaN(ops[0].value)) {
          moveVal = `(uint32_t)(uintptr_t)${moveVal}`;
        }
        return regWrite(dst, moveVal, s);
      }
      // 68k MOVE sets N and Z flags based on the moved value; clears V and C.
      // Capture src in a temp to avoid double-evaluation of side-effect macros.
      const mvType = s === 'B' ? 'uint8_t' : s === 'W' ? 'uint16_t' : 'uint32_t';
      const signCastM = s === 'B' ? '(int8_t)' : s === 'W' ? '(int16_t)' : '(int32_t)';
      return block([
        `${mvType} _mv = (${mvType})(${moveVal});`,
        regWrite(dst, '_mv', s),
        `flag_z = (${signCastM}(_mv) == 0);`,
        `flag_n = (${signCastM}(_mv) < 0);`,
        `flag_v = 0; flag_c = 0;`,
      ]);
    }

    case 'MOVEQ': {
      // Lexer may split `#62+8,D2` into 3 operands: [imm:62, imm:8, reg:D2].
      // Combine arithmetic immediates when there are 3 operands.
      let mqDst = dst;
      let mqVal = src;
      if (ops.length >= 3 && ops[0].kind === 'immediate' &&
          (ops[1].kind === 'immediate' || ops[1].kind === 'label_ref')) {
        const v0 = ops[0].kind === 'immediate' ? (ops[0] as { value: number }).value : 0;
        const v1 = ops[1].kind === 'immediate' ? (ops[1] as { value: number }).value : 0;
        mqVal = `${v0 + v1}`;
        mqDst = ops[2] ?? null;
      }
      if (!mqDst) return '';
      if (mqDst.kind !== 'register') return `/* MOVEQ invalid dst (${emitOperand(mqDst,'L')}) */`;
      return `${mqDst.name} = (uint32_t)(int32_t)(int8_t)(${mqVal});`;
    }

    case 'MOVEM': {
      // Use register list as-is from parser. The lexer drops both '-' (range) and
      // '/' (separator), so we can't distinguish D0-D3 (range) from D0/D3 (individual).
      // Since both push and pop pass through the same parser, the register counts match,
      // keeping the stack balanced even if some mid-range registers are missed.
      const regOps = ops.filter(o => o.kind === 'register');
      const addrOp = ops.find(o => o.kind === 'address');
      const regs = regOps.map(o => o.name === 'a7' ? 'sp' : o.name);
      if (!addrOp) return `/* MOVEM: no addr operand */`;
      const bits = sizeStr(s);
      const stackReg = addrOp.reg === 'a7' ? 'sp' : addrOp.reg;
      if (addrOp.mode === 'pre_dec') {
        // MOVEM regs,-(An): push registers (highest first)
        const reversed = [...regs].reverse();
        return reversed.map(r => `WRITE${bits}_PRE(${stackReg}, ${r});`).join('\n  ');
      } else if (addrOp.mode === 'post_inc') {
        // MOVEM (An)+,regs: pop registers (lowest first)
        const cast = s === 'W' ? '(uint32_t)(int32_t)(int16_t)' : '';
        return regs.map(r => `${r} = ${cast}READ${bits}_POST(${stackReg});`).join('\n  ');
      }
      return `/* MOVEM.${s} unhandled mode */`;
    }

    case 'LEA': {
      if (!dst) return '';
      // Compound source: "StructAdr+UPS_Voice1Adr(PC),A1" or "Buffer2+132,A1" tokenizes as
      // [label_ref, pc_rel|immediate, register] — lexer splits on '+', drops it.
      if (ops.length >= 3 && ops[0].kind === 'label_ref' &&
          (ops[1].kind === 'pc_rel' || ops[1].kind === 'immediate' ||
           (ops[1].kind === 'disp' && ops[1].base === 'pc'))) {
        const realDst = ops[ops.length - 1];
        const leaDst2 = realDst.kind === 'register' ? realDst.name : emitOperand(realDst, 'L');
        let offsetExpr: string;
        if (ops[1].kind === 'immediate')
          offsetExpr = immValue(ops[1] as { value: number; raw: string });
        else if (ops[1].kind === 'disp' && ops[1].base === 'pc')
          offsetExpr = `${ops[1].offset}`;
        else
          offsetExpr = (ops[1] as any).label;
        return `${leaDst2} = (uint32_t)((uintptr_t)${sanitizeLabel(ops[0].name)} + ${offsetExpr});`;
      }
      const leaDst = dst.kind === 'register' ? dst.name : emitOperand(dst, 'L');
      const op0 = ops[0];
      // No `&` — data labels are pointer macros into _ds; function names decay to pointers.
      if (op0.kind === 'label_ref') return `${leaDst} = (uint32_t)(uintptr_t)${sanitizeLabel(op0.name)};`;
      if (op0.kind === 'pc_rel') return `${leaDst} = (uint32_t)(uintptr_t)${sanitizeLabel(op0.label)};`;
      if (op0.kind === 'disp') {
        const offPart = typeof op0.offset === 'number' ? op0.offset : castOffsetExpr(String(op0.offset));
        let addrExpr = `${op0.base} + ${offPart}`;
        if (op0.index) {
          const idxParts = op0.index.split('.');
          const idxReg = idxParts[0].toLowerCase();
          const idxSize = (idxParts[1] || 'W').toUpperCase();
          const idxExpr = idxSize === 'L' ? idxReg : `(int16_t)W(${idxReg})`;
          addrExpr += ` + ${idxExpr}`;
        }
        return `${leaDst} = (uint32_t)(${addrExpr});`;
      }
      // abs_addr: LEA loads the address value itself, not the memory contents
      if (op0.kind === 'abs_addr') {
        const addrC = op0.raw.startsWith('$') ? `0x${op0.raw.slice(1)}` : op0.raw;
        return `${leaDst} = (uint32_t)${addrC};`;
      }
      // address (register indirect): LEA (An),Am means Am = An (load the address itself)
      if (op0.kind === 'address') {
        if (is68kReg(op0.reg)) {
          return `${leaDst} = ${op0.reg};`;
        }
        // Data label used as address: need cast from pointer to uint32_t
        return `${leaDst} = (uint32_t)(uintptr_t)${sanitizeLabel(op0.reg)};`;
      }
      return `${leaDst} = (uint32_t)(uintptr_t)(${src});`;
    }

    case 'PEA':
      return `sp -= 4; WRITE32(sp, ${emitEffectiveAddr(ops[0])});`;

    case 'ADD':  case 'ADDA':  case 'ADDI': case 'ADDQ': {
      if (!dst) return '';
      // ADDA (or ADD/ADDQ to address register) does NOT affect condition codes.
      // Always writes full 32-bit address register.
      const isAddrDst = dst?.kind === 'register' && (dst.name.startsWith('a') || dst.name === 'sp');
      if (mnemonic === 'ADDA' || isAddrDst) {
        if (dst.kind === 'register') return `${dst.name} = (uint32_t)((int32_t)${dst.name} + (int32_t)(int16_t)(${srcRead}));`;
        return regWrite(dst, `${emitOperand(dst, 'L')} + ${srcRead}`, 'L');
      }
      // ADD/ADDI/ADDQ set N, Z (and X, V, C which we approximate).
      const addType = s === 'B' ? 'uint8_t' : s === 'W' ? 'uint16_t' : 'uint32_t';
      const addSign = s === 'B' ? '(int8_t)' : s === 'W' ? '(int16_t)' : '(int32_t)';
      if (dst.kind === 'register') {
        const dstExpr = s === 'L' ? dst.name : emitRegSized(dst.name, s);
        return block([
          `${addType} _ar = (${addType})(${dstExpr} + ${srcRead});`,
          regWrite(dst, `(${addType})_ar`, s),
          `flag_z = (${addSign}(_ar) == 0);`,
          `flag_n = (${addSign}(_ar) < 0);`,
        ]);
      }
      const addRd = emitOperandRead(dst, s);
      return block([
        `${addType} _ar = (${addType})(${addRd} + ${srcRead});`,
        regWrite(dst, `(${addType})_ar`, s),
        `flag_z = (${addSign}(_ar) == 0);`,
        `flag_n = (${addSign}(_ar) < 0);`,
      ]);
    }
    case 'ADDX':
      return dst ? regWrite(dst, `${emitOperandRead(dst, s)} + ${srcRead} + flag_x`, s) : '';
    case 'SUB':  case 'SUBA':  case 'SUBI': case 'SUBQ': {
      if (!dst) return '';
      // SUBA (or SUB/SUBQ to address register) does NOT affect condition codes.
      const isSubAddrDst = dst?.kind === 'register' && (dst.name.startsWith('a') || dst.name === 'sp');
      if (mnemonic === 'SUBA' || isSubAddrDst) {
        if (dst.kind === 'register') return `${dst.name} = (uint32_t)((int32_t)${dst.name} - (int32_t)(int16_t)(${srcRead}));`;
        return regWrite(dst, `${emitOperand(dst, 'L')} - ${srcRead}`, 'L');
      }
      // SUB/SUBI/SUBQ set N, Z (and X, V, C which we approximate).
      const subType = s === 'B' ? 'uint8_t' : s === 'W' ? 'uint16_t' : 'uint32_t';
      const subSign = s === 'B' ? '(int8_t)' : s === 'W' ? '(int16_t)' : '(int32_t)';
      if (dst.kind === 'register') {
        const srcExpr = sizedSrc(ops[0], s);
        const dstExpr = s === 'L' ? dst.name : emitRegSized(dst.name, s);
        return block([
          `${subType} _sr = (${subType})(${dstExpr} - ${srcExpr});`,
          regWrite(dst, `(${subType})_sr`, s),
          `flag_z = (${subSign}(_sr) == 0);`,
          `flag_n = (${subSign}(_sr) < 0);`,
        ]);
      }
      const subRd = emitOperandRead(dst, s);
      return block([
        `${subType} _sr = (${subType})(${subRd} - ${srcRead});`,
        regWrite(dst, `(${subType})_sr`, s),
        `flag_z = (${subSign}(_sr) == 0);`,
        `flag_n = (${subSign}(_sr) < 0);`,
      ]);
    }
    case 'SUBX':
      return dst ? regWrite(dst, `${emitOperandRead(dst, s)} - ${srcRead} - flag_x`, s) : '';

    case 'MULS': return dst ? `${emitOperand(dst, 'L')} = (uint32_t)((int32_t)(int16_t)${emitOperand(ops[0], 'W')} * (int32_t)(int16_t)${emitOperand(dst, 'W')});` : '';
    case 'MULU': return dst ? `${emitOperand(dst, 'L')} = (uint32_t)((uint16_t)(${srcRead}) * (uint16_t)${emitOperand(dst, 'W')});` : '';
    case 'DIVS': {
      if (!dst) return '';
      const dv = emitOperand(dst, 'L'), sv = src;
      return block([
        `int16_t q = (int16_t)((int32_t)${dv} / (int16_t)${sv});`,
        `int16_t r = (int16_t)((int32_t)${dv} % (int16_t)${sv});`,
        `${dv} = ((uint32_t)(uint16_t)r << 16) | (uint16_t)q;`,
      ]);
    }
    case 'DIVU': {
      if (!dst) return '';
      const dv = emitOperand(dst, 'L'), sv = src;
      return block([
        `uint16_t q = (uint16_t)((uint32_t)${dv} / (uint16_t)${sv});`,
        `uint16_t r = (uint16_t)((uint32_t)${dv} % (uint16_t)${sv});`,
        `${dv} = ((uint32_t)r << 16) | q;`,
      ]);
    }

    case 'AND':  case 'ANDI':
      if (!dst) return '';
      if (dst.kind === 'register' && s === 'L') return `${dst.name} &= ${srcRead};`;
      if (dst.kind === 'register') return `${emitRegSized(dst.name, s)} &= ${sizedSrc(ops[0], s)};`;
      return regWrite(dst, `${emitOperandRead(dst, s)} & ${srcRead}`, s);
    case 'OR':   case 'ORI':
      if (!dst) return '';
      if (dst.kind === 'register' && s === 'L') return `${dst.name} |= ${srcRead};`;
      if (dst.kind === 'register') return `${emitRegSized(dst.name, s)} |= ${sizedSrc(ops[0], s)};`;
      return regWrite(dst, `${emitOperandRead(dst, s)} | ${srcRead}`, s);
    case 'EOR':  case 'EORI':
      if (!dst) return '';
      if (dst.kind === 'register' && s === 'L') return `${dst.name} ^= ${srcRead};`;
      if (dst.kind === 'register') return `${emitRegSized(dst.name, s)} ^= ${sizedSrc(ops[0], s)};`;
      return regWrite(dst, `${emitOperandRead(dst, s)} ^ ${srcRead}`, s);
    case 'NOT': {
      const op0 = ops[0];
      if (op0.kind === 'register') {
        if (s === 'W') return `W(${op0.name}) = (uint16_t)(~W(${op0.name}));`;
        if (s === 'B') return `B(${op0.name}) = (uint8_t)(~B(${op0.name}));`;
        return `${op0.name} = ~${op0.name};`;
      }
      // Memory destination: read-modify-write via WRITE/READ macros
      const rdN = emitOperandRead(op0, s);
      if (s === 'W') return regWrite(op0, `(uint16_t)(~(uint16_t)(${rdN}))`, s);
      if (s === 'B') return regWrite(op0, `(uint8_t)(~(uint8_t)(${rdN}))`, s);
      return regWrite(op0, `~(uint32_t)(${rdN})`, s);
    }
    case 'NEG': {
      const op0 = ops[0];
      if (op0.kind === 'register') {
        if (s === 'W') return `W(${op0.name}) = (uint16_t)(-(int16_t)W(${op0.name}));`;
        if (s === 'B') return `B(${op0.name}) = (uint8_t)(-(int8_t)B(${op0.name}));`;
        return `${op0.name} = (uint32_t)(-(int32_t)${op0.name});`;
      }
      // Memory destination: read-modify-write via WRITE/READ macros
      const rdG = emitOperandRead(op0, s);
      if (s === 'W') return regWrite(op0, `(uint16_t)(-(int16_t)(${rdG}))`, s);
      if (s === 'B') return regWrite(op0, `(uint8_t)(-(int8_t)(${rdG}))`, s);
      return regWrite(op0, `(uint32_t)(-(int32_t)(${rdG}))`, s);
    }
    case 'CLR': return regWrite(ops[0], '0', s);
    case 'ST': return regWrite(ops[0], '0xFF', 'B');   // Set True: dest byte = $FF
    case 'SF': return regWrite(ops[0], '0', 'B');      // Set False: dest byte = $00
    case 'EXT':
      if (s === 'W') return `${src} = (uint32_t)(int32_t)(int16_t)(int8_t)${src};`;
      return `${src} = (uint32_t)(int32_t)(int16_t)${src};`;
    case 'SWAP': return `${src} = (${src} >> 16) | (${src} << 16);`;

    case 'LSL':
      if (!dst) {
        if (ops[0].kind === 'register') return `${src} <<= 1;`;
        return regWrite(ops[0], `${emitOperandRead(ops[0], s)} << 1`, s);
      }
      return regWrite(dst, `${emitOperandRead(dst, s)} << ${src}`, s);
    case 'LSR':
      if (!dst) {
        if (ops[0].kind === 'register') return `${src} >>= 1;`;
        return regWrite(ops[0], `(uint32_t)(${emitOperandRead(ops[0], s)}) >> 1`, s);
      }
      if (dst.kind === 'register' && s === 'L') return `${dst.name} >>= ${src};`;
      return regWrite(dst, `(uint32_t)(${emitOperandRead(dst, s)}) >> ${src}`, s);
    case 'ASL':
      if (!dst) {
        if (ops[0].kind === 'register') return `${src} <<= 1;`;
        return regWrite(ops[0], `${emitOperandRead(ops[0], s)} << 1`, s);
      }
      return regWrite(dst, `${emitOperandRead(dst, s)} << ${src}`, s);
    case 'ASR':
      if (!dst) {
        if (ops[0].kind === 'register') return `${src} = (uint32_t)((int32_t)${src} >> 1);`;
        return regWrite(ops[0], `(uint32_t)((int32_t)${emitOperandRead(ops[0], s)} >> 1)`, s);
      }
      if (dst.kind === 'register' && s === 'L') return `${dst.name} = (uint32_t)((int32_t)${dst.name} >> ${src});`;
      return regWrite(dst, `(uint32_t)((int32_t)${emitOperandRead(dst, s)} >> ${src})`, s);
    case 'ROL': return dst ? regWrite(dst, `ROL32(${emitOperandRead(dst, s)}, ${src})`, s) : ``;
    case 'ROR': return dst ? regWrite(dst, `ROR32(${emitOperandRead(dst, s)}, ${src})`, s) : ``;

    case 'BSET': return dst ? regWrite(dst, `${emitOperandRead(dst, s)} | (1u << (${src} & 31))`, s) : '';
    case 'BCLR': return dst ? regWrite(dst, `${emitOperandRead(dst, s)} & ~(1u << (${src} & 31))`, s) : '';
    case 'BTST': {
      const testOp = dst ?? ops[0];
      return `flag_z = ((${emitOperandRead(testOp, s)} & (1u << (${src} & 31))) == 0);`;
    }
    case 'BCHG': return dst ? regWrite(dst, `${emitOperandRead(dst, s)} ^ (1u << (${src} & 31))`, s) : '';

    case 'CMP':  case 'CMPA': case 'CMPI': case 'CMPM': {
      const cmpOp = dst ?? ops[0];
      return block([
        `int32_t _lhs = (int32_t)(${emitOperandRead(cmpOp, s)});`,
        `int32_t _rhs = (int32_t)(${emitOperandRead(ops[0], s)});`,
        `int32_t _cmp = _lhs - _rhs;`,
        `flag_z = (_cmp == 0);`,
        `flag_n = (_cmp < 0);`,
        `flag_c = ((uint32_t)_lhs < (uint32_t)_rhs);`,
      ]);
    }
    case 'TST': {
      const tstType = s === 'B' ? 'uint8_t' : s === 'W' ? 'uint16_t' : 'uint32_t';
      const signCast = s === 'B' ? '(int8_t)' : s === 'W' ? '(int16_t)' : '(int32_t)';
      const tstSrc = ops[0] ? emitOperandRead(ops[0], s) : src;
      return block([
        `${tstType} _tst = (${tstType})(${tstSrc});`,
        `flag_z = (_tst == 0);`,
        `flag_n = (${signCast}(_tst) < 0);`,
        `flag_c = 0; flag_v = 0;`,
      ]);
    }

    case 'BRA': case 'JMP': {
      // Direct branch to a label — always valid as a goto target.
      if (ops[0].kind === 'label_ref') return `goto ${sanitizeLabel(ops[0].name)};`;
      // PC-relative with index register: JMP label(PC,Dn.W) — jump table pattern
      // The index register (e.g. D4.W) selects which BRA.W entry to use.
      // BRA.W is 4 bytes, so entry = index / 4. We emit a marker comment
      // that the restructure pass can convert to a switch statement.
      if (ops[0].kind === 'pc_rel' && ops[0].index) {
        const idxReg = ops[0].index.split('.')[0].toLowerCase();
        const label = sanitizeLabel(ops[0].label);
        return `/* JUMPTABLE ${label} ${idxReg} */ goto ${label};`;
      }
      if (ops[0].kind === 'pc_rel')    return `goto ${sanitizeLabel(ops[0].label)};`;
      // Indirect jump through register: JMP (An) — An IS the target address.
      if (ops[0].kind === 'address') {
        return `((void(*)(void))(uintptr_t)${ops[0].reg})(); return;`;
      }
      // Indirect jump through displacement: JMP d(An) — effective address An+d.
      if (ops[0].kind === 'disp') {
        const addr = typeof ops[0].offset === 'number'
          ? `${ops[0].base} + ${ops[0].offset}`
          : `${ops[0].base} + ${castOffsetExpr(String(ops[0].offset))}`;
        return `((void(*)(void))(uintptr_t)(${addr}))(); return;`;
      }
      // abs_addr or other: can only goto if it happens to be an identifier
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(src)) return `goto ${src};`;
      return `/* JMP ${src} */`;
    }
    case 'BEQ': return `if (flag_z) goto ${src};`;
    case 'BNE': return `if (!flag_z) goto ${src};`;
    case 'BMI': return `if (flag_n) goto ${src};`;
    case 'BPL': return `if (!flag_n) goto ${src};`;
    case 'BCS': return `if (flag_c) goto ${src};`;
    case 'BCC': return `if (!flag_c) goto ${src};`;
    case 'BVS': return `if (flag_v) goto ${src};`;
    case 'BVC': return `if (!flag_v) goto ${src};`;
    case 'BGT': return `if (!flag_z && (flag_n==flag_v)) goto ${src};`;
    case 'BGE': return `if (flag_n==flag_v) goto ${src};`;
    case 'BLT': return `if (flag_n!=flag_v) goto ${src};`;
    case 'BLE': return `if (flag_z||(flag_n!=flag_v)) goto ${src};`;
    case 'BHI': return `if (!flag_c&&!flag_z) goto ${src};`;
    case 'BLS': return `if (flag_c||flag_z) goto ${src};`;

    case 'DBRA': case 'DBF': {
      // DBRA with 1 operand (just a label) → use d0 as default counter
      const dbraReg = ops.length >= 2 ? src : 'd0';
      const dbraLabel = ops.length >= 2 ? emitOperand(ops[1]) : (ops[0] ? emitOperand(ops[0]) : '/* missing_label */');
      return `if ((int16_t)(--${dbraReg}) >= 0) goto ${dbraLabel};`;
    }
    case 'DBEQ':
      return `if (!flag_z && (int16_t)(--${src}) >= 0) goto ${ops[1] ? emitOperand(ops[1]) : '/* missing_label */'};`;
    case 'DBNE':
      return `if (flag_z && (int16_t)(--${src}) >= 0) goto ${ops[1] ? emitOperand(ops[1]) : '/* missing_label */'};`;

    case 'BSR': case 'JSR': {
      // Simple identifier → direct call
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(src)) return `${src}();`;
      // JSR (An) — register indirect: the register IS the function address (no dereference).
      // JSR d(An)  — displacement: model library jump-tables as fn-ptr tables → READ32.
      const callTarget = ops[0]?.kind === 'address' && ops[0].mode === 'indirect'
        ? ops[0].reg   // e.g. jsr (a0) → call a0 directly
        : src;          // e.g. jsr -198(a6) → READ32(a6 + -198)
      return `{ uintptr_t _jt=(uintptr_t)(${callTarget}); if(_jt) ((void(*)(void))_jt)(); }`;
    }
    case 'RTS':     return 'return;';
    case 'RTR':     return 'return; /* RTR: CCR restore omitted */';
    case 'RTE':     return 'return; /* RTE */';
    case 'NOP':     return '/* NOP */';
    case 'STOP':    return '/* STOP */';
    case 'RESET':   return '/* RESET */';
    case 'ILLEGAL': return '/* ILLEGAL */';
    case 'LINK':
      return `sp -= 4; WRITE32(sp, ${src}); ${src} = sp; sp -= ${dst ? emitOperand(dst) : '0'};`;
    case 'UNLK':
      return `sp = ${src}; ${src} = READ32(sp); sp += 4;`;
    case 'TRAP':
      return `/* TRAP #${src} */`;

    default:
      return `/* UNIMPLEMENTED: ${mnemonic} */`;
  }
}
