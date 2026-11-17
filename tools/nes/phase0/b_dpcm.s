; Mapper 31 (4 KB banks via $5FF8-$5FFF). DMC sample at $CF00, 513 bytes,
; crosses $D000. After ~10 frames both slots are switched while the sample plays.
.include "regs.inc"
.segment "HEADER"
  .byte "NES",$1A,2,0,$F0,$10,0,0,0,0,0,0,0,0
.segment "BANK0"
  .res $1000,$11
.segment "BANK1"
  .res $1000,$22
.segment "BANK4"
  .res $1000,$AA
.segment "BANK5"
  .res $1000,$55
.segment "CODE"
reset:
  sei
  ldx #$FF
  txs
  w $5FFC,$04          ; slot $C000 <- bank 4
  w $5FFD,$05          ; slot $D000 <- bank 5
  w $4010,$00          ; slowest rate, no loop, no IRQ
  w $4012,$3C          ; $C000 + $3C*64 = $CF00
  w $4013,$20          ; 16*$20+1 = 513 bytes
  w $4015,$10          ; start DMC
  ldy #10
@frame:
  bit $2002
@vbl:
  bit $2002
  bpl @vbl
  dey
  bne @frame
  w $5FFC,$00          ; switch current slot mid-sample
  w $5FFD,$01          ; switch next slot before DMC reaches it
  jmp *
nmi: rti
.segment "VECTORS"
  .word nmi, reset, nmi
