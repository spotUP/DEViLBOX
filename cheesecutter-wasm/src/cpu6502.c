/*
 * Compact 6502 CPU emulator — all documented NMOS opcodes.
 * Flat 64KB RAM. SID writes ($D400-$D41C) shadowed for reSID.
 */
#include "cpu6502.h"
#include <string.h>

/* Status flag bits */
#define FLAG_C 0x01
#define FLAG_Z 0x02
#define FLAG_I 0x04
#define FLAG_D 0x08
#define FLAG_B 0x10
#define FLAG_U 0x20
#define FLAG_V 0x40
#define FLAG_N 0x80

#define SET_NZ(v) do { \
    cpu->status = (cpu->status & ~(FLAG_N | FLAG_Z)) \
                | ((v) & 0x80) \
                | (((v) & 0xFF) == 0 ? FLAG_Z : 0); \
} while(0)

static inline uint8_t rd(CPU6502 *cpu, uint16_t a) { return cpu->ram[a]; }

static inline void wr(CPU6502 *cpu, uint16_t a, uint8_t v) {
    cpu->ram[a] = v;
    if (a >= 0xD400 && a <= 0xD41C) {
        cpu->sid_shadow[a - 0xD400] = v;
        cpu->sid_dirty = 1;
    }
}

static inline uint16_t rd16(CPU6502 *cpu, uint16_t a) {
    return rd(cpu, a) | ((uint16_t)rd(cpu, a + 1) << 8);
}

static inline uint16_t rd16_zp(CPU6502 *cpu, uint8_t a) {
    return rd(cpu, a) | ((uint16_t)rd(cpu, (uint8_t)(a + 1)) << 8);
}

static inline void push8(CPU6502 *cpu, uint8_t v) { wr(cpu, 0x100 + cpu->sp--, v); }
static inline uint8_t pull8(CPU6502 *cpu) { return rd(cpu, 0x100 + ++cpu->sp); }
static inline void push16(CPU6502 *cpu, uint16_t v) { push8(cpu, v >> 8); push8(cpu, v & 0xFF); }
static inline uint16_t pull16(CPU6502 *cpu) { uint16_t lo = pull8(cpu); return lo | ((uint16_t)pull8(cpu) << 8); }

void cpu_reset(CPU6502 *cpu) {
    cpu->a = cpu->x = cpu->y = 0;
    cpu->sp = 0xFF;
    cpu->status = FLAG_U | FLAG_I;
    cpu->pc = 0;
    cpu->sid_dirty = 0;
    cpu->jam = 0;
    memset(cpu->sid_shadow, 0, sizeof(cpu->sid_shadow));
}

void cpu_load(CPU6502 *cpu, const uint8_t *data, int len, uint16_t addr) {
    if (addr + len > 65536) len = 65536 - addr;
    memcpy(&cpu->ram[addr], data, len);
}

/* Run until RTS pops the sentinel return address, or max_cycles exceeded. */
int cpu_jsr(CPU6502 *cpu, uint16_t addr, int max_cycles) {
    /* Push a sentinel return address: $FFFF-1 = $FFFE.
       When RTS pops it and adds 1, PC becomes $FFFF. We detect that. */
    push16(cpu, 0xFFFE);
    cpu->pc = addr;

    int cycles = 0;
    while (cycles < max_cycles && cpu->pc != 0xFFFF && !cpu->jam) {
        uint16_t pc = cpu->pc;
        uint8_t op = rd(cpu, pc);
        cpu->pc++;

        /* Addressing mode helpers (inline for perf) */
        uint16_t ea;   /* effective address */
        uint8_t  val;  /* operand value */
        uint8_t  tmp;
        uint16_t tmp16;
        int      page_cross;

#define IMM()   (cpu->pc++)
#define ZP()    (rd(cpu, cpu->pc++))
#define ZPX()   ((uint8_t)(rd(cpu, cpu->pc++) + cpu->x))
#define ZPY()   ((uint8_t)(rd(cpu, cpu->pc++) + cpu->y))
#define ABS()   (ea = rd16(cpu, cpu->pc), cpu->pc += 2, ea)
#define ABX()   (tmp16 = rd16(cpu, cpu->pc), cpu->pc += 2, ea = tmp16 + cpu->x, ea)
#define ABY()   (tmp16 = rd16(cpu, cpu->pc), cpu->pc += 2, ea = tmp16 + cpu->y, ea)
#define IZX()   (ea = rd16_zp(cpu, (uint8_t)(rd(cpu, cpu->pc++) + cpu->x)), ea)
#define IZY()   (ea = rd16_zp(cpu, rd(cpu, cpu->pc++)) + cpu->y, ea)
#define REL()   (tmp = rd(cpu, cpu->pc++), ea = cpu->pc + (int8_t)tmp, ea)
#define BRANCH(cond) do { ea = REL(); if (cond) { cpu->pc = ea; cycles++; } } while(0)

        switch (op) {
        /* --- Load/Store --- */
        case 0xA9: val = rd(cpu, IMM()); cpu->a = val; SET_NZ(val); cycles += 2; break;
        case 0xA5: val = rd(cpu, ZP());  cpu->a = val; SET_NZ(val); cycles += 3; break;
        case 0xB5: val = rd(cpu, ZPX()); cpu->a = val; SET_NZ(val); cycles += 4; break;
        case 0xAD: val = rd(cpu, ABS()); cpu->a = val; SET_NZ(val); cycles += 4; break;
        case 0xBD: val = rd(cpu, ABX()); cpu->a = val; SET_NZ(val); cycles += 4; break;
        case 0xB9: val = rd(cpu, ABY()); cpu->a = val; SET_NZ(val); cycles += 4; break;
        case 0xA1: val = rd(cpu, IZX()); cpu->a = val; SET_NZ(val); cycles += 6; break;
        case 0xB1: val = rd(cpu, IZY()); cpu->a = val; SET_NZ(val); cycles += 5; break;

        case 0xA2: val = rd(cpu, IMM()); cpu->x = val; SET_NZ(val); cycles += 2; break;
        case 0xA6: val = rd(cpu, ZP());  cpu->x = val; SET_NZ(val); cycles += 3; break;
        case 0xB6: val = rd(cpu, ZPY()); cpu->x = val; SET_NZ(val); cycles += 4; break;
        case 0xAE: val = rd(cpu, ABS()); cpu->x = val; SET_NZ(val); cycles += 4; break;
        case 0xBE: val = rd(cpu, ABY()); cpu->x = val; SET_NZ(val); cycles += 4; break;

        case 0xA0: val = rd(cpu, IMM()); cpu->y = val; SET_NZ(val); cycles += 2; break;
        case 0xA4: val = rd(cpu, ZP());  cpu->y = val; SET_NZ(val); cycles += 3; break;
        case 0xB4: val = rd(cpu, ZPX()); cpu->y = val; SET_NZ(val); cycles += 4; break;
        case 0xAC: val = rd(cpu, ABS()); cpu->y = val; SET_NZ(val); cycles += 4; break;
        case 0xBC: val = rd(cpu, ABX()); cpu->y = val; SET_NZ(val); cycles += 4; break;

        case 0x85: wr(cpu, ZP(),  cpu->a); cycles += 3; break;
        case 0x95: wr(cpu, ZPX(), cpu->a); cycles += 4; break;
        case 0x8D: wr(cpu, ABS(), cpu->a); cycles += 4; break;
        case 0x9D: wr(cpu, ABX(), cpu->a); cycles += 5; break;
        case 0x99: wr(cpu, ABY(), cpu->a); cycles += 5; break;
        case 0x81: wr(cpu, IZX(), cpu->a); cycles += 6; break;
        case 0x91: wr(cpu, IZY(), cpu->a); cycles += 6; break;

        case 0x86: wr(cpu, ZP(),  cpu->x); cycles += 3; break;
        case 0x96: wr(cpu, ZPY(), cpu->x); cycles += 4; break;
        case 0x8E: wr(cpu, ABS(), cpu->x); cycles += 4; break;

        case 0x84: wr(cpu, ZP(),  cpu->y); cycles += 3; break;
        case 0x94: wr(cpu, ZPX(), cpu->y); cycles += 4; break;
        case 0x8C: wr(cpu, ABS(), cpu->y); cycles += 4; break;

        /* --- Transfer --- */
        case 0xAA: cpu->x = cpu->a; SET_NZ(cpu->x); cycles += 2; break;
        case 0xA8: cpu->y = cpu->a; SET_NZ(cpu->y); cycles += 2; break;
        case 0x8A: cpu->a = cpu->x; SET_NZ(cpu->a); cycles += 2; break;
        case 0x98: cpu->a = cpu->y; SET_NZ(cpu->a); cycles += 2; break;
        case 0xBA: cpu->x = cpu->sp; SET_NZ(cpu->x); cycles += 2; break;
        case 0x9A: cpu->sp = cpu->x; cycles += 2; break;

        /* --- Stack --- */
        case 0x48: push8(cpu, cpu->a); cycles += 3; break;
        case 0x08: push8(cpu, cpu->status | FLAG_B | FLAG_U); cycles += 3; break;
        case 0x68: cpu->a = pull8(cpu); SET_NZ(cpu->a); cycles += 4; break;
        case 0x28: cpu->status = (pull8(cpu) & ~FLAG_B) | FLAG_U; cycles += 4; break;

        /* --- Logic --- */
        case 0x29: cpu->a &= rd(cpu, IMM()); SET_NZ(cpu->a); cycles += 2; break;
        case 0x25: cpu->a &= rd(cpu, ZP());  SET_NZ(cpu->a); cycles += 3; break;
        case 0x35: cpu->a &= rd(cpu, ZPX()); SET_NZ(cpu->a); cycles += 4; break;
        case 0x2D: cpu->a &= rd(cpu, ABS()); SET_NZ(cpu->a); cycles += 4; break;
        case 0x3D: cpu->a &= rd(cpu, ABX()); SET_NZ(cpu->a); cycles += 4; break;
        case 0x39: cpu->a &= rd(cpu, ABY()); SET_NZ(cpu->a); cycles += 4; break;
        case 0x21: cpu->a &= rd(cpu, IZX()); SET_NZ(cpu->a); cycles += 6; break;
        case 0x31: cpu->a &= rd(cpu, IZY()); SET_NZ(cpu->a); cycles += 5; break;

        case 0x09: cpu->a |= rd(cpu, IMM()); SET_NZ(cpu->a); cycles += 2; break;
        case 0x05: cpu->a |= rd(cpu, ZP());  SET_NZ(cpu->a); cycles += 3; break;
        case 0x15: cpu->a |= rd(cpu, ZPX()); SET_NZ(cpu->a); cycles += 4; break;
        case 0x0D: cpu->a |= rd(cpu, ABS()); SET_NZ(cpu->a); cycles += 4; break;
        case 0x1D: cpu->a |= rd(cpu, ABX()); SET_NZ(cpu->a); cycles += 4; break;
        case 0x19: cpu->a |= rd(cpu, ABY()); SET_NZ(cpu->a); cycles += 4; break;
        case 0x01: cpu->a |= rd(cpu, IZX()); SET_NZ(cpu->a); cycles += 6; break;
        case 0x11: cpu->a |= rd(cpu, IZY()); SET_NZ(cpu->a); cycles += 5; break;

        case 0x49: cpu->a ^= rd(cpu, IMM()); SET_NZ(cpu->a); cycles += 2; break;
        case 0x45: cpu->a ^= rd(cpu, ZP());  SET_NZ(cpu->a); cycles += 3; break;
        case 0x55: cpu->a ^= rd(cpu, ZPX()); SET_NZ(cpu->a); cycles += 4; break;
        case 0x4D: cpu->a ^= rd(cpu, ABS()); SET_NZ(cpu->a); cycles += 4; break;
        case 0x5D: cpu->a ^= rd(cpu, ABX()); SET_NZ(cpu->a); cycles += 4; break;
        case 0x59: cpu->a ^= rd(cpu, ABY()); SET_NZ(cpu->a); cycles += 4; break;
        case 0x41: cpu->a ^= rd(cpu, IZX()); SET_NZ(cpu->a); cycles += 6; break;
        case 0x51: cpu->a ^= rd(cpu, IZY()); SET_NZ(cpu->a); cycles += 5; break;

        case 0x24: val = rd(cpu, ZP());  cpu->status = (cpu->status & ~(FLAG_N|FLAG_V|FLAG_Z)) | (val & (FLAG_N|FLAG_V)) | ((val & cpu->a) == 0 ? FLAG_Z : 0); cycles += 3; break;
        case 0x2C: val = rd(cpu, ABS()); cpu->status = (cpu->status & ~(FLAG_N|FLAG_V|FLAG_Z)) | (val & (FLAG_N|FLAG_V)) | ((val & cpu->a) == 0 ? FLAG_Z : 0); cycles += 4; break;

        /* --- Arithmetic --- */
#define ADC(v) do { \
    val = (v); \
    if (cpu->status & FLAG_D) { \
        uint16_t lo = (cpu->a & 0x0F) + (val & 0x0F) + (cpu->status & FLAG_C); \
        uint16_t hi = (cpu->a & 0xF0) + (val & 0xF0); \
        if (lo > 9) { lo += 6; hi += 0x10; } \
        if (hi > 0x90) hi += 0x60; \
        tmp16 = hi | (lo & 0x0F); \
        cpu->status = (cpu->status & ~(FLAG_C|FLAG_Z|FLAG_N|FLAG_V)) | (hi > 0xFF ? FLAG_C : 0); \
        cpu->a = (uint8_t)tmp16; SET_NZ(cpu->a); \
    } else { \
        tmp16 = (uint16_t)cpu->a + val + (cpu->status & FLAG_C); \
        cpu->status = (cpu->status & ~(FLAG_C|FLAG_V)) \
            | (tmp16 > 0xFF ? FLAG_C : 0) \
            | ((~(cpu->a ^ val) & (cpu->a ^ tmp16) & 0x80) ? FLAG_V : 0); \
        cpu->a = (uint8_t)tmp16; SET_NZ(cpu->a); \
    } \
} while(0)

        case 0x69: ADC(rd(cpu, IMM())); cycles += 2; break;
        case 0x65: ADC(rd(cpu, ZP()));  cycles += 3; break;
        case 0x75: ADC(rd(cpu, ZPX())); cycles += 4; break;
        case 0x6D: ADC(rd(cpu, ABS())); cycles += 4; break;
        case 0x7D: ADC(rd(cpu, ABX())); cycles += 4; break;
        case 0x79: ADC(rd(cpu, ABY())); cycles += 4; break;
        case 0x61: ADC(rd(cpu, IZX())); cycles += 6; break;
        case 0x71: ADC(rd(cpu, IZY())); cycles += 5; break;

#define SBC(v) do { ADC((uint8_t)~(v)); } while(0)
        case 0xE9: SBC(rd(cpu, IMM())); cycles += 2; break;
        case 0xE5: SBC(rd(cpu, ZP()));  cycles += 3; break;
        case 0xF5: SBC(rd(cpu, ZPX())); cycles += 4; break;
        case 0xED: SBC(rd(cpu, ABS())); cycles += 4; break;
        case 0xFD: SBC(rd(cpu, ABX())); cycles += 4; break;
        case 0xF9: SBC(rd(cpu, ABY())); cycles += 4; break;
        case 0xE1: SBC(rd(cpu, IZX())); cycles += 6; break;
        case 0xF1: SBC(rd(cpu, IZY())); cycles += 5; break;

#define CMP_OP(reg, v) do { \
    tmp16 = (uint16_t)(reg) - (v); \
    cpu->status = (cpu->status & ~(FLAG_C|FLAG_Z|FLAG_N)) \
        | (tmp16 < 0x100 ? FLAG_C : 0) \
        | ((tmp16 & 0xFF) == 0 ? FLAG_Z : 0) \
        | (tmp16 & 0x80); \
} while(0)

        case 0xC9: CMP_OP(cpu->a, rd(cpu, IMM())); cycles += 2; break;
        case 0xC5: CMP_OP(cpu->a, rd(cpu, ZP()));  cycles += 3; break;
        case 0xD5: CMP_OP(cpu->a, rd(cpu, ZPX())); cycles += 4; break;
        case 0xCD: CMP_OP(cpu->a, rd(cpu, ABS())); cycles += 4; break;
        case 0xDD: CMP_OP(cpu->a, rd(cpu, ABX())); cycles += 4; break;
        case 0xD9: CMP_OP(cpu->a, rd(cpu, ABY())); cycles += 4; break;
        case 0xC1: CMP_OP(cpu->a, rd(cpu, IZX())); cycles += 6; break;
        case 0xD1: CMP_OP(cpu->a, rd(cpu, IZY())); cycles += 5; break;

        case 0xE0: CMP_OP(cpu->x, rd(cpu, IMM())); cycles += 2; break;
        case 0xE4: CMP_OP(cpu->x, rd(cpu, ZP()));  cycles += 3; break;
        case 0xEC: CMP_OP(cpu->x, rd(cpu, ABS())); cycles += 4; break;

        case 0xC0: CMP_OP(cpu->y, rd(cpu, IMM())); cycles += 2; break;
        case 0xC4: CMP_OP(cpu->y, rd(cpu, ZP()));  cycles += 3; break;
        case 0xCC: CMP_OP(cpu->y, rd(cpu, ABS())); cycles += 4; break;

        /* --- Inc/Dec --- */
        case 0xE6: ea = ZP();  val = rd(cpu, ea) + 1; wr(cpu, ea, val); SET_NZ(val); cycles += 5; break;
        case 0xF6: ea = ZPX(); val = rd(cpu, ea) + 1; wr(cpu, ea, val); SET_NZ(val); cycles += 6; break;
        case 0xEE: ea = ABS(); val = rd(cpu, ea) + 1; wr(cpu, ea, val); SET_NZ(val); cycles += 6; break;
        case 0xFE: ea = ABX(); val = rd(cpu, ea) + 1; wr(cpu, ea, val); SET_NZ(val); cycles += 7; break;

        case 0xC6: ea = ZP();  val = rd(cpu, ea) - 1; wr(cpu, ea, val); SET_NZ(val); cycles += 5; break;
        case 0xD6: ea = ZPX(); val = rd(cpu, ea) - 1; wr(cpu, ea, val); SET_NZ(val); cycles += 6; break;
        case 0xCE: ea = ABS(); val = rd(cpu, ea) - 1; wr(cpu, ea, val); SET_NZ(val); cycles += 6; break;
        case 0xDE: ea = ABX(); val = rd(cpu, ea) - 1; wr(cpu, ea, val); SET_NZ(val); cycles += 7; break;

        case 0xE8: cpu->x++; SET_NZ(cpu->x); cycles += 2; break;
        case 0xCA: cpu->x--; SET_NZ(cpu->x); cycles += 2; break;
        case 0xC8: cpu->y++; SET_NZ(cpu->y); cycles += 2; break;
        case 0x88: cpu->y--; SET_NZ(cpu->y); cycles += 2; break;

        /* --- Shift/Rotate --- */
        case 0x0A: tmp = cpu->a & 0x80; cpu->a <<= 1; cpu->status = (cpu->status & ~FLAG_C) | (tmp ? FLAG_C : 0); SET_NZ(cpu->a); cycles += 2; break;
        case 0x06: ea = ZP();  val = rd(cpu, ea); tmp = val & 0x80; val <<= 1; wr(cpu, ea, val); cpu->status = (cpu->status & ~FLAG_C) | (tmp ? FLAG_C : 0); SET_NZ(val); cycles += 5; break;
        case 0x16: ea = ZPX(); val = rd(cpu, ea); tmp = val & 0x80; val <<= 1; wr(cpu, ea, val); cpu->status = (cpu->status & ~FLAG_C) | (tmp ? FLAG_C : 0); SET_NZ(val); cycles += 6; break;
        case 0x0E: ea = ABS(); val = rd(cpu, ea); tmp = val & 0x80; val <<= 1; wr(cpu, ea, val); cpu->status = (cpu->status & ~FLAG_C) | (tmp ? FLAG_C : 0); SET_NZ(val); cycles += 6; break;
        case 0x1E: ea = ABX(); val = rd(cpu, ea); tmp = val & 0x80; val <<= 1; wr(cpu, ea, val); cpu->status = (cpu->status & ~FLAG_C) | (tmp ? FLAG_C : 0); SET_NZ(val); cycles += 7; break;

        case 0x4A: tmp = cpu->a & 1; cpu->a >>= 1; cpu->status = (cpu->status & ~FLAG_C) | (tmp ? FLAG_C : 0); SET_NZ(cpu->a); cycles += 2; break;
        case 0x46: ea = ZP();  val = rd(cpu, ea); tmp = val & 1; val >>= 1; wr(cpu, ea, val); cpu->status = (cpu->status & ~FLAG_C) | (tmp ? FLAG_C : 0); SET_NZ(val); cycles += 5; break;
        case 0x56: ea = ZPX(); val = rd(cpu, ea); tmp = val & 1; val >>= 1; wr(cpu, ea, val); cpu->status = (cpu->status & ~FLAG_C) | (tmp ? FLAG_C : 0); SET_NZ(val); cycles += 6; break;
        case 0x4E: ea = ABS(); val = rd(cpu, ea); tmp = val & 1; val >>= 1; wr(cpu, ea, val); cpu->status = (cpu->status & ~FLAG_C) | (tmp ? FLAG_C : 0); SET_NZ(val); cycles += 6; break;
        case 0x5E: ea = ABX(); val = rd(cpu, ea); tmp = val & 1; val >>= 1; wr(cpu, ea, val); cpu->status = (cpu->status & ~FLAG_C) | (tmp ? FLAG_C : 0); SET_NZ(val); cycles += 7; break;

#define ROL_OP(v, dest) do { \
    uint8_t old_c = cpu->status & FLAG_C; \
    tmp = (v) & 0x80; \
    val = ((v) << 1) | (old_c ? 1 : 0); \
    cpu->status = (cpu->status & ~FLAG_C) | (tmp ? FLAG_C : 0); \
    SET_NZ(val); dest; \
} while(0)
        case 0x2A: ROL_OP(cpu->a, cpu->a = val); cycles += 2; break;
        case 0x26: ea = ZP();  ROL_OP(rd(cpu, ea), wr(cpu, ea, val)); cycles += 5; break;
        case 0x36: ea = ZPX(); ROL_OP(rd(cpu, ea), wr(cpu, ea, val)); cycles += 6; break;
        case 0x2E: ea = ABS(); ROL_OP(rd(cpu, ea), wr(cpu, ea, val)); cycles += 6; break;
        case 0x3E: ea = ABX(); ROL_OP(rd(cpu, ea), wr(cpu, ea, val)); cycles += 7; break;

#define ROR_OP(v, dest) do { \
    uint8_t old_c = cpu->status & FLAG_C; \
    tmp = (v) & 1; \
    val = ((v) >> 1) | (old_c ? 0x80 : 0); \
    cpu->status = (cpu->status & ~FLAG_C) | (tmp ? FLAG_C : 0); \
    SET_NZ(val); dest; \
} while(0)
        case 0x6A: ROR_OP(cpu->a, cpu->a = val); cycles += 2; break;
        case 0x66: ea = ZP();  ROR_OP(rd(cpu, ea), wr(cpu, ea, val)); cycles += 5; break;
        case 0x76: ea = ZPX(); ROR_OP(rd(cpu, ea), wr(cpu, ea, val)); cycles += 6; break;
        case 0x6E: ea = ABS(); ROR_OP(rd(cpu, ea), wr(cpu, ea, val)); cycles += 6; break;
        case 0x7E: ea = ABX(); ROR_OP(rd(cpu, ea), wr(cpu, ea, val)); cycles += 7; break;

        /* --- Branch --- */
        case 0x10: BRANCH(!(cpu->status & FLAG_N)); cycles += 2; break; /* BPL */
        case 0x30: BRANCH( (cpu->status & FLAG_N)); cycles += 2; break; /* BMI */
        case 0x50: BRANCH(!(cpu->status & FLAG_V)); cycles += 2; break; /* BVC */
        case 0x70: BRANCH( (cpu->status & FLAG_V)); cycles += 2; break; /* BVS */
        case 0x90: BRANCH(!(cpu->status & FLAG_C)); cycles += 2; break; /* BCC */
        case 0xB0: BRANCH( (cpu->status & FLAG_C)); cycles += 2; break; /* BCS */
        case 0xD0: BRANCH(!(cpu->status & FLAG_Z)); cycles += 2; break; /* BNE */
        case 0xF0: BRANCH( (cpu->status & FLAG_Z)); cycles += 2; break; /* BEQ */

        /* --- Jump/Call --- */
        case 0x4C: cpu->pc = rd16(cpu, cpu->pc); cycles += 3; break;
        case 0x6C: ea = rd16(cpu, cpu->pc); cpu->pc = rd(cpu, ea) | ((uint16_t)rd(cpu, (ea & 0xFF00) | ((ea + 1) & 0xFF)) << 8); cycles += 5; break;
        case 0x20: ea = rd16(cpu, cpu->pc); cpu->pc += 2; push16(cpu, cpu->pc - 1); cpu->pc = ea; cycles += 6; break;
        case 0x60: cpu->pc = pull16(cpu) + 1; cycles += 6; break;
        case 0x40: cpu->status = (pull8(cpu) & ~FLAG_B) | FLAG_U; cpu->pc = pull16(cpu); cycles += 6; break;

        /* --- Flag --- */
        case 0x18: cpu->status &= ~FLAG_C; cycles += 2; break;
        case 0x38: cpu->status |=  FLAG_C; cycles += 2; break;
        case 0x58: cpu->status &= ~FLAG_I; cycles += 2; break;
        case 0x78: cpu->status |=  FLAG_I; cycles += 2; break;
        case 0xD8: cpu->status &= ~FLAG_D; cycles += 2; break;
        case 0xF8: cpu->status |=  FLAG_D; cycles += 2; break;
        case 0xB8: cpu->status &= ~FLAG_V; cycles += 2; break;

        /* --- Misc --- */
        case 0xEA: cycles += 2; break; /* NOP */
        case 0x00: /* BRK */ push16(cpu, cpu->pc + 1); push8(cpu, cpu->status | FLAG_B | FLAG_U); cpu->status |= FLAG_I; cpu->pc = rd16(cpu, 0xFFFE); cycles += 7; break;

        default:
            /* Unknown/illegal opcode — halt */
            cpu->jam = 1;
            cycles += 2;
            break;
        }
    }
    return cycles;
}
