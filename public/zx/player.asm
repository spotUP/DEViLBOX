; DEViLBOX ZX Spectrum 128 register-stream player. Hand-assembled into player.bin
; (no assembler needed); offsets in player.json. Loaded at 0x8000, entered with USR 32768.
; Stream (banks paged at 0xC000 through port 0x7FFD) is a list of frames, one per 50 Hz tick:
;   byte m0   bit n set = AY register n (0..7) follows
;   byte m1   bit n set = AY register 8+n (8..13) follows; m1 >= 0xC0 is a control byte:
;             0xFF = continue in the next bank of banktab, 0xFE = loop to the first bank
;   then one value byte per set bit, register order.
; Control frames take no tick: the next frame is read at once.
        org  0x8000
start:  di
        ld   sp,0x7F00
        ld   h,0
        xor  a
mute:   ld   bc,0xFFFD
        out  (c),a          ; select register a
        ld   b,0xBF
        out  (c),h          ; write 0
        inc  a
        cp   14
        jr   nz,mute
        xor  a
        ld   (idx),a
        call setbank
        ei
frame:  halt                ; ROM IM 1 interrupt, 50 Hz
read:   ld   d,(hl)         ; m0
        inc  hl
        ld   a,(hl)         ; m1
        inc  hl
        cp   0xC0
        jr   nc,ctrl
        push af
        ld   e,0
        call dobyte
        pop  af
        ld   d,a
        ld   e,8
        call dobyte
        jr   frame
ctrl:   cp   0xFE
        ld   a,(idx)
        jr   nz,nxt
        xor  a
        jr   st
nxt:    inc  a
st:     ld   (idx),a
        call setbank
        jr   read
dobyte: ld   a,d            ; d = mask, e = first register, hl = stream
        or   a
        ret  z
dl:     srl  d
        jr   nc,dnext
        ld   a,e
        ld   bc,0xFFFD
        out  (c),a
        ld   a,(hl)
        inc  hl
        ld   b,0xBF
        out  (c),a
dnext:  inc  e
        ld   a,d
        or   a
        jr   nz,dl
        ret
setbank: ld  a,(idx)        ; page banktab[idx] at 0xC000, hl = 0xC000
        ld   e,a
        ld   d,0
        ld   hl,banktab
        add  hl,de
        ld   a,(hl)
        ld   bc,0x7FFD
        out  (c),a
        ld   hl,0xC000
        ret
        org  0x8080
idx:    defb 0
        org  0x8090
banktab: defs 8             ; 0x10 | bank number (ROM 1 selected), patched by the exporter
