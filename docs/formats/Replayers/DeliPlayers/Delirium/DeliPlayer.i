**
**  $Filename: misc/DeliPlayer.i $
**  $Release: 1.0 $
**  $Revision: 1.10 $
**  $Date: 25/10/91$
**
**	Definitions and Macros for use when creating DeliTracker Playermodules
**
**	(C) Copyright 1991 Delirium
**	    All Rights Reserved
**
	
	IFND	DELITRACKER_PLAYER_I
DELITRACKER_PLAYER_I	SET	1

    	IFND EXEC_TYPES_I
	    INCLUDE "exec/types.i"
	ENDC	

DELIVERSION	EQU	7		; Current Version of DeliTracker

;--------------------------------- Header -----------------------------------
CREATEHEADER	MACRO
   	moveq   #-1,d0			; this should return an error
   	rts   				; in case someone tried to run it
	dc.b	'DELIPLAY'		; idetifyer
	dc.w	DELIVERSION	 	; version
	dc.w	\1			; userversion
	dc.l 	\2			; ^playername (string max. 15 chars)
	dc.l	\3			; ^creator (NULL-terminated string)
	ENDM

	;------ All arguments must be supplied !!!

;--------------------------------- Header -----------------------------------
	;------ This belongs to the Header but this is a Functiontable

CREATEBASETAB	MACRO
	dc.l	\1			; ChkFormat
	dc.l	\2			; ExtLoad (load additional files)
	dc.l	\3			; Interrupt routine
	dc.l	\4			; Stop (clear Patterncounter, restart from begin)
	dc.l	\5			; player specific configroutine
	dc.l	\6			; user-configroutine
	ENDM

;--------------------------------- Header -----------------------------------
	;------ This belongs to the Header but this is a Functiontable

CREATEFUNCTAB	MACRO
	dc.l	\1			; initialisize player
	dc.l	\2			; player clean up
	dc.l	\3			; InitSnd (soundinitialisation routine)
	dc.l	\4			; RemSnd (remove sound)
	dc.l	\5			; StartSnd (start interrupt, usually NULL !!! )
	dc.l	\6			; StopSnd (stop interrupt, usually NULL !!! )
	ENDM

;--------------------------------- Header -----------------------------------
	;------ This belongs to the Header but this is a Functiontable

CREATEEXTFUNC	MACRO
	dc.l	\1			; Volume
	dc.l	\2			; Balance
	dc.l	\3			; Faster (incease playspeed)
	dc.l	\4			; Slower (decrease playspeed)	
	dc.l	\5			; NextPatt (jump to next pattern)
	dc.l	\6			; PrevPatt (jump to previous pattern)
	dc.l	\7			; NextSong (play next subsong)
	dc.l	\8			; PrevSong (play previous subsong)	
	ENDM

;------------------------------ Custom Header -------------------------------
CREATECUSTOM	MACRO
   	moveq   #-1,d0			; this should return an error
   	rts   				; in case someone tried to run it
	dc.b	'DELICUST'		; idetifyer
	dc.w	DELIVERSION	 	; version
	dc.w	0			; unused for compatibility
	dcb.l 	4,0			; with real players
	dc.l	\1			; Interrupt routine
	dc.l	\2			; Stop (clear Patterncounter, restart from begin)
	dcb.l 	2,0			; unused
	ENDM


	;------ When a subroutine in the player is called A5 will contain
	;------ the pointer to the DeliTrackerGlobals, the only exeption is 
	;------ of course the interrupt routine.
	;------ The interruptroutine is called every 1/50 sec (via timerint).

	;------ D7 will contain an ID number when ChkFormat is called, supply 
	;------ THIS ID in dtg_ChkFlag if the format is ok else noting.
	;------ This is the only call which is allowed to change dtg_ChkFlag! 

	;------ SetVolume usualy only copy's the values dtg_Volume, dtg_SndLBal
	;------ and dtg_SndRBal to an internal buffer. The interrupt code has 
	;------ access to this buffer and can set the volume correct. 

	;------ For not existing functions supply a NULL-pointer. 
	;------ ExtLoad: routine for loading additional files (instruments)

	;------ Note: the Player can consist of more Hunks. That means you
	;------ can seperate CHIP DATA form CODE (and you should do this!). 
	;------ Hint: The players are loaded via LoadSeg() so you may crunch 
	;------ them with TurboImploder (Fish #422) using the explode.library.

;---------------------------- Global Variables ------------------------------

 STRUCTURE DeliTrackerGlobals,0

	APTR	dtg_ReqBase		; librarybase don't CloseLibrary()
	APTR	dtg_DOSBase		; librarybase "
	APTR	dtg_IntuitionBase	; librarybase "
	APTR	dtg_GfxBase		; librarybase "

	APTR	dtg_ChkData		; pointer to the modules to be checked
	ULONG	dtg_ChkSize		; size of the Module
	
	APTR	dtg_FileArrayPtr	; 
	APTR	dtg_WorkPathPtr		;
	STRUCT	dtg_WorkPath,162	; 
	
	UWORD	dtg_ChkFlag		; 0 if not a Module
	UWORD	dtg_SndNum		; current sound number
	UWORD	dtg_SndVol		; volume (ranging from 0 to 63)
	UWORD	dtg_SndLBal		; left volume (ranging from 0 to 63)
	UWORD	dtg_SndRBal		; right volume (ranging from 0 to 63)
	UWORD	dtg_LED			; filter (0 if the LED is off)
	UWORD	dtg_Timer		; timer-value for the CIA-Timers

	FPTR	dtg_GetListData		;
	FPTR	dtg_LoadFile		;
 	FPTR	dtg_CopyFile		;
	FPTR	dtg_CopyDir		;
	FPTR	dtg_AudioAlloc		; 
	FPTR	dtg_AudioFree		;
	FPTR	dtg_InitInt		;
	FPTR	dtg_RemInt		;	

 * There is no dtg_SIZEOF cause ...

	;------ GetListData(Num:d0): This function returns the memorylocation
	;------ of a loaded file in a1 and its size in d1. Num starts with 0 
	;------ (the module). Example: GetListData(3) returns the start of the
	;------ third file loaded (via ExtLoad) in a1 an its size in d1.
	
	;------ LoadFile(): the correct file/pathname must be in dtg_WorkPath
	;------ and dtg_ChkFlag must not be zero then this function will load 
	;------ attempt to load the file into CHIPMEM (and DECRUNCH it). If 
	;------ threre is not enough memory LoadFile will deallocate all memory 
	;------ used for this module and clear dtg_ChkFlag. 

	ENDC	
