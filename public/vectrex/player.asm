; Vectrex cartridge AY-3-8910 register-stream player (6809, lwasm raw).
; Stream (src/lib/export/vectrex/vectrexCartridge.ts): per 50 Hz frame  m0 m1 v...
;   m0 bits 0-7 = regs 0-7, m1 bits 0-5 = regs 8-13; one value byte per set bit, ascending.
;   m1 = $FD: m0 = n identical empty frames in a row (run length, 1-255). m1 = $FE: song end, restart (m0 ignored). The stream starts right after this code (symbol data).
; Reg 7 is masked to $3F so PSG port A stays an input (the BIOS reads the buttons through it).
; The whole screen is redrawn every 50 Hz frame (no split over frames): logo as one vector list (lean loop, vlist), text by ptxt
; (rows alternate direction so the beam never returns; mirrored font for the right-to-left rows), bars at one scale.
; The title (16 upper case characters, space padded) is patched in by the exporter at symbol title.
Wait_Recal    equ $F192
Intensity_5F  equ $F2A5
Sound_Byte    equ $F256
Reset0Ref     equ $F354
Moveto_d      equ $F312
Moveto_d_7F   equ $F2FC
Delay_1       equ $F575
mask          equ $C880
reg           equ $C882
ptr           equ $C883
rep           equ $C885
vol           equ $C886       ; 3 shadow volumes 0-15 (regs 8-10; envelope bit = 15)
sub           equ $C889       ; frame within the second
scr           equ $C890       ; scroller offset
scrt          equ $C891       ; scroller tick
bi            equ $C8A4
dy            equ $C8A5
xs            equ $C8A6
stat          equ $C8B0       ; $80, "SONG 01/01  MM:SS", $80 (ptxt reads back to a byte >= $80)
clk           equ stat+13     ; "MM:SS" inside the status line
vcnt          equ $C922       ; vlist vector count
blist         equ $C900       ; bar vector list (copy of sBars, heights patched)
buf           equ $C8D1       ; $80 at buf-1, 12 char scroller window, $80 (12 not 16: frame budget)
        org $0000
        fcc "g GCE 2026"
        fcb $80
        fdb $FD0D       ; music pointer: BIOS jingle. $0000 made the BIOS play the header text as music (noise until the cart starts)
        fcb $F8,$50,$20,$B0
title:  fcc "DEVILBOX        "
        fcb $80
        fcb 0
        jmp start       ; the BIOS enters the cart right after the header terminator; data there ran as code by luck
        fcb $80         ; ptxt start mark for the author row
author: fcc "DEVILBOX        "
        fcb $80
scroll: fcc "    DEVILBOX VECTREX AY-3-8910 PLAYER - MUSIC CAPTURED FROM FURNACE                                                             "
scrollEnd:
sLogo:  ; DEViLBOX wordmark for vlist: dy, dx, beam ($FF line, 0 move); x8 at scale $20 (= the scale $FF original), after the scale $FF move to 112,-120
        fcb 72,0,$FF
        fcb 0,32,$FF
        fcb -16,16,$FF
        fcb -32,0,$FF
        fcb -24,-16,$FF
        fcb 0,-32,$FF
        fcb 72,112,0
        fcb 0,-48,$FF
        fcb -72,0,$FF
        fcb 0,48,$FF
        fcb 40,-48,0
        fcb 0,40,$FF
        fcb 32,24,0
        fcb -72,24,$FF
        fcb 72,24,$FF
        fcb -72,40,0
        fcb 48,0,$FF
        fcb 16,0,0
        fcb 8,0,$FF
        fcb 0,40,0
        fcb -72,0,$FF
        fcb 0,48,$FF
        fcb 0,16,0
        fcb 72,0,$FF
        fcb 0,32,$FF
        fcb -8,16,$FF
        fcb -16,0,$FF
        fcb -8,-16,$FF
        fcb 0,-32,$FF
        fcb 0,32,0
        fcb -8,16,$FF
        fcb -16,0,$FF
        fcb -16,-16,$FF
        fcb 0,-32,$FF
        fcb 0,80,0
        fcb 0,16,$FF
        fcb 16,16,$FF
        fcb 40,0,$FF
        fcb 16,-16,$FF
        fcb 0,-16,$FF
        fcb -16,-16,$FF
        fcb -40,0,$FF
        fcb -16,16,$FF
        fcb 0,48,0
        fcb 72,48,$FF
        fcb 0,-48,0
        fcb -72,48,$FF
sLogoEnd:
        fcb $80
sPlat:  fcc "AY-3-8910"      ; not "VECTREX AY-3-8910": frame budget
        fcb $80
sStat:  fcb $80
        fcc "SONG 01/01  00:00" ; no PLAYING/PAUSED: the player has no pause, and the 9 characters do not fit the frame
        fcb $80
sStatEnd:
sBars:  ; 3 bars at scale $7F: up h, right 20, down h, move right 80 (h written each frame)
        fcb 0,0,$FF,0,20,$FF,0,0,$FF,0,80,0
        fcb 0,0,$FF,0,20,$FF,0,0,$FF,0,80,0
        fcb 0,0,$FF,0,20,$FF,0,0,$FF
sBarsEnd:
fontR:  ; BIOS Char_Table ($F9D4+$20, 7 rows x 80 chars) bit-reversed and shifted left one (bit 0 stays dark) for the right-to-left rows
        fcb $00,$08,$14,$14,$08,$26,$08,$10,$10,$04,$08,$00,$00,$00,$00,$20
        fcb $18,$08,$1C,$1C,$10,$3E,$18,$3E,$1C,$1C,$00,$0C,$00,$00,$00,$1C
        fcb $1C,$08,$1E,$1C,$1E,$3E,$3E,$3C,$22,$1C,$20,$22,$02,$22,$22,$3E
        fcb $1E,$1C,$1E,$1C,$3E,$22,$22,$22,$22,$22,$3E,$1C,$02,$1C,$08,$00
        fcb $00,$08,$20,$08,$00,$00,$00,$38,$10,$08,$44,$44,$00,$FE,$FE,$FE
        fcb $00,$1C,$14,$14,$3C,$26,$14,$08,$08,$08,$2A,$08,$00,$00,$00,$20
        fcb $24,$0C,$22,$22,$18,$02,$04,$20,$22,$22,$0C,$0C,$10,$00,$04,$22
        fcb $22,$14,$24,$22,$24,$02,$02,$02,$22,$08,$20,$12,$02,$36,$26,$22
        fcb $22,$22,$22,$22,$2A,$22,$22,$22,$22,$22,$20,$04,$02,$20,$14,$00
        fcb $00,$1C,$60,$08,$1C,$1C,$00,$44,$10,$1C,$00,$00,$6C,$82,$FE,$FE
        fcb $00,$1C,$14,$3E,$0A,$10,$14,$04,$04,$10,$1C,$08,$00,$00,$00,$10
        fcb $24,$08,$20,$20,$14,$1E,$02,$10,$22,$22,$0C,$00,$08,$3C,$08,$20
        fcb $2A,$22,$24,$02,$24,$02,$02,$02,$22,$08,$20,$0A,$02,$2A,$2A,$22
        fcb $22,$22,$22,$04,$08,$22,$22,$22,$14,$14,$10,$04,$04,$20,$22,$00
        fcb $1C,$2A,$A0,$08,$22,$3E,$0C,$BA,$38,$08,$00,$00,$92,$82,$FE,$FE
        fcb $00,$08,$00,$14,$1C,$08,$0C,$00,$04,$10,$2A,$3E,$00,$1C,$00,$08
        fcb $24,$08,$1C,$18,$12,$20,$1E,$08,$1C,$3C,$00,$0C,$04,$00,$10,$10
        fcb $3A,$22,$1C,$02,$24,$0E,$0E,$32,$3E,$08,$20,$06,$02,$2A,$32,$22
        fcb $1E,$22,$1E,$08,$08,$22,$14,$2A,$08,$08,$08,$04,$08,$20,$00,$00
        fcb $FE,$08,$20,$08,$22,$3E,$1E,$8A,$38,$3E,$82,$38,$92,$82,$FE,$FE
        fcb $00,$00,$00,$3E,$1C,$04,$2A,$00,$04,$10,$2A,$08,$04,$00,$00,$04
        fcb $24,$08,$02,$20,$3E,$20,$22,$04,$22,$20,$0C,$0C,$08,$3C,$08,$08
        fcb $1A,$3E,$24,$02,$24,$02,$02,$22,$22,$08,$20,$0A,$02,$22,$22,$22
        fcb $02,$2A,$0A,$10,$08,$22,$14,$2A,$14,$08,$04,$04,$10,$20,$00,$00
        fcb $FE,$08,$3C,$2A,$22,$3E,$1E,$BA,$7C,$08,$44,$44,$6C,$82,$FE,$FE
        fcb $00,$00,$00,$14,$28,$32,$12,$00,$08,$08,$00,$08,$04,$00,$00,$02
        fcb $24,$08,$02,$22,$10,$22,$22,$02,$22,$10,$0C,$08,$10,$00,$04,$00
        fcb $02,$22,$24,$22,$24,$02,$02,$22,$22,$08,$22,$12,$22,$22,$22,$22
        fcb $02,$12,$12,$22,$08,$22,$08,$2A,$22,$08,$02,$04,$20,$20,$00,$00
        fcb $24,$08,$1E,$1C,$1C,$1C,$0C,$44,$6C,$14,$38,$82,$00,$82,$FE,$FE
        fcb $00,$08,$00,$14,$3E,$32,$2C,$00,$10,$04,$00,$00,$02,$00,$02,$02
        fcb $18,$1C,$3E,$1C,$10,$1C,$1C,$02,$1C,$0C,$00,$04,$00,$00,$00,$08
        fcb $3C,$22,$1E,$1C,$1E,$3E,$02,$3C,$22,$1C,$1C,$22,$3E,$22,$22,$3E
        fcb $02,$2C,$22,$1C,$08,$1C,$08,$14,$22,$08,$3E,$1C,$20,$1C,$00,$3E
        fcb $00,$08,$0C,$08,$00,$00,$00,$38,$82,$22,$00,$00,$00,$FE,$FE,$FE
start:  lda #$D0
        tfr a,dp
        jsr mute
        jsr resetclk
        clr rep
        clr scr
        clr scrt
        ldx #sBars
        ldu #blist
bc:     lda ,x+
        sta ,u+
        cmpx #sBarsEnd
        bne bc
        lda #$80
        sta buf-1
        sta buf+12
        ldx #data
frame:  stx ptr
frame2: jsr Wait_Recal
        jsr tick
        jsr screen
        lda #$D0
        tfr a,dp
        ldx ptr
        lda rep
        beq getf
        dec rep
        bra frame2
getf:   lda ,x+
        ldb ,x+
        cmpb #$FE
        bne chkrl
        jsr mute
        jsr resetclk
        ldx #data
        bra getf
chkrl:  cmpb #$FD
        bne play
        deca
        sta rep
        lbra frame
play:   sta mask+1
        stb mask
        clr reg
nextr:  lsr mask
        ror mask+1
        bcc skip
        ldb ,x+
        lda reg
        cmpa #7
        bne wr
        andb #$3F
wr:     pshs b          ; volume shadow for the bars
        lda reg
        cmpa #8
        blo nov
        cmpa #10
        bhi nov
        ldy #vol-8
        leay a,y
        ldb ,s
        bitb #$10
        beq lowv
        ldb #15
lowv:   andb #$0F
        stb ,y
nov:    puls b
        lda reg
        stx ptr
        jsr Sound_Byte
        ldx ptr
skip:   inc reg
        lda reg
        cmpa #14
        bne nextr
        lbra frame
mute:   clr vol
        clr vol+1
        clr vol+2
        clra
mu:     pshs a
        clrb
        jsr Sound_Byte
        puls a
        inca
        cmpa #14
        bne mu
        rts
resetclk: clr sub       ; status line template (clock 00:00) into RAM
        ldx #sStat
        ldu #stat
rc:     lda ,x+
        sta ,u+
        cmpx #sStatEnd
        bne rc
        rts
tick:   inc sub
        lda sub
        cmpa #50
        blo tkd
        clr sub
        lda clk+4
        inca
        sta clk+4
        cmpa #'9'+1
        blo tkd
        lda #'0'
        sta clk+4
        lda clk+3
        inca
        sta clk+3
        cmpa #'6'
        blo tkd
        lda #'0'
        sta clk+3
        lda clk+1
        inca
        sta clk+1
        cmpa #'9'+1
        blo tkd
        lda #'0'
        sta clk+1
        inc clk
tkd:    rts
; Text at A = y, B = x (scale $7F); U = string ended by $80 and preceded by a byte >= $80.
; BIOS Print_Str does a beam return after every one of the 7 font rows. Here even rows run left to right
; (BIOS font, ,U+) and odd rows right to left (fontR, ,-U) with the same 18 cycle character loop,
; so the beam never goes back. Rows 0-6 end on a left-to-right row.
TAIL    equ 23          ; cycles from the last character's loop exit to ramp off, equal on both row kinds (alignment)
; The beam must be at the origin (ptxt itself ends with Reset0Ref).
ptxt:   jsr Moveto_d_7F
        jsr Delay_1
        ldx #$F9D4      ; BIOS Char_Table - $20, row 0
        ldy #fontR-$20
        ldd #$1883
        clr <$01
        sta <$0B        ; ACR: shift register out under phi2
        bsr thead
tfw:    lda $C82B       ; text width = X rate
        sta <$01
        ldd #$0100
        sta <$00        ; ramp on
        bra tf1
tf0:    lda a,x
        sta <$0A
tf1:    lda ,u+
        bpl tf0
        cmpx #$FBB4     ; 4  tail: TAIL cycles
        beq tlast       ; 3
        leax $50,x      ; 5
        leay $50,y      ; 5
        nop             ; 2
        nop             ; 2
        nop             ; 2
        lda #$81
        sta <$00        ; ramp off
        leau -1,u       ; back onto the $80 end mark
        bsr tstep
        lda $C82B
        nega
        sta <$01        ; right to left
        ldd #$0100
        sta <$00
        bra tb1
tb0:    lda a,y
        sta <$0A
tb1:    lda ,-u
        bpl tb0
        leax $50,x      ; 5  tail: TAIL cycles
        leay $50,y      ; 5
        leau 1,u        ; 5  back onto the first character
        nop             ; 2
        nop             ; 2
        nop             ; 2
        nop             ; 2
        lda #$81
        sta <$00
        bsr tstep
        bra tfw
tlast:  lda #$81
        sta <$00
        lda #$98
        sta <$0B
        jmp Reset0Ref
; one row down (BIOS Print_Str step: Y S/H = text height, short ramp, X rate 0), then into thead
tstep:  ldb $C82A
        stb <$01
        dec <$00
        ldd #$8101
        nop
        sta <$00
        clr <$01
        stb <$00
        sta <$00
        ldb #$03
; B = $83 (first row) or $03: Y S/H back to 0, ramp off
thead:  stb <$00
        dec <$00
        ldd #$8081
        nop
        inc <$00
        stb <$00
        sta <$00
        tst $C800
        inc <$00
        rts
; Vector list at X, vcnt vectors: dy, dx, beam pattern ($FF line, 0 move). DP=$D0, scale already in T1 low.
; The BIOS Draw_VL_mode costs about 125 cycles a vector on top of the scale; this loop about 65.
vlist:  ldd ,x++
        sta <$01        ; dy to the DAC
        clr <$00        ; mux on, Y sample/hold
        lda ,x+         ; beam pattern (also the sample/hold settle time)
        nop
        inc <$00        ; mux off
        stb <$01        ; dx
        sta <$0A        ; beam
        clr <$05        ; T1 start: ramp on for the scale time
        ldb #$40
vw:     bitb <$0D
        beq vw
        clr <$0A        ; beam off
        dec vcnt
        bne vlist
        rts
screen: jsr Intensity_5F
        jsr Reset0Ref
        lda #$FF
        sta <$04
        lda #112
        ldb #-120
        jsr Moveto_d
        lda #$20        ; logo list is x8 at scale $20
        sta <$04
        ldx #sLogo
        lda #(sLogoEnd-sLogo)/3
        sta vcnt
        jsr vlist
;MK 2
        jsr Reset0Ref   ; bars: one path at one scale every frame, base at -105 (scale $FF)
        lda #$FF
        sta <$04
        lda #-105
        ldb #-60
        jsr Moveto_d
        lda #$7F        ; scale $7F, coordinates x2 (same size as the old scale $FF bars)
        sta <$04
        lda vol         ; bar heights x6 into the RAM list
        ldb #6
        mul
        stb blist
        negb
        stb blist+6
        lda vol+1
        ldb #6
        mul
        stb blist+12
        negb
        stb blist+18
        lda vol+2
        ldb #6
        mul
        stb blist+24
        negb
        stb blist+30
        ldx #blist
        lda #11
        sta vcnt
        jsr vlist
        jsr Reset0Ref
;MK 3
        ldu #sPlat
        lda #112
        ldb #-48
        jsr ptxt
        ldu #title
        lda #84
        ldb #-120
        jsr ptxt
        ldu #author
        lda #66
        ldb #-120
        jsr ptxt
        ldu #stat+1
        lda #40
        ldb #-120
        jsr ptxt
        lda scrt
        inca
        sta scrt
        cmpa #2
        blo scd
        clr scrt
        lda scr
        inca
        cmpa #scrollEnd-scroll-12
        blo scs
        clra
scs:    sta scr
scd:    ldx #scroll
        ldb scr
        abx
        ldu #buf
        ldb #12
scc:    lda ,x+
        sta ,u+
        decb
        bne scc
        ldu #buf
        lda #-122
        ldb #-54         ; 12 characters centred (the 16 character window started at -72)
        jmp ptxt
data:
