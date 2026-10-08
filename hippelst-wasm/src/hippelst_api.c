/*
 * hippelst_api.c - the exported surface of the transpiled Jochen Hippel ST
 * player (hippelst_play.c, made by tools/asm68k-to-c from asm/hippel_st_play.asm).
 *
 * The player runs once per 50 Hz tick and leaves the YM2149 register values
 * in its shadow (lbL000E26: register r at byte 4r + 2).  This file loads a song
 * image, starts a subsong, runs ticks and hands the shadow to the caller.  The
 * chip itself is in ym_render.cpp.
 */
#include "hippelst_play.c"
#include <stdlib.h>

#define HST_YM_REGS 11

static uint8_t g_pristine[sizeof(_ds)];
static int g_saved = 0;
static uint8_t *g_image = NULL;     /* the working copy the player reads and may write */
static uint8_t *g_source = NULL;    /* the song as loaded, to start every subsong from */
static int g_len = 0;
static int g_typeAdr, g_typePlay, g_typeSid;
/* The 68k stack the player pushes words on (MOVE.W D0,-(SP) splits a word into bytes). */
static uint8_t g_stack[256];
static int g_ticks = 0, g_firstEnd = 0;
static int g_posStep = 0, g_posRow = -1;

/* Everything the player keeps is in _ds (state, mode flags) and the song image: put both back
 * as they were when the song was loaded, then run InitPlay (it sets the table pointers). */
static void reset_player(void)
{
  /* The registers too: the 68k code leans on them across calls as the first call finds them (zero). */
  d0 = d1 = d2 = d3 = d4 = d5 = d6 = d7 = 0;
  a1 = a2 = a3 = a4 = a5 = a6 = 0;
  flag_z = flag_n = flag_c = flag_v = flag_x = 0;
  memcpy(_ds, g_pristine, sizeof(_ds));
  memcpy(g_image, g_source, (size_t)g_len + 64);
  *TypeAdr = (uint8_t)(g_typeAdr ? 0xff : 0);
  *TypePlay = (uint8_t)(g_typePlay ? 0xff : 0);
  *TypeSID = (uint8_t)(g_typeSid ? 0xff : 0);
  *TypePeriod = 0;
  *Period = 0x248;
  sp = (uint32_t)(uintptr_t)(g_stack + sizeof g_stack);
  a0 = (uint32_t)(uintptr_t)g_image;
  InitPlay();
}

/* The song as the player reads it: the COSO form (the player packs a raw TFMX
 * song into one first; the TypeScript side does that, Compress is not here).
 * typeAdr: pointer tables hold words (1) or longs (0).  typePlay: the player
 * generation (0 = the original, 1 = later commands).  typeSid: new SID code. */
int hst_load(const uint8_t *coso, int len, int typeAdr, int typePlay, int typeSid)
{
  if (!g_saved) { memcpy(g_pristine, _ds, sizeof(_ds)); g_saved = 1; }
  free(g_image);
  free(g_source);
  g_len = len;
  g_image = (uint8_t *)calloc((size_t)len + 64, 1);
  g_source = (uint8_t *)calloc((size_t)len + 64, 1);
  if (!g_image || !g_source) return 0;
  memcpy(g_source, coso, (size_t)len);
  g_typeAdr = typeAdr; g_typePlay = typePlay; g_typeSid = typeSid;
  reset_player();
  return 1;
}

/* Subsong sub1 (1-based), as InitSound starts it. */
void hst_start(int sub1)
{
  reset_player();
  uint8_t *tab = (uint8_t *)(uintptr_t)READ32((uintptr_t)lbL000F5A) + (size_t)(sub1 - 1) * 6;
  Init_Emu();
  if (tab[4] == 0 && tab[5] == 0) tab[5] = 4;                  /* default speed */
  {
    int first = (tab[0] << 8) | tab[1], last = (tab[2] << 8) | tab[3];
    if (last - first < 0) { tab[0] = tab[1] = tab[2] = tab[3] = 0; }
  }
  WRITE32((uintptr_t)SongEnds, 0);
  g_ticks = 0; g_firstEnd = 0; g_posStep = 0; g_posRow = -1;
  d0 = (uint32_t)sub1;
  Init();
}

/* Where voice 0 is: the step it plays (an index into the step table) and the row in it. A row is
 * every player tick on which the speed counter runs out (all voices read their next event then);
 * voice 0 loading a step, or the song ending, makes that row the first of its step. */
static void track_position(int fired, uint32_t stepOffBefore, uint32_t endsBefore)
{
  uint8_t *v0 = (uint8_t *)lbL000E72;
  uint32_t off = READ16((uintptr_t)(v0 + 0x14));
  if (fired) {
    if (off != stepOffBefore || READ32((uintptr_t)SongEnds) != endsBefore) g_posRow = 0; else g_posRow++;
  }
  {
    int32_t rel = (int32_t)(READ32((uintptr_t)v0) - READ32((uintptr_t)lbL000F52)) + (int32_t)off - 12;
    g_posStep = rel / 12;
  }
}

void hst_tick(void)
{
  uint8_t *v0 = (uint8_t *)lbL000E72;
  int fired = READ16((uintptr_t)lbW000E6C) == 1;
  uint32_t before = READ16((uintptr_t)(v0 + 0x14));
  uint32_t endsBefore = READ32((uintptr_t)SongEnds);
  Play();
  g_ticks++;
  if (!g_firstEnd && READ32((uintptr_t)SongEnds)) g_firstEnd = g_ticks;
  track_position(fired, before, endsBefore);
}

int hst_ticks(void) { return g_ticks; }
int hst_pos_step(void) { return g_posStep; }
int hst_pos_row(void) { return g_posRow < 0 ? 0 : g_posRow; }

/* The tick (1-based, since hst_start) on which the song first ended, 0 if it has not. */
int hst_first_end(void) { return g_firstEnd; }

int hst_song_ends(void) { return (int)READ32((uintptr_t)SongEnds); }

/* The YM register values after the last tick. */
void hst_regs(uint8_t *out)
{
  const uint8_t *sh = (const uint8_t *)lbL000E26;
  for (int r = 0; r < HST_YM_REGS; r++) out[r] = sh[r * 4 + 2];
}

/* ticks ticks of the player, HST_YM_REGS bytes each, into out. */
void hst_run(int ticks, uint8_t *out)
{
  for (int t = 0; t < ticks; t++) { hst_tick(); hst_regs(out + (size_t)t * HST_YM_REGS); }
}

/* The player's state block (YM shadow, tick counters, the three voice records), for the tools. */
int hst_state(uint8_t *out, int max)
{
  int n = (int)((uint8_t *)lbW000F70 - (uint8_t *)lbL000E26);
  if (n > max) n = max;
  memcpy(out, lbL000E26, (size_t)n);
  return n;
}


/* ---- The keyboard voice ----
 * A second instance of this module holds the same song; its sequencer is parked (the speed counter
 * never runs out) and a key starts a note on voice 0 exactly as a pattern row does: the player's
 * own note-start code runs on a stream of [info, extra]. The other voices stay silent in the mixer. */
void hst_key_prepare(void)
{
  WRITE16((uintptr_t)lbW000E6C, 0x7fff);
  WRITE16((uintptr_t)lbW000E6E, 0x7fff);
}

void hst_key_on(int note, int instrument, int transpose, int attenuation)
{
  int info = instrument & 0x1f;
  static uint8_t stream[4];
  uint8_t *v0 = (uint8_t *)lbL000E72;
  v0[0x20] = (uint8_t)(instrument - info);   /* the step's sound transpose reaches instruments past 31 */
  v0[0x30] = (uint8_t)attenuation; v0[0x31] = 0;   /* the step's volume attenuation ($Fx), none on a plain key */
  v0[0x21] = (uint8_t)transpose;               /* the step's note transpose, as the song voice has it */
  stream[0] = (uint8_t)info; stream[1] = 0; stream[2] = stream[3] = 0;
  d5 = 0;
  a0 = (uint32_t)(uintptr_t)v0;
  a1 = (uint32_t)(uintptr_t)stream;
  d0 = (uint32_t)(note & 0xff);
  v0[0x1a] = 0;          /* wait counters: nothing is read from the stream after this */
  lbC000854();
  WRITE16((uintptr_t)lbW000E6C, 0x7fff);
}
