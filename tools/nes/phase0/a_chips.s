.include "regs.inc"
.segment "HEADER"
  .byte "NES",$1A,2,0,0,0,0,0,0,0,0,0,0,0
.segment "CODE"
reset:
  sei
  ldx #$FF
  txs
  chip_sequence
  jmp *
nmi: rti
.segment "VECTORS"
  .word nmi, reset, nmi
