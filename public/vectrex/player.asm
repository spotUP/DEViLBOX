; Vectrex cartridge AY-3-8910 register-stream player (6809, lwasm raw).
; Stream (src/lib/export/vectrex/vectrexCartridge.ts): per 50 Hz frame  m0 m1 v...
;   m0 bits 0-7 = regs 0-7, m1 bits 0-5 = regs 8-13; one value byte per set bit, ascending.
;   m1 = $FD: m0 = n identical empty frames in a row (run length, 1-255). m1 = $FE: song end, restart (m0 ignored). The stream starts right after this code (symbol data).
; Reg 7 is masked to $3F so PSG port A stays an input (the BIOS reads the buttons through it).
; The title (16 upper case characters, space padded) is patched in by the exporter at symbol title.
Wait_Recal    equ $F192
Intensity_5F  equ $F2A5
Print_Str_d   equ $F37A
Sound_Byte    equ $F256
Reset0Ref     equ $F354
Moveto_d      equ $F312
Draw_Line_d   equ $F3DF
mask          equ $C880
reg           equ $C882
ptr           equ $C883
rep           equ $C885
vol           equ $C886       ; 3 shadow volumes 0-15 (regs 8-10; envelope bit = 15)
sub           equ $C889       ; frame within the second
clk           equ $C88A       ; "MM:SS" + $80
scr           equ $C890       ; scroller offset
scrt          equ $C891       ; scroller tick
buf           equ $C892       ; 16 char scroller window + $80
bi            equ $C8A4
dy            equ $C8A5
xs            equ $C8A6
ph            equ $C8A7
lp            equ $C8A8       ; logo list pointer
lf            equ $C8AA       ; logo segment flag
        org $0000
        fcc "g GCE 2026"
        fcb $80
        fdb $FD0D       ; music pointer: BIOS jingle. $0000 made the BIOS play the header text as music (noise until the cart starts)
        fcb $F8,$50,$20,$B0
title:  fcc "DEVILBOX        "
        fcb $80
        fcb 0
        jmp start       ; the BIOS enters the cart right after the header terminator; data there ran as code by luck
author: fcc "DEVILBOX        "
        fcb $80
scroll: fcc "    DEVILBOX VECTREX AY-3-8910 PLAYER - MUSIC CAPTURED FROM FURNACE                                                             "
scrollEnd:
sLogo:
; DEViLBOX wordmark as vectors, 6x9 units a letter (generated): flag 0=move 1=line, dy, dx; relative from the screen centre. $80 ends.
        fcb 0,112,-120
        fcb 1,9,0
        fcb 1,0,4
        fcb 1,-2,2
        fcb 1,-4,0
        fcb 1,-3,-2
        fcb 1,0,-4
        fcb 0,9,14
        fcb 1,0,-6
        fcb 1,-9,0
        fcb 1,0,6
        fcb 0,5,-6
        fcb 1,0,5
        fcb 0,4,3
        fcb 1,-9,3
        fcb 1,9,3
        fcb 0,-9,5
        fcb 1,6,0
        fcb 0,2,0
        fcb 1,1,0
        fcb 0,0,5
        fcb 1,-9,0
        fcb 1,0,6
        fcb 0,0,2
        fcb 1,9,0
        fcb 1,0,4
        fcb 1,-1,2
        fcb 1,-2,0
        fcb 1,-1,-2
        fcb 1,0,-4
        fcb 0,0,4
        fcb 1,-1,2
        fcb 1,-2,0
        fcb 1,-2,-2
        fcb 1,0,-4
        fcb 0,0,10
        fcb 1,0,2
        fcb 1,2,2
        fcb 1,5,0
        fcb 1,2,-2
        fcb 1,0,-2
        fcb 1,-2,-2
        fcb 1,-5,0
        fcb 1,-2,2
        fcb 0,0,6
        fcb 1,9,6
        fcb 0,0,-6
        fcb 1,-9,6
        fcb $80
sPlat:  fcc "VECTREX AY-3-8910"
        fcb $80
sSong:  fcc "SONG 01/01"
        fcb $80
sPlay:  fcc "PLAYING"
        fcb $80

start:  lda #$D0
        tfr a,dp
        jsr mute
        jsr resetclk
        clr rep
        clr scr
        clr scrt
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

resetclk: clr sub
        ldx #clk
        ldd #$3030
        std ,x++
        lda #':'
        sta ,x+
        ldd #$3030
        std ,x++
        lda #$80
        sta ,x
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

; A = y, B = x, U = string: absolute position, then print
pstr:   pshs d,u
        jsr Reset0Ref
        jsr Intensity_5F
        puls d,u
        jsr Print_Str_d
        lda #$D0
        tfr a,dp
        rts

screen: lda ph          ; three frames a cycle: logo+chip+title / author+status / bars+scroller (the 48-segment logo made two overrun 50 Hz)
        inca
        cmpa #3
        blo scp
        clra
scp:    sta ph
        beq scr0
        deca
        lbne scr2
        bra scr1
scr0:
        jsr Reset0Ref
        jsr Intensity_5F
        ldx #sLogo
        stx lp
lg:     ldx lp
        ldb ,x+
        bmi lgd
        stb lf
        lda ,x+
        ldb ,x+
        stx lp
        tst lf
        beq lgm
        jsr Draw_Line_d
        bra lg
lgm:    jsr Moveto_d
        bra lg
lgd:    lda #$D0
        tfr a,dp
        ldu #sPlat
        lda #112
        ldb #-48
        jsr pstr
        ldu #title
        lda #84
        ldb #-120
        jsr pstr
        rts
scr1:   ldu #author
        lda #66
        ldb #-120
        jsr pstr
        ldu #sSong
        lda #40
        ldb #-120
        jsr pstr
        ldu #clk
        lda #40
        ldb #-30
        jsr pstr
        ldu #sPlay
        lda #40
        ldb #30
        jsr pstr
scr2:
        clr bi
bl:     ldb bi
        ldx #vol
        lda b,x
        ldb #3
        mul
        stb dy
        ldb bi
        lda #50
        mul
        subb #60
        stb xs
        jsr Reset0Ref
        jsr Intensity_5F
        lda #-105
        ldb xs
        jsr Moveto_d
        lda dy
        clrb
        jsr Draw_Line_d
        clra
        ldb #10
        jsr Draw_Line_d
        lda dy
        nega
        clrb
        jsr Draw_Line_d
        lda #$D0
        tfr a,dp
        inc bi
        lda bi
        cmpa #3
        blo bl
        lda scrt
        inca
        sta scrt
        cmpa #2
        blo scd
        clr scrt
        lda scr
        inca
        cmpa #scrollEnd-scroll-16
        blo scs
        clra
scs:    sta scr
scd:    ldx #scroll
        ldb scr
        abx
        ldu #buf
        ldb #16
scc:    lda ,x+
        sta ,u+
        decb
        bne scc
        lda #$80
        sta ,u
        ldu #buf
        lda #-122
        ldb #-72
        jmp pstr

data:
