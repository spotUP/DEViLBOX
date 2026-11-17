; NSF with expansion byte $3F = VRC6|VRC7|FDS|MMC5|N163|5B all set at once.
.include "regs.inc"
.segment "HEADER"
  .byte "NESM",$1A,1,1,1
  .word $8000,$8000,play      ; load, init, play
  .byte "multi",0
  .res 26,0
  .byte "phase0",0
  .res 25,0
  .byte "none",0
  .res 27,0
  .word 16666                 ; NTSC speed
  .res 8,0                    ; no bankswitching
  .word 20000                 ; PAL speed
  .byte 0                     ; NTSC
  .byte $3F                   ; expansion chips
  .res 4-1,0
.segment "CODE"
init:
  chip_sequence
  rts
play:
  rts
