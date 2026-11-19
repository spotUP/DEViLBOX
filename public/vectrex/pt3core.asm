; PT3 song player core: 6809 port of Sergey Bulba's Universal PT2/PT3 player (public/zx/pt3player.asm), PT3 path only.
; Included by player.asm. The module sits at symbol data (ROM). The note table nt (96 big-endian words) and the volume
; table vt (256 bytes) are built by the exporter exactly as Bulba's INIT builds them and patched in at their offsets
; (src/lib/export/vectrex/vectrexCartridge.ts), so the 6809 does no table setup and the Vectrex retune is a table swap.
; All module words are little-endian and are read low byte first; the envelope base in a pattern is big-endian.
; Every routine keeps the Z80 control flow; labels carry the Z80 label names in lower case where one exists.
PsInOr  equ 0           ; channel struct (Bulba CHP, same order; words stored big-endian)
PsInSm  equ 1
CrAmSl  equ 2
CrNsSl  equ 3
CrEnSl  equ 4
TSlCnt  equ 5
CrTnSl  equ 6
TnAcc   equ 8
COnOff  equ 10
OnOffD  equ 11
OffOnD  equ 12
OrnPtr  equ 13
SamPtr  equ 15
NNtSkp  equ 17
Note    equ 18
SlToNt  equ 19
Env_En  equ 20
Flags   equ 21
TnSlDl  equ 22
TSlStp  equ 23
TnDelt  equ 25
NtSkCn  equ 27
Volume  equ 28
PtPtr   equ 29          ; pattern pointer (Z80 AdInPtA/B/C)
chA     equ $C930
chB     equ $C950
chC     equ $C970
DelyCnt equ $C990
CurESld equ $C991
CurEDel equ $C993
Ns_Base equ $C994
AddToNs equ $C995
AYREGS  equ $C996       ; 14 registers, 13 = envelope type ($FF = do not write)
EnvBase equ $C9A4
Delay   equ $C9A6
AddToEn equ $C9A7
Env_Del equ $C9A8
ESldAdd equ $C9A9
PrNote  equ $C9AB
PrSlide equ $C9AC
Version equ $C9AE
CrPsPtr equ $C9AF
LPosPtr equ $C9B1
PatsPtr equ $C9B3
Ampl    equ $C9B5
LoStep  equ $C9B6
tonep   equ $C9B7
noteT   equ $C9B9
sC      equ $C9BA       ; sample line byte 0 (Z80 C)
sB      equ $C9BB       ; sample line byte 1 (Z80 B)
tmpw    equ $C9BC
tmpw2   equ $C9BE
tmpb    equ $C9C0
tmphi   equ $C9C1
pvEnd   equ $C9C2

pt3init: ldx #chA
pi0:    clr ,x+
        cmpx #pvEnd
        bne pi0
        ldx #data
        lda 100,x
        sta Delay
        ldd #data+200
        std CrPsPtr
        ldb 102,x
        clra
        addd #data+201
        std LPosPtr
        ldb 103,x
        lda 104,x
        addd #data
        std PatsPtr
        lda 13,x
        suba #'0'
        cmpa #9
        bls pi1
        lda #6
pi1:    sta Version
        lda #1
        sta DelyCnt
        ldu #chA
        bsr pich
        ldu #chB
        bsr pich
        ldu #chC
pich:   lda #1
        sta NtSkCn,u
        lda #$F0
        sta Volume,u
        ldd #emptyso
        std OrnPtr,u
        std SamPtr,u
        std PtPtr,u
        rts
emptyso: fcb 0,1,0,$90,0,0      ; EMPTYSAMORN: loop 0, length 1, one silent line; byte 0 = pattern end

pt3play: clr AddToEn
        clr AYREGS+7
        lda #$FF
        sta AYREGS+13
        dec DelyCnt
        lbne pl2
        ldu #chA
        dec NtSkCn,u
        bne pl1b
        ldy PtPtr,u
        lda ,y
        bne pl1a
        clr Ns_Base
        ldx CrPsPtr
        leax 1,x
        lda ,x
        cmpa #$FF
        bne plnlp
        ldx LPosPtr
        lda ,x
plnlp:  stx CrPsPtr
        tfr a,b
        clra
        lslb
        rola
        addd PatsPtr
        tfr d,x
        ldb ,x
        lda 1,x
        addd #data
        tfr d,y
        ldb 2,x
        lda 3,x
        addd #data
        std chB+PtPtr
        ldb 4,x
        lda 5,x
        addd #data
        std chC+PtPtr
pl1a:   jsr pt3pd
        sty PtPtr,u
pl1b:   ldu #chB
        dec NtSkCn,u
        bne pl1c
        ldy PtPtr,u
        jsr pt3pd
        sty PtPtr,u
pl1c:   ldu #chC
        dec NtSkCn,u
        bne pl1d
        ldy PtPtr,u
        jsr pt3pd
        sty PtPtr,u
pl1d:   lda Delay
        sta DelyCnt
pl2:    ldu #chA
        ldx #AYREGS
        jsr chregs
        lda Ampl
        sta AYREGS+8
        ldu #chB
        ldx #AYREGS+2
        jsr chregs
        lda Ampl
        sta AYREGS+9
        ldu #chC
        ldx #AYREGS+4
        jsr chregs
        lda Ampl
        sta AYREGS+10
        lda Ns_Base
        adda AddToNs
        sta AYREGS+6
        ldb AddToEn
        sex
        addd EnvBase
        addd CurESld
        stb AYREGS+11
        sta AYREGS+12
        lda CurEDel
        beq plx
        dec CurEDel
        bne plx
        lda Env_Del
        sta CurEDel
        ldd CurESld
        addd ESldAdd
        std CurESld
plx:    rts

; Pattern decoder: U = channel, Y = pattern pointer. Commands $01-$0F push their routine and run, last pushed first,
; on the final rts (the Z80 PUSH DE / RET trick), each reading its own parameters from Y.
pt3pd:  lda Note,u
        sta PrNote
        ldd CrTnSl,u
        std PrSlide
pd_loop: lda ,y+
        cmpa #$F0
        bhs pd_orsm
        cmpa #$D0
        lbeq pd_fin
        bhi pd_sam
        cmpa #$C0
        lbeq pd_rel
        bhi pd_vol
        cmpa #$B0
        beq pd_eoff
        bhi pd_sore
        cmpa #$50
        bhs pd_note
        cmpa #$40
        bhs pd_orn
        cmpa #$20
        bhs pd_nois
        cmpa #$10
        bhs pd_esam
        lsla
        ldx #spccoms
        ldx a,x
        pshs x
        bra pd_loop
pd_orsm: clr Env_En,u
        suba #$F0
        jsr setorn
pd_sam_: lda ,y+        ; sample number x2, RRCA
        lsra
        bcc pd_sam2
        ora #$80
pd_sam2: jsr setsam
        bra pd_loop
pd_sam: suba #$D0
        bra pd_sam2
pd_vol: suba #$C0
        lsla
        lsla
        lsla
        lsla
        sta Volume,u
        bra pd_loop
pd_eoff: clr Env_En,u
        clr PsInOr,u
        bra pd_loop
pd_sore: cmpa #$B1
        bne pd_env
        lda ,y+
        sta NNtSkp,u
        bra pd_loop
pd_env: suba #$B1
        bsr setenv
        bra pd_loop
pd_orn: suba #$40
        bsr setorn
        bra pd_loop
pd_nois: suba #$20
        sta Ns_Base
        bra pd_loop
pd_esam: suba #$10
        sta Env_En,u
        sta PsInOr,u
        beq pd_sam_
        bsr setenv
        bra pd_sam_
pd_note: suba #$50
        sta Note,u
        lda Flags,u
        ora #1
        sta Flags,u
        bra pd_res
pd_rel: lda Flags,u
        anda #$FE
        sta Flags,u
pd_res: clra            ; reset group: PsInOr .. OnOffD
        clrb
        std 0,u
        std 2,u
        std 4,u
        std 6,u
        std 8,u
        std 10,u
pd_fin: lda NNtSkp,u
        sta NtSkCn,u
        rts

setenv: ldb #16
        stb Env_En,u
        sta AYREGS+13
        ldd ,y++        ; big-endian in the pattern (Z80 H first)
        std EnvBase
        clr PsInOr,u
        clr CurEDel
        clr CurESld
        clr CurESld+1
        rts
setorn: clr PsInOr,u
        tfr a,b
        lslb
        ldx #data+169
        abx
        ldb ,x
        lda 1,x
        addd #data
        std OrnPtr,u
        rts
setsam: tfr a,b
        lslb
        ldx #data+105
        abx
        ldb ,x
        lda 1,x
        addd #data
        std SamPtr,u
        rts
ntget:  lslb            ; D = nt[B]
        ldx #nt
        abx
        ldd ,x
        rts

spccoms: fdb c_nop,c_gliss,c_portm,c_smpos,c_orpos,c_vibrt,c_nop,c_nop
        fdb c_engls,c_delay,c_nop,c_nop,c_nop,c_nop,c_nop,c_nop
c_gliss: lda Flags,u
        ora #4
        sta Flags,u
        lda ,y+
        sta TnSlDl,u
        bne gl36
        lda Version     ; AlCo PT3.7+: 1, older: 0
        cmpa #7
        lda #0
        bcs gl36
        lda #1
gl36:   sta TSlCnt,u
        ldb ,y+
        lda ,y+
setstp: std TSlStp,u    ; A = high, B = low
        clr COnOff,u
c_nop:  rts
c_portm: lda ,y
        leay 3,y
        ldb ,y+
        stb LoStep
        ldb ,y+
        stb tmphi
        ldb Flags,u     ; SETPORT
        andb #$FB
        stb Flags,u
        sta TnSlDl,u
        sta TSlCnt,u
        ldx CrTnSl,u
        pshs x
        ldb Note,u
        stb SlToNt,u
        bsr ntget
        std tmpw
        ldb PrNote
        stb Note,u
        bsr ntget
        std tmpw2
        ldd tmpw
        subd tmpw2
        std TnDelt,u
        puls x
        lda Version
        cmpa #6
        blo oldprtm     ; old 3xxx for PT 3.5 and older
        ldx PrSlide
        stx CrTnSl,u
oldprtm: stx tmpw2
        ldd TnDelt,u
        tst tmphi
        beq nosig
        ldd tmpw2
        subd TnDelt,u
        bra pchk
nosig:  subd tmpw2
pchk:   bmi pneg
        lda tmphi
        ldb LoStep
        bra setstp
pneg:   lda tmphi
        coma
        ldb LoStep
        negb
        bra setstp
c_smpos: lda ,y+
        sta PsInSm,u
        rts
c_orpos: lda ,y+
        sta PsInOr,u
        rts
c_vibrt: lda ,y+
        sta OnOffD,u
        sta COnOff,u
        lda ,y+
        sta OffOnD,u
        clr TSlCnt,u
        clr CrTnSl,u
        clr CrTnSl+1,u
        rts
c_engls: lda ,y+
        sta Env_Del
        sta CurEDel
        ldb ,y+
        lda ,y+
        std ESldAdd
        rts
c_delay: lda ,y+
        sta Delay
        rts

; Channel registers: U = channel, X = its tone register pair in AYREGS (low, high). Leaves Ampl.
chregs: clr Ampl
        lda Flags,u
        lsra
        lbcc ch_exit    ; disabled: tone registers keep their value, mixer gets 0
        stx tonep
        ldx OrnPtr,u
        ldb PsInOr,u
        incb
        cmpb 1,x
        blo ch_orps
        ldb ,x
ch_orps: lda PsInOr,u
        stb PsInOr,u
        tfr a,b
        abx
        lda Note,u
        adda 2,x
        bpl ch_ntp
        clra
ch_ntp: cmpa #96
        blo ch_nok
        lda #95
ch_nok: sta noteT
        ldx SamPtr,u
        ldb PsInSm,u
        incb
        cmpb 1,x
        blo ch_smps
        ldb ,x
ch_smps: lda PsInSm,u
        stb PsInSm,u
        lsla
        lsla
        tfr a,b
        abx
        lda 2,x
        sta sC
        lda 3,x
        sta sB
        ldb 4,x
        lda 5,x
        addd TnAcc,u
        std tmpw
        lda sB
        bita #$40
        beq ch_noac
        ldd tmpw
        std TnAcc,u
ch_noac: ldb noteT
        jsr ntget
        addd tmpw
        addd CrTnSl,u
        ldx tonep
        stb ,x
        sta 1,x
        lda TSlCnt,u
        beq ch_amp
        dec TSlCnt,u
        bne ch_amp
        lda TnSlDl,u
        sta TSlCnt,u
        ldd TSlStp,u
        addd CrTnSl,u
        std CrTnSl,u
        lda Flags,u
        bita #4
        bne ch_amp
        lda TSlStp,u
        bne ch_stpn
        ldd CrTnSl,u
        subd TnDelt,u
        bra ch_stpp
ch_stpn: ldd TnDelt,u
        subd CrTnSl,u
ch_stpp: bmi ch_amp
        lda SlToNt,u
        sta Note,u
        clr TSlCnt,u
        clr CrTnSl,u
        clr CrTnSl+1,u
ch_amp: lda CrAmSl,u
        ldb sC
        bitb #$80
        beq ch_noam
        bitb #$40
        beq ch_amin
        cmpa #15
        beq ch_noam
        inca
        bra ch_svam
ch_amin: cmpa #-15
        beq ch_noam
        deca
ch_svam: sta CrAmSl,u
ch_noam: sta tmpb
        lda sB
        anda #15
        adda tmpb
        bpl ch_apos
        clra
ch_apos: cmpa #16
        blo ch_vol
        lda #15
ch_vol: ora Volume,u
        tfr a,b
        ldx #vt
        abx
        lda ,x
        ldb sC
        lsrb
        bcs ch_noen
        ora Env_En,u
ch_noen: sta Ampl
        lda sB
        bpl no_ensl
        lda sC          ; envelope slide: bits 1-5 of C, signed
        lsla
        lsla
        asra
        asra
        asra
        adda CrEnSl,u
        ldb sB
        bitb #$20
        beq no_enac
        sta CrEnSl,u
no_enac: adda AddToEn
        sta AddToEn
        bra ch_mix
no_ensl: lda sC         ; Z80 RRA rotates a stale carry into bit 7; the AY ignores noise bits 5-7
        lsra
        adda CrNsSl,u
        sta AddToNs
        ldb sB
        bitb #$20
        beq ch_mix
        sta CrNsSl,u
ch_mix: lda sB
        lsra
        anda #$48
ch_exit: ora AYREGS+7
        lsra
        bcc ch_mx1
        ora #$80
ch_mx1: sta AYREGS+7
        lda COnOff,u
        beq ch_ret
        dec COnOff,u
        bne ch_ret
        lda Flags,u
        eora #1
        sta Flags,u
        lsra
        lda OnOffD,u
        bcs ch_ondl
        lda OffOnD,u
ch_ondl: sta COnOff,u
ch_ret: rts

nt:     zmb 192         ; note table, patched by the exporter
vt:     zmb 256         ; volume table, patched by the exporter
