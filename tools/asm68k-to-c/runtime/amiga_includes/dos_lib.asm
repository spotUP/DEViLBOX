; AmigaOS dos.library Library Vector Offsets (LVOs)
; From AmigaOS NDK 3.9
_LVOOpen            EQU -30
_LVOClose           EQU -36
_LVORead            EQU -42
_LVOWrite           EQU -48
_LVOInput           EQU -54
_LVOOutput          EQU -60
_LVOSeek            EQU -66
_LVODeleteFile      EQU -72
_LVORename          EQU -78
_LVOLock            EQU -84
_LVOUnLock          EQU -90
_LVODupLock         EQU -96
_LVOExamine         EQU -102
_LVOExNext          EQU -108
_LVOInfo            EQU -114
_LVOCreateDir       EQU -120
_LVOCurrentDir      EQU -126
_LVOIoErr           EQU -132

; dos.library Mode constants
MODE_OLDFILE        EQU 1005
MODE_NEWFILE        EQU 1006
MODE_READWRITE      EQU 1004

; Seek modes
OFFSET_BEGINNING    EQU -1
OFFSET_CURRENT      EQU 0
OFFSET_END          EQU 1
