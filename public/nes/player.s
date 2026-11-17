; NES native player, Phases 3-4: 2A03 only, NTSC, one stream tick per NMI, mapper 31 (4 KB banking) cartridge.
; Banking: $5FF8+n selects the 4 KB ROM bank shown at $8000+n*$1000. The last window $F000 is never switched (code, vectors;
; mapper 31 powers on with $5FFF = last bank). Window 0 ($8000) holds the current subsong's first bank (dictionary, first
; ticks); window 1 ($9000) holds the stream bank set by SET_BANK/LOOP; windows 4-6 ($C000-$EFFF) are the DPCM window.
; The region header (subsong table) lives in ROM bank 0. Streams are always encoded with bankSize 4096.
; Stream format: header comment of src/lib/export/nes/nesStream.ts. The region stream sits at $8000 (patched in).
; Decoded: tick masks, chip blocks (items, ascending and constant runs), dictionary refs, repeat, loop, end.
; Chip writers for 2A03, VRC6, VRC7, FDS, MMC5, N163, 5B (Phase 5). Events prefix: only DPCM_BANK is acted on.
; Phase 7: RAW prefix ($84, chip, a, b, u16 len, bytes) runs a cycle-counted loop that writes the bytes to $4011 / $9000 / $5011.
; Cycles per sample = 30 + 5a + 7b (NES_RAW_FIXED in nesStream.ts). NMI is off and nothing else runs while it plays.
; Phase 6: region (NTSC/PAL/Dendy) is detected at boot by counting loop iterations between two vblanks; the region's stream starts
; at ROM bank regbank[region] (patched). A subsong whose table entry has period 0 ticks on NMI (song rate = console frame rate);
; otherwise the custom board's cycle IRQ ticks it every `period` CPU cycles ($4100/$4101 reload lo/hi, $4102 bit 0 enable, $4103 ack;
; same idea as the VRC cycle counter) and NMI is off. Subsong table entry (7 bytes): u24 offset, u16 rate in 0.01 Hz, u16 IRQ period.
STREAM   = $8000
shadow   = $0200            ; register shadows: 2A03 $0200, VRC6 $0300, VRC7 $0380, FDS $0400, MMC5 $0480, N163 $0500, 5B $0580 (bars read them)

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
wp       = $14              ; computed write port (VRC6)
rbank    = $16              ; first ROM bank of the detected region's stream
period   = $17              ; IRQ period of the current subsong (0 = NMI driven), 2 bytes
region   = $19              ; 0 NTSC, 1 PAL, 2 Dendy
ra       = $1A              ; raw loop delay loop counts (5 and 7 cycle loops)
rb       = $1B
endp     = $1C              ; raw block end address, 2 bytes
; Phase 8 screen state (separate zero page block)
s_ptr    = $20              ; text source pointer, 2 bytes
fc       = $22              ; frame counter within the second
tm       = $23              ; MM:SS digits: m10 m1 s10 s1 (4 bytes)
paused   = $27
dirty    = $28              ; status line needs a redraw
pad      = $29
padold   = $2A
curl     = $2B              ; current subsong
scrpos   = $2C              ; scroller start index into scroll text
scrcnt   = $2D
barnext  = $2E
busy     = $2F              ; set while the IRQ tick runs
skipscr  = $30              ; a raw block ran this frame: PPU is not in vblank, skip drawing
tmpa     = $31
tmpb     = $32
tmpc     = $33
tmpd     = $34
fcmax    = $35
pad2     = $36
SCROLL_FRAMES = 6           ; frames per scroller character
BAR_PER_FRAME = 2           ; bars redrawn per NMI
NBARS    = 28               ; NES_BAR_BUDGET in the plan: 5 (2A03) + 3 (VRC6) + 6 (VRC7) + 1 (FDS) + 2 (MMC5) + 8 (N163) + 3 (5B)

; One raw sample loop. Per sample: fetch, write, advance (+4 cycles on a page carry), two delay loops, end test.
.macro RAWLOOP port
.align 64, $EA            ; the loop is under 64 bytes: aligned, no branch inside it crosses a page (+1 cycle each)
:
  lda (ptr),y
  sta port
  inc ptr
  bne :+
  inc ptr+1
: ldx ra
: dex
  bne :-
  ldx rb
: dex
  nop
  bne :-
  lda ptr
  cmp endp
  bne :----
  lda ptr+1
  cmp endp+1
  bne :----
.endmacro

.segment "HEADER"
.ifdef VRC6
  .byte "NES",$1A,2,0,$80,$18,0,0,0,0,0,0,0,0 ; NES 2.0, mapper 24 (VRC6), PRG size patched by the cartridge builder
.else
  .byte "NES",$1A,2,0,$F0,$18,0,0,0,0,0,0,0,0 ; NES 2.0, mapper 31, PRG size patched by the cartridge builder
.endif

.segment "CODE"
.export title, startsong, regbank, nmi, irq, idle, author, chipname, scrolltext, nsub, nmiend, nsfinit, nsfplay
title:     .res 32,$20      ; patched title text
startsong: .byte 0          ; patched initial subsong
regbank:   .byte 0,0,0      ; patched: first ROM bank of the NTSC, PAL, Dendy streams
author:    .res 32,$20      ; patched author text
chipname:  .res 16,$20      ; patched chip/platform name
scrolltext: .res 128,$20    ; patched scroller text (space padded)
nsub:      .byte 1          ; patched subsong count

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
.ifdef VRC6
  sta $8000                 ; mapper 24: $8000 16 KB select, $C000 8 KB select (the 8 KB last bank is fixed)
  sta $C000
.else
  ldx #6
: sta $5FF8,x
  dex
  bpl :-
.endif
  bit $2002
: bit $2002
  bpl :-
: bit $2002
  bpl :-
  ldx #0                    ; vblank just started: count 12-cycle iterations until the next one (NTSC ~2482, PAL ~2770, Dendy ~2955)
  ldy #0
: inx
  bne :+
  iny
: lda $2002
  bpl :--
  sty tmp+1
  stx tmp
  lda #0
  sta region
  lda tmp+1                 ; 16-bit compare with the midpoints $0A42 (NTSC/PAL) and $0B2E (PAL/Dendy)
  cmp #$0A
  bcc @found
  bne @pal0
  lda tmp
  cmp #$42
  bcc @found
@pal0:
  inc region
  lda tmp+1
  cmp #$0B
  bcc @found
  bne @dendy
  lda tmp
  cmp #$2E
  bcc @found
@dendy:
  inc region
@found:
  ldx region
  lda regbank,x
  sta rbank
  lda #60
  cpx #0
  beq :+
  lda #50
: sta fcmax
  jsr screen_init
  lda startsong
  sta curl
  jsr restart
  lda #$80
  sta $2000                 ; NMI always on: screen update, and the tick when period is 0
  lda period
  ora period+1
  beq idle
  jsr irq_program
  cli
idle:
  jmp *

irq_program:
  lda period
  sta $4100
  lda period+1
  sta $4101
  lda #1
  sta $4102
  rts

; A = subsong. Points ptr past the dictionary of that subsong and clears the repeat state.
restart:
  sta tmp
  asl a
  asl a
  asl a
  sec
  sbc tmp                   ; 7 bytes per table entry (builder limits the song to 36 subsongs)
  tay
  lda rbank
.ifdef VRC6
  lsr a                     ; mapper 24 build: stream banks are 8 KB; the region start is even, so the table sits at $8000
.endif
  sta $5FF8                 ; the subsong table is in the first bank of the region stream
  lda STREAM+6,y
  sta period
  lda STREAM+7,y
  sta period+1
  lda STREAM+2,y            ; offset mid byte: bank = high nibble (offsets are bank aligned; builder keeps them < 1 MB)
.ifdef VRC6
  ldx STREAM+3,y            ; offset high byte: 8 KB bank = offset bits 13-20
  lsr a
  lsr a
  lsr a
  lsr a
  lsr a
  sta tmp
  txa
  asl a
  asl a
  asl a
  ora tmp
.else
  lsr a
  lsr a
  lsr a
  lsr a
.endif
  clc
  adc rbank
  sta sbase
.ifdef VRC6
  sta $C000                 ; $C000 8 KB window = the stream bank
  lsr a
  sta $8000                 ; $8000 16 KB window = the dictionary (the sbase half of its 16 KB bank)
  lda #0
  sta base
  sta pendf
  lda #>STREAM
  bcc :+
  lda #>STREAM+$20
: sta base+1
.else
  sta $5FF8
  lda #0
  sta base
  sta pendf
  lda #>STREAM
  sta base+1
.endif
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
.ifdef VRC6
  lda ptr+1                 ; the records after the dictionary are read through the stream window
  and #$1F
  ora #$C0
  sta ptr+1
.endif
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
  jsr screen                ; PPU writes first, while the whole vblank is free; a heavy tick would push them past it
  lda period
  ora period+1
  bne nmiend                ; IRQ board: the cycle IRQ ticks
  lda paused
  bne nmiend
  ldy #0
  jsr dpcm_apply
  jsr tick
nmiend:
  pla
  tay
  pla
  tax
  pla
  rti
irq:                        ; custom board cycle IRQ: ack, then the tick unless paused
  pha
  txa
  pha
  tya
  pha
  sta $4103
  lda paused
  bne @out
  inc busy
  ldy #0
  jsr dpcm_apply
  jsr tick
  dec busy
@out:
  pla
  tay
  pla
  tax
  pla
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
  bne @n82
  jmp @events
@n82:
  cmp #$83
  beq @bank
  cmp #$84
.ifdef VRC6
  bne @n84                  ; @raw is out of branch range in the VRC6 build
  jmp @raw
@n84:
.else
  beq @raw
.endif
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
.ifdef VRC6
  sta $C000
  lda #0
  sta ptr
  lda #$C0
.else
  sta $5FF9
  lda #0
  sta ptr
  lda #$90
.endif
  sta ptr+1
  jmp @decode
@loop:                      ; target u24 from the subsong start: bank = bits 12-19, offset in bank = bits 0-11
  jsr rd
  sta tmp
  jsr rd
  sta tmp+1
  jsr rd
.ifdef VRC6
  asl a                     ; u24 target: 8 KB bank = bits 13-20, offset in bank = bits 0-12
  asl a
  asl a
  sta tmp+2
  lda tmp
  sta ptr
  lda tmp+1
  and #$1F
  ora #$C0
  sta ptr+1
  lda tmp+1
  lsr a
  lsr a
  lsr a
  lsr a
  lsr a
  ora tmp+2
  clc
  adc sbase
  sta $C000
  jmp @decode
.endif
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
@raw:                       ; chip index (CHIP_ORDER), a, b, u16 length, data
  jsr rd
  sta tmp
  jsr rd
  sta ra
  jsr rd
  sta rb
  jsr rd
  sta endp
  jsr rd
  sta endp+1
  clc
  lda endp
  adc ptr
  sta endp
  lda endp+1
  adc ptr+1
  sta endp+1
  lda #0
  sta $2000                 ; no NMI tick while the sample plays
  lda tmp
  bne @r1
  RAWLOOP $4011
  jmp @rawdone
@r1:
  cmp #1
  bne @r4
  RAWLOOP $9000
  jmp @rawdone
@r4:
  cmp #4
  bne @rskip
  RAWLOOP $5011
  jmp @rawdone
@rskip:
  lda endp                  ; unknown chip: skip the data
  sta ptr
  lda endp+1
  sta ptr+1
@rawdone:
  bit $2002                 ; drop the vblank edge that passed during the block
  lda #$80
  sta $2000
  sta skipscr
  jmp @decode
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

block:                      ; one chip block; chip index = bit number in the tick mask (CHIP_ORDER in nesStream.ts)
  jsr rd
  cmp #$FF
  beq @done
  cmp #$80                  ; cmp #$FF leaves N set for A >= $7F, so test the high bit separately
  bcs @run
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

; Chip writers (Phase 5). ri = register index as the stream stores it, rv = value; Y = 0 on entry and exit.
; Canonical non-mirrored ports only. Chip 0 2A03, 1 VRC6, 2 VRC7, 3 FDS, 4 MMC5, 5 N163, 6 5B.
; Wave-enable windows (FDS $4089 bit 7, N163 channel regs) are not synthesised: the capture holds those writes and the
; stream replays them in order. Chips are written in tick-mask order, not interleaved as captured.
wr:
  jsr wdisp
  ldy #0
  rts
wdisp:
  ldx ri
  lda rv
  ldy chip
  beq w2a03
  dey
  beq wvrc6
  dey
  beq wvrc7
  dey
  beq wfds
  dey
  beq wmmc5
  dey
  beq wn163
  dey
  beq w5b
  rts
w2a03:
  sta shadow,x
  sta $4000,x
  rts
wfds:                       ; $4040-$407F wave RAM, $4080-$408A registers
  sta $0400,x
  sta $4040,x
  rts
wmmc5:                      ; $5000-$5015
  sta $0480,x
  sta $5000,x
  rts
wvrc6:                      ; index = (bank-9)*4 + (addr&3), banks $9000 / $A000 / $B000
  sta $0300,x
  sta tmp
  txa
  and #3
  sta wp
  txa
  lsr a
  lsr a
  asl a
  asl a
  asl a
  asl a
  clc
  adc #$90
  sta wp+1
  lda tmp
  ldy #0
  sta (wp),y
  rts
wvrc7:                      ; $9010 register select, >= 6 cycles, $9030 data, >= 42 cycles
  sta $0380,x
  sta tmp
  stx $9010
  nop
  nop
  nop
  lda tmp
  sta $9030
  ldx #9                    ; 9 x 5 - 1 = 44 cycles
: dex
  bne :-
  rts
wn163:                      ; $F800 address with auto-increment (bit 7), $4800 data; $7F channel count as captured
  sta $0500,x
  sta tmp
  txa
  ora #$80
  sta $F800
  lda tmp
  sta $4800
  rts
w5b:                        ; $C000 register select, $E000 data
  sta $0580,x
  sta tmp
  stx $C000
  lda tmp
  sta $E000
  rts


; ---------------------------------------------------------------------------------------------------------------------
; Phase 8 player screen. Background only (CHR RAM tiles from screen.chr), nametable 0, rendering on, updates only in NMI.
; Tile = ASCII - $20 for text, 64-71 logo, 72 solid bar block. Layout: logo + chip name rows 1-2, title row 4, author row 5,
; status row 7, bars rows 10-17 (one column per bar, from column 2), scroller row 24.
puttext:                    ; s_ptr -> text, X = length; PPU address already set
  ldy #0
: lda (s_ptr),y
  sec
  sbc #$20
  sta $2007
  iny
  dex
  bne :-
  rts
setaddr:                    ; A = high, X = low
  sta $2006
  stx $2006
  rts
setptr:                     ; A = low, X = high
  sta s_ptr
  stx s_ptr+1
  rts
pstr:                       ; A = low, X = high of an ASCII string whose length is in Y
  jsr setptr
  tya
  tax
  jmp puttext
pdig:                       ; A = 0-9
  clc
  adc #$10
  sta $2007
  rts
pnum:                       ; A = 0-99 as two digits
  ldx #0
: cmp #10
  bcc :+
  sbc #10
  inx
  bne :-
: pha
  txa
  jsr pdig
  pla
  jmp pdig

screen_init:
  lda #0
  sta $2001
  lda #0
  tax
  jsr setaddr               ; CHR RAM $0000: 5 pages cover the 73 tiles
  lda #<chr
  ldx #>chr
  jsr setptr
  ldx #5
  ldy #0
: lda (s_ptr),y
  sta $2007
  iny
  bne :-
  inc s_ptr+1
  dex
  bne :-
  lda #$20
  ldx #0
  jsr setaddr               ; clear nametable 0 and its attributes
  ldx #4
  ldy #0
  lda #0
: sta $2007
  iny
  bne :-
  dex
  bne :-
  lda #$3F
  ldx #0
  jsr setaddr
  ldx #0
: lda palette,x
  sta $2007
  inx
  cpx #4
  bne :-
  lda #$20                  ; logo rows
  ldx #$21
  jsr setaddr
  ldx #64
: stx $2007
  inx
  cpx #68
  bne :-
  lda #$20
  ldx #$41
  jsr setaddr
: stx $2007
  inx
  cpx #72
  bne :-
  lda #$20
  ldx #$26
  jsr setaddr
  lda #<chipname
  ldx #>chipname
  ldy #16
  jsr pstr
  lda #$20
  ldx #$80
  jsr setaddr
  lda #<title
  ldx #>title
  ldy #32
  jsr pstr
  lda #$20
  ldx #$A0
  jsr setaddr
  lda #<author
  ldx #>author
  ldy #32
  jsr pstr
  lda #0
  sta fc
  sta paused
  sta padold
  sta scrpos
  sta scrcnt
  sta barnext
  sta busy
  sta skipscr
  lda #$0F                  ; VRC7 volume registers are attenuation: 15 = silent, so an absent chip shows empty bars
  ldx #5
: sta $03B0,x
  dex
  bpl :-
  lda #0
  sta tm
  sta tm+1
  sta tm+2
  sta tm+3
  jsr status
  jsr scroller
  lda #0
  sta dirty
  jsr scrollreset
  lda #$0A
  sta $2001                 ; background on, left column shown
  rts

scrollreset:                ; leave the PPU scroll at 0,0 (address writes disturb it)
  lda $2002
  lda #0
  sta $2005
  sta $2005
  rts

status:                     ; row 7: SONG nn/mm  MM:SS  PLAYING
  lda #$20
  ldx #$E2
  jsr setaddr
  lda #<t_song
  ldx #>t_song
  ldy #5
  jsr pstr
  lda curl
  clc
  adc #1
  jsr pnum
  lda #$0F                  ; '/'
  sta $2007
  lda nsub
  jsr pnum
  lda #0
  sta $2007
  sta $2007
  lda tm
  jsr pdig
  lda tm+1
  jsr pdig
  lda #$1A                  ; ':'
  sta $2007
  lda tm+2
  jsr pdig
  lda tm+3
  jsr pdig
  lda #0
  sta $2007
  sta $2007
  lda paused
  bne :+
  lda #<t_play
  ldx #>t_play
  bne :++
: lda #<t_pause
  ldx #>t_pause
: ldy #7
  jmp pstr

scroller:                   ; row 24, half A (0 = columns 0-15, 1 = 16-31): 16 characters of scrolltext, wrapping at 128 (a half fits the vblank budget)
  sta tmpc
  lda #$23
  ldx tmpc
  beq :+
  ldx #16
: stx tmpd
  jsr setaddr
  lda tmpd
  clc
  adc scrpos
  and #$7F
  tax
  ldy #16
: lda scrolltext,x
  sec
  sbc #$20
  sta $2007
  inx
  txa
  and #$7F
  tax
  dey
  bne :-
  rts

bar:                        ; A = bar index: level from its shadow register, redrawn as 8 block tiles in column 2+index
  sta tmpd
  asl a
  asl a
  tax
  lda bartab,x
  sta s_ptr
  lda bartab+1,x
  sta s_ptr+1
  lda bartab+2,x
  sta tmpa
  lda bartab+3,x
  sta tmpb
  ldy #0
  lda (s_ptr),y
  and tmpa
  pha
  lda tmpb
  and #$07
  tax
  pla
  cpx #0
  beq :++
: lsr a
  dex
  bne :-
: ldx tmpb
  bpl :+
  eor #$0F                  ; inverted attenuation register (VRC7)
  and #$0F
: clc
  adc #1
  lsr a                     ; 0-15 -> 0-8 filled rows
  sta tmpc
  lda #$21
  sta $2006
  lda tmpd
  clc
  adc #$42                  ; row 10, column 2
  sta $2006
  lda #$84
  sta $2000                 ; PPU address steps down a row per write
  ldx #8
: lda #0
  cpx tmpc
  bcc :+
  bne :++
: lda #72
: sta $2007
  dex
  bne :---
  lda #$80
  sta $2000
  rts

screen:
  lda paused                ; MM:SS counts frames while playing
  bne @notime
  inc fc
  lda fc
  cmp fcmax
  bcc @notime
  lda #0
  sta fc
  sta dirty
  inc dirty
  inc tm+3
  lda tm+3
  cmp #10
  bcc @notime
  lda #0
  sta tm+3
  inc tm+2
  lda tm+2
  cmp #6
  bcc @notime
  lda #0
  sta tm+2
  inc tm+1
  lda tm+1
  cmp #10
  bcc @notime
  lda #0
  sta tm+1
  inc tm
  lda tm
  cmp #10
  bcc @notime
  lda #0
  sta tm
@notime:
  jsr joypad
  lda skipscr
  beq @draw
  lda #0
  sta skipscr
  rts                       ; a raw block ran: not in vblank, drawing would corrupt the picture
@draw:
  lda dirty                 ; a status frame draws the status line only (keeps the NMI inside vblank)
  beq @nostatus
  lda #0
  sta dirty
  jsr status
  jmp @end
@nostatus:
  lda #BAR_PER_FRAME
  sta pad2
@bars:
  lda barnext
  jsr bar
  inc barnext
  lda barnext
  cmp #NBARS
  bcc :+
  lda #0
  sta barnext
: dec pad2
  bne @bars
@scroll:
  inc scrcnt
  lda scrcnt
  cmp #SCROLL_FRAMES-1
  bcc @end
  bne @half1
  lda #0                    ; first half this frame, second half the next
  jsr scroller
  jmp @end
@half1:
  lda #1
  jsr scroller
  lda #0
  sta scrcnt
  lda scrpos
  clc
  adc #1
  and #$7F
  sta scrpos
@end:
  jmp scrollreset

readpad:                    ; A = buttons: bit7 A, 6 B, 5 Select, 4 Start, 3 Up, 2 Down, 1 Left, 0 Right
  lda #1
  sta $4016
  lda #0
  sta $4016
  ldx #8
: lda $4016
  lsr a
  rol pad
  dex
  bne :-
  lda pad
  rts
joypad:
  jsr readpad               ; the DMC steals cycles and corrupts a read: accept a value only when two reads agree
  sta pad2
  jsr readpad
  cmp pad2
  bne @none
  tax
  eor padold
  and pad2                  ; newly pressed
  stx padold
  sta tmpa
  and #$90                  ; Start or A
  beq @nopause
  lda paused
  eor #1
  sta paused
  inc dirty
  lda paused
  bne @mute
  lda $0215                 ; resume: restore the 2A03 channel enables
  sta $4015
  jmp @nopause
@mute:
  lda #0
  sta $4015
@nopause:
  lda busy                  ; not while the IRQ tick runs
  bne @none
  lda tmpa
  and #$03
  beq @none
  and #$01                  ; Right = next, Left = previous
  bne @next
  lda curl
  bne :+
  lda nsub
: sec
  sbc #1
  jmp @go
@next:
  lda curl
  clc
  adc #1
  cmp nsub
  bcc @go
  lda #0
@go:
  sta curl
  sei
  lda #0
  sta $4015
  sta $4102
  sta tm
  sta tm+1
  sta tm+2
  sta tm+3
  sta fc
  lda curl
  jsr restart
  lda period
  ora period+1
  beq @nirq
  jsr irq_program
@nirq:
  inc dirty
@none:
  rts

palette:  .byte $0F,$30,$10,$2A
t_song:   .byte "SONG "
t_play:   .byte "PLAYING"
t_pause:  .byte "PAUSED "
; Bar sources: shadow address, mask, shift (bit 7 = invert). Level = ((reg & mask) >> shift), 0-15, drawn as (level+1)/2 rows.
bartab:
  .word $0200
  .byte $0F,0
  .word $0204
  .byte $0F,0
  .word $0208
  .byte $7F,3
  .word $020C
  .byte $0F,0
  .word $0211
  .byte $7F,3
  .word $0300
  .byte $0F,0
  .word $0304
  .byte $0F,0
  .word $0308
  .byte $3F,2
  .word $03B0
  .byte $0F,$80
  .word $03B1
  .byte $0F,$80
  .word $03B2
  .byte $0F,$80
  .word $03B3
  .byte $0F,$80
  .word $03B4
  .byte $0F,$80
  .word $03B5
  .byte $0F,$80
  .word $0440
  .byte $3F,2
  .word $0480
  .byte $0F,0
  .word $0484
  .byte $0F,0
  .word $0547
  .byte $0F,0
  .word $054F
  .byte $0F,0
  .word $0557
  .byte $0F,0
  .word $055F
  .byte $0F,0
  .word $0567
  .byte $0F,0
  .word $056F
  .byte $0F,0
  .word $0577
  .byte $0F,0
  .word $057F
  .byte $0F,0
  .word $0588
  .byte $0F,0
  .word $0589
  .byte $0F,0
  .word $058A
  .byte $0F,0
chr:      .incbin "screen.chr"

; NSF / NSFe entry points (Phase 10): no video. The NSF data is this ROM without the iNES header; header bytes $070-$077 bank-init it
; (windows 0-6 = bank 0, window 7 = the last bank), so $5FF8-$5FFF banking is the NSF banking and the decoder runs unchanged.
; INIT: A = song, X = region (0 NTSC, 1 PAL; anything else NTSC). PLAY: one stream tick per call (the NSF play rate is the song rate).
nsfinit:
  pha
  lda #0
  tay
: sta $00,y                 ; NSF leaves RAM undefined: clear the zero page (not the stack page)
  iny
  bne :-
  pla
  sta curl
  cpx #2
  bcc :+
  ldx #0
: stx region
  lda regbank,x
  sta rbank
  lda curl
  jmp restart

nsfplay:
  ldy #0
  jsr dpcm_apply
  jmp tick

.segment "VECTORS"
  .word nmi, reset, irq
