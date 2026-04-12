class Cpu6502 {
  mem;
  A = 0;
  X = 0;
  Y = 0;
  SP = 253;
  PC = 0;
  // Status flags as individual bits
  N = 0;
  V = 0;
  B = 1;
  D = 0;
  I = 1;
  Z = 0;
  C = 0;
  constructor(mem) {
    this.mem = mem;
  }
  reset(pc, sp = 253) {
    this.PC = pc;
    this.SP = sp;
    this.A = 0;
    this.X = 0;
    this.Y = 0;
    this.N = 0;
    this.V = 0;
    this.B = 1;
    this.D = 0;
    this.I = 1;
    this.Z = 1;
    this.C = 0;
  }
  getA() {
    return this.A;
  }
  getX() {
    return this.X;
  }
  getY() {
    return this.Y;
  }
  getPC() {
    return this.PC;
  }
  getSP() {
    return this.SP;
  }
  setA(v) {
    this.A = v & 255;
  }
  setX(v) {
    this.X = v & 255;
  }
  setY(v) {
    this.Y = v & 255;
  }
  setPC(v) {
    this.PC = v & 65535;
  }
  rd(a) {
    return this.mem.read(a & 65535) & 255;
  }
  wr(a, v) {
    this.mem.write(a & 65535, v & 255);
  }
  // 6502 page-wrap bug on indirect JMP: high byte wraps within page
  rd16wrap(a) {
    return this.rd(a) | this.rd(a & 65280 | a + 1 & 255) << 8;
  }
  fetch() {
    return this.rd(this.PC++);
  }
  fetch16() {
    const lo = this.fetch();
    const hi = this.fetch();
    return lo | hi << 8;
  }
  push(v) {
    this.wr(256 | this.SP, v);
    this.SP = this.SP - 1 & 255;
  }
  pop() {
    this.SP = this.SP + 1 & 255;
    return this.rd(256 | this.SP);
  }
  getP() {
    return this.N << 7 | this.V << 6 | 1 << 5 | this.B << 4 | this.D << 3 | this.I << 2 | this.Z << 1 | this.C;
  }
  setP(v) {
    this.N = v >> 7 & 1;
    this.V = v >> 6 & 1;
    this.B = v >> 4 & 1;
    this.D = v >> 3 & 1;
    this.I = v >> 2 & 1;
    this.Z = v >> 1 & 1;
    this.C = v & 1;
  }
  nz(v) {
    this.N = v >> 7 & 1;
    this.Z = v === 0 ? 1 : 0;
  }
  adc(val) {
    const r = this.A + val + this.C;
    this.V = ~(this.A ^ val) & (this.A ^ r) & 128 ? 1 : 0;
    this.C = r > 255 ? 1 : 0;
    this.A = r & 255;
    this.nz(this.A);
  }
  sbc(val) {
    this.adc(val ^ 255);
  }
  cmp(a, b) {
    const r = a - b;
    this.N = r >> 7 & 1;
    this.Z = (r & 255) === 0 ? 1 : 0;
    this.C = a >= b ? 1 : 0;
  }
  branch(cond) {
    const off = this.fetch();
    if (cond) this.PC = this.PC + (off < 128 ? off : off - 256) & 65535;
  }
  asl(v) {
    this.C = v >> 7 & 1;
    v = v << 1 & 255;
    this.nz(v);
    return v;
  }
  lsr(v) {
    this.C = v & 1;
    v = v >> 1;
    this.nz(v);
    return v;
  }
  rol(v) {
    const c = this.C;
    this.C = v >> 7 & 1;
    v = (v << 1 | c) & 255;
    this.nz(v);
    return v;
  }
  ror(v) {
    const c = this.C;
    this.C = v & 1;
    v = v >> 1 | c << 7;
    this.nz(v);
    return v;
  }
  /** Execute one instruction, return cycles consumed. */
  step() {
    const op = this.fetch();
    switch (op) {
      // ── LDA ──
      case 169: {
        const v = this.fetch();
        this.A = v;
        this.nz(v);
        return 2;
      }
      case 165: {
        const v = this.rd(this.fetch());
        this.A = v;
        this.nz(v);
        return 3;
      }
      case 181: {
        const v = this.rd(this.fetch() + this.X & 255);
        this.A = v;
        this.nz(v);
        return 4;
      }
      case 173: {
        const v = this.rd(this.fetch16());
        this.A = v;
        this.nz(v);
        return 4;
      }
      case 189: {
        const v = this.rd(this.fetch16() + this.X);
        this.A = v;
        this.nz(v);
        return 4;
      }
      case 185: {
        const v = this.rd(this.fetch16() + this.Y);
        this.A = v;
        this.nz(v);
        return 4;
      }
      case 161: {
        const zp = this.fetch() + this.X & 255;
        const v = this.rd(this.rd16wrap(zp));
        this.A = v;
        this.nz(v);
        return 6;
      }
      case 177: {
        const zp = this.fetch();
        const v = this.rd(this.rd16wrap(zp) + this.Y);
        this.A = v;
        this.nz(v);
        return 5;
      }
      // ── LDX ──
      case 162: {
        const v = this.fetch();
        this.X = v;
        this.nz(v);
        return 2;
      }
      case 166: {
        const v = this.rd(this.fetch());
        this.X = v;
        this.nz(v);
        return 3;
      }
      case 182: {
        const v = this.rd(this.fetch() + this.Y & 255);
        this.X = v;
        this.nz(v);
        return 4;
      }
      case 174: {
        const v = this.rd(this.fetch16());
        this.X = v;
        this.nz(v);
        return 4;
      }
      case 190: {
        const v = this.rd(this.fetch16() + this.Y);
        this.X = v;
        this.nz(v);
        return 4;
      }
      // ── LDY ──
      case 160: {
        const v = this.fetch();
        this.Y = v;
        this.nz(v);
        return 2;
      }
      case 164: {
        const v = this.rd(this.fetch());
        this.Y = v;
        this.nz(v);
        return 3;
      }
      case 180: {
        const v = this.rd(this.fetch() + this.X & 255);
        this.Y = v;
        this.nz(v);
        return 4;
      }
      case 172: {
        const v = this.rd(this.fetch16());
        this.Y = v;
        this.nz(v);
        return 4;
      }
      case 188: {
        const v = this.rd(this.fetch16() + this.X);
        this.Y = v;
        this.nz(v);
        return 4;
      }
      // ── STA ──
      case 133: {
        this.wr(this.fetch(), this.A);
        return 3;
      }
      case 149: {
        this.wr(this.fetch() + this.X & 255, this.A);
        return 4;
      }
      case 141: {
        this.wr(this.fetch16(), this.A);
        return 4;
      }
      case 157: {
        this.wr(this.fetch16() + this.X, this.A);
        return 5;
      }
      case 153: {
        this.wr(this.fetch16() + this.Y, this.A);
        return 5;
      }
      case 129: {
        const zp = this.fetch() + this.X & 255;
        this.wr(this.rd16wrap(zp), this.A);
        return 6;
      }
      case 145: {
        const zp = this.fetch();
        this.wr(this.rd16wrap(zp) + this.Y, this.A);
        return 6;
      }
      // ── STX ──
      case 134: {
        this.wr(this.fetch(), this.X);
        return 3;
      }
      case 150: {
        this.wr(this.fetch() + this.Y & 255, this.X);
        return 4;
      }
      case 142: {
        this.wr(this.fetch16(), this.X);
        return 4;
      }
      // ── STY ──
      case 132: {
        this.wr(this.fetch(), this.Y);
        return 3;
      }
      case 148: {
        this.wr(this.fetch() + this.X & 255, this.Y);
        return 4;
      }
      case 140: {
        this.wr(this.fetch16(), this.Y);
        return 4;
      }
      // ── Transfers ──
      case 170: {
        this.X = this.A;
        this.nz(this.X);
        return 2;
      }
      case 168: {
        this.Y = this.A;
        this.nz(this.Y);
        return 2;
      }
      case 138: {
        this.A = this.X;
        this.nz(this.A);
        return 2;
      }
      case 152: {
        this.A = this.Y;
        this.nz(this.A);
        return 2;
      }
      case 186: {
        this.X = this.SP;
        this.nz(this.X);
        return 2;
      }
      case 154: {
        this.SP = this.X;
        return 2;
      }
      // ── Stack ──
      case 72: {
        this.push(this.A);
        return 3;
      }
      case 104: {
        this.A = this.pop();
        this.nz(this.A);
        return 4;
      }
      case 8: {
        this.push(this.getP() | 16);
        return 3;
      }
      case 40: {
        this.setP(this.pop());
        return 4;
      }
      // ── ADC ──
      case 105: {
        this.adc(this.fetch());
        return 2;
      }
      case 101: {
        this.adc(this.rd(this.fetch()));
        return 3;
      }
      case 117: {
        this.adc(this.rd(this.fetch() + this.X & 255));
        return 4;
      }
      case 109: {
        this.adc(this.rd(this.fetch16()));
        return 4;
      }
      case 125: {
        this.adc(this.rd(this.fetch16() + this.X));
        return 4;
      }
      case 121: {
        this.adc(this.rd(this.fetch16() + this.Y));
        return 4;
      }
      case 97: {
        const zp = this.fetch() + this.X & 255;
        this.adc(this.rd(this.rd16wrap(zp)));
        return 6;
      }
      case 113: {
        const zp = this.fetch();
        this.adc(this.rd(this.rd16wrap(zp) + this.Y));
        return 5;
      }
      // ── SBC ──
      case 233: {
        this.sbc(this.fetch());
        return 2;
      }
      case 229: {
        this.sbc(this.rd(this.fetch()));
        return 3;
      }
      case 245: {
        this.sbc(this.rd(this.fetch() + this.X & 255));
        return 4;
      }
      case 237: {
        this.sbc(this.rd(this.fetch16()));
        return 4;
      }
      case 253: {
        this.sbc(this.rd(this.fetch16() + this.X));
        return 4;
      }
      case 249: {
        this.sbc(this.rd(this.fetch16() + this.Y));
        return 4;
      }
      case 225: {
        const zp = this.fetch() + this.X & 255;
        this.sbc(this.rd(this.rd16wrap(zp)));
        return 6;
      }
      case 241: {
        const zp = this.fetch();
        this.sbc(this.rd(this.rd16wrap(zp) + this.Y));
        return 5;
      }
      // ── AND ──
      case 41: {
        this.A &= this.fetch();
        this.nz(this.A);
        return 2;
      }
      case 37: {
        this.A &= this.rd(this.fetch());
        this.nz(this.A);
        return 3;
      }
      case 53: {
        this.A &= this.rd(this.fetch() + this.X & 255);
        this.nz(this.A);
        return 4;
      }
      case 45: {
        this.A &= this.rd(this.fetch16());
        this.nz(this.A);
        return 4;
      }
      case 61: {
        this.A &= this.rd(this.fetch16() + this.X);
        this.nz(this.A);
        return 4;
      }
      case 57: {
        this.A &= this.rd(this.fetch16() + this.Y);
        this.nz(this.A);
        return 4;
      }
      case 33: {
        const zp = this.fetch() + this.X & 255;
        this.A &= this.rd(this.rd16wrap(zp));
        this.nz(this.A);
        return 6;
      }
      case 49: {
        const zp = this.fetch();
        this.A &= this.rd(this.rd16wrap(zp) + this.Y);
        this.nz(this.A);
        return 5;
      }
      // ── ORA ──
      case 9: {
        this.A |= this.fetch();
        this.nz(this.A);
        return 2;
      }
      case 5: {
        this.A |= this.rd(this.fetch());
        this.nz(this.A);
        return 3;
      }
      case 21: {
        this.A |= this.rd(this.fetch() + this.X & 255);
        this.nz(this.A);
        return 4;
      }
      case 13: {
        this.A |= this.rd(this.fetch16());
        this.nz(this.A);
        return 4;
      }
      case 29: {
        this.A |= this.rd(this.fetch16() + this.X);
        this.nz(this.A);
        return 4;
      }
      case 25: {
        this.A |= this.rd(this.fetch16() + this.Y);
        this.nz(this.A);
        return 4;
      }
      case 1: {
        const zp = this.fetch() + this.X & 255;
        this.A |= this.rd(this.rd16wrap(zp));
        this.nz(this.A);
        return 6;
      }
      case 17: {
        const zp = this.fetch();
        this.A |= this.rd(this.rd16wrap(zp) + this.Y);
        this.nz(this.A);
        return 5;
      }
      // ── EOR ──
      case 73: {
        this.A ^= this.fetch();
        this.nz(this.A);
        return 2;
      }
      case 69: {
        this.A ^= this.rd(this.fetch());
        this.nz(this.A);
        return 3;
      }
      case 85: {
        this.A ^= this.rd(this.fetch() + this.X & 255);
        this.nz(this.A);
        return 4;
      }
      case 77: {
        this.A ^= this.rd(this.fetch16());
        this.nz(this.A);
        return 4;
      }
      case 93: {
        this.A ^= this.rd(this.fetch16() + this.X);
        this.nz(this.A);
        return 4;
      }
      case 89: {
        this.A ^= this.rd(this.fetch16() + this.Y);
        this.nz(this.A);
        return 4;
      }
      case 65: {
        const zp = this.fetch() + this.X & 255;
        this.A ^= this.rd(this.rd16wrap(zp));
        this.nz(this.A);
        return 6;
      }
      case 81: {
        const zp = this.fetch();
        this.A ^= this.rd(this.rd16wrap(zp) + this.Y);
        this.nz(this.A);
        return 5;
      }
      // ── CMP/CPX/CPY ──
      case 201: {
        this.cmp(this.A, this.fetch());
        return 2;
      }
      case 197: {
        this.cmp(this.A, this.rd(this.fetch()));
        return 3;
      }
      case 213: {
        this.cmp(this.A, this.rd(this.fetch() + this.X & 255));
        return 4;
      }
      case 205: {
        this.cmp(this.A, this.rd(this.fetch16()));
        return 4;
      }
      case 221: {
        this.cmp(this.A, this.rd(this.fetch16() + this.X));
        return 4;
      }
      case 217: {
        this.cmp(this.A, this.rd(this.fetch16() + this.Y));
        return 4;
      }
      case 193: {
        const zp = this.fetch() + this.X & 255;
        this.cmp(this.A, this.rd(this.rd16wrap(zp)));
        return 6;
      }
      case 209: {
        const zp = this.fetch();
        this.cmp(this.A, this.rd(this.rd16wrap(zp) + this.Y));
        return 5;
      }
      case 224: {
        this.cmp(this.X, this.fetch());
        return 2;
      }
      case 228: {
        this.cmp(this.X, this.rd(this.fetch()));
        return 3;
      }
      case 236: {
        this.cmp(this.X, this.rd(this.fetch16()));
        return 4;
      }
      case 192: {
        this.cmp(this.Y, this.fetch());
        return 2;
      }
      case 196: {
        this.cmp(this.Y, this.rd(this.fetch()));
        return 3;
      }
      case 204: {
        this.cmp(this.Y, this.rd(this.fetch16()));
        return 4;
      }
      // ── BIT ──
      case 36: {
        const v = this.rd(this.fetch());
        this.Z = this.A & v ? 0 : 1;
        this.N = v >> 7 & 1;
        this.V = v >> 6 & 1;
        return 3;
      }
      case 44: {
        const v = this.rd(this.fetch16());
        this.Z = this.A & v ? 0 : 1;
        this.N = v >> 7 & 1;
        this.V = v >> 6 & 1;
        return 4;
      }
      // ── INC/DEC ──
      case 230: {
        const a = this.fetch();
        const v = this.rd(a) + 1 & 255;
        this.wr(a, v);
        this.nz(v);
        return 5;
      }
      case 246: {
        const a = this.fetch() + this.X & 255;
        const v = this.rd(a) + 1 & 255;
        this.wr(a, v);
        this.nz(v);
        return 6;
      }
      case 238: {
        const a = this.fetch16();
        const v = this.rd(a) + 1 & 255;
        this.wr(a, v);
        this.nz(v);
        return 6;
      }
      case 254: {
        const a = this.fetch16() + this.X;
        const v = this.rd(a) + 1 & 255;
        this.wr(a, v);
        this.nz(v);
        return 7;
      }
      case 198: {
        const a = this.fetch();
        const v = this.rd(a) - 1 & 255;
        this.wr(a, v);
        this.nz(v);
        return 5;
      }
      case 214: {
        const a = this.fetch() + this.X & 255;
        const v = this.rd(a) - 1 & 255;
        this.wr(a, v);
        this.nz(v);
        return 6;
      }
      case 206: {
        const a = this.fetch16();
        const v = this.rd(a) - 1 & 255;
        this.wr(a, v);
        this.nz(v);
        return 6;
      }
      case 222: {
        const a = this.fetch16() + this.X;
        const v = this.rd(a) - 1 & 255;
        this.wr(a, v);
        this.nz(v);
        return 7;
      }
      case 232: {
        this.X = this.X + 1 & 255;
        this.nz(this.X);
        return 2;
      }
      case 202: {
        this.X = this.X - 1 & 255;
        this.nz(this.X);
        return 2;
      }
      case 200: {
        this.Y = this.Y + 1 & 255;
        this.nz(this.Y);
        return 2;
      }
      case 136: {
        this.Y = this.Y - 1 & 255;
        this.nz(this.Y);
        return 2;
      }
      // ── ASL ──
      case 10: {
        this.A = this.asl(this.A);
        return 2;
      }
      case 6: {
        const a = this.fetch();
        this.wr(a, this.asl(this.rd(a)));
        return 5;
      }
      case 22: {
        const a = this.fetch() + this.X & 255;
        this.wr(a, this.asl(this.rd(a)));
        return 6;
      }
      case 14: {
        const a = this.fetch16();
        this.wr(a, this.asl(this.rd(a)));
        return 6;
      }
      case 30: {
        const a = this.fetch16() + this.X;
        this.wr(a, this.asl(this.rd(a)));
        return 7;
      }
      // ── LSR ──
      case 74: {
        this.A = this.lsr(this.A);
        return 2;
      }
      case 70: {
        const a = this.fetch();
        this.wr(a, this.lsr(this.rd(a)));
        return 5;
      }
      case 86: {
        const a = this.fetch() + this.X & 255;
        this.wr(a, this.lsr(this.rd(a)));
        return 6;
      }
      case 78: {
        const a = this.fetch16();
        this.wr(a, this.lsr(this.rd(a)));
        return 6;
      }
      case 94: {
        const a = this.fetch16() + this.X;
        this.wr(a, this.lsr(this.rd(a)));
        return 7;
      }
      // ── ROL ──
      case 42: {
        this.A = this.rol(this.A);
        return 2;
      }
      case 38: {
        const a = this.fetch();
        this.wr(a, this.rol(this.rd(a)));
        return 5;
      }
      case 54: {
        const a = this.fetch() + this.X & 255;
        this.wr(a, this.rol(this.rd(a)));
        return 6;
      }
      case 46: {
        const a = this.fetch16();
        this.wr(a, this.rol(this.rd(a)));
        return 6;
      }
      case 62: {
        const a = this.fetch16() + this.X;
        this.wr(a, this.rol(this.rd(a)));
        return 7;
      }
      // ── ROR ──
      case 106: {
        this.A = this.ror(this.A);
        return 2;
      }
      case 102: {
        const a = this.fetch();
        this.wr(a, this.ror(this.rd(a)));
        return 5;
      }
      case 118: {
        const a = this.fetch() + this.X & 255;
        this.wr(a, this.ror(this.rd(a)));
        return 6;
      }
      case 110: {
        const a = this.fetch16();
        this.wr(a, this.ror(this.rd(a)));
        return 6;
      }
      case 126: {
        const a = this.fetch16() + this.X;
        this.wr(a, this.ror(this.rd(a)));
        return 7;
      }
      // ── JMP / JSR / RTS / RTI ──
      case 76: {
        this.PC = this.fetch16();
        return 3;
      }
      case 108: {
        this.PC = this.rd16wrap(this.fetch16());
        return 5;
      }
      case 32: {
        const addr = this.fetch16();
        const ret = this.PC - 1;
        this.push(ret >> 8 & 255);
        this.push(ret & 255);
        this.PC = addr;
        return 6;
      }
      case 96: {
        const lo = this.pop();
        const hi = this.pop();
        this.PC = (lo | hi << 8) + 1;
        return 6;
      }
      case 64: {
        this.setP(this.pop());
        const lo = this.pop();
        const hi = this.pop();
        this.PC = lo | hi << 8;
        return 6;
      }
      // ── Branches ──
      case 144: {
        this.branch(this.C === 0);
        return 2;
      }
      // BCC
      case 176: {
        this.branch(this.C === 1);
        return 2;
      }
      // BCS
      case 240: {
        this.branch(this.Z === 1);
        return 2;
      }
      // BEQ
      case 208: {
        this.branch(this.Z === 0);
        return 2;
      }
      // BNE
      case 48: {
        this.branch(this.N === 1);
        return 2;
      }
      // BMI
      case 16: {
        this.branch(this.N === 0);
        return 2;
      }
      // BPL
      case 112: {
        this.branch(this.V === 1);
        return 2;
      }
      // BVS
      case 80: {
        this.branch(this.V === 0);
        return 2;
      }
      // BVC
      // ── Flag ops ──
      case 24: {
        this.C = 0;
        return 2;
      }
      // CLC
      case 56: {
        this.C = 1;
        return 2;
      }
      // SEC
      case 88: {
        this.I = 0;
        return 2;
      }
      // CLI
      case 120: {
        this.I = 1;
        return 2;
      }
      // SEI
      case 216: {
        this.D = 0;
        return 2;
      }
      // CLD
      case 248: {
        this.D = 1;
        return 2;
      }
      // SED
      case 184: {
        this.V = 0;
        return 2;
      }
      // CLV
      // ── NOP and unofficial NOPs (commonly used in NSF/SID code) ──
      case 234:
        return 2;
      case 26:
      case 58:
      case 90:
      case 122:
      case 218:
      case 250:
        return 2;
      case 128:
      case 130:
      case 137:
      case 194:
      case 226: {
        this.fetch();
        return 2;
      }
      case 4:
      case 68:
      case 100: {
        this.fetch();
        return 3;
      }
      case 12: {
        this.fetch16();
        return 4;
      }
      case 20:
      case 52:
      case 84:
      case 116:
      case 212:
      case 244: {
        this.fetch();
        return 4;
      }
      case 28:
      case 60:
      case 92:
      case 124:
      case 220:
      case 252: {
        this.fetch16();
        return 4;
      }
      // ── Commonly used illegal opcodes (many SID players use these) ──
      // LAX — Load A and X simultaneously
      case 167: {
        const v = this.rd(this.fetch());
        this.A = v;
        this.X = v;
        this.nz(v);
        return 3;
      }
      case 183: {
        const v = this.rd(this.fetch() + this.Y & 255);
        this.A = v;
        this.X = v;
        this.nz(v);
        return 4;
      }
      case 175: {
        const v = this.rd(this.fetch16());
        this.A = v;
        this.X = v;
        this.nz(v);
        return 4;
      }
      case 191: {
        const v = this.rd(this.fetch16() + this.Y);
        this.A = v;
        this.X = v;
        this.nz(v);
        return 4;
      }
      case 163: {
        const zp = this.fetch() + this.X & 255;
        const v = this.rd(this.rd16wrap(zp));
        this.A = v;
        this.X = v;
        this.nz(v);
        return 6;
      }
      case 179: {
        const zp = this.fetch();
        const v = this.rd(this.rd16wrap(zp) + this.Y);
        this.A = v;
        this.X = v;
        this.nz(v);
        return 5;
      }
      // SAX — Store A AND X
      case 135: {
        this.wr(this.fetch(), this.A & this.X);
        return 3;
      }
      case 151: {
        this.wr(this.fetch() + this.Y & 255, this.A & this.X);
        return 4;
      }
      case 143: {
        this.wr(this.fetch16(), this.A & this.X);
        return 4;
      }
      case 131: {
        const zp = this.fetch() + this.X & 255;
        this.wr(this.rd16wrap(zp), this.A & this.X);
        return 6;
      }
      // DCP — Decrement then Compare (DEC + CMP)
      case 199: {
        const a = this.fetch();
        const v = this.rd(a) - 1 & 255;
        this.wr(a, v);
        this.cmp(this.A, v);
        return 5;
      }
      case 215: {
        const a = this.fetch() + this.X & 255;
        const v = this.rd(a) - 1 & 255;
        this.wr(a, v);
        this.cmp(this.A, v);
        return 6;
      }
      case 207: {
        const a = this.fetch16();
        const v = this.rd(a) - 1 & 255;
        this.wr(a, v);
        this.cmp(this.A, v);
        return 6;
      }
      case 223: {
        const a = this.fetch16() + this.X;
        const v = this.rd(a) - 1 & 255;
        this.wr(a, v);
        this.cmp(this.A, v);
        return 7;
      }
      case 219: {
        const a = this.fetch16() + this.Y;
        const v = this.rd(a) - 1 & 255;
        this.wr(a, v);
        this.cmp(this.A, v);
        return 7;
      }
      case 195: {
        const zp = this.fetch() + this.X & 255;
        const a = this.rd16wrap(zp);
        const v = this.rd(a) - 1 & 255;
        this.wr(a, v);
        this.cmp(this.A, v);
        return 8;
      }
      case 211: {
        const zp = this.fetch();
        const a = this.rd16wrap(zp) + this.Y;
        const v = this.rd(a) - 1 & 255;
        this.wr(a, v);
        this.cmp(this.A, v);
        return 8;
      }
      // ISB/ISC — Increment then Subtract (INC + SBC)
      case 231: {
        const a = this.fetch();
        const v = this.rd(a) + 1 & 255;
        this.wr(a, v);
        this.sbc(v);
        return 5;
      }
      case 247: {
        const a = this.fetch() + this.X & 255;
        const v = this.rd(a) + 1 & 255;
        this.wr(a, v);
        this.sbc(v);
        return 6;
      }
      case 239: {
        const a = this.fetch16();
        const v = this.rd(a) + 1 & 255;
        this.wr(a, v);
        this.sbc(v);
        return 6;
      }
      case 255: {
        const a = this.fetch16() + this.X;
        const v = this.rd(a) + 1 & 255;
        this.wr(a, v);
        this.sbc(v);
        return 7;
      }
      case 251: {
        const a = this.fetch16() + this.Y;
        const v = this.rd(a) + 1 & 255;
        this.wr(a, v);
        this.sbc(v);
        return 7;
      }
      case 227: {
        const zp = this.fetch() + this.X & 255;
        const a = this.rd16wrap(zp);
        const v = this.rd(a) + 1 & 255;
        this.wr(a, v);
        this.sbc(v);
        return 8;
      }
      case 243: {
        const zp = this.fetch();
        const a = this.rd16wrap(zp) + this.Y;
        const v = this.rd(a) + 1 & 255;
        this.wr(a, v);
        this.sbc(v);
        return 8;
      }
      // SLO — Shift Left then OR (ASL + ORA)
      case 7: {
        const a = this.fetch();
        const v = this.asl(this.rd(a));
        this.wr(a, v);
        this.A |= v;
        this.nz(this.A);
        return 5;
      }
      case 23: {
        const a = this.fetch() + this.X & 255;
        const v = this.asl(this.rd(a));
        this.wr(a, v);
        this.A |= v;
        this.nz(this.A);
        return 6;
      }
      case 15: {
        const a = this.fetch16();
        const v = this.asl(this.rd(a));
        this.wr(a, v);
        this.A |= v;
        this.nz(this.A);
        return 6;
      }
      case 31: {
        const a = this.fetch16() + this.X;
        const v = this.asl(this.rd(a));
        this.wr(a, v);
        this.A |= v;
        this.nz(this.A);
        return 7;
      }
      case 27: {
        const a = this.fetch16() + this.Y;
        const v = this.asl(this.rd(a));
        this.wr(a, v);
        this.A |= v;
        this.nz(this.A);
        return 7;
      }
      case 3: {
        const zp = this.fetch() + this.X & 255;
        const a = this.rd16wrap(zp);
        const v = this.asl(this.rd(a));
        this.wr(a, v);
        this.A |= v;
        this.nz(this.A);
        return 8;
      }
      case 19: {
        const zp = this.fetch();
        const a = this.rd16wrap(zp) + this.Y;
        const v = this.asl(this.rd(a));
        this.wr(a, v);
        this.A |= v;
        this.nz(this.A);
        return 8;
      }
      // RLA — Rotate Left then AND (ROL + AND)
      case 39: {
        const a = this.fetch();
        const v = this.rol(this.rd(a));
        this.wr(a, v);
        this.A &= v;
        this.nz(this.A);
        return 5;
      }
      case 55: {
        const a = this.fetch() + this.X & 255;
        const v = this.rol(this.rd(a));
        this.wr(a, v);
        this.A &= v;
        this.nz(this.A);
        return 6;
      }
      case 47: {
        const a = this.fetch16();
        const v = this.rol(this.rd(a));
        this.wr(a, v);
        this.A &= v;
        this.nz(this.A);
        return 6;
      }
      case 63: {
        const a = this.fetch16() + this.X;
        const v = this.rol(this.rd(a));
        this.wr(a, v);
        this.A &= v;
        this.nz(this.A);
        return 7;
      }
      case 59: {
        const a = this.fetch16() + this.Y;
        const v = this.rol(this.rd(a));
        this.wr(a, v);
        this.A &= v;
        this.nz(this.A);
        return 7;
      }
      case 35: {
        const zp = this.fetch() + this.X & 255;
        const a = this.rd16wrap(zp);
        const v = this.rol(this.rd(a));
        this.wr(a, v);
        this.A &= v;
        this.nz(this.A);
        return 8;
      }
      case 51: {
        const zp = this.fetch();
        const a = this.rd16wrap(zp) + this.Y;
        const v = this.rol(this.rd(a));
        this.wr(a, v);
        this.A &= v;
        this.nz(this.A);
        return 8;
      }
      // SRE — Shift Right then EOR (LSR + EOR)
      case 71: {
        const a = this.fetch();
        const v = this.lsr(this.rd(a));
        this.wr(a, v);
        this.A ^= v;
        this.nz(this.A);
        return 5;
      }
      case 87: {
        const a = this.fetch() + this.X & 255;
        const v = this.lsr(this.rd(a));
        this.wr(a, v);
        this.A ^= v;
        this.nz(this.A);
        return 6;
      }
      case 79: {
        const a = this.fetch16();
        const v = this.lsr(this.rd(a));
        this.wr(a, v);
        this.A ^= v;
        this.nz(this.A);
        return 6;
      }
      case 95: {
        const a = this.fetch16() + this.X;
        const v = this.lsr(this.rd(a));
        this.wr(a, v);
        this.A ^= v;
        this.nz(this.A);
        return 7;
      }
      case 91: {
        const a = this.fetch16() + this.Y;
        const v = this.lsr(this.rd(a));
        this.wr(a, v);
        this.A ^= v;
        this.nz(this.A);
        return 7;
      }
      case 67: {
        const zp = this.fetch() + this.X & 255;
        const a = this.rd16wrap(zp);
        const v = this.lsr(this.rd(a));
        this.wr(a, v);
        this.A ^= v;
        this.nz(this.A);
        return 8;
      }
      case 83: {
        const zp = this.fetch();
        const a = this.rd16wrap(zp) + this.Y;
        const v = this.lsr(this.rd(a));
        this.wr(a, v);
        this.A ^= v;
        this.nz(this.A);
        return 8;
      }
      // RRA — Rotate Right then Add (ROR + ADC)
      case 103: {
        const a = this.fetch();
        const v = this.ror(this.rd(a));
        this.wr(a, v);
        this.adc(v);
        return 5;
      }
      case 119: {
        const a = this.fetch() + this.X & 255;
        const v = this.ror(this.rd(a));
        this.wr(a, v);
        this.adc(v);
        return 6;
      }
      case 111: {
        const a = this.fetch16();
        const v = this.ror(this.rd(a));
        this.wr(a, v);
        this.adc(v);
        return 6;
      }
      case 127: {
        const a = this.fetch16() + this.X;
        const v = this.ror(this.rd(a));
        this.wr(a, v);
        this.adc(v);
        return 7;
      }
      case 123: {
        const a = this.fetch16() + this.Y;
        const v = this.ror(this.rd(a));
        this.wr(a, v);
        this.adc(v);
        return 7;
      }
      case 99: {
        const zp = this.fetch() + this.X & 255;
        const a = this.rd16wrap(zp);
        const v = this.ror(this.rd(a));
        this.wr(a, v);
        this.adc(v);
        return 8;
      }
      case 115: {
        const zp = this.fetch();
        const a = this.rd16wrap(zp) + this.Y;
        const v = this.ror(this.rd(a));
        this.wr(a, v);
        this.adc(v);
        return 8;
      }
      // ANC — AND + set C from N
      case 11:
      case 43: {
        this.A &= this.fetch();
        this.nz(this.A);
        this.C = this.N;
        return 2;
      }
      // ALR — AND + LSR
      case 75: {
        this.A &= this.fetch();
        this.A = this.lsr(this.A);
        return 2;
      }
      // ARR — AND + ROR (with special C/V handling)
      case 107: {
        this.A &= this.fetch();
        this.A = this.ror(this.A);
        this.C = this.A >> 6 & 1;
        this.V = (this.A >> 6 ^ this.A >> 5) & 1;
        return 2;
      }
      // AXS/SBX — (A AND X) - imm → X
      case 203: {
        const v = this.fetch();
        const r = (this.A & this.X) - v;
        this.X = r & 255;
        this.C = r >= 0 ? 1 : 0;
        this.nz(this.X);
        return 2;
      }
      case 0: {
        this.fetch();
        return 2e5;
      }
      default:
        return 2;
    }
  }
  /** Run exactly N instructions. */
  runSteps(n) {
    for (let i = 0; i < n; i++) this.step();
  }
  /** Run until PC == targetPC or cycleLimit exceeded. Returns cycles consumed. */
  runUntilPC(targetPC, cycleLimit) {
    let cycles = 0;
    while (cycles < cycleLimit && this.PC !== targetPC) {
      cycles += this.step();
    }
    return cycles;
  }
  /**
   * Call subroutine at addr and run until it returns (SP returns to initial level).
   * Uses cycle limit as safety net.
   * NOTE: After this returns, PC is left at $FFFF (the fake return address).
   * Callers should not rely on getPC() after callSubroutine.
   * PUBLIC so NSF/SID/SAP parsers can call it directly.
   */
  callSubroutine(addr, maxCycles = 2e5) {
    const targetSP = this.SP;
    this.push(255);
    this.push(254);
    this.PC = addr;
    let cycles = 0;
    while (cycles < maxCycles) {
      cycles += this.step();
      if (this.SP >= targetSP) break;
    }
  }
  /**
   * Run music-player pattern: init once, then call play `frames` times.
   * NSF/SID/SAP drivers follow this pattern exactly.
   */
  runPlayer(initAddr, playAddr, initA, initX, frames, maxCyclesPerFrame = 2e5) {
    this.setA(initA);
    this.setX(initX);
    this.callSubroutine(initAddr);
    for (let f = 0; f < frames; f++) {
      this.callSubroutine(playAddr, maxCyclesPerFrame);
    }
  }
}
export {
  Cpu6502 as C
};
