/*
*нннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннн
*
*  Soucecode:  Replayer demo for high-level-languages
*
*  й by BrainTrace Design    / Carsten Schlote, Egelseeweg 52,
*                              6302 Lich 1
*
*  This is the headerfile for SAS/C 5.10b. With some modification
*  it should work on each other compiler.
*
*нннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннн
*/
#ifndef	EXEC_TYPES_H
#include <exec/types.h>
#endif

extern void    __far	      SA_Hardcalc(void);
extern BOOL    __far	      SA_SetIrq(void);
extern void    __far       SA_ClrIrq(void);
extern void    __far __asm SA_StartSong(register __d0 LONG songnum);
extern void    __far       SA_StopSong(void);
extern void    __far __asm SA_Insert(register __d0 ULONG  voice, register __d1 ULONG note);
extern void    __far  	   SA_IrqLowLevel(void);
extern WORD    __far	      SA_VolLevels[4];
extern UBYTE *	__far       SA_VoiceCons[4];
extern UWORD   __far       SA_ReplayerVer;
extern UWORD   __far       SA_SyncValue;

