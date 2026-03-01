import type { InstructionNode, Operand, Size } from './ast.js';

function sizeStr(size: Size): string {
  switch (size) { case 'B': return '8'; case 'W': return '16'; default: return '32'; }
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
  if (stripped.startsWith('$')) return `0x${stripped.slice(1)}`;
  if (stripped.startsWith('%')) return `0b${stripped.slice(1)}`;
  return `${op.value}`;
}

// For sub-expressions: emit a register with the appropriate width accessor.
function emitRegSized(name: string, size: Size): string {
  if (size === 'W') return `W(${name})`;
  if (size === 'B') return `B(${name})`;
  return name;
}

export function emitOperand(op: Operand, size: Size = 'L'): string {
  switch (op.kind) {
    case 'register': return op.name;
    case 'immediate': return immValue(op);
    case 'address': {
      const bits = sizeStr(size);
      if (op.mode === 'post_inc') return `READ${bits}_POST(${op.reg})`;
      if (op.mode === 'pre_dec') return `READ${bits}_PRE(${op.reg})`;
      return `READ${bits}(${op.reg})`;
    }
    case 'disp': {
      const bits = sizeStr(size);
      const addr = typeof op.offset === 'number' ? `${op.base} + ${op.offset}` : `${op.base} + (intptr_t)${op.offset}`;
      return `READ${bits}(${addr})`;
    }
    case 'abs_addr': return `READ${sizeStr(size)}(${op.raw})`;
    case 'label_ref': return op.name;
    case 'pc_rel': return op.label;
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
    return `WRITE${bits}(${op.reg}, ${value});`;
  }
  if (op.kind === 'disp') {
    const addr = typeof op.offset === 'number' ? `${op.base} + ${op.offset}` : `${op.base} + (intptr_t)${op.offset}`;
    return `WRITE${bits}(${addr}, ${value});`;
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
    if (addr === PAULA_LC[ch])     return `paula_set_sample_ptr(${ch}, (const int8_t*)(uintptr_t)${maybeParens(value)}, 0);`;
    if (addr === PAULA_DAT[ch])    return `/* AUD${ch}DAT ${value} */`;
  }
  return `/* paula $${addr.toString(16)} */ (void)(${value});`;
}

export function emitInstruction(node: InstructionNode): string {
  const { mnemonic, size, operands: ops } = node;
  const s = size ?? 'L';
  const src = ops[0] ? emitOperand(ops[0], s) : '';
  const dst = ops[1] ?? null;

  switch (mnemonic) {
    case 'MOVE':
    case 'MOVEA':
      if (!dst) return `/* MOVE no dest */`;
      return regWrite(dst, src, s);

    case 'MOVEQ':
      return dst ? `${emitOperand(dst, 'L')} = (uint32_t)(int32_t)(int8_t)(${src});` : '';

    case 'MOVEM':
      return `/* MOVEM.${s} ${ops.map(o => o.kind === 'register' ? o.name : '?').join(',')} */`;

    case 'LEA': {
      if (!dst) return '';
      const leaDst = dst.kind === 'register' ? dst.name : emitOperand(dst, 'L');
      const op0 = ops[0];
      if (op0.kind === 'label_ref') return `${leaDst} = (uint32_t)(uintptr_t)&${op0.name};`;
      if (op0.kind === 'pc_rel') return `${leaDst} = (uint32_t)(uintptr_t)&${op0.label};`;
      if (op0.kind === 'disp') return `${leaDst} = (uint32_t)(${op0.base} + ${op0.offset});`;
      return `${leaDst} = (uint32_t)(uintptr_t)(${src});`;
    }

    case 'PEA':
      return `sp -= 4; WRITE32(sp, (uint32_t)(uintptr_t)&${src});`;

    case 'ADD':  case 'ADDA':  case 'ADDI': case 'ADDQ':
      if (!dst) return '';
      if (dst.kind === 'register' && s === 'L') return `${dst.name} += ${src};`;
      return regWrite(dst, `${emitOperand(dst, s)} + ${src}`, s);
    case 'ADDX':
      return dst ? regWrite(dst, `${emitOperand(dst, s)} + ${src} + flag_x`, s) : '';
    case 'SUB':  case 'SUBA':  case 'SUBI': case 'SUBQ':
      if (!dst) return '';
      if (dst.kind === 'register' && s === 'L') return `${dst.name} -= ${src};`;
      if (dst.kind === 'register') return regWrite(dst, `${emitRegSized(dst.name, s)} - ${emitRegSized(src, s)}`, s);
      return regWrite(dst, `${emitOperand(dst, s)} - ${src}`, s);
    case 'SUBX':
      return dst ? regWrite(dst, `${emitOperand(dst, s)} - ${src} - flag_x`, s) : '';

    case 'MULS': return dst ? `${emitOperand(dst, 'L')} = (uint32_t)((int32_t)(int16_t)${emitOperand(ops[0], 'W')} * (int32_t)(int16_t)${emitOperand(dst, 'W')});` : '';
    case 'MULU': return dst ? `${emitOperand(dst, 'L')} = (uint32_t)((uint16_t)${src} * (uint16_t)${emitOperand(dst, 'W')});` : '';
    case 'DIVS': {
      if (!dst) return '';
      const dv = emitOperand(dst, 'L'), sv = src;
      return `{ int16_t q=(int16_t)((int32_t)${dv}/(int16_t)${sv}); int16_t r=(int16_t)((int32_t)${dv}%(int16_t)${sv}); ${dv}=((uint32_t)(uint16_t)r<<16)|(uint16_t)q; }`;
    }
    case 'DIVU': {
      if (!dst) return '';
      const dv = emitOperand(dst, 'L'), sv = src;
      return `{ uint16_t q=(uint16_t)((uint32_t)${dv}/(uint16_t)${sv}); uint16_t r=(uint16_t)((uint32_t)${dv}%(uint16_t)${sv}); ${dv}=((uint32_t)r<<16)|q; }`;
    }

    case 'AND':  case 'ANDI':
      if (!dst) return '';
      if (dst.kind === 'register' && s === 'L') return `${dst.name} &= ${src};`;
      if (dst.kind === 'register') return `${emitRegSized(dst.name, s)} &= ${emitRegSized(src, s)};`;
      return regWrite(dst, `${emitOperand(dst, s)} & ${src}`, s);
    case 'OR':   case 'ORI':
      if (!dst) return '';
      if (dst.kind === 'register' && s === 'L') return `${dst.name} |= ${src};`;
      if (dst.kind === 'register') return `${emitRegSized(dst.name, s)} |= ${emitRegSized(src, s)};`;
      return regWrite(dst, `${emitOperand(dst, s)} | ${src}`, s);
    case 'EOR':  case 'EORI':
      if (!dst) return '';
      if (dst.kind === 'register' && s === 'L') return `${dst.name} ^= ${src};`;
      if (dst.kind === 'register') return `${emitRegSized(dst.name, s)} ^= ${emitRegSized(src, s)};`;
      return regWrite(dst, `${emitOperand(dst, s)} ^ ${src}`, s);
    case 'NOT': return `${src} = ~${src};`;
    case 'NEG': return `${src} = (uint32_t)(-(int32_t)${src});`;
    case 'CLR': return dst ? regWrite(dst, '0', s) : regWrite(ops[0], '0', s);
    case 'EXT':
      if (s === 'W') return `${src} = (uint32_t)(int32_t)(int16_t)(int8_t)${src};`;
      return `${src} = (uint32_t)(int32_t)(int16_t)${src};`;
    case 'SWAP': return `${src} = (${src} >> 16) | (${src} << 16);`;

    case 'LSL':
      if (!dst) return `${src} <<= 1;`;
      return regWrite(dst, `${emitOperand(dst, s)} << ${src}`, s);
    case 'LSR':
      if (!dst) return `${src} >>= 1;`;
      if (dst.kind === 'register' && s === 'L') return `${dst.name} >>= ${src};`;
      return regWrite(dst, `(uint32_t)(${emitOperand(dst, s)}) >> ${src}`, s);
    case 'ASL':
      if (!dst) return `${src} <<= 1;`;
      return regWrite(dst, `${emitOperand(dst, s)} << ${src}`, s);
    case 'ASR':
      if (!dst) return `${src} = (uint32_t)((int32_t)${src} >> 1);`;
      if (dst.kind === 'register' && s === 'L') return `${dst.name} = (uint32_t)((int32_t)${dst.name} >> ${src});`;
      return regWrite(dst, `(uint32_t)((int32_t)${emitOperand(dst, s)} >> ${src})`, s);
    case 'ROL': return dst ? regWrite(dst, `ROL32(${emitOperand(dst, s)}, ${src})`, s) : ``;
    case 'ROR': return dst ? regWrite(dst, `ROR32(${emitOperand(dst, s)}, ${src})`, s) : ``;

    case 'BSET': return dst ? regWrite(dst, `${emitOperand(dst, s)} | (1u << (${src} & 31))`, s) : '';
    case 'BCLR': return dst ? regWrite(dst, `${emitOperand(dst, s)} & ~(1u << (${src} & 31))`, s) : '';
    case 'BTST': {
      const testOp = dst ?? ops[0];
      return `flag_z = ((${emitOperand(testOp, s)} & (1u << (${src} & 31))) == 0);`;
    }
    case 'BCHG': return dst ? regWrite(dst, `${emitOperand(dst, s)} ^ (1u << (${src} & 31))`, s) : '';

    case 'CMP':  case 'CMPA': case 'CMPI': case 'CMPM': {
      const cmpOp = dst ?? ops[0];
      return `{ int32_t _cmp=(int32_t)${emitOperand(cmpOp,s)}-(int32_t)${src}; flag_z=(_cmp==0); flag_n=(_cmp<0); flag_c=((uint32_t)${emitOperand(cmpOp,s)}<(uint32_t)${src}); }`;
    }
    case 'TST':
      return `flag_z=(${src}==0); flag_n=((int32_t)${src}<0); flag_c=0; flag_v=0;`;

    case 'BRA': case 'JMP': return `goto ${src};`;
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

    case 'DBRA': case 'DBF':
      return `if ((int16_t)(--${src}) >= 0) goto ${ops[1] ? emitOperand(ops[1]) : '???'};`;
    case 'DBEQ':
      return `if (!flag_z && (int16_t)(--${src}) >= 0) goto ${ops[1] ? emitOperand(ops[1]) : '???'};`;
    case 'DBNE':
      return `if (flag_z && (int16_t)(--${src}) >= 0) goto ${ops[1] ? emitOperand(ops[1]) : '???'};`;

    case 'BSR': case 'JSR': return `${src}();`;
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
