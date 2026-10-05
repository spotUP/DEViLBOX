/*
 * st_machine.c - a minimal Amiga that runs StonePlayer_Hard.bin
 *
 * Memory map (24-bit, 2 MB chip RAM, VBR = 0):
 *   $000000  exception vectors
 *   $000400  idle loop: STOP #$2000 / BRA.S $400 - the "main program"
 *   $000408  RTE - default autovector handler
 *   $000410  STOP #$2700 / BRA.S $410 - unexpected exception (crash) trap
 *   $001000  the player's 4140 bytes of chip work memory
 *   $010000  StonePlayer_Hard.bin
 *   $040000  SPM module
 *   $060000  SPS bank, unpacked
 *   $1FFF00  supervisor stack top
 *   $BFD000  CIA-B (even addresses), $BFE001 CIA-A (odd)
 *   $DFF000  custom chips
 *
 * Time: each output sample runs the CPU for CPU_HZ / sampleRate cycles, then
 * advances CIA-B by the E clock and Paula by the colour clock. Interrupts
 * raised during a sample are taken at the start of the next CPU slice
 * (at most one output sample of latency, ~21 us at 48 kHz).
 */
#include "st_machine.h"
#include "st_dhuf.h"
#include "stoneplayer_hard.h"   /* generated: g_stoneplayer_hard[] */

#include "m68k.h"
#include "m68kcpu.h"

#include <string.h>

#define RAM_SIZE      0x200000u
#define ADDR_IDLE     0x000400u
#define ADDR_RTE      0x000408u
#define ADDR_CRASH    0x000410u
#define ADDR_CHIPBUF  0x001000u
#define ADDR_PLAYER   0x010000u
#define ADDR_SPM      0x040000u
#define ADDR_SPS      0x060000u
#define ADDR_STACK    0x1FFF00u

/* PAL clocks */
#define PAULA_HZ      3546895.0
#define CIA_HZ        709379.0
#define CPU_HZ        28375160.0   /* 8 x colour clock: an A1200 with a 68030 card */

/* Player jump table (StonePlayer_Bin.I) */
#define SP_INSTALLPLAYER     0x00
#define SP_INSTALLMODULE     0x08
#define SP_INITPLAYER        0x0C
#define SP_STARTPLAYER       0x10
#define SP_STOPPLAYER        0x14
#define SP_SETPLAYERPOS      0x18
#define SP_SLIDESONGVOLUME   0x28
#define SP_SLIDEBALANCE      0x2C
#define SP_CHECKMODULE       0x34

/* Player variables: a5 = player + $48D8 (lea $48D8(pc),a5 in every entry). */
#define PLAYER_VARS   (ADDR_PLAYER + 0x48D8u)
#define VAR_SONG      206u
#define VAR_POSITION  208u
#define VAR_LINE      212u
#define VAR_VOICES    278u     /* 8 track structures, 108 bytes each */
#define VOICE_SIZE    108u
#define VOICE_VOLUME  26u      /* current (sample/effect) volume, word */

/* The seven instructions that read a track's volume to build its Paula or
 * mix volume (move.w aN@(26),dX). A muted track reads 0 there and only
 * there, so its effects, slides and sample positions keep running. */
static const uint32_t k_volume_read_pcs[7] = {
  0x0A40, 0x2AC8, 0x2D24, 0x2D9E, 0x35AE, 0x3624, 0x369A,
};

static uint8_t ram[RAM_SIZE];

/* ---- custom chips ---------------------------------------------------- */
static uint16_t intena, intreq, dmacon;

typedef struct {
  uint32_t lc;        /* AUDxLC */
  uint16_t len;       /* AUDxLEN (words) */
  uint16_t per;       /* AUDxPER */
  uint16_t vol;       /* AUDxVOL */
  /* DMA state */
  int active;
  uint32_t pt;        /* next word fetch address */
  uint32_t remaining; /* words left in this block */
  uint16_t word;      /* current data word */
  int byteIndex;      /* 0 = high byte playing, 1 = low */
  double clocksLeft;  /* colour clocks left in the current byte */
} PaulaChannel;
static PaulaChannel ch[4];

/* ---- CIA ------------------------------------------------------------- */
typedef struct {
  uint8_t regs[16];
  uint16_t taLatch, taCount, tbLatch, tbCount;
  uint8_t cra, crb;
  uint8_t icrData, icrMask;
  double eAcc;
} Cia;
static Cia ciaB, ciaA;

/* ---- run state -------------------------------------------------------- */
static int g_loaded = 0;
static int g_crashed = 0;
static int g_sampleRate = 48000;
static double g_cpuPerSample, g_ciaPerSample, g_paulaPerSample;
static double g_cpuAcc = 0.0;
static uint32_t g_muteMask = 0xFF;

/* ======================================================================= */
static inline uint16_t rd16(uint32_t a) { return (uint16_t)((ram[a] << 8) | ram[a + 1]); }
static inline void wr16(uint32_t a, uint16_t v) { ram[a] = (uint8_t)(v >> 8); ram[a + 1] = (uint8_t)v; }
static inline void wr32(uint32_t a, uint32_t v) { wr16(a, (uint16_t)(v >> 16)); wr16(a + 2, (uint16_t)v); }

static void update_ipl(void) {
  int level = 0;
  if (intena & 0x4000) {
    const uint16_t p = intena & intreq & 0x3FFF;
    if (p & 0x2000) level = 6;
    else if (p & 0x1800) level = 5;
    else if (p & 0x0780) level = 4;
    else if (p & 0x0070) level = 3;
    else if (p & 0x0008) level = 2;
    else if (p & 0x0007) level = 1;
  }
  m68k_set_irq((unsigned)level);
}

/* ---- Paula ------------------------------------------------------------ */
static void paula_fetch(PaulaChannel *c) {
  c->word = (c->pt + 1 < RAM_SIZE) ? rd16(c->pt) : 0;
  c->pt = (c->pt + 2) & 0xFFFFFEu;
  c->byteIndex = 0;
}

static void paula_start(int i) {
  PaulaChannel *c = &ch[i];
  c->active = 1;
  c->pt = c->lc & 0x1FFFFEu;
  c->remaining = c->len ? c->len : 0x10000u;
  intreq |= (uint16_t)(0x0080u << i);   /* block start: LC/LEN latched */
  paula_fetch(c);
  c->clocksLeft = c->per ? c->per : 0x10000;
}

static void paula_next_byte(int i) {
  PaulaChannel *c = &ch[i];
  if (c->byteIndex == 0) { c->byteIndex = 1; return; }
  if (--c->remaining == 0) {           /* block done: reload, interrupt */
    c->pt = c->lc & 0x1FFFFEu;
    c->remaining = c->len ? c->len : 0x10000u;
    intreq |= (uint16_t)(0x0080u << i);
  }
  paula_fetch(c);
}

static void dmacon_write(uint16_t v) {
  const uint16_t before = dmacon;
  if (v & 0x8000) dmacon |= (v & 0x7FFF); else dmacon &= (uint16_t)~v;
  for (int i = 0; i < 4; i++) {
    const int was = (before & 0x200) && (before & (1 << i));
    const int now = (dmacon & 0x200) && (dmacon & (1 << i));
    if (!was && now) paula_start(i);
    else if (was && !now) ch[i].active = 0;
  }
}

/* One output sample of a channel, box-filtered over the sample period. */
static float paula_render_channel(int i) {
  PaulaChannel *c = &ch[i];
  if (!c->active) return 0.0f;
  double t = g_paulaPerSample, acc = 0.0;
  while (t > 0.0) {
    const double d = t < c->clocksLeft ? t : c->clocksLeft;
    const int8_t s = (int8_t)(c->byteIndex == 0 ? (c->word >> 8) : (c->word & 0xFF));
    acc += (double)s * d;
    t -= d;
    c->clocksLeft -= d;
    if (c->clocksLeft <= 0.0) {
      paula_next_byte(i);
      c->clocksLeft += c->per ? c->per : 0x10000;
    }
  }
  unsigned v = c->vol & 0x7F;
  if (v > 64) v = 64;
  return (float)(acc / g_paulaPerSample / 128.0 * (double)v / 64.0);
}

static void custom_write16(uint32_t reg, uint16_t v) {
  switch (reg) {
    case 0x096: dmacon_write(v); break;
    case 0x09A: if (v & 0x8000) intena |= (v & 0x7FFF); else intena &= (uint16_t)~v; update_ipl(); break;
    case 0x09C: if (v & 0x8000) intreq |= (v & 0x7FFF); else intreq &= (uint16_t)~v; update_ipl(); break;
    default:
      if (reg >= 0x0A0 && reg < 0x0E0) {
        PaulaChannel *c = &ch[(reg - 0x0A0) >> 4];
        switch (reg & 0x0F) {
          case 0x0: c->lc = (c->lc & 0x0000FFFFu) | ((uint32_t)v << 16); break;
          case 0x2: c->lc = (c->lc & 0xFFFF0000u) | (v & 0xFFFEu); break;
          case 0x4: c->len = v; break;
          case 0x6: c->per = v; break;
          case 0x8: c->vol = v; break;
          default: break;  /* AUDxDAT: DMA mode only here */
        }
      }
      break;  /* ADKCON and the rest: not used for sound here */
  }
}

static uint16_t custom_read16(uint32_t reg) {
  switch (reg) {
    case 0x002: return dmacon & 0x07FF;
    case 0x004: return 0x2000;   /* VPOSR: ECS Agnus id $20, PAL (bit 12 clear) */
    case 0x006: return 0;
    case 0x01C: return intena;
    case 0x01E: return intreq;
    default: return 0;
  }
}

/* ---- CIA ---------------------------------------------------------------- */
static void cia_raise(Cia *c, uint8_t bit, int isB) {
  c->icrData |= bit;
  if (c->icrMask & bit) {
    intreq |= isB ? 0x2000 : 0x0008;   /* EXTER (level 6) / PORTS (level 2) */
    update_ipl();
  }
}

static void cia_write(Cia *c, int reg, uint8_t v, int isB) {
  c->regs[reg] = v;
  switch (reg) {
    case 0x4: c->taLatch = (uint16_t)((c->taLatch & 0xFF00) | v); break;
    case 0x5:
      c->taLatch = (uint16_t)((c->taLatch & 0x00FF) | (v << 8));
      if (!(c->cra & 0x01)) c->taCount = c->taLatch;
      if (c->cra & 0x08) { c->taCount = c->taLatch; c->cra |= 0x01; }   /* one-shot: write starts */
      break;
    case 0x6: c->tbLatch = (uint16_t)((c->tbLatch & 0xFF00) | v); break;
    case 0x7:
      c->tbLatch = (uint16_t)((c->tbLatch & 0x00FF) | (v << 8));
      if (!(c->crb & 0x01)) c->tbCount = c->tbLatch;
      if (c->crb & 0x08) { c->tbCount = c->tbLatch; c->crb |= 0x01; }
      break;
    case 0xD:
      if (v & 0x80) c->icrMask |= (v & 0x7F); else c->icrMask &= (uint8_t)~v;
      if (c->icrData & c->icrMask) { intreq |= isB ? 0x2000 : 0x0008; update_ipl(); }
      break;
    case 0xE:
      if (v & 0x10) c->taCount = c->taLatch;   /* force load strobe */
      c->cra = v & (uint8_t)~0x10;
      break;
    case 0xF:
      if (v & 0x10) c->tbCount = c->tbLatch;
      c->crb = v & (uint8_t)~0x10;
      break;
    default: break;
  }
}

static uint8_t cia_read(Cia *c, int reg) {
  switch (reg) {
    case 0x4: return (uint8_t)c->taCount;
    case 0x5: return (uint8_t)(c->taCount >> 8);
    case 0x6: return (uint8_t)c->tbCount;
    case 0x7: return (uint8_t)(c->tbCount >> 8);
    case 0xD: {
      uint8_t r = c->icrData;
      if (c->icrData & c->icrMask) r |= 0x80;
      c->icrData = 0;              /* reading clears */
      return r;
    }
    case 0xE: return c->cra;
    case 0xF: return c->crb;
    default: return c->regs[reg];
  }
}

static void cia_tick_timer(Cia *c, uint16_t *count, uint16_t latch, uint8_t *cr,
                           uint8_t bit, int isB, uint32_t ticks) {
  if (!(*cr & 0x01)) return;
  while (ticks > 0) {
    const uint32_t untilUnder = (uint32_t)*count + 1u;   /* counts latch..0, underflows next */
    if (ticks < untilUnder) { *count = (uint16_t)(*count - ticks); return; }
    ticks -= untilUnder;
    *count = latch;
    cia_raise(c, bit, isB);
    if (*cr & 0x08) { *cr &= (uint8_t)~0x01; return; }   /* one-shot stops */
  }
}

static void cia_advance(Cia *c, int isB) {
  c->eAcc += g_ciaPerSample;
  const uint32_t ticks = (uint32_t)c->eAcc;
  if (!ticks) return;
  c->eAcc -= ticks;
  cia_tick_timer(c, &c->taCount, c->taLatch, &c->cra, 0x01, isB, ticks);
  cia_tick_timer(c, &c->tbCount, c->tbLatch, &c->crb, 0x02, isB, ticks);
}

/* ---- Musashi memory interface ------------------------------------------- */
static int track_of_volume_read(uint32_t a) {
  const uint32_t base = PLAYER_VARS + VAR_VOICES;
  if (a < base || a >= base + 8 * VOICE_SIZE) return -1;
  const uint32_t off = a - base;
  if (off % VOICE_SIZE != VOICE_VOLUME) return -1;
  return (int)(off / VOICE_SIZE);
}

static int is_volume_read_pc(uint32_t ppc) {
  if (ppc < ADDR_PLAYER) return 0;
  const uint32_t o = ppc - ADDR_PLAYER;
  for (int i = 0; i < 7; i++) if (k_volume_read_pcs[i] == o) return 1;
  return 0;
}

static uint8_t io_read8(uint32_t a) {
  if ((a & 0xFFF000u) == 0xBFD000u && !(a & 1)) return cia_read(&ciaB, (int)((a >> 8) & 0xF));
  if ((a & 0xFFF000u) == 0xBFE000u && (a & 1)) return cia_read(&ciaA, (int)((a >> 8) & 0xF));
  if ((a & 0xFFF000u) == 0xDFF000u) {
    const uint16_t w = custom_read16(a & 0x1FEu);
    return (uint8_t)((a & 1) ? w : (w >> 8));
  }
  return 0;
}

static void io_write8(uint32_t a, uint8_t v) {
  if ((a & 0xFFF000u) == 0xBFD000u && !(a & 1)) { cia_write(&ciaB, (int)((a >> 8) & 0xF), v, 1); return; }
  if ((a & 0xFFF000u) == 0xBFE000u && (a & 1)) { cia_write(&ciaA, (int)((a >> 8) & 0xF), v, 0); return; }
  if ((a & 0xFFF000u) == 0xDFF000u) custom_write16(a & 0x1FEu, (uint16_t)((v << 8) | v));
}

unsigned int m68k_read_memory_8(unsigned int a) {
  a &= 0xFFFFFFu;
  if (a < RAM_SIZE) return ram[a];
  return io_read8(a);
}

unsigned int m68k_read_memory_16(unsigned int a) {
  a &= 0xFFFFFFu;
  if (a + 1 < RAM_SIZE) {
    if (g_muteMask != 0xFF) {
      const int t = track_of_volume_read(a);
      if (t >= 0 && !(g_muteMask & (1u << t)) && is_volume_read_pc(m68ki_cpu.ppc)) return 0;
    }
    return rd16(a);
  }
  if ((a & 0xFFF000u) == 0xDFF000u) return custom_read16(a & 0x1FEu);
  return (unsigned)((io_read8(a) << 8) | io_read8(a + 1));
}

unsigned int m68k_read_memory_32(unsigned int a) {
  return (m68k_read_memory_16(a) << 16) | m68k_read_memory_16(a + 2);
}

void m68k_write_memory_8(unsigned int a, unsigned int v) {
  a &= 0xFFFFFFu;
  if (a < RAM_SIZE) { ram[a] = (uint8_t)v; return; }
  io_write8(a, (uint8_t)v);
}

void m68k_write_memory_16(unsigned int a, unsigned int v) {
  a &= 0xFFFFFFu;
  if (a + 1 < RAM_SIZE) { wr16(a, (uint16_t)v); return; }
  if ((a & 0xFFF000u) == 0xDFF000u) { custom_write16(a & 0x1FEu, (uint16_t)v); return; }
  io_write8(a, (uint8_t)(v >> 8));
  io_write8(a + 1, (uint8_t)v);
}

void m68k_write_memory_32(unsigned int a, unsigned int v) {
  m68k_write_memory_16(a, v >> 16);
  m68k_write_memory_16(a + 2, v & 0xFFFF);
}

unsigned int m68k_read_disassembler_8(unsigned int a) { return m68k_read_memory_8(a); }
unsigned int m68k_read_disassembler_16(unsigned int a) { return m68k_read_memory_16(a); }
unsigned int m68k_read_disassembler_32(unsigned int a) { return m68k_read_memory_32(a); }

/* ---- time -------------------------------------------------------------- */
static void step_sample(float *l, float *r) {
  g_cpuAcc += g_cpuPerSample;
  const int cycles = (int)g_cpuAcc;
  g_cpuAcc -= cycles;
  if (cycles > 0) m68k_execute(cycles);
  const uint32_t pc = m68k_get_reg(NULL, M68K_REG_PC);
  if (pc >= ADDR_CRASH && pc < ADDR_CRASH + 6) g_crashed = 1;

  cia_advance(&ciaB, 1);
  cia_advance(&ciaA, 0);

  const float c0 = paula_render_channel(0), c1 = paula_render_channel(1);
  const float c2 = paula_render_channel(2), c3 = paula_render_channel(3);
  update_ipl();
  /* Amiga hard panning: 0 and 3 left, 1 and 2 right (paula_soft.c scale). */
  *l = (c0 + c3) * 0.5f;
  *r = (c1 + c2) * 0.5f;
}

/* Call a player entry with the given registers and run the machine until it
 * returns to the idle loop. Time runs (the install waits on a CIA-B timer B
 * interrupt). Returns D0, or 0x7FFFFFFF if it never returned. */
static int32_t call_player(uint32_t entry, uint32_t d0, uint32_t d1, uint32_t d2, uint32_t d3,
                           uint32_t a0, uint32_t a1, uint32_t a2) {
  uint32_t sp = m68k_get_reg(NULL, M68K_REG_SP);
  sp -= 4;
  wr32(sp, ADDR_IDLE);
  m68k_set_reg(M68K_REG_SP, sp);
  m68k_set_reg(M68K_REG_D0, d0); m68k_set_reg(M68K_REG_D1, d1);
  m68k_set_reg(M68K_REG_D2, d2); m68k_set_reg(M68K_REG_D3, d3);
  m68k_set_reg(M68K_REG_A0, a0); m68k_set_reg(M68K_REG_A1, a1);
  m68k_set_reg(M68K_REG_A2, a2);
  m68ki_cpu.stopped = 0;
  m68k_set_reg(M68K_REG_PC, ADDR_PLAYER + entry);
  float l, r;
  for (int n = 0; n < g_sampleRate * 4; n++) {
    step_sample(&l, &r);
    if (g_crashed) return 0x7FFFFFFF;
    const uint32_t pc = m68k_get_reg(NULL, M68K_REG_PC);
    if (pc >= ADDR_IDLE && pc < ADDR_IDLE + 6 && m68k_get_reg(NULL, M68K_REG_SP) == sp + 4)
      return (int32_t)m68k_get_reg(NULL, M68K_REG_D0);
  }
  return 0x7FFFFFFF;
}

/* The player's SOFT-interrupt mixer handler ($EF4) ends with
 *
 *   $F3E  tst.b  180(a5)        ; more work queued?
 *   $F42  bne.s  $F1A           ; yes: loop
 *   $F44  move.w #$0004,$DFF09C ; no: clear the SOFT request
 *
 * A CIA-B tick or a mix-buffer audio interrupt taken at $F42 or $F44 sees
 * 180(a5) = 0, queues its work there and sets INTREQ SOFT - which $F44 then
 * clears. 180(a5) stays non-zero, so no later interrupt requests SOFT again:
 * the tick never runs again, the song freezes on one line and the mixing
 * period climbs to $3C1 (measured: hypnosphere froze at 108 s, position 13
 * line 53, with a CIA-B interrupt pending at PC $F42). Clearing the request
 * before the last check closes the window; the instructions are the same,
 * reordered:
 *
 *   $F3E  move.w #$0004,$DFF09C
 *   $F46  tst.b  180(a5)
 *   $F4A  bne.s  $F1A
 */
static void patch_soft_interrupt_race(void) {
  static const uint8_t before[14] = { 0x4A, 0x2D, 0x00, 0xB4, 0x66, 0xD6,
                                      0x33, 0xFC, 0x00, 0x04, 0x00, 0xDF, 0xF0, 0x9C };
  static const uint8_t after[14] = { 0x33, 0xFC, 0x00, 0x04, 0x00, 0xDF, 0xF0, 0x9C,
                                     0x4A, 0x2D, 0x00, 0xB4, 0x66, 0xCE };
  uint8_t *at = ram + ADDR_PLAYER + 0x0F3E;
  if (memcmp(at, before, sizeof before) == 0) memcpy(at, after, sizeof after);
}

static void reset_machine(void) {
  memset(ram, 0, sizeof ram);
  memset(ch, 0, sizeof ch);
  memset(&ciaA, 0, sizeof ciaA);
  memset(&ciaB, 0, sizeof ciaB);
  ciaA.taLatch = ciaA.tbLatch = ciaB.taLatch = ciaB.tbLatch = 0xFFFF;
  ciaA.taCount = ciaA.tbCount = ciaB.taCount = ciaB.tbCount = 0xFFFF;
  intena = intreq = dmacon = 0;
  g_crashed = 0;
  g_cpuAcc = 0.0;

  /* vectors: everything unexpected traps to the crash loop; autovectors
   * and the spurious interrupt return. */
  for (uint32_t v = 2; v < 256; v++) wr32(v * 4, ADDR_CRASH);
  for (uint32_t v = 24; v <= 31; v++) wr32(v * 4, ADDR_RTE);
  wr32(0, ADDR_STACK);
  wr32(4, ADDR_IDLE);
  wr16(ADDR_IDLE + 0, 0x4E72); wr16(ADDR_IDLE + 2, 0x2000);   /* STOP #$2000 */
  wr16(ADDR_IDLE + 4, 0x60FA);                                 /* BRA.S *-4  */
  wr16(ADDR_RTE, 0x4E73);                                      /* RTE */
  wr16(ADDR_CRASH + 0, 0x4E72); wr16(ADDR_CRASH + 2, 0x2700); /* STOP #$2700 */
  wr16(ADDR_CRASH + 4, 0x60FA);

  m68k_init();
  m68k_set_cpu_type(M68K_CPU_TYPE_68020);
  m68k_pulse_reset();
  m68k_set_reg(M68K_REG_SR, 0x2000);   /* supervisor, all levels open */
  m68k_set_irq(0);
}

int st_machine_load(const uint8_t *spm, size_t spmLen, const uint8_t *sps, size_t spsLen,
                    int song, int sampleRate) {
  g_loaded = 0;
  if (!spm || !sps || sampleRate <= 0) return -1;
  if (spmLen < 52 || spm[0] != 'S' || spm[1] != 'P' || spm[2] != 'M') return -2;
  if (spsLen < 6 || sps[0] != 'S' || sps[1] != 'P' || sps[2] != 'S') return -3;
  if (ADDR_SPM + spmLen > ADDR_SPS) return -2;

  g_sampleRate = sampleRate;
  g_cpuPerSample = CPU_HZ / sampleRate;
  g_ciaPerSample = CIA_HZ / sampleRate;
  g_paulaPerSample = PAULA_HZ / sampleRate;
  reset_machine();

  memcpy(ram + ADDR_PLAYER, g_stoneplayer_hard, sizeof g_stoneplayer_hard);
  patch_soft_interrupt_race();
  memcpy(ram + ADDR_SPM, spm, spmLen);

  /* The sample bank: headers as they are, data unpacked behind them. */
  const size_t nSamples = sps[5];
  const size_t hdr = 6 + nSamples * 32;
  if (spsLen < hdr) return -3;
  const int method = sps[4] & 0x0F;
  if (ADDR_SPS + hdr > ADDR_STACK - 0x1000) return -3;
  memcpy(ram + ADDR_SPS, sps, hdr);
  if (method == 0) {
    if (ADDR_SPS + spsLen > ADDR_STACK - 0x1000) return -3;
    memcpy(ram + ADDR_SPS + hdr, sps + hdr, spsLen - hdr);
  } else if (method == 1) {
    const int len = st_dhuf_unpacked_length(sps + hdr, spsLen - hdr);
    if (len < 0 || ADDR_SPS + hdr + (size_t)len > ADDR_STACK - 0x1000) return -3;
    if (st_dhuf_depack(sps + hdr, spsLen - hdr, hdr, ram + ADDR_SPS + hdr, (size_t)len) != len) return -3;
    ram[ADDR_SPS + 4] &= 0xF0;   /* now an unpacked bank */
  } else {
    return -3;   /* CrunchMania / StoneCruncher banks: not seen in the corpus */
  }

  /* spInstallPlayer(D0 = AttnFlags 68010|68020, A0 = chip work memory, A1 = VBR) */
  if (call_player(SP_INSTALLPLAYER, 0x0003, 0, 0, 0, ADDR_CHIPBUF, 0, 0) != 0) return g_crashed ? -5 : -4;
  /* spInstallModule(A0 = module, A1 = sample bank, A2 = 0: data follows headers) */
  if (call_player(SP_INSTALLMODULE, 0, 0, 0, 0, ADDR_SPM, ADDR_SPS, 0) != 0) return g_crashed ? -5 : -4;
  /* As CPlay.c: init, full volume, centre balance, song, start. */
  call_player(SP_INITPLAYER, 0, 0, 0, 0, 0, 0, 0);
  call_player(SP_SLIDESONGVOLUME, 64, 0, 0, 0, 0, 0, 0);
  call_player(SP_SLIDEBALANCE, 128, 0, 0, 0, 0, 0, 0);
  call_player(SP_SETPLAYERPOS, (uint32_t)(song > 0 ? song : 1), 0, 0, 0, 0, 0, 0);
  call_player(SP_STARTPLAYER, 0, 0, 0, 0, 0, 0, 0);
  if (g_crashed) return -5;
  g_loaded = 1;
  return 0;
}

int st_machine_render(float *out, int frames) {
  if (!g_loaded) { memset(out, 0, (size_t)frames * 2 * sizeof(float)); return frames; }
  for (int i = 0; i < frames; i++) step_sample(&out[2 * i], &out[2 * i + 1]);
  return frames;
}

void st_machine_set_mute_mask(uint32_t mask) { g_muteMask = mask & 0xFF; }

void st_machine_stop(void) {
  if (g_loaded) call_player(SP_STOPPLAYER, 1 /* VOF_CUTDMA */, 0, 0, 0, 0, 0, 0);
  g_loaded = 0;
}

int st_machine_get_position(void) { return rd16(PLAYER_VARS + VAR_POSITION); }
int st_machine_get_line(void) { return rd16(PLAYER_VARS + VAR_LINE); }
int st_machine_get_song(void) { return rd16(PLAYER_VARS + VAR_SONG); }
int st_machine_crashed(void) { return g_crashed; }
