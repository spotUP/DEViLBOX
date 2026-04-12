/*
 * Minimal 6502 CPU emulator for CheeseCutter playback.
 * Flat 64KB RAM — no I/O mapping, no ROM banking.
 * SID register writes ($D400-$D41C) are intercepted and shadowed.
 */
#ifndef CPU6502_H
#define CPU6502_H

#include <stdint.h>

typedef struct {
    uint8_t  a, x, y, sp, status;
    uint16_t pc;
    uint8_t  ram[65536];
    uint8_t  sid_shadow[29];   /* $D400-$D41C shadow buffer */
    int      sid_dirty;        /* set when any SID reg written */
    int      jam;              /* set if illegal opcode encountered */
} CPU6502;

void cpu_reset(CPU6502 *cpu);
void cpu_load(CPU6502 *cpu, const uint8_t *data, int len, uint16_t addr);

/* Execute a JSR to addr. Returns after the subroutine RTS
   or after max_cycles (whichever comes first). */
int  cpu_jsr(CPU6502 *cpu, uint16_t addr, int max_cycles);

#endif
