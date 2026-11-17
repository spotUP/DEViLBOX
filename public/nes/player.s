; NES native player, Phases 3-4: 2A03 only, NTSC, one stream tick per NMI, mapper 31 (4 KB banking) cartridge.
; Banking: $5FF8+n selects the 4 KB ROM bank shown at $8000+n*$1000. The last window $F000 is never switched (code, vectors;
; mapper 31 powers on with $5FFF = last bank). Window 0 ($8000) holds the current subsong's first bank (dictionary, first
; ticks); window 1 ($9000) holds the stream bank set by SET_BANK/LOOP; windows 4-6 ($C000-$EFFF) are the DPCM window.
; The region header (subsong table) lives in ROM bank 0. Streams are always encoded with bankSize 4096.
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
sbase    = $11              ; ROM bank of the current subsong start
pendf    = $12              ; DPCM bank switch waiting for the sample to finish
pendb    = $13              ; first ROM bank of the pending DPCM window

.segment "HEADER"
  .byte "NES",$1A,2,0,$F0,$18,0,0,0,0,0,0,0,0 ; NES 2.0, mapper 31, PRG size patched by the cartridge builder

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
  txa                       ; windows 0-6 = ROM bank 0 (A = 0)
  ldx #6
: sta $5FF8,x
  dex
  bpl :-
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
  lda #0
  sta $5FF8                 ; the subsong table is in ROM bank 0
  lda STREAM+2,y            ; offset mid byte: bank = high nibble (offsets are bank aligned; builder keeps them < 1 MB)
  lsr a
  lsr a
  lsr a
  lsr a
  sta sbase
  sta $5FF8
  lda #0
  sta base
  sta pendf
  lda #>STREAM
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
  jsr dpcm_apply
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
  jsr rd                    ; bank relative to the subsong start, shown in window 1
  clc
  adc sbase
  sta $5FF9
  lda #0
  sta ptr
  lda #$90
  sta ptr+1
  jmp @decode
@loop:                      ; target u24 from the subsong start: bank = bits 12-19, offset in bank = bits 0-11
  jsr rd
  sta tmp
  jsr rd
  sta tmp+1
  jsr rd
  lda tmp
  sta ptr
  lda tmp+1
  and #$0F
  sta ptr+1
  lda tmp+1
  lsr a
  lsr a
  lsr a
  lsr a
  beq @w0
  clc
  adc sbase
  sta $5FF9
  lda ptr+1
  ora #$90
  sta ptr+1
  jmp @decode
@w0:
  lda ptr+1
  ora #$80
  sta ptr+1
  jmp @decode               ; loop target is a tick start; decode it in this tick
@events:                    ; entries: byte0 = kind<<3|chip, u16 offset, then 2 (PCM) or 3 (control) value bytes
  jsr rd
  sta cnt
@ev:
  jsr rd
  sta tmp
  lsr a
  lsr a
  lsr a
  tax                       ; kind
  lda #2
  jsr addptr                ; offset
  cpx #0
  bne @ctl
  lda #2
  jsr addptr
  jmp @evnext
@ctl:
  jsr rd                    ; control | channel<<4
  sta tmp+1
  jsr rd
  sta rv                    ; value low
  jsr rd
  lda tmp
  and #7
  bne @evnext               ; only the 2A03 owns a DPCM bank
  lda tmp+1
  and #$0F
  cmp #4                    ; NES_CONTROL.DPCM_BANK
  bne @evnext
  lda rv
  sta pendb
  lda #1
  sta pendf
  jsr dpcm_apply
@evnext:
  dec cnt
  bne @ev
  jmp @decode

; Map the pending DPCM bank to $C000-$EFFF once the DMC has fetched its last byte ($4015 bit 4 clear).
dpcm_apply:
  lda pendf
  beq @no
  lda $4015
  and #$10
  bne @no
  lda pendb
  sta $5FFC
  clc
  adc #1
  sta $5FFD
  adc #1
  sta $5FFE
  lda #0
  sta pendf
@no:
  rts

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
