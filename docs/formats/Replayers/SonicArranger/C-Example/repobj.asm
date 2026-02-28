
*нннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннн
*
*  Soucecode:  Replayer demo for high-level-languages
*
*  й by BrainTrace Design    / Carsten Schlote, Egelseeweg 52,
*                              6302 Lich 1
*
*
*  This source will produce a linkable object module in the Amigaо
*  standard format ( is there anything around, which doesn't use this
*  standard ?).
*  It will run with the DevPac Genam and the OMA assembler packages, and
*  maybe with any other MetaComco compatible stuff.
*
*  Assemble this with your favorite songmodule. Look at rep.h for
*  pragmas / prototypes for SAS/C.
*
*нннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннннн

	SECTION replayerstub,CODE_C	// CHIP mem !!!!
	XDEF	_SA_Hardcalc
	XDEF	_SA_SetIrq
	XDEF  	_SA_ClrIrq
	XDEF  	_SA_StartSong
	XDEF  	_SA_StopSong
	XDEF  	_SA_Insert
	XDEF	_SA_IrqLowLevel
	XDEF	_SA_VolLevels
	XDEF    _SA_VoiceCons

module:	IncBin	"/RamboLoader.pc"      ; Change this !

_SA_Hardcalc 	equ	module+0
_SA_SetIrq	equ	module+4
_SA_ClrIrq      equ	module+8
_SA_StartSong   equ	module+12
_SA_StopSong    equ	module+16
_SA_Insert      equ	module+20
_SA_IrqLowLevel equ	module+24
_SA_VolLevels   equ	module+28
_SA_VoiceCons   equ	module+42
_SA_ReplayerVer equ	module+46
_SA_SyncValue   equ	module+48

         	END
