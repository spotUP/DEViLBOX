; Simple test replayer
n_period  EQU 16
n_volume  EQU 18

  XDEF InitPlay
  XDEF PlayMusic

InitPlay:
  movem.l d0-d1/a0,-(sp)
  lea     SongData(PC),a0
  move.w  #$0040,$DFF0A8    ; ch0 volume=64
  movem.l (sp)+,d0-d1/a0
  rts

PlayMusic:
  move.w  (a0)+,d0
  move.w  d0,$DFF0A6        ; set period ch0
  rts

SongData:  DC.W $0358,$0280,$0200
