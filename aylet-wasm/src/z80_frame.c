/* z80_frame.c - aylet's Z80 loop, made re-entrant one frame at a time.
 *
 * This is third-party/aylet-0.5/z80.c (Ian Collier's xz80 core as used by
 * aylet, GPL-2.0-or-later) with ONE structural change: the register file is
 * static instead of local to z80loop(), and the endless loop is split into
 * z80_frame_reset() + z80_run_frame(). aylet blocks inside do_interrupt()
 * at every frame boundary and plays from there; an AudioWorklet pulls
 * samples instead, so the wrapper runs exactly one frame of t-states per
 * call and renders the AY between calls. The opcode tables (z80ops.c,
 * cbops.c, edops.c) are included unchanged from third-party/aylet-0.5.
 *
 * Original header:
 *   Z80 emulation for aylet, Copyright (C) 1994 Ian Collier,
 *   with modifications (C) 2001 Russell Marks.
 */
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

#include "main.h"
#include "z80.h"

#define parity(a) (partable[a])

unsigned char partable[256]={
      4, 0, 0, 4, 0, 4, 4, 0, 0, 4, 4, 0, 4, 0, 0, 4,
      0, 4, 4, 0, 4, 0, 0, 4, 4, 0, 0, 4, 0, 4, 4, 0,
      0, 4, 4, 0, 4, 0, 0, 4, 4, 0, 0, 4, 0, 4, 4, 0,
      4, 0, 0, 4, 0, 4, 4, 0, 0, 4, 4, 0, 4, 0, 0, 4,
      0, 4, 4, 0, 4, 0, 0, 4, 4, 0, 0, 4, 0, 4, 4, 0,
      4, 0, 0, 4, 0, 4, 4, 0, 0, 4, 4, 0, 4, 0, 0, 4,
      4, 0, 0, 4, 0, 4, 4, 0, 0, 4, 4, 0, 4, 0, 0, 4,
      0, 4, 4, 0, 4, 0, 0, 4, 4, 0, 0, 4, 0, 4, 4, 0,
      0, 4, 4, 0, 4, 0, 0, 4, 4, 0, 0, 4, 0, 4, 4, 0,
      4, 0, 0, 4, 0, 4, 4, 0, 0, 4, 4, 0, 4, 0, 0, 4,
      4, 0, 0, 4, 0, 4, 4, 0, 0, 4, 4, 0, 4, 0, 0, 4,
      0, 4, 4, 0, 4, 0, 0, 4, 4, 0, 0, 4, 0, 4, 4, 0,
      4, 0, 0, 4, 0, 4, 4, 0, 0, 4, 4, 0, 4, 0, 0, 4,
      0, 4, 4, 0, 4, 0, 0, 4, 4, 0, 0, 4, 0, 4, 4, 0,
      0, 4, 4, 0, 4, 0, 0, 4, 4, 0, 0, 4, 0, 4, 4, 0,
      4, 0, 0, 4, 0, 4, 4, 0, 0, 4, 4, 0, 4, 0, 0, 4
   };

/* The register file, static so a frame can end mid-program and resume. */
static unsigned char a, f, b, c, d, e, h, l;
static unsigned char r, a1, f1, b1, c1, d1, e1, h1, l1, i, iff1, iff2, im;
static unsigned short pc;
static unsigned short ix, iy, sp;
static unsigned int radjust;
static unsigned int ixoriy, new_ixoriy;
static unsigned int intsample;
static unsigned char op;
static int interrupted=0;

/* The register load aylet's z80loop() performs before its first opcode:
 * every register pair HiReg:LoReg from the song data, SP from the points. */
void z80_frame_reset(unsigned char *data,unsigned char *stacketc)
{
a=f=b=c=d=e=h=l=a1=f1=b1=c1=d1=e1=h1=l1=i=r=iff1=iff2=im=0;
ixoriy=new_ixoriy=0;
ix=iy=sp=pc=0;
tstates=0;
radjust=0;
interrupted=0;

a=a1=b=b1=d=d1=h=h1=data[8];
f=f1=c=c1=e=e1=l=l1=data[9];
ix=iy=hl;
sp=stacketc[0]*256+stacketc[1];
}

/* Run until this frame's t-states are spent. On entry a finished frame is
 * closed the way z80loop() closes it (tstates-=tsmax, interrupt pending),
 * so the caller renders the AY between two calls and the program sees the
 * same timing it would under aylet. */
void z80_run_frame(void)
{
if(tstates>=tsmax)
  {
  tstates-=tsmax;
  interrupted=1;
  }

while(tstates<tsmax)
  {
  ixoriy=new_ixoriy;
  new_ixoriy=0;
  intsample=1;
  op=fetch(pc);
  pc++;
  radjust++;
  switch(op)
    {
#include "z80ops.c"
    }

  if(interrupted && intsample && iff1)
    {
    interrupted=0;
    if(fetch(pc)==0x76)pc++;
    iff1=iff2=0;
    tstates+=5; /* accompanied by an input from the data bus */
    switch(im)
      {
      case 0: /* IM 0 */
      case 1: /* undocumented */
      case 2: /* IM 1 */
        /* there is little to distinguish between these cases */
        tstates+=7; /* perhaps */
        push2(pc);
        pc=0x38;
        break;
      case 3: /* IM 2 */
        tstates+=13; /* perhaps */
        {
        int addr=fetch2((i<<8)|0xff);
        push2(pc);
        pc=addr;
        }
      }
    }
  }
}
