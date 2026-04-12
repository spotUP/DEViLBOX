import { D as DEFAULT_FURNACE } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const F_S = 128;
const F_Z = 64;
const F_H = 16;
const F_PV = 4;
const F_N = 2;
const F_C = 1;
class CpuZ80 {
  // ── main registers ─────────────────────────────────────────────────────────
  A = 0;
  F = 0;
  B = 0;
  C = 0;
  D = 0;
  E = 0;
  H = 0;
  L = 0;
  // ── index registers ────────────────────────────────────────────────────────
  IX = 0;
  IY = 0;
  // ── alternate register set ─────────────────────────────────────────────────
  A2 = 0;
  F2 = 0;
  B2 = 0;
  C2 = 0;
  D2 = 0;
  E2 = 0;
  H2 = 0;
  L2 = 0;
  // ── special registers ──────────────────────────────────────────────────────
  I = 0;
  R = 0;
  SP = 65535;
  PC = 0;
  IFF2 = false;
  mem;
  constructor(mem) {
    this.mem = mem;
  }
  // ── Public interface (mirrors Cpu6502.ts style) ───────────────────────────
  reset(pc, sp = 65535) {
    this.PC = pc & 65535;
    this.SP = sp & 65535;
    this.A = 0;
    this.F = 0;
    this.B = 0;
    this.C = 0;
    this.D = 0;
    this.E = 0;
    this.H = 0;
    this.L = 0;
    this.IX = 0;
    this.IY = 0;
    this.I = 0;
    this.R = 0;
    this.IFF2 = false;
  }
  getA() {
    return this.A;
  }
  getB() {
    return this.B;
  }
  getC() {
    return this.C;
  }
  getD() {
    return this.D;
  }
  getE() {
    return this.E;
  }
  getH() {
    return this.H;
  }
  getL() {
    return this.L;
  }
  getPC() {
    return this.PC;
  }
  getSP() {
    return this.SP;
  }
  getAF() {
    return this.A << 8 | this.F;
  }
  getBC() {
    return this.B << 8 | this.C;
  }
  getDE() {
    return this.D << 8 | this.E;
  }
  getHL() {
    return this.H << 8 | this.L;
  }
  getIX() {
    return this.IX;
  }
  getIY() {
    return this.IY;
  }
  setA(v) {
    this.A = v & 255;
  }
  setF(v) {
    this.F = v & 255;
  }
  setB(v) {
    this.B = v & 255;
  }
  setC(v) {
    this.C = v & 255;
  }
  setD(v) {
    this.D = v & 255;
  }
  setE(v) {
    this.E = v & 255;
  }
  setH(v) {
    this.H = v & 255;
  }
  setL(v) {
    this.L = v & 255;
  }
  setAF(v) {
    this.A = v >> 8 & 255;
    this.F = v & 255;
  }
  setBC(v) {
    this.B = v >> 8 & 255;
    this.C = v & 255;
  }
  setDE(v) {
    this.D = v >> 8 & 255;
    this.E = v & 255;
  }
  setHL(v) {
    this.H = v >> 8 & 255;
    this.L = v & 255;
  }
  setIX(v) {
    this.IX = v & 65535;
  }
  setIY(v) {
    this.IY = v & 65535;
  }
  setPC(v) {
    this.PC = v & 65535;
  }
  setSP(v) {
    this.SP = v & 65535;
  }
  // ── Private helpers ───────────────────────────────────────────────────────
  rd(a) {
    return this.mem.read(a & 65535) & 255;
  }
  wr(a, v) {
    this.mem.write(a & 65535, v & 255);
  }
  rd16(a) {
    return this.rd(a) | this.rd(a + 1) << 8;
  }
  wr16(a, v) {
    this.wr(a, v & 255);
    this.wr(a + 1, v >> 8 & 255);
  }
  fetch() {
    const v = this.rd(this.PC);
    this.PC = this.PC + 1 & 65535;
    return v;
  }
  fetch16() {
    const lo = this.fetch();
    const hi = this.fetch();
    return lo | hi << 8;
  }
  // signed 8-bit displacement used by JR and IX/IY indexed addressing
  signedByte(b) {
    return b < 128 ? b : b - 256;
  }
  push8(v) {
    this.SP = this.SP - 1 & 65535;
    this.wr(this.SP, v & 255);
  }
  pop8() {
    const v = this.rd(this.SP);
    this.SP = this.SP + 1 & 65535;
    return v;
  }
  push16(v) {
    this.push8(v >> 8 & 255);
    this.push8(v & 255);
  }
  pop16() {
    const lo = this.pop8();
    const hi = this.pop8();
    return lo | hi << 8;
  }
  // ── Flag helpers ──────────────────────────────────────────────────────────
  setFlags_NZ(v) {
    this.F = this.F & F_C | // preserve carry
    (v === 0 ? F_Z : 0) | v & F_S;
  }
  setFlags_Add(a, b, result) {
    const r8 = result & 255;
    const overflow = (~(a ^ b) & (a ^ result) & 128) !== 0;
    this.F = r8 & F_S | (r8 === 0 ? F_Z : 0) | (a ^ b ^ result) & F_H | (overflow ? F_PV : 0) | (result > 255 ? F_C : 0);
  }
  setFlags_Sub(a, b, result) {
    const r8 = result & 255;
    const overflow = ((a ^ b) & (a ^ result) & 128) !== 0;
    this.F = r8 & F_S | (r8 === 0 ? F_Z : 0) | (a ^ b ^ result) & F_H | (overflow ? F_PV : 0) | F_N | (result < 0 || result > 255 ? F_C : 0);
  }
  setFlags_Logic(v, hFlag) {
    let p = v ^ v >> 4;
    p ^= p >> 2;
    p ^= p >> 1;
    p = ~p & 1;
    this.F = v & F_S | (v === 0 ? F_Z : 0) | hFlag | (p ? F_PV : 0);
  }
  // ── Register index helpers (for 8-bit reg encoding 0-7) ──────────────────
  // The Z80 register table (B,C,D,E,H,L,(HL),A) maps to bits [5:3] in opcodes.
  getReg8(r) {
    switch (r) {
      case 0:
        return this.B;
      case 1:
        return this.C;
      case 2:
        return this.D;
      case 3:
        return this.E;
      case 4:
        return this.H;
      case 5:
        return this.L;
      case 6:
        return this.rd(this.H << 8 | this.L);
      // (HL)
      case 7:
        return this.A;
      default:
        return 0;
    }
  }
  setReg8(r, v) {
    const b = v & 255;
    switch (r) {
      case 0:
        this.B = b;
        break;
      case 1:
        this.C = b;
        break;
      case 2:
        this.D = b;
        break;
      case 3:
        this.E = b;
        break;
      case 4:
        this.H = b;
        break;
      case 5:
        this.L = b;
        break;
      case 6:
        this.wr(this.H << 8 | this.L, b);
        break;
      case 7:
        this.A = b;
        break;
    }
  }
  // ── ALU operations ────────────────────────────────────────────────────────
  aluA(op, val) {
    const a = this.A;
    switch (op & 7) {
      case 0: {
        const r = a + val;
        this.setFlags_Add(a, val, r);
        this.A = r & 255;
        break;
      }
      case 1: {
        const c = this.F & F_C ? 1 : 0;
        const r = a + val + c;
        this.setFlags_Add(a, val, r);
        this.A = r & 255;
        break;
      }
      case 2: {
        const r = a - val;
        this.setFlags_Sub(a, val, r);
        this.A = r & 255;
        break;
      }
      case 3: {
        const c = this.F & F_C ? 1 : 0;
        const r = a - val - c;
        this.setFlags_Sub(a, val + c, r);
        this.A = r & 255;
        break;
      }
      case 4: {
        this.A = a & val & 255;
        this.setFlags_Logic(this.A, F_H);
        break;
      }
      case 5: {
        this.A = (a ^ val) & 255;
        this.setFlags_Logic(this.A, 0);
        break;
      }
      case 6: {
        this.A = (a | val) & 255;
        this.setFlags_Logic(this.A, 0);
        break;
      }
      case 7: {
        const r = a - val;
        this.setFlags_Sub(a, val, r);
        break;
      }
    }
  }
  // ADD HL, rr (16-bit add, only carry flag affected in standard Z80)
  addHL(val) {
    const hl = this.H << 8 | this.L;
    const r = hl + val;
    this.F = this.F & (F_S | F_Z | F_PV) | (hl ^ val ^ r) & F_H | (r > 65535 ? F_C : 0);
    this.H = r >> 8 & 255;
    this.L = r & 255;
  }
  // ── CB prefix: bit operations ─────────────────────────────────────────────
  execCB(op) {
    const reg = op & 7;
    const v = this.getReg8(reg);
    let r;
    switch (op >> 3) {
      case 0: {
        r = (v << 1 | v >> 7) & 255;
        this.setFlags_Logic(r, 0);
        this.F = this.F & ~F_C | v >> 7;
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 1: {
        r = (v >> 1 | v << 7) & 255;
        this.setFlags_Logic(r, 0);
        this.F = this.F & ~F_C | v & 1;
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 2: {
        const cin = this.F & F_C ? 1 : 0;
        r = (v << 1 | cin) & 255;
        this.setFlags_Logic(r, 0);
        this.F = this.F & ~F_C | v >> 7;
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 3: {
        const cin = this.F & F_C ? 1 : 0;
        r = (v >> 1 | cin << 7) & 255;
        this.setFlags_Logic(r, 0);
        this.F = this.F & ~F_C | v & 1;
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 4: {
        r = v << 1 & 255;
        this.setFlags_Logic(r, 0);
        this.F = this.F & ~F_C | v >> 7;
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 5: {
        r = (v >> 1 | v & 128) & 255;
        this.setFlags_Logic(r, 0);
        this.F = this.F & ~F_C | v & 1;
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 6: {
        r = (v << 1 | 1) & 255;
        this.setFlags_Logic(r, 0);
        this.F = this.F & ~F_C | v >> 7;
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 7: {
        r = v >> 1 & 255;
        this.setFlags_Logic(r, 0);
        this.F = this.F & ~F_C | v & 1;
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      default: {
        const bit = op >> 3 & 7;
        const group = op >> 6;
        if (group === 1) {
          const masked = v & 1 << bit;
          this.F = this.F & F_C | (masked === 0 ? F_Z | F_PV : 0) | F_H | masked & F_S;
          return reg === 6 ? 12 : 8;
        } else if (group === 2) {
          this.setReg8(reg, v & ~(1 << bit));
          return reg === 6 ? 15 : 8;
        } else {
          this.setReg8(reg, v | 1 << bit);
          return reg === 6 ? 15 : 8;
        }
      }
    }
  }
  // ── ED prefix ────────────────────────────────────────────────────────────
  execED(op) {
    switch (op) {
      // IN r,(C)  — $40,$48,$50,$58,$60,$68,$70,$78
      case 64:
      case 72:
      case 80:
      case 88:
      case 96:
      case 104:
      case 112:
      case 120: {
        const port = this.C | this.B << 8;
        const v = this.mem.inPort ? this.mem.inPort(port) & 255 : 255;
        this.setFlags_Logic(v, 0);
        const r = op >> 3 & 7;
        if (r !== 6) this.setReg8(r, v);
        return 12;
      }
      // OUT (C),r — $41,$49,$51,$59,$61,$69,$71,$79
      case 65:
      case 73:
      case 81:
      case 89:
      case 97:
      case 105:
      case 113:
      case 121: {
        const port = this.C | this.B << 8;
        const r = op >> 3 & 7;
        const v = r === 6 ? 0 : this.getReg8(r);
        if (this.mem.outPort) this.mem.outPort(port, v);
        return 12;
      }
      // SBC HL, rr
      case 66: {
        const v = this.getBC();
        const hl = this.H << 8 | this.L;
        const c = this.F & F_C ? 1 : 0;
        const r = hl - v - c;
        this.setFlags_Sub(hl, v + c, r);
        this.H = r >> 8 & 255;
        this.L = r & 255;
        return 15;
      }
      case 82: {
        const v = this.getDE();
        const hl = this.H << 8 | this.L;
        const c = this.F & F_C ? 1 : 0;
        const r = hl - v - c;
        this.setFlags_Sub(hl, v + c, r);
        this.H = r >> 8 & 255;
        this.L = r & 255;
        return 15;
      }
      case 98: {
        const hl = this.H << 8 | this.L;
        const c = this.F & F_C ? 1 : 0;
        const r = hl - hl - c;
        this.setFlags_Sub(hl, hl + c, r);
        this.H = r >> 8 & 255;
        this.L = r & 255;
        return 15;
      }
      case 114: {
        const v = this.SP;
        const hl = this.H << 8 | this.L;
        const c = this.F & F_C ? 1 : 0;
        const r = hl - v - c;
        this.setFlags_Sub(hl, v + c, r);
        this.H = r >> 8 & 255;
        this.L = r & 255;
        return 15;
      }
      // ADC HL, rr
      case 74: {
        const v = this.getBC();
        const hl = this.H << 8 | this.L;
        const c = this.F & F_C ? 1 : 0;
        const r = hl + v + c;
        this.setFlags_Add(hl, v, r);
        this.H = r >> 8 & 255;
        this.L = r & 255;
        return 15;
      }
      case 90: {
        const v = this.getDE();
        const hl = this.H << 8 | this.L;
        const c = this.F & F_C ? 1 : 0;
        const r = hl + v + c;
        this.setFlags_Add(hl, v, r);
        this.H = r >> 8 & 255;
        this.L = r & 255;
        return 15;
      }
      case 106: {
        const hl = this.H << 8 | this.L;
        const c = this.F & F_C ? 1 : 0;
        const r = hl + hl + c;
        this.setFlags_Add(hl, hl, r);
        this.H = r >> 8 & 255;
        this.L = r & 255;
        return 15;
      }
      case 122: {
        const v = this.SP;
        const hl = this.H << 8 | this.L;
        const c = this.F & F_C ? 1 : 0;
        const r = hl + v + c;
        this.setFlags_Add(hl, v, r);
        this.H = r >> 8 & 255;
        this.L = r & 255;
        return 15;
      }
      // LD (nn),rr / LD rr,(nn)
      case 67: {
        const a = this.fetch16();
        this.wr16(a, this.B << 8 | this.C);
        return 20;
      }
      case 75: {
        const a = this.fetch16();
        const v = this.rd16(a);
        this.B = v >> 8 & 255;
        this.C = v & 255;
        return 20;
      }
      case 83: {
        const a = this.fetch16();
        this.wr16(a, this.D << 8 | this.E);
        return 20;
      }
      case 91: {
        const a = this.fetch16();
        const v = this.rd16(a);
        this.D = v >> 8 & 255;
        this.E = v & 255;
        return 20;
      }
      case 99: {
        const a = this.fetch16();
        this.wr16(a, this.H << 8 | this.L);
        return 20;
      }
      case 107: {
        const a = this.fetch16();
        const v = this.rd16(a);
        this.H = v >> 8 & 255;
        this.L = v & 255;
        return 20;
      }
      case 115: {
        const a = this.fetch16();
        this.wr16(a, this.SP);
        return 20;
      }
      case 123: {
        const a = this.fetch16();
        this.SP = this.rd16(a);
        return 20;
      }
      // LD I,A / LD R,A
      case 71: {
        this.I = this.A;
        return 9;
      }
      case 79: {
        this.R = this.A;
        return 9;
      }
      // LD A,I / LD A,R
      case 87: {
        this.A = this.I;
        this.setFlags_NZ(this.A);
        if (this.IFF2) this.F |= F_PV;
        else this.F &= ~F_PV;
        return 9;
      }
      case 95: {
        this.A = this.R & 255;
        this.setFlags_NZ(this.A);
        if (this.IFF2) this.F |= F_PV;
        else this.F &= ~F_PV;
        return 9;
      }
      // NEG
      case 68:
      case 76:
      case 84:
      case 92:
      case 100:
      case 108:
      case 116:
      case 124: {
        const a = this.A;
        const r = 0 - a;
        this.setFlags_Sub(0, a, r);
        this.A = r & 255;
        return 8;
      }
      // RETI / RETN
      case 69:
      case 85:
      case 101:
      case 117:
      case 77:
      case 93:
      case 109:
      case 125: {
        this.PC = this.pop16();
        return 14;
      }
      // RLD / RRD
      case 111: {
        const hl = this.H << 8 | this.L;
        const mem = this.rd(hl);
        const newMem = (mem << 4 | this.A & 15) & 255;
        this.A = this.A & 240 | mem >> 4;
        this.wr(hl, newMem);
        this.setFlags_Logic(this.A, 0);
        return 18;
      }
      case 103: {
        const hl = this.H << 8 | this.L;
        const mem = this.rd(hl);
        const newMem = (this.A << 4 | mem >> 4) & 255;
        this.A = this.A & 240 | mem & 15;
        this.wr(hl, newMem);
        this.setFlags_Logic(this.A, 0);
        return 18;
      }
      // LDIR ($B0)
      case 176: {
        let cyc = 0;
        do {
          const hl = this.H << 8 | this.L;
          const de = this.D << 8 | this.E;
          const bc = this.B << 8 | this.C;
          this.wr(de, this.rd(hl));
          const hl2 = hl + 1 & 65535;
          const de2 = de + 1 & 65535;
          const bc2 = bc - 1 & 65535;
          this.H = hl2 >> 8 & 255;
          this.L = hl2 & 255;
          this.D = de2 >> 8 & 255;
          this.E = de2 & 255;
          this.B = bc2 >> 8 & 255;
          this.C = bc2 & 255;
          cyc += 21;
          if (bc2 === 0) break;
        } while (true);
        this.F &= -23;
        return cyc;
      }
      // LDDR ($B8)
      case 184: {
        let cyc = 0;
        do {
          const hl = this.H << 8 | this.L;
          const de = this.D << 8 | this.E;
          const bc = this.B << 8 | this.C;
          this.wr(de, this.rd(hl));
          const hl2 = hl - 1 & 65535;
          const de2 = de - 1 & 65535;
          const bc2 = bc - 1 & 65535;
          this.H = hl2 >> 8 & 255;
          this.L = hl2 & 255;
          this.D = de2 >> 8 & 255;
          this.E = de2 & 255;
          this.B = bc2 >> 8 & 255;
          this.C = bc2 & 255;
          cyc += 21;
          if (bc2 === 0) break;
        } while (true);
        this.F &= -23;
        return cyc;
      }
      // CPIR ($B1)
      case 177: {
        let cyc = 0;
        do {
          const hl = this.H << 8 | this.L;
          const bc = this.B << 8 | this.C;
          const v = this.rd(hl);
          const r = this.A - v;
          const hl2 = hl + 1 & 65535;
          const bc2 = bc - 1 & 65535;
          this.H = hl2 >> 8 & 255;
          this.L = hl2 & 255;
          this.B = bc2 >> 8 & 255;
          this.C = bc2 & 255;
          cyc += 21;
          if ((r & 255) === 0 || bc2 === 0) break;
        } while (true);
        return cyc;
      }
      // CPDR ($B9)
      case 185: {
        let cyc = 0;
        do {
          const hl = this.H << 8 | this.L;
          const bc = this.B << 8 | this.C;
          const v = this.rd(hl);
          const r = this.A - v;
          const hl2 = hl - 1 & 65535;
          const bc2 = bc - 1 & 65535;
          this.H = hl2 >> 8 & 255;
          this.L = hl2 & 255;
          this.B = bc2 >> 8 & 255;
          this.C = bc2 & 255;
          cyc += 21;
          if ((r & 255) === 0 || bc2 === 0) break;
        } while (true);
        return cyc;
      }
      // INIR ($B2) / INDR ($BA) / OTIR ($B3) / OTDR ($BB) — treat as NOP blocks
      case 178:
      case 186:
      case 179:
      case 187:
        return 21;
      // IM 0/1/2
      case 70:
      case 86:
      case 94:
      case 78:
      case 102:
      case 110:
      case 118:
      case 126:
        return 8;
      default:
        return 8;
    }
  }
  // ── DD/FD prefix (IX/IY instructions) ────────────────────────────────────
  execDDFD(prefix) {
    const useIX = prefix === 221;
    const getXY = () => useIX ? this.IX : this.IY;
    const setXY = (v) => {
      if (useIX) this.IX = v & 65535;
      else this.IY = v & 65535;
    };
    const op = this.fetch();
    if (op === 33) {
      setXY(this.fetch16());
      return 14;
    }
    if (op === 34) {
      const a = this.fetch16();
      this.wr16(a, getXY());
      return 20;
    }
    if (op === 42) {
      const a = this.fetch16();
      setXY(this.rd16(a));
      return 20;
    }
    if (op === 249) {
      this.SP = getXY();
      return 10;
    }
    if (op === 229) {
      this.push16(getXY());
      return 15;
    }
    if (op === 225) {
      setXY(this.pop16());
      return 14;
    }
    if (op === 227) {
      const top = this.rd16(this.SP);
      this.wr16(this.SP, getXY());
      setXY(top);
      return 23;
    }
    if (op === 233) {
      this.PC = getXY();
      return 8;
    }
    if (op === 35) {
      setXY(getXY() + 1 & 65535);
      return 10;
    }
    if (op === 43) {
      setXY(getXY() - 1 & 65535);
      return 10;
    }
    if (op === 9) {
      const r = getXY() + (this.B << 8 | this.C);
      this.F = this.F & (F_S | F_Z | F_PV) | (r > 65535 ? F_C : 0);
      setXY(r & 65535);
      return 15;
    }
    if (op === 25) {
      const r = getXY() + (this.D << 8 | this.E);
      this.F = this.F & (F_S | F_Z | F_PV) | (r > 65535 ? F_C : 0);
      setXY(r & 65535);
      return 15;
    }
    if (op === 41) {
      const r = getXY() + getXY();
      this.F = this.F & (F_S | F_Z | F_PV) | (r > 65535 ? F_C : 0);
      setXY(r & 65535);
      return 15;
    }
    if (op === 57) {
      const r = getXY() + this.SP;
      this.F = this.F & (F_S | F_Z | F_PV) | (r > 65535 ? F_C : 0);
      setXY(r & 65535);
      return 15;
    }
    if (op === 52) {
      const d = this.signedByte(this.fetch());
      const a = getXY() + d & 65535;
      const v = this.rd(a) + 1 & 255;
      this.wr(a, v);
      this.setFlags_NZ(v);
      return 23;
    }
    if (op === 53) {
      const d = this.signedByte(this.fetch());
      const a = getXY() + d & 65535;
      const v = this.rd(a) - 1 & 255;
      this.wr(a, v);
      this.setFlags_NZ(v);
      return 23;
    }
    if (op === 54) {
      const d = this.signedByte(this.fetch());
      const n = this.fetch();
      this.wr(getXY() + d & 65535, n);
      return 19;
    }
    if ((op & 199) === 70 && op >> 3 !== 6) {
      const reg = op >> 3 & 7;
      const d = this.signedByte(this.fetch());
      const v = this.rd(getXY() + d & 65535);
      this.setReg8(reg, v);
      return 19;
    }
    if ((op & 248) === 112 && op !== 118) {
      const reg = op & 7;
      const d = this.signedByte(this.fetch());
      this.wr(getXY() + d & 65535, this.getReg8(reg));
      return 19;
    }
    if ((op & 199) === 134) {
      const d = this.signedByte(this.fetch());
      const v = this.rd(getXY() + d & 65535);
      this.aluA(op >> 3, v);
      return 19;
    }
    if (op === 203) {
      const d = this.signedByte(this.fetch());
      const cbop = this.fetch();
      const addr = getXY() + d & 65535;
      const v = this.rd(addr);
      const reg = cbop & 7;
      const bit = cbop >> 3 & 7;
      const group = cbop >> 6;
      if (group === 1) {
        const masked = v & 1 << bit;
        this.F = this.F & F_C | (masked === 0 ? F_Z | F_PV : 0) | F_H | masked & F_S;
        return 20;
      } else if (group === 2) {
        const r2 = v & ~(1 << bit);
        this.wr(addr, r2);
        if (reg !== 6) this.setReg8(reg, r2);
        return 23;
      } else if (group === 3) {
        const r2 = v | 1 << bit;
        this.wr(addr, r2);
        if (reg !== 6) this.setReg8(reg, r2);
        return 23;
      } else {
        const savedH = this.H;
        const savedL = this.L;
        this.H = addr >> 8 & 255;
        this.L = addr & 255;
        const cyc = this.execCB(cbop | 6);
        if (reg !== 6) this.setReg8(reg, this.rd(addr));
        this.H = savedH;
        this.L = savedL;
        return cyc + 8;
      }
    }
    return 8;
  }
  // ── Main decode/execute ───────────────────────────────────────────────────
  /** Execute one instruction, return T-states consumed. */
  step() {
    const op = this.fetch();
    switch (op) {
      // ── NOP ───────────────────────────────────────────────────────────────
      case 0:
        return 4;
      // ── LD r,r' / LD r,n / LD r,(HL) ─────────────────────────────────────
      // LD B,n; LD C,n; LD D,n; LD E,n; LD H,n; LD L,n; LD A,n
      case 6: {
        this.B = this.fetch();
        return 7;
      }
      case 14: {
        this.C = this.fetch();
        return 7;
      }
      case 22: {
        this.D = this.fetch();
        return 7;
      }
      case 30: {
        this.E = this.fetch();
        return 7;
      }
      case 38: {
        this.H = this.fetch();
        return 7;
      }
      case 46: {
        this.L = this.fetch();
        return 7;
      }
      case 62: {
        this.A = this.fetch();
        return 7;
      }
      // LD rr,nn  (16-bit immediate loads)
      case 1: {
        const v = this.fetch16();
        this.B = v >> 8 & 255;
        this.C = v & 255;
        return 10;
      }
      case 17: {
        const v = this.fetch16();
        this.D = v >> 8 & 255;
        this.E = v & 255;
        return 10;
      }
      case 33: {
        const v = this.fetch16();
        this.H = v >> 8 & 255;
        this.L = v & 255;
        return 10;
      }
      case 49: {
        this.SP = this.fetch16();
        return 10;
      }
      // LD HL,(nn) / LD (nn),HL
      case 42: {
        const a = this.fetch16();
        const v = this.rd16(a);
        this.H = v >> 8 & 255;
        this.L = v & 255;
        return 16;
      }
      case 34: {
        const a = this.fetch16();
        this.wr16(a, this.H << 8 | this.L);
        return 16;
      }
      // LD A,(BC) / LD A,(DE) / LD A,(nn)
      case 10: {
        this.A = this.rd(this.B << 8 | this.C);
        return 7;
      }
      case 26: {
        this.A = this.rd(this.D << 8 | this.E);
        return 7;
      }
      case 58: {
        this.A = this.rd(this.fetch16());
        return 13;
      }
      // LD (BC),A / LD (DE),A / LD (nn),A
      case 2: {
        this.wr(this.B << 8 | this.C, this.A);
        return 7;
      }
      case 18: {
        this.wr(this.D << 8 | this.E, this.A);
        return 7;
      }
      case 50: {
        this.wr(this.fetch16(), this.A);
        return 13;
      }
      // LD SP,HL
      case 249: {
        this.SP = this.H << 8 | this.L;
        return 6;
      }
      // ── 8-bit register-to-register moves (0x40..0x7F block) ──────────────
      // HALT is 0x76 (within this range)
      case 118:
        return 4;
      // HALT → treat as NOP for extraction purposes
      case 64:
        return 4;
      // LD B,B (NOP)
      case 65: {
        this.B = this.C;
        return 4;
      }
      case 66: {
        this.B = this.D;
        return 4;
      }
      case 67: {
        this.B = this.E;
        return 4;
      }
      case 68: {
        this.B = this.H;
        return 4;
      }
      case 69: {
        this.B = this.L;
        return 4;
      }
      case 70: {
        this.B = this.rd(this.H << 8 | this.L);
        return 7;
      }
      case 71: {
        this.B = this.A;
        return 4;
      }
      case 72: {
        this.C = this.B;
        return 4;
      }
      case 73:
        return 4;
      // LD C,C
      case 74: {
        this.C = this.D;
        return 4;
      }
      case 75: {
        this.C = this.E;
        return 4;
      }
      case 76: {
        this.C = this.H;
        return 4;
      }
      case 77: {
        this.C = this.L;
        return 4;
      }
      case 78: {
        this.C = this.rd(this.H << 8 | this.L);
        return 7;
      }
      case 79: {
        this.C = this.A;
        return 4;
      }
      case 80: {
        this.D = this.B;
        return 4;
      }
      case 81: {
        this.D = this.C;
        return 4;
      }
      case 82:
        return 4;
      // LD D,D
      case 83: {
        this.D = this.E;
        return 4;
      }
      case 84: {
        this.D = this.H;
        return 4;
      }
      case 85: {
        this.D = this.L;
        return 4;
      }
      case 86: {
        this.D = this.rd(this.H << 8 | this.L);
        return 7;
      }
      case 87: {
        this.D = this.A;
        return 4;
      }
      case 88: {
        this.E = this.B;
        return 4;
      }
      case 89: {
        this.E = this.C;
        return 4;
      }
      case 90: {
        this.E = this.D;
        return 4;
      }
      case 91:
        return 4;
      // LD E,E
      case 92: {
        this.E = this.H;
        return 4;
      }
      case 93: {
        this.E = this.L;
        return 4;
      }
      case 94: {
        this.E = this.rd(this.H << 8 | this.L);
        return 7;
      }
      case 95: {
        this.E = this.A;
        return 4;
      }
      case 96: {
        this.H = this.B;
        return 4;
      }
      case 97: {
        this.H = this.C;
        return 4;
      }
      case 98: {
        this.H = this.D;
        return 4;
      }
      case 99: {
        this.H = this.E;
        return 4;
      }
      case 100:
        return 4;
      // LD H,H
      case 101: {
        this.H = this.L;
        return 4;
      }
      case 102: {
        this.H = this.rd(this.H << 8 | this.L);
        return 7;
      }
      case 103: {
        this.H = this.A;
        return 4;
      }
      case 104: {
        this.L = this.B;
        return 4;
      }
      case 105: {
        this.L = this.C;
        return 4;
      }
      case 106: {
        this.L = this.D;
        return 4;
      }
      case 107: {
        this.L = this.E;
        return 4;
      }
      case 108: {
        this.L = this.H;
        return 4;
      }
      case 109:
        return 4;
      // LD L,L
      case 110: {
        this.L = this.rd(this.H << 8 | this.L);
        return 7;
      }
      case 111: {
        this.L = this.A;
        return 4;
      }
      case 112: {
        this.wr(this.H << 8 | this.L, this.B);
        return 7;
      }
      case 113: {
        this.wr(this.H << 8 | this.L, this.C);
        return 7;
      }
      case 114: {
        this.wr(this.H << 8 | this.L, this.D);
        return 7;
      }
      case 115: {
        this.wr(this.H << 8 | this.L, this.E);
        return 7;
      }
      case 116: {
        this.wr(this.H << 8 | this.L, this.H);
        return 7;
      }
      case 117: {
        this.wr(this.H << 8 | this.L, this.L);
        return 7;
      }
      case 119: {
        this.wr(this.H << 8 | this.L, this.A);
        return 7;
      }
      case 120: {
        this.A = this.B;
        return 4;
      }
      case 121: {
        this.A = this.C;
        return 4;
      }
      case 122: {
        this.A = this.D;
        return 4;
      }
      case 123: {
        this.A = this.E;
        return 4;
      }
      case 124: {
        this.A = this.H;
        return 4;
      }
      case 125: {
        this.A = this.L;
        return 4;
      }
      case 126: {
        this.A = this.rd(this.H << 8 | this.L);
        return 7;
      }
      case 127:
        return 4;
      // LD A,A
      // ── ALU group (0x80..0xBF) ────────────────────────────────────────────
      case 128:
      case 129:
      case 130:
      case 131:
      case 132:
      case 133:
      case 135:
      case 136:
      case 137:
      case 138:
      case 139:
      case 140:
      case 141:
      case 143:
      case 144:
      case 145:
      case 146:
      case 147:
      case 148:
      case 149:
      case 151:
      case 152:
      case 153:
      case 154:
      case 155:
      case 156:
      case 157:
      case 159:
      case 160:
      case 161:
      case 162:
      case 163:
      case 164:
      case 165:
      case 167:
      case 168:
      case 169:
      case 170:
      case 171:
      case 172:
      case 173:
      case 175:
      case 176:
      case 177:
      case 178:
      case 179:
      case 180:
      case 181:
      case 183:
      case 184:
      case 185:
      case 186:
      case 187:
      case 188:
      case 189:
      case 191: {
        this.aluA(op >> 3, this.getReg8(op & 7));
        return (op & 7) === 6 ? 7 : 4;
      }
      // ALU on (HL): already handled above via getReg8(6), but opcodes 0x86/8E etc
      case 134:
      case 142:
      case 150:
      case 158:
      case 166:
      case 174:
      case 182:
      case 190: {
        this.aluA(op >> 3, this.rd(this.H << 8 | this.L));
        return 7;
      }
      // ── ALU immediate (0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE) ─
      case 198: {
        this.aluA(0, this.fetch());
        return 7;
      }
      // ADD A,n
      case 206: {
        this.aluA(1, this.fetch());
        return 7;
      }
      // ADC A,n
      case 214: {
        this.aluA(2, this.fetch());
        return 7;
      }
      // SUB n
      case 222: {
        this.aluA(3, this.fetch());
        return 7;
      }
      // SBC A,n
      case 230: {
        this.aluA(4, this.fetch());
        return 7;
      }
      // AND n
      case 238: {
        this.aluA(5, this.fetch());
        return 7;
      }
      // XOR n
      case 246: {
        this.aluA(6, this.fetch());
        return 7;
      }
      // OR n
      case 254: {
        this.aluA(7, this.fetch());
        return 7;
      }
      // CP n
      // ── INC / DEC 8-bit ──────────────────────────────────────────────────
      case 4: {
        const v = this.B + 1 & 255;
        this.B = v;
        this.setFlags_NZ(v);
        return 4;
      }
      case 12: {
        const v = this.C + 1 & 255;
        this.C = v;
        this.setFlags_NZ(v);
        return 4;
      }
      case 20: {
        const v = this.D + 1 & 255;
        this.D = v;
        this.setFlags_NZ(v);
        return 4;
      }
      case 28: {
        const v = this.E + 1 & 255;
        this.E = v;
        this.setFlags_NZ(v);
        return 4;
      }
      case 36: {
        const v = this.H + 1 & 255;
        this.H = v;
        this.setFlags_NZ(v);
        return 4;
      }
      case 44: {
        const v = this.L + 1 & 255;
        this.L = v;
        this.setFlags_NZ(v);
        return 4;
      }
      case 52: {
        const a = this.H << 8 | this.L;
        const v = this.rd(a) + 1 & 255;
        this.wr(a, v);
        this.setFlags_NZ(v);
        return 11;
      }
      case 60: {
        const v = this.A + 1 & 255;
        this.A = v;
        this.setFlags_NZ(v);
        return 4;
      }
      case 5: {
        const v = this.B - 1 & 255;
        this.B = v;
        this.setFlags_NZ(v);
        this.F |= F_N;
        return 4;
      }
      case 13: {
        const v = this.C - 1 & 255;
        this.C = v;
        this.setFlags_NZ(v);
        this.F |= F_N;
        return 4;
      }
      case 21: {
        const v = this.D - 1 & 255;
        this.D = v;
        this.setFlags_NZ(v);
        this.F |= F_N;
        return 4;
      }
      case 29: {
        const v = this.E - 1 & 255;
        this.E = v;
        this.setFlags_NZ(v);
        this.F |= F_N;
        return 4;
      }
      case 37: {
        const v = this.H - 1 & 255;
        this.H = v;
        this.setFlags_NZ(v);
        this.F |= F_N;
        return 4;
      }
      case 45: {
        const v = this.L - 1 & 255;
        this.L = v;
        this.setFlags_NZ(v);
        this.F |= F_N;
        return 4;
      }
      case 53: {
        const a = this.H << 8 | this.L;
        const v = this.rd(a) - 1 & 255;
        this.wr(a, v);
        this.setFlags_NZ(v);
        this.F |= F_N;
        return 11;
      }
      case 61: {
        const v = this.A - 1 & 255;
        this.A = v;
        this.setFlags_NZ(v);
        this.F |= F_N;
        return 4;
      }
      // ── INC / DEC 16-bit ─────────────────────────────────────────────────
      case 3: {
        const v = (this.B << 8 | this.C) + 1;
        this.B = v >> 8 & 255;
        this.C = v & 255;
        return 6;
      }
      case 19: {
        const v = (this.D << 8 | this.E) + 1;
        this.D = v >> 8 & 255;
        this.E = v & 255;
        return 6;
      }
      case 35: {
        const v = (this.H << 8 | this.L) + 1;
        this.H = v >> 8 & 255;
        this.L = v & 255;
        return 6;
      }
      case 51: {
        this.SP = this.SP + 1 & 65535;
        return 6;
      }
      case 11: {
        const v = (this.B << 8 | this.C) - 1;
        this.B = v >> 8 & 255;
        this.C = v & 255;
        return 6;
      }
      case 27: {
        const v = (this.D << 8 | this.E) - 1;
        this.D = v >> 8 & 255;
        this.E = v & 255;
        return 6;
      }
      case 43: {
        const v = (this.H << 8 | this.L) - 1;
        this.H = v >> 8 & 255;
        this.L = v & 255;
        return 6;
      }
      case 59: {
        this.SP = this.SP - 1 & 65535;
        return 6;
      }
      // ── ADD HL,rr ────────────────────────────────────────────────────────
      case 9: {
        this.addHL(this.B << 8 | this.C);
        return 11;
      }
      case 25: {
        this.addHL(this.D << 8 | this.E);
        return 11;
      }
      case 41: {
        this.addHL(this.H << 8 | this.L);
        return 11;
      }
      case 57: {
        this.addHL(this.SP);
        return 11;
      }
      // ── Rotates (A-register shortcuts) ────────────────────────────────────
      case 7: {
        const c = this.A >> 7 & 1;
        this.A = (this.A << 1 | c) & 255;
        this.F = this.F & (F_S | F_Z | F_PV) | c;
        return 4;
      }
      case 15: {
        const c = this.A & 1;
        this.A = (this.A >> 1 | c << 7) & 255;
        this.F = this.F & (F_S | F_Z | F_PV) | c;
        return 4;
      }
      case 23: {
        const cin = this.F & F_C;
        const cout = this.A >> 7 & 1;
        this.A = (this.A << 1 | cin) & 255;
        this.F = this.F & (F_S | F_Z | F_PV) | cout;
        return 4;
      }
      case 31: {
        const cin = (this.F & F_C) << 7;
        const cout = this.A & 1;
        this.A = (this.A >> 1 | cin) & 255;
        this.F = this.F & (F_S | F_Z | F_PV) | cout;
        return 4;
      }
      // ── DAA ───────────────────────────────────────────────────────────────
      case 39: {
        let a = this.A;
        const n = (this.F & F_N) !== 0;
        const c = (this.F & F_C) !== 0;
        const h = (this.F & F_H) !== 0;
        if (!n) {
          if (h || (a & 15) > 9) a += 6;
          if (c || a > 153) {
            a += 96;
            this.F |= F_C;
          }
        } else {
          if (h || (a & 15) > 9) a -= 6;
          if (c || this.A > 153) {
            a -= 96;
          }
        }
        this.A = a & 255;
        this.setFlags_NZ(this.A);
        return 4;
      }
      // ── CPL ───────────────────────────────────────────────────────────────
      case 47: {
        this.A ^= 255;
        this.F |= F_H | F_N;
        return 4;
      }
      // ── SCF / CCF ────────────────────────────────────────────────────────
      case 55: {
        this.F = this.F & (F_S | F_Z | F_PV) | F_C;
        return 4;
      }
      case 63: {
        const wasC = this.F & F_C;
        this.F = this.F & (F_S | F_Z | F_PV) | (wasC ? F_H : 0) | (wasC ? 0 : F_C);
        return 4;
      }
      // ── PUSH / POP ────────────────────────────────────────────────────────
      case 197: {
        this.push16(this.B << 8 | this.C);
        return 11;
      }
      case 213: {
        this.push16(this.D << 8 | this.E);
        return 11;
      }
      case 229: {
        this.push16(this.H << 8 | this.L);
        return 11;
      }
      case 245: {
        this.push16(this.A << 8 | this.F);
        return 11;
      }
      case 193: {
        const v = this.pop16();
        this.B = v >> 8 & 255;
        this.C = v & 255;
        return 10;
      }
      case 209: {
        const v = this.pop16();
        this.D = v >> 8 & 255;
        this.E = v & 255;
        return 10;
      }
      case 225: {
        const v = this.pop16();
        this.H = v >> 8 & 255;
        this.L = v & 255;
        return 10;
      }
      case 241: {
        const v = this.pop16();
        this.A = v >> 8 & 255;
        this.F = v & 255;
        return 10;
      }
      // ── EX instructions ──────────────────────────────────────────────────
      case 8: {
        const ta = this.A;
        const tf = this.F;
        this.A = this.A2;
        this.F = this.F2;
        this.A2 = ta;
        this.F2 = tf;
        return 4;
      }
      case 217: {
        let t;
        t = this.B;
        this.B = this.B2;
        this.B2 = t;
        t = this.C;
        this.C = this.C2;
        this.C2 = t;
        t = this.D;
        this.D = this.D2;
        this.D2 = t;
        t = this.E;
        this.E = this.E2;
        this.E2 = t;
        t = this.H;
        this.H = this.H2;
        this.H2 = t;
        t = this.L;
        this.L = this.L2;
        this.L2 = t;
        return 4;
      }
      case 235: {
        const td = this.D;
        const te = this.E;
        this.D = this.H;
        this.E = this.L;
        this.H = td;
        this.L = te;
        return 4;
      }
      case 227: {
        const lo = this.rd(this.SP);
        const hi = this.rd(this.SP + 1 & 65535);
        this.wr(this.SP, this.L);
        this.wr(this.SP + 1 & 65535, this.H);
        this.H = hi;
        this.L = lo;
        return 19;
      }
      // ── Jumps ─────────────────────────────────────────────────────────────
      case 195: {
        this.PC = this.fetch16();
        return 10;
      }
      // JP nn
      case 194: {
        const a = this.fetch16();
        if (!(this.F & F_Z)) this.PC = a;
        return 10;
      }
      // JP NZ,nn
      case 202: {
        const a = this.fetch16();
        if (this.F & F_Z) this.PC = a;
        return 10;
      }
      // JP Z,nn
      case 210: {
        const a = this.fetch16();
        if (!(this.F & F_C)) this.PC = a;
        return 10;
      }
      // JP NC,nn
      case 218: {
        const a = this.fetch16();
        if (this.F & F_C) this.PC = a;
        return 10;
      }
      // JP C,nn
      case 226: {
        const a = this.fetch16();
        if (!(this.F & F_PV)) this.PC = a;
        return 10;
      }
      // JP PO,nn
      case 234: {
        const a = this.fetch16();
        if (this.F & F_PV) this.PC = a;
        return 10;
      }
      // JP PE,nn
      case 242: {
        const a = this.fetch16();
        if (!(this.F & F_S)) this.PC = a;
        return 10;
      }
      // JP P,nn
      case 250: {
        const a = this.fetch16();
        if (this.F & F_S) this.PC = a;
        return 10;
      }
      // JP M,nn
      case 233: {
        this.PC = this.H << 8 | this.L;
        return 4;
      }
      // JP (HL)
      // ── JR ────────────────────────────────────────────────────────────────
      case 24: {
        const d = this.signedByte(this.fetch());
        this.PC = this.PC + d & 65535;
        return 12;
      }
      // JR e
      case 32: {
        const d = this.signedByte(this.fetch());
        if (!(this.F & F_Z)) this.PC = this.PC + d & 65535;
        return 7;
      }
      // JR NZ,e
      case 40: {
        const d = this.signedByte(this.fetch());
        if (this.F & F_Z) this.PC = this.PC + d & 65535;
        return 7;
      }
      // JR Z,e
      case 48: {
        const d = this.signedByte(this.fetch());
        if (!(this.F & F_C)) this.PC = this.PC + d & 65535;
        return 7;
      }
      // JR NC,e
      case 56: {
        const d = this.signedByte(this.fetch());
        if (this.F & F_C) this.PC = this.PC + d & 65535;
        return 7;
      }
      // JR C,e
      // ── DJNZ ─────────────────────────────────────────────────────────────
      case 16: {
        const d = this.signedByte(this.fetch());
        this.B = this.B - 1 & 255;
        if (this.B !== 0) {
          this.PC = this.PC + d & 65535;
          return 13;
        }
        return 8;
      }
      // ── CALL / RET ────────────────────────────────────────────────────────
      case 205: {
        const a = this.fetch16();
        this.push16(this.PC);
        this.PC = a;
        return 17;
      }
      // CALL nn
      case 196: {
        const a = this.fetch16();
        if (!(this.F & F_Z)) {
          this.push16(this.PC);
          this.PC = a;
          return 17;
        }
        return 10;
      }
      case 204: {
        const a = this.fetch16();
        if (this.F & F_Z) {
          this.push16(this.PC);
          this.PC = a;
          return 17;
        }
        return 10;
      }
      case 212: {
        const a = this.fetch16();
        if (!(this.F & F_C)) {
          this.push16(this.PC);
          this.PC = a;
          return 17;
        }
        return 10;
      }
      case 220: {
        const a = this.fetch16();
        if (this.F & F_C) {
          this.push16(this.PC);
          this.PC = a;
          return 17;
        }
        return 10;
      }
      case 228: {
        const a = this.fetch16();
        if (!(this.F & F_PV)) {
          this.push16(this.PC);
          this.PC = a;
          return 17;
        }
        return 10;
      }
      case 236: {
        const a = this.fetch16();
        if (this.F & F_PV) {
          this.push16(this.PC);
          this.PC = a;
          return 17;
        }
        return 10;
      }
      case 244: {
        const a = this.fetch16();
        if (!(this.F & F_S)) {
          this.push16(this.PC);
          this.PC = a;
          return 17;
        }
        return 10;
      }
      case 252: {
        const a = this.fetch16();
        if (this.F & F_S) {
          this.push16(this.PC);
          this.PC = a;
          return 17;
        }
        return 10;
      }
      case 201: {
        this.PC = this.pop16();
        return 10;
      }
      // RET
      case 192: {
        if (!(this.F & F_Z)) {
          this.PC = this.pop16();
          return 11;
        }
        return 5;
      }
      // RET NZ
      case 200: {
        if (this.F & F_Z) {
          this.PC = this.pop16();
          return 11;
        }
        return 5;
      }
      // RET Z
      case 208: {
        if (!(this.F & F_C)) {
          this.PC = this.pop16();
          return 11;
        }
        return 5;
      }
      // RET NC
      case 216: {
        if (this.F & F_C) {
          this.PC = this.pop16();
          return 11;
        }
        return 5;
      }
      // RET C
      case 224: {
        if (!(this.F & F_PV)) {
          this.PC = this.pop16();
          return 11;
        }
        return 5;
      }
      // RET PO
      case 232: {
        if (this.F & F_PV) {
          this.PC = this.pop16();
          return 11;
        }
        return 5;
      }
      // RET PE
      case 240: {
        if (!(this.F & F_S)) {
          this.PC = this.pop16();
          return 11;
        }
        return 5;
      }
      // RET P
      case 248: {
        if (this.F & F_S) {
          this.PC = this.pop16();
          return 11;
        }
        return 5;
      }
      // RET M
      // ── RST ───────────────────────────────────────────────────────────────
      case 199: {
        this.push16(this.PC);
        this.PC = 0;
        return 11;
      }
      case 207: {
        this.push16(this.PC);
        this.PC = 8;
        return 11;
      }
      case 215: {
        this.push16(this.PC);
        this.PC = 16;
        return 11;
      }
      case 223: {
        this.push16(this.PC);
        this.PC = 24;
        return 11;
      }
      case 231: {
        this.push16(this.PC);
        this.PC = 32;
        return 11;
      }
      case 239: {
        this.push16(this.PC);
        this.PC = 40;
        return 11;
      }
      case 247: {
        this.push16(this.PC);
        this.PC = 48;
        return 11;
      }
      case 255: {
        this.push16(this.PC);
        this.PC = 56;
        return 11;
      }
      // ── IN / OUT ──────────────────────────────────────────────────────────
      case 219: {
        const port = this.fetch();
        this.A = this.mem.inPort ? this.mem.inPort(port) & 255 : 255;
        return 11;
      }
      case 211: {
        const port = this.fetch();
        if (this.mem.outPort) this.mem.outPort(port, this.A);
        return 11;
      }
      // ── EI / DI ───────────────────────────────────────────────────────────
      case 251: {
        this.IFF2 = true;
        return 4;
      }
      case 243: {
        this.IFF2 = false;
        return 4;
      }
      // ── Prefix dispatch ──────────────────────────────────────────────────
      case 203: {
        return this.execCB(this.fetch());
      }
      case 237: {
        return this.execED(this.fetch());
      }
      case 221: {
        return this.execDDFD(221);
      }
      case 253: {
        return this.execDDFD(253);
      }
      // ── Unimplemented → NOP ───────────────────────────────────────────────
      default:
        return 4;
    }
  }
  /**
   * Call subroutine at addr and run until it returns (SP returns to initial
   * level).  Uses a cycle limit as a safety net.
   *
   * After this returns, PC is left past the fake return address pushed here.
   * Callers should not rely on getPC() after callSubroutine.
   */
  callSubroutine(addr, maxCycles = 2e5) {
    const targetSP = this.SP;
    this.push16(65535);
    this.PC = addr & 65535;
    let cycles = 0;
    while (cycles < maxCycles) {
      cycles += this.step();
      if (this.SP >= targetSP) break;
    }
  }
}
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function emptyPattern(numCh) {
  return {
    id: "p0",
    name: "Pattern 1",
    length: 16,
    channels: Array.from({ length: numCh }, (_, i) => ({
      id: `ch${i}`,
      name: `AY ${String.fromCharCode(65 + i)}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 16 }, emptyCell)
    }))
  };
}
function readRelStr(buf, ptrOff) {
  if (ptrOff + 2 > buf.length) return "";
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rel = dv.getInt16(ptrOff, false);
  if (rel === 0) return "";
  const abs = ptrOff + rel;
  if (abs < 0 || abs >= buf.length) return "";
  let s = "", i = abs;
  while (i < buf.length && buf[i] !== 0) s += String.fromCharCode(buf[i++]);
  return s.trim();
}
const AY_CLOCK = 1773400;
function ayPeriodToNote(period) {
  if (period <= 0) return 0;
  const freq = AY_CLOCK / (16 * period);
  if (freq < 20 || freq > 2e4) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}
function parseSongDescriptor(buf, songDescOff) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const dataRel = dv.getInt16(songDescOff + 2, false);
  const dataOff = songDescOff + 2 + dataRel;
  if (dataOff < 0 || dataOff + 10 > buf.length) {
    throw new Error(`AY song data block out of range: dataOff=${dataOff}`);
  }
  const initAddr = dv.getUint16(dataOff + 2, false);
  const intrAddr = dv.getUint16(dataOff + 4, false);
  const stackAddr = dv.getUint16(dataOff + 6, false);
  let blockOff = dataOff + 10;
  const memBlocks = [];
  while (blockOff + 4 <= buf.length) {
    const targetAddr = dv.getUint16(blockOff, false);
    const rawLen = dv.getUint16(blockOff + 2, false);
    if (targetAddr === 0 && rawLen === 0) break;
    const dataLen = rawLen === 0 ? 65536 : rawLen;
    blockOff += 4;
    const end = Math.min(blockOff + dataLen, buf.length);
    const data = buf.slice(blockOff, end);
    memBlocks.push({ addr: targetAddr, data });
    blockOff += dataLen;
  }
  return { initAddr, intrAddr, stackAddr, memBlocks };
}
function runAYEmulation(desc) {
  const FRAMES = 300;
  const STACK = desc.stackAddr > 0 && desc.stackAddr <= 65535 ? desc.stackAddr : 61440;
  const ram = new Uint8Array(65536);
  for (const block of desc.memBlocks) {
    const len = Math.min(block.data.length, 65536 - block.addr);
    ram.set(block.data.subarray(0, len), block.addr);
  }
  function isCovered(addr) {
    return desc.memBlocks.some((b) => addr >= b.addr && addr < b.addr + b.data.length);
  }
  if (!isCovered(desc.initAddr) || !isCovered(desc.intrAddr)) {
    return [];
  }
  const ayRegs = new Uint8Array(16);
  let selectedReg = 0;
  const mem = {
    read: (addr) => ram[addr & 65535],
    write: (addr, val) => {
      ram[addr & 65535] = val & 255;
    },
    outPort: (port, val) => {
      const p16 = port & 65535;
      if (p16 === 65533) {
        selectedReg = val & 15;
      } else if (p16 === 49149) {
        ayRegs[selectedReg] = val & 255;
      }
    }
  };
  const cpu = new CpuZ80(mem);
  cpu.reset(desc.initAddr, STACK);
  cpu.callSubroutine(desc.initAddr);
  const frames = [];
  for (let f = 0; f < FRAMES; f++) {
    cpu.callSubroutine(desc.intrAddr);
    frames.push(new Uint8Array(ayRegs));
  }
  return frames;
}
const MAX_ROWS = 256;
function framesToPattern(frames) {
  const step = Math.max(1, Math.ceil(frames.length / MAX_ROWS));
  const rows = Math.min(MAX_ROWS, Math.ceil(frames.length / step));
  const pat = {
    id: "p0",
    name: "Pattern 1",
    length: rows,
    channels: Array.from({ length: 3 }, (_, i) => ({
      id: `ch${i}`,
      name: `AY ${String.fromCharCode(65 + i)}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rows }, emptyCell)
    }))
  };
  const lastNote = [0, 0, 0];
  const lastVol = [-1, -1, -1];
  for (let row = 0; row < rows; row++) {
    const f = frames[Math.min(row * step, frames.length - 1)];
    const mixer = f[7] ?? 255;
    for (let ch = 0; ch < 3; ch++) {
      const periodLo = f[ch * 2] ?? 0;
      const periodHi = (f[ch * 2 + 1] ?? 0) & 15;
      const period = periodHi << 8 | periodLo;
      const vol = (f[8 + ch] ?? 0) & 15;
      const toneOn = !(mixer >> ch & 1);
      const note = toneOn && vol > 0 && period > 0 ? ayPeriodToNote(period) : 0;
      const cell = pat.channels[ch].rows[row];
      if (note !== lastNote[ch]) {
        cell.note = note > 0 ? note : lastNote[ch] > 0 ? 97 : 0;
        if (note > 0) cell.instrument = 1;
        lastNote[ch] = note;
      }
      if (vol !== lastVol[ch]) {
        cell.volume = vol > 0 ? Math.round(vol / 15 * 64) : 0;
        lastVol[ch] = vol;
      }
    }
  }
  return pat;
}
function isAYFormat(buffer) {
  const b = new Uint8Array(buffer);
  if (b.length < 8) return false;
  return String.fromCharCode(b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]) === "ZXAYEMUL";
}
async function parseAYFile(buffer, filename) {
  if (!isAYFormat(buffer)) throw new Error("Not a valid AY file");
  const buf = new Uint8Array(buffer);
  const isYM = buf[8] === 1;
  const numSongs = (buf[18] ?? 0) + 1;
  const author = readRelStr(buf, 14);
  const misc = readRelStr(buf, 16);
  const chipLabel = isYM ? "YM" : "AY";
  const instruments = Array.from({ length: 3 }, (_, i) => ({
    id: i + 1,
    name: `${chipLabel} ${String.fromCharCode(65 + i)}`,
    type: "synth",
    synthType: "FurnaceAY",
    furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 },
    effects: [],
    volume: 0,
    pan: 0
  }));
  const name = misc || filename.replace(/\.ay$/i, "");
  let pattern;
  try {
    const songDescOff = 20;
    const desc = parseSongDescriptor(buf, songDescOff);
    if (desc.initAddr === 0 || desc.intrAddr === 0) {
      throw new Error("AY init/interrupt address is zero — cannot emulate");
    }
    if (desc.memBlocks.length === 0) {
      throw new Error("AY file has no memory blocks");
    }
    const frames = runAYEmulation(desc);
    pattern = framesToPattern(frames);
  } catch {
    pattern = emptyPattern(3);
  }
  return {
    name: name + (author ? ` — ${author}` : ""),
    format: "AY",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: numSongs > 1 ? numSongs : 1,
    restartPosition: 0,
    numChannels: 3,
    initialSpeed: 6,
    initialBPM: 125
  };
}
export {
  isAYFormat,
  parseAYFile
};
