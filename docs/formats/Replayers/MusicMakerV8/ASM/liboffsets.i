   IFND MMV8_LIB_I
MMV8_LIB_I   SET 1
*
* mmv8 library offsets
* v21
*

SoundOn            equ -30  ; ()
SoundOff           equ -36  ; ()
GeneralSndInit     equ -42  ; (oneshot,idata,sdata,routine)(D0/A1/A2/A3)
GeneralSndRemove   equ -48  ; ()
GeneralSndReset    equ -54  ; (oneshot)(D0)
FadeSnd            equ -60  ; (speed)(D0)
WaitFade           equ -66  ; ()
LoadAndInit        equ -72  ; (filename,oneshot)(A0/D0)
RemoveLoaded       equ -78  ; ()
WaitOneShotFin     equ -84  ; ()
DecrunchInstrs     equ -90  ; (source,dest)(A0/A1)
SetVolume          equ -96  ; (volume)(D0)
SetSpeed           equ -102 ; (speed)(D0)
GetUnPackedInstLen equ -108 ; (ipdata)(A0)
IsStdSong          equ -114 ; (sdata)(A0)
SetAlertReaction   equ -120 ; (reaction)(D0)
ObtainMixBufLen    equ -126 ; (sdata)(A0)
SetMixBuffers      equ -132 ; (vectorfield)(A0)
NewLoadAndInit     equ -138 ; (filename,oneshot,routine,song#)(A0/D0/A1/D1)
NewSndInit         equ -144 ; (oneshot,song#,idata,sdata,routine)(D0/D1/A1/A2/A3)
NewRemoveSong      equ -150 ; (song#)(D0)
NewSndReset        equ -156 ; (song#)(D0)
NewSndResetOneshot equ -162 ; (oneshot,song#)(D0/D1)
RemoveAllSongs     equ -168 ; ()
NewMakeTables      equ -174 ; (memory,packed)(A0/D1)
;Reserved1         equ -180 ; DO NOT USE
LockAudio          equ -186 ; ()
UnlockAudio        equ -192 ; ()
SetupCacheControl  equ -198 ; (kickversion,attnflags)(D0/D1)
MuteChannels       equ -204 ; (mutechannels)(D0)
GetMutedChannels   equ -210 ; ()
InitUMod           equ -216 ; (umod,oneshot,routine,song#)(A1/D0/A2/D1)
InitPMod           equ -222 ; (pmod,insts,oneshot,routine,song#)(A1/A2/D0/A3/D1)
GetUnpacklenMod    equ -228 ; (pmod)(A0)
DecrunchMod        equ -234 ; (pmod,destmem)(A0/A1)
IsStdMod           equ -240 ; (module)(A0)

 ENDC  ;!MMV8_LIB_I


