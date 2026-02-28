/*
*нннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннн
*
*  Soucecode:  Replayer demo for high-level-languages
*
*  й by BrainTrace Design    / Carsten Schlote, Egelseeweg 52,
*                              6302 Lich 1
*
*  This is the demo source for SAS/C 5.10b. With some modification
*  it should work on each other compiler.
*
*  compile :   lc -L repexe ( other option are in SASCOPTS file ! )
*
*нннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннн
*/

#include "repobj.h"

void main(void)
{
   SA_Hardcalc();
   if ( SA_SetIrq()==TRUE ) {
      SA_StartSong(0);
      while (  ( *((UBYTE*)0xbfe001) & (1<<6) ) ); // Wait for LMB ;-)
      SA_StopSong();
      SA_ClrIrq();
   }
}

