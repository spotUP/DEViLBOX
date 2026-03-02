; EaglePlayer / DeliTracker dispatch table offsets
; From DeliPlayer.i STRUCTURE DeliTrackerGlobals,0
; APTR=4 bytes, UWORD=2 bytes, FPTR=4 bytes
;
; Offset calculation (all in bytes, big-endian 68k):
;   0: dtg_AslBase          (APTR, 4)
;   4: dtg_DOSBase          (APTR, 4)
;   8: dtg_IntuitionBase    (APTR, 4)
;  12: dtg_GfxBase          (APTR, 4)
;  16: dtg_GadToolsBase     (APTR, 4)
;  20: dtg_ReservedLibraryBase (APTR, 4)
;  24: dtg_DirArrayPtr      (APTR, 4)
;  28: dtg_FileArrayPtr     (APTR, 4)
;  32: dtg_PathArrayPtr     (APTR, 4)
;  36: dtg_ChkData          (APTR, 4)
;  40: dtg_ChkSize          (ULONG, 4)
;  44: dtg_SndNum           (UWORD, 2)
;  46: dtg_SndVol           (UWORD, 2)
;  48: dtg_SndLBal          (UWORD, 2)
;  50: dtg_SndRBal          (UWORD, 2)
;  52: dtg_LED              (UWORD, 2)
;  54: dtg_Timer            (UWORD, 2)
;  56: dtg_GetListData      (FPTR, 4)
;  60: dtg_LoadFile         (FPTR, 4)
;  64: dtg_CopyDir          (FPTR, 4)
;  68: dtg_CopyFile         (FPTR, 4)
;  72: dtg_CopyString       (FPTR, 4)
;  76: dtg_AudioAlloc       (FPTR, 4)
;  80: dtg_AudioFree        (FPTR, 4)
;  84: dtg_StartInt         (FPTR, 4)
;  88: dtg_StopInt          (FPTR, 4)
;  92: dtg_SongEnd          (FPTR, 4)
;  96: dtg_CutSuffix        (FPTR, 4)
; 100: dtg_SetTimer         (FPTR, 4)
; 104: dtg_WaitAudioDMA     (FPTR, 4)
; 108: dtg_LockScreen       (FPTR, 4)
; 112: dtg_UnlockScreen     (FPTR, 4)
; 116: dtg_NotePlayer       (FPTR, 4)
; 120: dtg_AllocListData    (FPTR, 4)
; 124: dtg_FreeListData     (FPTR, 4)
; 128: dtg_Reserved1        (FPTR, 4)
; 132: dtg_Reserved2        (FPTR, 4)
; 136: dtg_Reserved3        (FPTR, 4)

dtg_AslBase             EQU 0
dtg_DOSBase             EQU 4
dtg_IntuitionBase       EQU 8
dtg_GfxBase             EQU 12
dtg_GadToolsBase        EQU 16
dtg_ReservedLibraryBase EQU 20
dtg_DirArrayPtr         EQU 24
dtg_FileArrayPtr        EQU 28
dtg_PathArrayPtr        EQU 32
dtg_ChkData             EQU 36
dtg_ChkSize             EQU 40
dtg_SndNum              EQU 44
dtg_SndVol              EQU 46
dtg_SndLBal             EQU 48
dtg_SndRBal             EQU 50
dtg_LED                 EQU 52
dtg_Timer               EQU 54
dtg_GetListData         EQU 56
dtg_LoadFile            EQU 60
dtg_CopyDir             EQU 64
dtg_CopyFile            EQU 68
dtg_CopyString          EQU 72
dtg_AudioAlloc          EQU 76
dtg_AudioFree           EQU 80
dtg_StartInt            EQU 84
dtg_StopInt             EQU 88
dtg_SongEnd             EQU 92
dtg_CutSuffix           EQU 96
dtg_SetTimer            EQU 100
dtg_WaitAudioDMA        EQU 104
dtg_LockScreen          EQU 108
dtg_UnlockScreen        EQU 112
dtg_NotePlayer          EQU 116
dtg_AllocListData       EQU 120
dtg_FreeListData        EQU 124
dtg_Reserved1           EQU 128
dtg_Reserved2           EQU 132
dtg_Reserved3           EQU 136

; EaglePlayer version
EAGLEVERSION            EQU 13

; TAG constants
TAG_DONE                EQU 0
TAG_USER                EQU $80000000

; EaglePlayer Tag base
EP_TagBase              EQU $80004550   ; TAG_USER + "EP"
; DeliTracker Tag base
DTP_TagBase             EQU $80004454   ; TAG_USER + "DT"

; Common DeliTracker tags (DTP_TagBase + enum index)
DTP_PlayerVersion       EQU DTP_TagBase+1
DTP_RequestDTVersion    EQU DTP_TagBase+2
DTP_PlayerName          EQU DTP_TagBase+3
DTP_Creator             EQU DTP_TagBase+4
DTP_InfFile             EQU DTP_TagBase+5
DTP_ExtLoad             EQU DTP_TagBase+6
DTP_Interrupt           EQU DTP_TagBase+7
DTP_Volume              EQU DTP_TagBase+8
DTP_Balance             EQU DTP_TagBase+9
DTP_InitPlayer          EQU DTP_TagBase+10
DTP_EndPlayer           EQU DTP_TagBase+11
DTP_InitSound           EQU DTP_TagBase+12
DTP_EndSound            EQU DTP_TagBase+13
DTP_Check1              EQU DTP_TagBase+14
DTP_Check2              EQU DTP_TagBase+15
DTP_RequestKickVersion  EQU DTP_TagBase+16
DTP_RequestV37          EQU DTP_TagBase+16
DTP_SongEnd             EQU DTP_TagBase+17
DTP_Restart             EQU DTP_TagBase+18
DTP_SetBPM              EQU DTP_TagBase+19

; Common EaglePlayer tags (EP_TagBase + enum index)
EP_PlayerVersion        EQU EP_TagBase+1
EP_Flags                EQU EP_TagBase+15
EP_ModuleInfo           EQU EP_TagBase+16   ; was EP_Get_ModuleInfo
EP_NewModuleInfo        EQU EP_TagBase+24
EP_EagleBase            EQU EP_TagBase+47
EP_Check5               EQU EP_TagBase+37
EP_Voices               EQU EP_TagBase+4
EP_StructInit           EQU EP_TagBase+9
EP_InitAmplifier        EQU EP_TagBase+42

; EaglePlayer bit flags (EPF_* / EPB_*)
EPB_Volume              EQU 1<<8
EPB_Balance             EQU 1<<9
EPB_Voices              EQU 1<<10
EPB_Analyzer            EQU 1<<12
EPB_ModuleInfo          EQU 1<<13
EPB_Packable            EQU 1<<15
EPB_Songend             EQU 1<<1
EPB_Restart             EQU 1<<2

; DeliTracker/ModuleInfo tags
MI_TagBase              EQU $80004D49   ; TAG_USER + "MI"
MI_Calcsize             EQU MI_TagBase+1
WT                      EQU $5754       ; 'WT' — Wanted Team version

; UPS (User Program Structure) offsets — used by Sonix driver
; These are offsets into the StructAdr structure
UPS_Voice1Per           EQU 0
UPS_Voice2Per           EQU 2
UPS_Voice3Per           EQU 4
UPS_Voice4Per           EQU 6
UPS_Voice1Vol           EQU 8
UPS_Voice2Vol           EQU 10
UPS_Voice3Vol           EQU 12
UPS_Voice4Vol           EQU 14
UPS_Enabled             EQU 16
UPSB_Adr                EQU 0           ; placeholder
UPS_SizeOF              EQU 18          ; end of UPS structure

; LoadFile mode bits
MEMF_CHIP               EQU 2
MEMF_PUBLIC             EQU 1
MEMF_CLEAR              EQU $10000
