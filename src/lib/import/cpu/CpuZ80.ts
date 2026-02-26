// src/lib/import/cpu/CpuZ80.ts
//
// Lightweight Z80 CPU emulator for extracting pattern data from ZX Spectrum AY
// music files.  Modelled after Cpu6502.ts — same interface idioms, same
// callSubroutine SP-tracking approach.
//
// Instruction coverage targets real AY/YM player code.  Unimplemented opcodes
// are treated as NOP (4 T-states) rather than throwing.

export interface Z80MemoryMap {
  read(addr: number): number;                       // 16-bit addr → 8-bit value
  write(addr: number, val: number): void;
  inPort?(port: number): number;                    // Z80 IN  (defaults to 0xFF)
  outPort?(port: number, val: number): void;        // Z80 OUT (for AY reg writes)
}

// ─── flag bit positions in F ──────────────────────────────────────────────────
const F_S  = 0x80; // Sign
const F_Z  = 0x40; // Zero
const F_H  = 0x10; // Half-carry
const F_PV = 0x04; // Parity / oVerflow
const F_N  = 0x02; // Subtract
const F_C  = 0x01; // Carry

export class CpuZ80 {
  // ── main registers ─────────────────────────────────────────────────────────
  private A = 0; private F = 0;
  private B = 0; private C = 0;
  private D = 0; private E = 0;
  private H = 0; private L = 0;
  // ── index registers ────────────────────────────────────────────────────────
  private IX = 0; private IY = 0;
  // ── alternate register set ─────────────────────────────────────────────────
  private A2 = 0; private F2 = 0;
  private B2 = 0; private C2 = 0;
  private D2 = 0; private E2 = 0;
  private H2 = 0; private L2 = 0;
  // ── special registers ──────────────────────────────────────────────────────
  private I = 0; private R = 0;
  private SP = 0xFFFF; private PC = 0;
  private IFF1 = false; private IFF2 = false;

  constructor(private mem: Z80MemoryMap) {}

  // ── Public interface (mirrors Cpu6502.ts style) ───────────────────────────

  reset(pc: number, sp = 0xFFFF): void {
    this.PC = pc & 0xFFFF;
    this.SP = sp & 0xFFFF;
    this.A = 0; this.F = 0;
    this.B = 0; this.C = 0;
    this.D = 0; this.E = 0;
    this.H = 0; this.L = 0;
    this.IX = 0; this.IY = 0;
    this.I = 0; this.R = 0;
    this.IFF1 = false; this.IFF2 = false;
  }

  getA(): number  { return this.A; }
  getB(): number  { return this.B; }
  getC(): number  { return this.C; }
  getD(): number  { return this.D; }
  getE(): number  { return this.E; }
  getH(): number  { return this.H; }
  getL(): number  { return this.L; }
  getPC(): number { return this.PC; }
  getSP(): number { return this.SP; }
  getAF(): number { return (this.A << 8) | this.F; }
  getBC(): number { return (this.B << 8) | this.C; }
  getDE(): number { return (this.D << 8) | this.E; }
  getHL(): number { return (this.H << 8) | this.L; }
  getIX(): number { return this.IX; }
  getIY(): number { return this.IY; }

  setA(v: number):   void { this.A = v & 0xFF; }
  setBC(v: number):  void { this.B = (v >> 8) & 0xFF; this.C = v & 0xFF; }
  setDE(v: number):  void { this.D = (v >> 8) & 0xFF; this.E = v & 0xFF; }
  setHL(v: number):  void { this.H = (v >> 8) & 0xFF; this.L = v & 0xFF; }
  setIX(v: number):  void { this.IX = v & 0xFFFF; }
  setIY(v: number):  void { this.IY = v & 0xFFFF; }
  setPC(v: number):  void { this.PC = v & 0xFFFF; }
  setSP(v: number):  void { this.SP = v & 0xFFFF; }

  // ── Private helpers ───────────────────────────────────────────────────────

  private rd(a: number): number { return this.mem.read(a & 0xFFFF) & 0xFF; }
  private wr(a: number, v: number): void { this.mem.write(a & 0xFFFF, v & 0xFF); }
  private rd16(a: number): number { return this.rd(a) | (this.rd(a + 1) << 8); }
  private wr16(a: number, v: number): void { this.wr(a, v & 0xFF); this.wr(a + 1, (v >> 8) & 0xFF); }

  private fetch(): number { const v = this.rd(this.PC); this.PC = (this.PC + 1) & 0xFFFF; return v; }
  private fetch16(): number { const lo = this.fetch(); const hi = this.fetch(); return lo | (hi << 8); }

  // signed 8-bit displacement used by JR and IX/IY indexed addressing
  private signedByte(b: number): number { return b < 0x80 ? b : b - 0x100; }

  private push8(v: number): void { this.SP = (this.SP - 1) & 0xFFFF; this.wr(this.SP, v & 0xFF); }
  private pop8(): number { const v = this.rd(this.SP); this.SP = (this.SP + 1) & 0xFFFF; return v; }
  private push16(v: number): void { this.push8((v >> 8) & 0xFF); this.push8(v & 0xFF); }
  private pop16(): number { const lo = this.pop8(); const hi = this.pop8(); return lo | (hi << 8); }

  // ── Flag helpers ──────────────────────────────────────────────────────────

  private setFlags_NZ(v: number): void {
    this.F = (this.F & F_C) |                // preserve carry
             (v === 0 ? F_Z : 0) |
             (v & F_S);
  }

  private setFlags_Add(a: number, b: number, result: number): void {
    const r8 = result & 0xFF;
    const overflow = (~(a ^ b) & (a ^ result) & 0x80) !== 0;
    this.F =
      (r8 & F_S) |
      (r8 === 0 ? F_Z : 0) |
      ((a ^ b ^ result) & F_H) |
      (overflow ? F_PV : 0) |
      (result > 0xFF ? F_C : 0);
  }

  private setFlags_Sub(a: number, b: number, result: number): void {
    const r8 = result & 0xFF;
    const overflow = ((a ^ b) & (a ^ result) & 0x80) !== 0;
    this.F =
      (r8 & F_S) |
      (r8 === 0 ? F_Z : 0) |
      ((a ^ b ^ result) & F_H) |
      (overflow ? F_PV : 0) |
      F_N |
      (result < 0 || result > 0xFF ? F_C : 0);
  }

  private setFlags_Logic(v: number, hFlag: number): void {
    // parity
    let p = v ^ (v >> 4); p ^= p >> 2; p ^= p >> 1; p = (~p) & 1;
    this.F =
      (v & F_S) |
      (v === 0 ? F_Z : 0) |
      hFlag |
      (p ? F_PV : 0);
  }

  // ── Register index helpers (for 8-bit reg encoding 0-7) ──────────────────
  // The Z80 register table (B,C,D,E,H,L,(HL),A) maps to bits [5:3] in opcodes.

  private getReg8(r: number): number {
    switch (r) {
      case 0: return this.B;
      case 1: return this.C;
      case 2: return this.D;
      case 3: return this.E;
      case 4: return this.H;
      case 5: return this.L;
      case 6: return this.rd((this.H << 8) | this.L); // (HL)
      case 7: return this.A;
      default: return 0;
    }
  }

  private setReg8(r: number, v: number): void {
    const b = v & 0xFF;
    switch (r) {
      case 0: this.B = b; break;
      case 1: this.C = b; break;
      case 2: this.D = b; break;
      case 3: this.E = b; break;
      case 4: this.H = b; break;
      case 5: this.L = b; break;
      case 6: this.wr((this.H << 8) | this.L, b); break;
      case 7: this.A = b; break;
    }
  }

  // ── ALU operations ────────────────────────────────────────────────────────

  private aluA(op: number, val: number): void {
    const a = this.A;
    switch (op & 7) {
      case 0: { // ADD
        const r = a + val;
        this.setFlags_Add(a, val, r);
        this.A = r & 0xFF;
        break;
      }
      case 1: { // ADC
        const c = (this.F & F_C) ? 1 : 0;
        const r = a + val + c;
        this.setFlags_Add(a, val, r);
        this.A = r & 0xFF;
        break;
      }
      case 2: { // SUB
        const r = a - val;
        this.setFlags_Sub(a, val, r);
        this.A = r & 0xFF;
        break;
      }
      case 3: { // SBC
        const c = (this.F & F_C) ? 1 : 0;
        const r = a - val - c;
        this.setFlags_Sub(a, val + c, r);
        this.A = r & 0xFF;
        break;
      }
      case 4: { // AND
        this.A = (a & val) & 0xFF;
        this.setFlags_Logic(this.A, F_H);
        break;
      }
      case 5: { // XOR
        this.A = (a ^ val) & 0xFF;
        this.setFlags_Logic(this.A, 0);
        break;
      }
      case 6: { // OR
        this.A = (a | val) & 0xFF;
        this.setFlags_Logic(this.A, 0);
        break;
      }
      case 7: { // CP (compare without storing)
        const r = a - val;
        this.setFlags_Sub(a, val, r);
        break;
      }
    }
  }

  // ADD HL, rr (16-bit add, only carry flag affected in standard Z80)
  private addHL(val: number): void {
    const hl = (this.H << 8) | this.L;
    const r = hl + val;
    this.F = (this.F & (F_S | F_Z | F_PV)) |
             ((hl ^ val ^ r) & F_H) |
             (r > 0xFFFF ? F_C : 0);
    this.H = (r >> 8) & 0xFF;
    this.L = r & 0xFF;
  }

  // ── CB prefix: bit operations ─────────────────────────────────────────────

  private execCB(op: number): number {
    const reg = op & 7;
    const v = this.getReg8(reg);
    let r: number;

    switch (op >> 3) {
      case 0: { // RLC
        r = ((v << 1) | (v >> 7)) & 0xFF;
        this.setFlags_Logic(r, 0);
        this.F = (this.F & ~F_C) | (v >> 7);
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 1: { // RRC
        r = ((v >> 1) | (v << 7)) & 0xFF;
        this.setFlags_Logic(r, 0);
        this.F = (this.F & ~F_C) | (v & 1);
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 2: { // RL
        const cin = (this.F & F_C) ? 1 : 0;
        r = ((v << 1) | cin) & 0xFF;
        this.setFlags_Logic(r, 0);
        this.F = (this.F & ~F_C) | (v >> 7);
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 3: { // RR
        const cin = (this.F & F_C) ? 1 : 0;
        r = ((v >> 1) | (cin << 7)) & 0xFF;
        this.setFlags_Logic(r, 0);
        this.F = (this.F & ~F_C) | (v & 1);
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 4: { // SLA
        r = (v << 1) & 0xFF;
        this.setFlags_Logic(r, 0);
        this.F = (this.F & ~F_C) | (v >> 7);
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 5: { // SRA (arithmetic: MSB preserved)
        r = ((v >> 1) | (v & 0x80)) & 0xFF;
        this.setFlags_Logic(r, 0);
        this.F = (this.F & ~F_C) | (v & 1);
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 6: { // SLL (undocumented, shifts in 1)
        r = ((v << 1) | 1) & 0xFF;
        this.setFlags_Logic(r, 0);
        this.F = (this.F & ~F_C) | (v >> 7);
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      case 7: { // SRL
        r = (v >> 1) & 0xFF;
        this.setFlags_Logic(r, 0);
        this.F = (this.F & ~F_C) | (v & 1);
        this.setReg8(reg, r);
        return reg === 6 ? 15 : 8;
      }
      default: {
        // BIT / RES / SET
        const bit = (op >> 3) & 7;
        const group = op >> 6;
        if (group === 1) {
          // BIT b,r
          const masked = v & (1 << bit);
          this.F = (this.F & F_C) |
                   (masked === 0 ? F_Z | F_PV : 0) |
                   F_H |
                   (masked & F_S);
          return reg === 6 ? 12 : 8;
        } else if (group === 2) {
          // RES b,r
          this.setReg8(reg, v & ~(1 << bit));
          return reg === 6 ? 15 : 8;
        } else {
          // SET b,r
          this.setReg8(reg, v | (1 << bit));
          return reg === 6 ? 15 : 8;
        }
      }
    }
  }

  // ── ED prefix ────────────────────────────────────────────────────────────

  private execED(op: number): number {
    switch (op) {
      // IN r,(C)  — $40,$48,$50,$58,$60,$68,$70,$78
      case 0x40: case 0x48: case 0x50: case 0x58:
      case 0x60: case 0x68: case 0x70: case 0x78: {
        const port = this.C | (this.B << 8);
        const v = this.mem.inPort ? this.mem.inPort(port) & 0xFF : 0xFF;
        this.setFlags_Logic(v, 0);
        const r = (op >> 3) & 7;
        if (r !== 6) this.setReg8(r, v);  // r=6 means (HL) slot but actually flags-only for IN F,(C)
        return 12;
      }
      // OUT (C),r — $41,$49,$51,$59,$61,$69,$71,$79
      case 0x41: case 0x49: case 0x51: case 0x59:
      case 0x61: case 0x69: case 0x71: case 0x79: {
        const port = this.C | (this.B << 8);
        const r = (op >> 3) & 7;
        const v = r === 6 ? 0 : this.getReg8(r);
        if (this.mem.outPort) this.mem.outPort(port, v);
        return 12;
      }
      // SBC HL, rr
      case 0x42: { const v = this.getBC(); const hl = (this.H<<8)|this.L; const c=(this.F&F_C)?1:0; const r=hl-v-c; this.setFlags_Sub(hl,v+c,r); this.H=(r>>8)&0xFF; this.L=r&0xFF; return 15; }
      case 0x52: { const v = this.getDE(); const hl = (this.H<<8)|this.L; const c=(this.F&F_C)?1:0; const r=hl-v-c; this.setFlags_Sub(hl,v+c,r); this.H=(r>>8)&0xFF; this.L=r&0xFF; return 15; }
      case 0x62: { const hl = (this.H<<8)|this.L; const c=(this.F&F_C)?1:0; const r=hl-hl-c; this.setFlags_Sub(hl,hl+c,r); this.H=(r>>8)&0xFF; this.L=r&0xFF; return 15; }
      case 0x72: { const v = this.SP; const hl = (this.H<<8)|this.L; const c=(this.F&F_C)?1:0; const r=hl-v-c; this.setFlags_Sub(hl,v+c,r); this.H=(r>>8)&0xFF; this.L=r&0xFF; return 15; }
      // ADC HL, rr
      case 0x4A: { const v = this.getBC(); const hl=(this.H<<8)|this.L; const c=(this.F&F_C)?1:0; const r=hl+v+c; this.setFlags_Add(hl,v,r); this.H=(r>>8)&0xFF; this.L=r&0xFF; return 15; }
      case 0x5A: { const v = this.getDE(); const hl=(this.H<<8)|this.L; const c=(this.F&F_C)?1:0; const r=hl+v+c; this.setFlags_Add(hl,v,r); this.H=(r>>8)&0xFF; this.L=r&0xFF; return 15; }
      case 0x6A: { const hl=(this.H<<8)|this.L; const c=(this.F&F_C)?1:0; const r=hl+hl+c; this.setFlags_Add(hl,hl,r); this.H=(r>>8)&0xFF; this.L=r&0xFF; return 15; }
      case 0x7A: { const v = this.SP; const hl=(this.H<<8)|this.L; const c=(this.F&F_C)?1:0; const r=hl+v+c; this.setFlags_Add(hl,v,r); this.H=(r>>8)&0xFF; this.L=r&0xFF; return 15; }
      // LD (nn),rr / LD rr,(nn)
      case 0x43: { const a=this.fetch16(); this.wr16(a, (this.B<<8)|this.C); return 20; }
      case 0x4B: { const a=this.fetch16(); const v=this.rd16(a); this.B=(v>>8)&0xFF; this.C=v&0xFF; return 20; }
      case 0x53: { const a=this.fetch16(); this.wr16(a, (this.D<<8)|this.E); return 20; }
      case 0x5B: { const a=this.fetch16(); const v=this.rd16(a); this.D=(v>>8)&0xFF; this.E=v&0xFF; return 20; }
      case 0x63: { const a=this.fetch16(); this.wr16(a, (this.H<<8)|this.L); return 20; }
      case 0x6B: { const a=this.fetch16(); const v=this.rd16(a); this.H=(v>>8)&0xFF; this.L=v&0xFF; return 20; }
      case 0x73: { const a=this.fetch16(); this.wr16(a, this.SP); return 20; }
      case 0x7B: { const a=this.fetch16(); this.SP=this.rd16(a); return 20; }
      // LD I,A / LD R,A
      case 0x47: { this.I = this.A; return 9; }
      case 0x4F: { this.R = this.A; return 9; }
      // LD A,I / LD A,R
      case 0x57: {
        this.A = this.I;
        this.setFlags_NZ(this.A);
        if (this.IFF2) this.F |= F_PV; else this.F &= ~F_PV;
        return 9;
      }
      case 0x5F: {
        this.A = this.R & 0xFF;
        this.setFlags_NZ(this.A);
        if (this.IFF2) this.F |= F_PV; else this.F &= ~F_PV;
        return 9;
      }
      // NEG
      case 0x44: case 0x4C: case 0x54: case 0x5C: case 0x64: case 0x6C: case 0x74: case 0x7C: {
        const a = this.A;
        const r = 0 - a;
        this.setFlags_Sub(0, a, r);
        this.A = r & 0xFF;
        return 8;
      }
      // RETI / RETN
      case 0x45: case 0x55: case 0x65: case 0x75: case 0x4D: case 0x5D: case 0x6D: case 0x7D: {
        this.IFF1 = this.IFF2;
        this.PC = this.pop16();
        return 14;
      }
      // RLD / RRD
      case 0x6F: { // RLD
        const hl = (this.H<<8)|this.L;
        const mem = this.rd(hl);
        const newMem = ((mem << 4) | (this.A & 0x0F)) & 0xFF;
        this.A = (this.A & 0xF0) | (mem >> 4);
        this.wr(hl, newMem);
        this.setFlags_Logic(this.A, 0);
        return 18;
      }
      case 0x67: { // RRD
        const hl = (this.H<<8)|this.L;
        const mem = this.rd(hl);
        const newMem = ((this.A << 4) | (mem >> 4)) & 0xFF;
        this.A = (this.A & 0xF0) | (mem & 0x0F);
        this.wr(hl, newMem);
        this.setFlags_Logic(this.A, 0);
        return 18;
      }
      // LDIR ($B0)
      case 0xB0: {
        let cyc = 0;
        do {
          const hl = (this.H<<8)|this.L;
          const de = (this.D<<8)|this.E;
          const bc = (this.B<<8)|this.C;
          this.wr(de, this.rd(hl));
          const hl2 = (hl + 1) & 0xFFFF;
          const de2 = (de + 1) & 0xFFFF;
          const bc2 = (bc - 1) & 0xFFFF;
          this.H = (hl2 >> 8) & 0xFF; this.L = hl2 & 0xFF;
          this.D = (de2 >> 8) & 0xFF; this.E = de2 & 0xFF;
          this.B = (bc2 >> 8) & 0xFF; this.C = bc2 & 0xFF;
          cyc += 21;
          if (bc2 === 0) break;
        } while (true);
        this.F &= ~(F_H | F_PV | F_N);
        return cyc;
      }
      // LDDR ($B8)
      case 0xB8: {
        let cyc = 0;
        do {
          const hl = (this.H<<8)|this.L;
          const de = (this.D<<8)|this.E;
          const bc = (this.B<<8)|this.C;
          this.wr(de, this.rd(hl));
          const hl2 = (hl - 1) & 0xFFFF;
          const de2 = (de - 1) & 0xFFFF;
          const bc2 = (bc - 1) & 0xFFFF;
          this.H = (hl2 >> 8) & 0xFF; this.L = hl2 & 0xFF;
          this.D = (de2 >> 8) & 0xFF; this.E = de2 & 0xFF;
          this.B = (bc2 >> 8) & 0xFF; this.C = bc2 & 0xFF;
          cyc += 21;
          if (bc2 === 0) break;
        } while (true);
        this.F &= ~(F_H | F_PV | F_N);
        return cyc;
      }
      // CPIR ($B1)
      case 0xB1: {
        let cyc = 0;
        do {
          const hl = (this.H<<8)|this.L;
          const bc = (this.B<<8)|this.C;
          const v = this.rd(hl);
          const r = this.A - v;
          const hl2 = (hl + 1) & 0xFFFF;
          const bc2 = (bc - 1) & 0xFFFF;
          this.H = (hl2 >> 8) & 0xFF; this.L = hl2 & 0xFF;
          this.B = (bc2 >> 8) & 0xFF; this.C = bc2 & 0xFF;
          cyc += 21;
          if ((r & 0xFF) === 0 || bc2 === 0) break;
        } while (true);
        return cyc;
      }
      // CPDR ($B9)
      case 0xB9: {
        let cyc = 0;
        do {
          const hl = (this.H<<8)|this.L;
          const bc = (this.B<<8)|this.C;
          const v = this.rd(hl);
          const r = this.A - v;
          const hl2 = (hl - 1) & 0xFFFF;
          const bc2 = (bc - 1) & 0xFFFF;
          this.H = (hl2 >> 8) & 0xFF; this.L = hl2 & 0xFF;
          this.B = (bc2 >> 8) & 0xFF; this.C = bc2 & 0xFF;
          cyc += 21;
          if ((r & 0xFF) === 0 || bc2 === 0) break;
        } while (true);
        return cyc;
      }
      // INIR ($B2) / INDR ($BA) / OTIR ($B3) / OTDR ($BB) — treat as NOP blocks
      case 0xB2: case 0xBA: case 0xB3: case 0xBB: return 21;
      // IM 0/1/2
      case 0x46: case 0x56: case 0x5E: case 0x4E: case 0x66: case 0x6E: case 0x76: case 0x7E: return 8;
      default: return 8; // unimplemented ED opcode → NOP
    }
  }

  // ── DD/FD prefix (IX/IY instructions) ────────────────────────────────────

  private execDDFD(prefix: number): number {
    const useIX = prefix === 0xDD;
    const getXY = (): number => useIX ? this.IX : this.IY;
    const setXY = (v: number): void => { if (useIX) this.IX = v & 0xFFFF; else this.IY = v & 0xFFFF; };

    const op = this.fetch();

    // LD IX/IY, nn
    if (op === 0x21) { setXY(this.fetch16()); return 14; }
    // LD (nn), IX/IY
    if (op === 0x22) { const a = this.fetch16(); this.wr16(a, getXY()); return 20; }
    // LD IX/IY, (nn)
    if (op === 0x2A) { const a = this.fetch16(); setXY(this.rd16(a)); return 20; }
    // LD SP, IX/IY
    if (op === 0xF9) { this.SP = getXY(); return 10; }
    // PUSH IX/IY
    if (op === 0xE5) { this.push16(getXY()); return 15; }
    // POP IX/IY
    if (op === 0xE1) { setXY(this.pop16()); return 14; }
    // EX (SP), IX/IY
    if (op === 0xE3) {
      const top = this.rd16(this.SP);
      this.wr16(this.SP, getXY());
      setXY(top);
      return 23;
    }
    // JP (IX/IY)
    if (op === 0xE9) { this.PC = getXY(); return 8; }
    // INC/DEC IX/IY
    if (op === 0x23) { setXY((getXY() + 1) & 0xFFFF); return 10; }
    if (op === 0x2B) { setXY((getXY() - 1) & 0xFFFF); return 10; }
    // ADD IX/IY, rr
    if (op === 0x09) { const r = getXY() + ((this.B<<8)|this.C); this.F=(this.F&(F_S|F_Z|F_PV))|((r>0xFFFF)?F_C:0); setXY(r&0xFFFF); return 15; }
    if (op === 0x19) { const r = getXY() + ((this.D<<8)|this.E); this.F=(this.F&(F_S|F_Z|F_PV))|((r>0xFFFF)?F_C:0); setXY(r&0xFFFF); return 15; }
    if (op === 0x29) { const r = getXY() + getXY(); this.F=(this.F&(F_S|F_Z|F_PV))|((r>0xFFFF)?F_C:0); setXY(r&0xFFFF); return 15; }
    if (op === 0x39) { const r = getXY() + this.SP; this.F=(this.F&(F_S|F_Z|F_PV))|((r>0xFFFF)?F_C:0); setXY(r&0xFFFF); return 15; }

    // INC/DEC (IX/IY+d)
    if (op === 0x34) { const d=this.signedByte(this.fetch()); const a=(getXY()+d)&0xFFFF; const v=(this.rd(a)+1)&0xFF; this.wr(a,v); this.setFlags_NZ(v); return 23; }
    if (op === 0x35) { const d=this.signedByte(this.fetch()); const a=(getXY()+d)&0xFFFF; const v=(this.rd(a)-1)&0xFF; this.wr(a,v); this.setFlags_NZ(v); return 23; }

    // LD (IX/IY+d), n
    if (op === 0x36) { const d=this.signedByte(this.fetch()); const n=this.fetch(); this.wr((getXY()+d)&0xFFFF, n); return 19; }

    // LD r,(IX/IY+d)   — opcodes 0x46/4E/56/5E/66/6E/7E and 0x44/4C/54/5C/64/6C (XYH/XYL undocumented, ignore)
    if ((op & 0xC7) === 0x46 && (op >> 3) !== 6) {
      const reg = (op >> 3) & 7;
      const d = this.signedByte(this.fetch());
      const v = this.rd((getXY() + d) & 0xFFFF);
      this.setReg8(reg, v);
      return 19;
    }
    // LD (IX/IY+d), r  — opcodes 0x70..0x75,0x77
    if ((op & 0xF8) === 0x70 && op !== 0x76) {
      const reg = op & 7;
      const d = this.signedByte(this.fetch());
      this.wr((getXY() + d) & 0xFFFF, this.getReg8(reg));
      return 19;
    }
    // ALU A,(IX/IY+d)  — 0x86/8E/96/9E/A6/AE/B6/BE
    if ((op & 0xC7) === 0x86) {
      const d = this.signedByte(this.fetch());
      const v = this.rd((getXY() + d) & 0xFFFF);
      this.aluA(op >> 3, v);
      return 19;
    }
    // CB prefix with IX/IY displacement (DDCB / FDCB)
    if (op === 0xCB) {
      const d = this.signedByte(this.fetch());
      const cbop = this.fetch();
      const addr = (getXY() + d) & 0xFFFF;
      const v = this.rd(addr);
      const reg = cbop & 7;
      const bit = (cbop >> 3) & 7;
      const group = cbop >> 6;
      if (group === 1) {
        // BIT
        const masked = v & (1 << bit);
        this.F = (this.F & F_C) | (masked === 0 ? F_Z | F_PV : 0) | F_H | (masked & F_S);
        return 20;
      } else if (group === 2) {
        // RES
        const r2 = v & ~(1 << bit);
        this.wr(addr, r2);
        if (reg !== 6) this.setReg8(reg, r2);
        return 23;
      } else if (group === 3) {
        // SET
        const r2 = v | (1 << bit);
        this.wr(addr, r2);
        if (reg !== 6) this.setReg8(reg, r2);
        return 23;
      } else {
        // Shift/rotate DDCB variant — same logic as CB but on (IX+d)
        // re-use execCB by temporarily patching H,L and restoring
        const savedH = this.H; const savedL = this.L;
        this.H = (addr >> 8) & 0xFF; this.L = addr & 0xFF;
        const cyc = this.execCB(cbop | 6); // force reg=6 ((HL) slot)
        if (reg !== 6) this.setReg8(reg, this.rd(addr)); // store result back
        this.H = savedH; this.L = savedL;
        return cyc + 8;
      }
    }

    // Fallthrough: unimplemented DDFD opcode → NOP
    return 8;
  }

  // ── Main decode/execute ───────────────────────────────────────────────────

  /** Execute one instruction, return T-states consumed. */
  step(): number {
    const op = this.fetch();

    switch (op) {
      // ── NOP ───────────────────────────────────────────────────────────────
      case 0x00: return 4;

      // ── LD r,r' / LD r,n / LD r,(HL) ─────────────────────────────────────
      // LD B,n; LD C,n; LD D,n; LD E,n; LD H,n; LD L,n; LD A,n
      case 0x06: { this.B = this.fetch(); return 7; }
      case 0x0E: { this.C = this.fetch(); return 7; }
      case 0x16: { this.D = this.fetch(); return 7; }
      case 0x1E: { this.E = this.fetch(); return 7; }
      case 0x26: { this.H = this.fetch(); return 7; }
      case 0x2E: { this.L = this.fetch(); return 7; }
      case 0x3E: { this.A = this.fetch(); return 7; }

      // LD rr,nn  (16-bit immediate loads)
      case 0x01: { const v=this.fetch16(); this.B=(v>>8)&0xFF; this.C=v&0xFF; return 10; }
      case 0x11: { const v=this.fetch16(); this.D=(v>>8)&0xFF; this.E=v&0xFF; return 10; }
      case 0x21: { const v=this.fetch16(); this.H=(v>>8)&0xFF; this.L=v&0xFF; return 10; }
      case 0x31: { this.SP=this.fetch16(); return 10; }

      // LD HL,(nn) / LD (nn),HL
      case 0x2A: { const a=this.fetch16(); const v=this.rd16(a); this.H=(v>>8)&0xFF; this.L=v&0xFF; return 16; }
      case 0x22: { const a=this.fetch16(); this.wr16(a, (this.H<<8)|this.L); return 16; }

      // LD A,(BC) / LD A,(DE) / LD A,(nn)
      case 0x0A: { this.A = this.rd((this.B<<8)|this.C); return 7; }
      case 0x1A: { this.A = this.rd((this.D<<8)|this.E); return 7; }
      case 0x3A: { this.A = this.rd(this.fetch16()); return 13; }

      // LD (BC),A / LD (DE),A / LD (nn),A
      case 0x02: { this.wr((this.B<<8)|this.C, this.A); return 7; }
      case 0x12: { this.wr((this.D<<8)|this.E, this.A); return 7; }
      case 0x32: { this.wr(this.fetch16(), this.A); return 13; }

      // LD SP,HL
      case 0xF9: { this.SP = (this.H<<8)|this.L; return 6; }

      // ── 8-bit register-to-register moves (0x40..0x7F block) ──────────────
      // HALT is 0x76 (within this range)
      case 0x76: return 4; // HALT → treat as NOP for extraction purposes

      case 0x40: return 4; // LD B,B (NOP)
      case 0x41: { this.B=this.C; return 4; }
      case 0x42: { this.B=this.D; return 4; }
      case 0x43: { this.B=this.E; return 4; }
      case 0x44: { this.B=this.H; return 4; }
      case 0x45: { this.B=this.L; return 4; }
      case 0x46: { this.B=this.rd((this.H<<8)|this.L); return 7; }
      case 0x47: { this.B=this.A; return 4; }

      case 0x48: { this.C=this.B; return 4; }
      case 0x49: return 4; // LD C,C
      case 0x4A: { this.C=this.D; return 4; }
      case 0x4B: { this.C=this.E; return 4; }
      case 0x4C: { this.C=this.H; return 4; }
      case 0x4D: { this.C=this.L; return 4; }
      case 0x4E: { this.C=this.rd((this.H<<8)|this.L); return 7; }
      case 0x4F: { this.C=this.A; return 4; }

      case 0x50: { this.D=this.B; return 4; }
      case 0x51: { this.D=this.C; return 4; }
      case 0x52: return 4; // LD D,D
      case 0x53: { this.D=this.E; return 4; }
      case 0x54: { this.D=this.H; return 4; }
      case 0x55: { this.D=this.L; return 4; }
      case 0x56: { this.D=this.rd((this.H<<8)|this.L); return 7; }
      case 0x57: { this.D=this.A; return 4; }

      case 0x58: { this.E=this.B; return 4; }
      case 0x59: { this.E=this.C; return 4; }
      case 0x5A: { this.E=this.D; return 4; }
      case 0x5B: return 4; // LD E,E
      case 0x5C: { this.E=this.H; return 4; }
      case 0x5D: { this.E=this.L; return 4; }
      case 0x5E: { this.E=this.rd((this.H<<8)|this.L); return 7; }
      case 0x5F: { this.E=this.A; return 4; }

      case 0x60: { this.H=this.B; return 4; }
      case 0x61: { this.H=this.C; return 4; }
      case 0x62: { this.H=this.D; return 4; }
      case 0x63: { this.H=this.E; return 4; }
      case 0x64: return 4; // LD H,H
      case 0x65: { this.H=this.L; return 4; }
      case 0x66: { this.H=this.rd((this.H<<8)|this.L); return 7; }
      case 0x67: { this.H=this.A; return 4; }

      case 0x68: { this.L=this.B; return 4; }
      case 0x69: { this.L=this.C; return 4; }
      case 0x6A: { this.L=this.D; return 4; }
      case 0x6B: { this.L=this.E; return 4; }
      case 0x6C: { this.L=this.H; return 4; }
      case 0x6D: return 4; // LD L,L
      case 0x6E: { this.L=this.rd((this.H<<8)|this.L); return 7; }
      case 0x6F: { this.L=this.A; return 4; }

      case 0x70: { this.wr((this.H<<8)|this.L, this.B); return 7; }
      case 0x71: { this.wr((this.H<<8)|this.L, this.C); return 7; }
      case 0x72: { this.wr((this.H<<8)|this.L, this.D); return 7; }
      case 0x73: { this.wr((this.H<<8)|this.L, this.E); return 7; }
      case 0x74: { this.wr((this.H<<8)|this.L, this.H); return 7; }
      case 0x75: { this.wr((this.H<<8)|this.L, this.L); return 7; }
      case 0x77: { this.wr((this.H<<8)|this.L, this.A); return 7; }
      case 0x78: { this.A=this.B; return 4; }
      case 0x79: { this.A=this.C; return 4; }
      case 0x7A: { this.A=this.D; return 4; }
      case 0x7B: { this.A=this.E; return 4; }
      case 0x7C: { this.A=this.H; return 4; }
      case 0x7D: { this.A=this.L; return 4; }
      case 0x7E: { this.A=this.rd((this.H<<8)|this.L); return 7; }
      case 0x7F: return 4; // LD A,A

      // ── ALU group (0x80..0xBF) ────────────────────────────────────────────
      case 0x80: case 0x81: case 0x82: case 0x83: case 0x84: case 0x85: case 0x87:
      case 0x88: case 0x89: case 0x8A: case 0x8B: case 0x8C: case 0x8D: case 0x8F:
      case 0x90: case 0x91: case 0x92: case 0x93: case 0x94: case 0x95: case 0x97:
      case 0x98: case 0x99: case 0x9A: case 0x9B: case 0x9C: case 0x9D: case 0x9F:
      case 0xA0: case 0xA1: case 0xA2: case 0xA3: case 0xA4: case 0xA5: case 0xA7:
      case 0xA8: case 0xA9: case 0xAA: case 0xAB: case 0xAC: case 0xAD: case 0xAF:
      case 0xB0: case 0xB1: case 0xB2: case 0xB3: case 0xB4: case 0xB5: case 0xB7:
      case 0xB8: case 0xB9: case 0xBA: case 0xBB: case 0xBC: case 0xBD: case 0xBF: {
        this.aluA(op >> 3, this.getReg8(op & 7));
        return (op & 7) === 6 ? 7 : 4;
      }
      // ALU on (HL): already handled above via getReg8(6), but opcodes 0x86/8E etc
      case 0x86: case 0x8E: case 0x96: case 0x9E: case 0xA6: case 0xAE: case 0xB6: case 0xBE: {
        this.aluA(op >> 3, this.rd((this.H<<8)|this.L));
        return 7;
      }

      // ── ALU immediate (0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE) ─
      case 0xC6: { this.aluA(0, this.fetch()); return 7; } // ADD A,n
      case 0xCE: { this.aluA(1, this.fetch()); return 7; } // ADC A,n
      case 0xD6: { this.aluA(2, this.fetch()); return 7; } // SUB n
      case 0xDE: { this.aluA(3, this.fetch()); return 7; } // SBC A,n
      case 0xE6: { this.aluA(4, this.fetch()); return 7; } // AND n
      case 0xEE: { this.aluA(5, this.fetch()); return 7; } // XOR n
      case 0xF6: { this.aluA(6, this.fetch()); return 7; } // OR n
      case 0xFE: { this.aluA(7, this.fetch()); return 7; } // CP n

      // ── INC / DEC 8-bit ──────────────────────────────────────────────────
      case 0x04: { const v=(this.B+1)&0xFF; this.B=v; this.setFlags_NZ(v); return 4; }
      case 0x0C: { const v=(this.C+1)&0xFF; this.C=v; this.setFlags_NZ(v); return 4; }
      case 0x14: { const v=(this.D+1)&0xFF; this.D=v; this.setFlags_NZ(v); return 4; }
      case 0x1C: { const v=(this.E+1)&0xFF; this.E=v; this.setFlags_NZ(v); return 4; }
      case 0x24: { const v=(this.H+1)&0xFF; this.H=v; this.setFlags_NZ(v); return 4; }
      case 0x2C: { const v=(this.L+1)&0xFF; this.L=v; this.setFlags_NZ(v); return 4; }
      case 0x34: { const a=(this.H<<8)|this.L; const v=(this.rd(a)+1)&0xFF; this.wr(a,v); this.setFlags_NZ(v); return 11; }
      case 0x3C: { const v=(this.A+1)&0xFF; this.A=v; this.setFlags_NZ(v); return 4; }

      case 0x05: { const v=(this.B-1)&0xFF; this.B=v; this.setFlags_NZ(v); this.F|=F_N; return 4; }
      case 0x0D: { const v=(this.C-1)&0xFF; this.C=v; this.setFlags_NZ(v); this.F|=F_N; return 4; }
      case 0x15: { const v=(this.D-1)&0xFF; this.D=v; this.setFlags_NZ(v); this.F|=F_N; return 4; }
      case 0x1D: { const v=(this.E-1)&0xFF; this.E=v; this.setFlags_NZ(v); this.F|=F_N; return 4; }
      case 0x25: { const v=(this.H-1)&0xFF; this.H=v; this.setFlags_NZ(v); this.F|=F_N; return 4; }
      case 0x2D: { const v=(this.L-1)&0xFF; this.L=v; this.setFlags_NZ(v); this.F|=F_N; return 4; }
      case 0x35: { const a=(this.H<<8)|this.L; const v=(this.rd(a)-1)&0xFF; this.wr(a,v); this.setFlags_NZ(v); this.F|=F_N; return 11; }
      case 0x3D: { const v=(this.A-1)&0xFF; this.A=v; this.setFlags_NZ(v); this.F|=F_N; return 4; }

      // ── INC / DEC 16-bit ─────────────────────────────────────────────────
      case 0x03: { const v=((this.B<<8)|this.C)+1; this.B=(v>>8)&0xFF; this.C=v&0xFF; return 6; }
      case 0x13: { const v=((this.D<<8)|this.E)+1; this.D=(v>>8)&0xFF; this.E=v&0xFF; return 6; }
      case 0x23: { const v=((this.H<<8)|this.L)+1; this.H=(v>>8)&0xFF; this.L=v&0xFF; return 6; }
      case 0x33: { this.SP=(this.SP+1)&0xFFFF; return 6; }
      case 0x0B: { const v=((this.B<<8)|this.C)-1; this.B=(v>>8)&0xFF; this.C=v&0xFF; return 6; }
      case 0x1B: { const v=((this.D<<8)|this.E)-1; this.D=(v>>8)&0xFF; this.E=v&0xFF; return 6; }
      case 0x2B: { const v=((this.H<<8)|this.L)-1; this.H=(v>>8)&0xFF; this.L=v&0xFF; return 6; }
      case 0x3B: { this.SP=(this.SP-1)&0xFFFF; return 6; }

      // ── ADD HL,rr ────────────────────────────────────────────────────────
      case 0x09: { this.addHL((this.B<<8)|this.C); return 11; }
      case 0x19: { this.addHL((this.D<<8)|this.E); return 11; }
      case 0x29: { this.addHL((this.H<<8)|this.L); return 11; }
      case 0x39: { this.addHL(this.SP); return 11; }

      // ── Rotates (A-register shortcuts) ────────────────────────────────────
      case 0x07: { // RLCA
        const c = (this.A >> 7) & 1;
        this.A = ((this.A << 1) | c) & 0xFF;
        this.F = (this.F & (F_S | F_Z | F_PV)) | c;
        return 4;
      }
      case 0x0F: { // RRCA
        const c = this.A & 1;
        this.A = ((this.A >> 1) | (c << 7)) & 0xFF;
        this.F = (this.F & (F_S | F_Z | F_PV)) | c;
        return 4;
      }
      case 0x17: { // RLA
        const cin = this.F & F_C;
        const cout = (this.A >> 7) & 1;
        this.A = ((this.A << 1) | cin) & 0xFF;
        this.F = (this.F & (F_S | F_Z | F_PV)) | cout;
        return 4;
      }
      case 0x1F: { // RRA
        const cin = (this.F & F_C) << 7;
        const cout = this.A & 1;
        this.A = ((this.A >> 1) | cin) & 0xFF;
        this.F = (this.F & (F_S | F_Z | F_PV)) | cout;
        return 4;
      }

      // ── DAA ───────────────────────────────────────────────────────────────
      case 0x27: {
        let a = this.A;
        const n = (this.F & F_N) !== 0;
        const c = (this.F & F_C) !== 0;
        const h = (this.F & F_H) !== 0;
        if (!n) {
          if (h || (a & 0x0F) > 9)  a += 0x06;
          if (c || a > 0x99)         { a += 0x60; this.F |= F_C; }
        } else {
          if (h || (a & 0x0F) > 9)  a -= 0x06;
          if (c || this.A > 0x99)    { a -= 0x60; }
        }
        this.A = a & 0xFF;
        this.setFlags_NZ(this.A);
        return 4;
      }

      // ── CPL ───────────────────────────────────────────────────────────────
      case 0x2F: { this.A ^= 0xFF; this.F |= F_H | F_N; return 4; }

      // ── SCF / CCF ────────────────────────────────────────────────────────
      case 0x37: { this.F = (this.F & (F_S|F_Z|F_PV)) | F_C; return 4; }
      case 0x3F: { const wasC=(this.F&F_C); this.F=(this.F&(F_S|F_Z|F_PV))|(wasC?F_H:0)|(wasC?0:F_C); return 4; }

      // ── PUSH / POP ────────────────────────────────────────────────────────
      case 0xC5: { this.push16((this.B<<8)|this.C); return 11; }
      case 0xD5: { this.push16((this.D<<8)|this.E); return 11; }
      case 0xE5: { this.push16((this.H<<8)|this.L); return 11; }
      case 0xF5: { this.push16((this.A<<8)|this.F); return 11; }
      case 0xC1: { const v=this.pop16(); this.B=(v>>8)&0xFF; this.C=v&0xFF; return 10; }
      case 0xD1: { const v=this.pop16(); this.D=(v>>8)&0xFF; this.E=v&0xFF; return 10; }
      case 0xE1: { const v=this.pop16(); this.H=(v>>8)&0xFF; this.L=v&0xFF; return 10; }
      case 0xF1: { const v=this.pop16(); this.A=(v>>8)&0xFF; this.F=v&0xFF; return 10; }

      // ── EX instructions ──────────────────────────────────────────────────
      case 0x08: { // EX AF,AF'
        const ta=this.A; const tf=this.F;
        this.A=this.A2; this.F=this.F2;
        this.A2=ta; this.F2=tf;
        return 4;
      }
      case 0xD9: { // EXX
        let t;
        t=this.B; this.B=this.B2; this.B2=t;
        t=this.C; this.C=this.C2; this.C2=t;
        t=this.D; this.D=this.D2; this.D2=t;
        t=this.E; this.E=this.E2; this.E2=t;
        t=this.H; this.H=this.H2; this.H2=t;
        t=this.L; this.L=this.L2; this.L2=t;
        return 4;
      }
      case 0xEB: { // EX DE,HL
        const td=this.D; const te=this.E;
        this.D=this.H; this.E=this.L;
        this.H=td; this.L=te;
        return 4;
      }
      case 0xE3: { // EX (SP),HL
        const lo=this.rd(this.SP); const hi=this.rd((this.SP+1)&0xFFFF);
        this.wr(this.SP, this.L); this.wr((this.SP+1)&0xFFFF, this.H);
        this.H=hi; this.L=lo;
        return 19;
      }

      // ── Jumps ─────────────────────────────────────────────────────────────
      case 0xC3: { this.PC = this.fetch16(); return 10; }               // JP nn
      case 0xC2: { const a=this.fetch16(); if (!(this.F&F_Z)) this.PC=a; return 10; } // JP NZ,nn
      case 0xCA: { const a=this.fetch16(); if ( (this.F&F_Z)) this.PC=a; return 10; } // JP Z,nn
      case 0xD2: { const a=this.fetch16(); if (!(this.F&F_C)) this.PC=a; return 10; } // JP NC,nn
      case 0xDA: { const a=this.fetch16(); if ( (this.F&F_C)) this.PC=a; return 10; } // JP C,nn
      case 0xE2: { const a=this.fetch16(); if (!(this.F&F_PV)) this.PC=a; return 10; } // JP PO,nn
      case 0xEA: { const a=this.fetch16(); if ( (this.F&F_PV)) this.PC=a; return 10; } // JP PE,nn
      case 0xF2: { const a=this.fetch16(); if (!(this.F&F_S)) this.PC=a; return 10; } // JP P,nn
      case 0xFA: { const a=this.fetch16(); if ( (this.F&F_S)) this.PC=a; return 10; } // JP M,nn
      case 0xE9: { this.PC=(this.H<<8)|this.L; return 4; }              // JP (HL)

      // ── JR ────────────────────────────────────────────────────────────────
      case 0x18: { const d=this.signedByte(this.fetch()); this.PC=(this.PC+d)&0xFFFF; return 12; } // JR e
      case 0x20: { const d=this.signedByte(this.fetch()); if (!(this.F&F_Z)) this.PC=(this.PC+d)&0xFFFF; return 7; } // JR NZ,e
      case 0x28: { const d=this.signedByte(this.fetch()); if ( (this.F&F_Z)) this.PC=(this.PC+d)&0xFFFF; return 7; } // JR Z,e
      case 0x30: { const d=this.signedByte(this.fetch()); if (!(this.F&F_C)) this.PC=(this.PC+d)&0xFFFF; return 7; } // JR NC,e
      case 0x38: { const d=this.signedByte(this.fetch()); if ( (this.F&F_C)) this.PC=(this.PC+d)&0xFFFF; return 7; } // JR C,e

      // ── DJNZ ─────────────────────────────────────────────────────────────
      case 0x10: {
        const d = this.signedByte(this.fetch());
        this.B = (this.B - 1) & 0xFF;
        if (this.B !== 0) { this.PC = (this.PC + d) & 0xFFFF; return 13; }
        return 8;
      }

      // ── CALL / RET ────────────────────────────────────────────────────────
      case 0xCD: { const a=this.fetch16(); this.push16(this.PC); this.PC=a; return 17; } // CALL nn
      case 0xC4: { const a=this.fetch16(); if (!(this.F&F_Z))  { this.push16(this.PC); this.PC=a; return 17; } return 10; }
      case 0xCC: { const a=this.fetch16(); if ( (this.F&F_Z))  { this.push16(this.PC); this.PC=a; return 17; } return 10; }
      case 0xD4: { const a=this.fetch16(); if (!(this.F&F_C))  { this.push16(this.PC); this.PC=a; return 17; } return 10; }
      case 0xDC: { const a=this.fetch16(); if ( (this.F&F_C))  { this.push16(this.PC); this.PC=a; return 17; } return 10; }
      case 0xE4: { const a=this.fetch16(); if (!(this.F&F_PV)) { this.push16(this.PC); this.PC=a; return 17; } return 10; }
      case 0xEC: { const a=this.fetch16(); if ( (this.F&F_PV)) { this.push16(this.PC); this.PC=a; return 17; } return 10; }
      case 0xF4: { const a=this.fetch16(); if (!(this.F&F_S))  { this.push16(this.PC); this.PC=a; return 17; } return 10; }
      case 0xFC: { const a=this.fetch16(); if ( (this.F&F_S))  { this.push16(this.PC); this.PC=a; return 17; } return 10; }

      case 0xC9: { this.PC = this.pop16(); return 10; } // RET
      case 0xC0: { if (!(this.F&F_Z))  { this.PC=this.pop16(); return 11; } return 5; } // RET NZ
      case 0xC8: { if ( (this.F&F_Z))  { this.PC=this.pop16(); return 11; } return 5; } // RET Z
      case 0xD0: { if (!(this.F&F_C))  { this.PC=this.pop16(); return 11; } return 5; } // RET NC
      case 0xD8: { if ( (this.F&F_C))  { this.PC=this.pop16(); return 11; } return 5; } // RET C
      case 0xE0: { if (!(this.F&F_PV)) { this.PC=this.pop16(); return 11; } return 5; } // RET PO
      case 0xE8: { if ( (this.F&F_PV)) { this.PC=this.pop16(); return 11; } return 5; } // RET PE
      case 0xF0: { if (!(this.F&F_S))  { this.PC=this.pop16(); return 11; } return 5; } // RET P
      case 0xF8: { if ( (this.F&F_S))  { this.PC=this.pop16(); return 11; } return 5; } // RET M

      // ── RST ───────────────────────────────────────────────────────────────
      case 0xC7: { this.push16(this.PC); this.PC=0x0000; return 11; }
      case 0xCF: { this.push16(this.PC); this.PC=0x0008; return 11; }
      case 0xD7: { this.push16(this.PC); this.PC=0x0010; return 11; }
      case 0xDF: { this.push16(this.PC); this.PC=0x0018; return 11; }
      case 0xE7: { this.push16(this.PC); this.PC=0x0020; return 11; }
      case 0xEF: { this.push16(this.PC); this.PC=0x0028; return 11; }
      case 0xF7: { this.push16(this.PC); this.PC=0x0030; return 11; }
      case 0xFF: { this.push16(this.PC); this.PC=0x0038; return 11; }

      // ── IN / OUT ──────────────────────────────────────────────────────────
      case 0xDB: { // IN A,(n)
        const port = this.fetch();
        this.A = this.mem.inPort ? this.mem.inPort(port) & 0xFF : 0xFF;
        return 11;
      }
      case 0xD3: { // OUT (n),A
        const port = this.fetch();
        if (this.mem.outPort) this.mem.outPort(port, this.A);
        return 11;
      }

      // ── EI / DI ───────────────────────────────────────────────────────────
      case 0xFB: { this.IFF1 = true;  this.IFF2 = true;  return 4; }
      case 0xF3: { this.IFF1 = false; this.IFF2 = false; return 4; }

      // ── Prefix dispatch ──────────────────────────────────────────────────
      case 0xCB: { return this.execCB(this.fetch()); }
      case 0xED: { return this.execED(this.fetch()); }
      case 0xDD: { return this.execDDFD(0xDD); }
      case 0xFD: { return this.execDDFD(0xFD); }

      // ── Unimplemented → NOP ───────────────────────────────────────────────
      default: return 4;
    }
  }

  /**
   * Call subroutine at addr and run until it returns (SP returns to initial
   * level).  Uses a cycle limit as a safety net.
   *
   * After this returns, PC is left past the fake return address pushed here.
   * Callers should not rely on getPC() after callSubroutine.
   */
  callSubroutine(addr: number, maxCycles = 200_000): void {
    const targetSP = this.SP;
    this.push16(0xFFFF);  // fake return address
    this.PC = addr & 0xFFFF;
    let cycles = 0;
    while (cycles < maxCycles) {
      cycles += this.step();
      if (this.SP >= targetSP) break;
    }
  }
}

