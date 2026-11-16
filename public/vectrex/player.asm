; Vectrex cartridge AY-3-8910 register-stream player (6809, lwasm raw).
; Stream (src/lib/export/vectrex/vectrexCartridge.ts): per 50 Hz frame  m0 m1 v...
;   m0 bits 0-7 = regs 0-7, m1 bits 0-5 = regs 8-13; one value byte per set bit, ascending.
;   m1 = $FE: song end, restart (m0 ignored). The stream starts right after this code (symbol data).
; Reg 7 is masked to $3F so PSG port A stays an input (the BIOS reads the buttons through it).
; The title (16 upper case characters, space padded) is patched in by the exporter at symbol title.
Wait_Recal    equ $F192
Intensity_5F  equ $F2A5
Print_Str_d   equ $F37A
Sound_Byte    equ $F256
mask          equ $C880
reg           equ $C882
ptr           equ $C883

        org $0000
        fcc "g GCE 2026"
        fcb $80
        fdb $0000
        fcb $F8,$50,$20,$B0
title:  fcc "DEVILBOX        "
        fcb $80
        fcb 0

start:  lda #$D0
        tfr a,dp
        jsr mute
        ldx #data
frame:  stx ptr
        jsr Wait_Recal
        jsr Intensity_5F
        ldu #title
        lda #$20
        ldb #$B8
        jsr Print_Str_d
        lda #$D0
        tfr a,dp
        ldx ptr
getf:   lda ,x+
        ldb ,x+
        cmpb #$FE
        bne play
        jsr mute
        ldx #data
        bra getf
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
wr:     stx ptr
        jsr Sound_Byte
        ldx ptr
skip:   inc reg
        lda reg
        cmpa #14
        bne nextr
        bra frame

mute:   clra
mu:     pshs a
        clrb
        jsr Sound_Byte
        puls a
        inca
        cmpa #14
        bne mu
        rts
data:
