; NES native player, Phase 3: 2A03 only, NROM-256, NTSC, one stream tick per NMI.
; Stream format: header comment of src/lib/export/nes/nesStream.ts. The region stream sits at $8000 (patched in).
; Decoded: tick masks, chip blocks (items, ascending and constant runs), dictionary refs, repeat, loop, end.
; Parsed but ignored for now: other chips (blocks skipped), events prefix (PCM/control), set-bank (Phase 4).
; Tick rate is the NMI rate: tick rates other than the console frame rate are not honoured yet (Phase 6).
STREAM   = $8000
shadow   = $0200            ; 2A03 register shadow $4000-$4017 (for bars later)

ptr      = $00              ; stream read pointer
base     = $02              ; start of the current subsong stream (dictionary start)
tmp      = $04
saved    = $06
rep      = $08              ; empty ticks still to run
chip     = $09
mask     = $0A
ri       = $0B
rv       = $0C
cnt      = $0D
ended    = $0E
len      = $0F
kind     = $10

.segment "HEADER"
  .byte "NES",$1A,2,0,0,0,0,0,0,0,0,0,0,0

.segment "CODE"
.export title, startsong, nmi
title:     .res 32,$20      ; patched title text
startsong: .byte 0          ; patched initial subsong

reset:
  sei
  cld
  ldx #$40
  stx $4017
  ldx #$FF
  txs
  inx
  stx $2000
  stx $2001
  stx $4010
  bit $2002
: bit $2002
  bpl :-
: bit $2002
  bpl :-
  lda startsong
  jsr restart
  lda #$80
  sta $2000
  jmp *

; A = subsong. Points ptr past the dictionary of that subsong and clears the repeat state.
restart:
  sta tmp
  asl a
  asl a
  clc
  adc tmp
  tay
  lda STREAM+1,y
  sta base
  lda STREAM+2,y
  clc
  adc #>STREAM
  sta base+1
  ldy #0
  lda (base),y
  sta cnt
  lda base
  clc
  adc #1
  sta ptr
  lda base+1
  adc #0
  sta ptr+1
  ldx cnt
  beq @entries
: lda #2
  jsr addptr
  dex
  bne :-
@entries:
  ldx cnt
  beq @done
: lda (ptr),y
  jsr addptr
  lda #1
  jsr addptr
  dex
  bne :-
@done:
  lda #0
  sta rep
  sta ended
  rts

addptr:                     ; ptr += A, keeps X and Y
  clc
  adc ptr
  sta ptr
  bcc :+
  inc ptr+1
: rts

rd:                         ; A = next stream byte (Y must be 0)
  lda (ptr),y
  inc ptr
  bne :+
  inc ptr+1
: rts

nmi:
  pha
  txa
  pha
  tya
  pha
  ldy #0
  jsr tick
  pla
  tay
  pla
  tax
  pla
irq:
  rti

tick:
  lda ended
  bne @ret
  lda rep
  beq @decode
  dec rep
@ret:
  rts
@decode:
  jsr rd
  cmp #0                    ; rd leaves the flags of its pointer increment
  beq @ret                  ; 0: empty tick
  bmi @high
  jmp do_record
@high:
  cmp #$80
  beq @end
  cmp #$81
  beq @loop
  cmp #$82
  beq @events
  cmp #$83
  beq @bank
  cmp #$FE
  beq @repeat
  cmp #$FF
  beq @dictlong
  cmp #$C0
  bcc @end                  ; $84-$BF are not valid headers: stop
  sec
  sbc #$C0
  jmp dict
@dictlong:
  jsr rd
  jmp dict
@end:
  lda #1
  sta ended
  rts
@repeat:
  jsr rd
  sec
  sbc #1
  sta rep
  rts
@bank:
  jsr rd                    ; Phase 4: bank switching; NROM has none
  jmp @decode
@loop:
  jsr rd
  sta tmp
  jsr rd
  sta tmp+1
  jsr rd
  lda tmp
  clc
  adc base
  sta ptr
  lda tmp+1
  adc base+1
  sta ptr+1
  jmp @decode               ; loop target is a tick start; decode it in this tick
@events:                    ; skip count entries: 3 header bytes + 2 (PCM) or 3 (control) value bytes
  jsr rd
  sta cnt
: jsr rd
  lsr a
  lsr a
  lsr a                     ; kind
  tax
  lda #2                    ; offset u16
  jsr addptr
  lda #2
  cpx #0
  beq :+
  lda #3
: jsr addptr
  dec cnt
  bne :--
  jmp @decode

dict:                       ; A = dictionary index; run the entry as a tick record, then return to the stream
  sta tmp
  lda #0
  sta tmp+1
  asl tmp
  rol tmp+1
  lda tmp
  clc
  adc base
  sta tmp
  lda tmp+1
  adc base+1
  sta tmp+1
  lda ptr
  sta saved
  lda ptr+1
  sta saved+1
  ldy #1
  lda (tmp),y
  sec
  adc base                  ; + base + 1 skips the entry length byte
  sta ptr
  iny
  lda (tmp),y
  adc base+1
  sta ptr+1
  ldy #0
  jsr rd
  jsr do_record
  lda saved
  sta ptr
  lda saved+1
  sta ptr+1
  rts

do_record:                  ; A = chip mask
  sta mask
  lda #0
  sta chip
: lsr mask
  bcc :+
  jsr block
: inc chip
  lda mask
  bne :--
  rts

block:                      ; one chip block; only chip 0 (2A03) is written
  jsr rd
  cmp #$FF
  beq @done
  bmi @run
  sta ri
  jsr rd
  sta rv
  jsr wr
  jmp block
@run:
  sta kind
  jsr rd
  sta ri
  jsr rd
  sta len
: jsr rd
  sta rv
  jsr wr
  lda kind
  cmp #$80
  bne :+
  inc ri                    ; $80 ascending run; $81 repeats the same register
: dec len
  bne :--
  jmp block
@done:
  rts

wr:
  lda chip
  bne @r
  ldx ri
  lda rv
  sta shadow,x
  sta $4000,x
@r:
  rts

.segment "VECTORS"
  .word nmi, reset, irq
