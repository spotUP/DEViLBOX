; DEViLBOX ADF player screen: platform `amiga` of
; thoughts/shared/design/player-ui/player-screens.html (layout(), motion rules).
; 320x256 PAL lowres, 3 bitplanes, CPU drawn, one copperlist. Colour index =
; design role: 0 bg, 1 text, 2 dim, 3 bar, 4 barlo, 5 cap (also time), 6 logo,
; 7 rule. Font and palette come from tools/hwplayer/assets.ts (screen_font.i).
;
; Bar levels: PTK-Prowiz channel shadow (pt_audchanNtemp, 44 bytes each,
; n_volume at +19), found once by scanning the relocated player for its
; `tst.b pt_audchan1temp+34 / bne.b / tst.b pt_audchan2temp+34` sequence.
; Level = n_volume*15/64 while the channel's DMACONR AUDxEN bit is set.
; Every other player: Paula AUDxVOL is write-only, so hook_install patches each
; `move.w Dn,d16(An)` with d16 in {8,$a8,$b8,$c8,$d8} in the relocated player
; into `trap #15 / index`; hook_trap performs the same store and, when the
; address is AUDxVOL, records the value (hookvol). Forms not of that shape
; (immediate or memory source, (An) indirect, abs.l) are not seen.
; shortcut: channel volume, not a sample envelope; a held or one-shot sample
; keeps its bar up. Upgrade: read Paula AUDxDAT or the sample position.

        xdef    _screen_init
        xdef    _screen_frame
        xdef    _screen_paused
        xref    _input_poll
        xref    _input_key_pressed
        xref    _music_set_pos
        xref    _uade_sub_min
        xref    _uade_sub_cur
        xref    _uade_sub_max
        xref    _uade_reloc_base
        xref    _uade_module_src
        xref    _uprough_vbr
        xref    _uade_saved_execbase

CUSTOM  = $dff000
ROWB    = 40
PLANE   = ROWB*256
BOT     = 216                   ; (5 + 22 bar rows) * 8
TW      = 29                    ; title width
HOOKMAX = 96
C_TEXT  = 1
C_DIM   = 2
C_BAR   = 3
C_CAP   = 5
C_LOGO  = 6
KEY_SPACE = $40
KEY_LEFT  = $4f
KEY_RIGHT = $4e

        section text,code

; ---------------------------------------------------------------------------
_screen_init:
        movem.l d0-d7/a0-a6,-(sp)
        ; No _input_own_keyboard here: this runs after _music_start, so taking
        ; $68 now replaces score's ciaa_interrupt and the CIA-A timer player
        ; never ticks (measured 2026-11-19: vec68=input_keyboard_isr,
        ; _uade_ciaa_hits 0, DMACONR $0380). uade_glue.s already installs it
        ; before the player; score's ciaa_interrupt hands keys on itself.
        lea     planes,a0
        move.w  #PLANE*3/4-1,d0
.clr:   clr.l   (a0)+
        dbf     d0,.clr
        lea     coplist,a0
        lea     copinit,a1
.ci:    move.l  (a1)+,d0
        beq.b   .cidone
        move.l  d0,(a0)+
        bra.b   .ci
.cidone:
        move.l  #planes,d1
        move.w  #$00e0,d2
        moveq   #2,d3
.bp:    move.w  d2,(a0)+
        swap    d1
        move.w  d1,(a0)+
        addq.w  #2,d2
        move.w  d2,(a0)+
        swap    d1
        move.w  d1,(a0)+
        addq.w  #2,d2
        add.l   #PLANE,d1
        dbf     d3,.bp
        lea     screen_pal,a1
        move.w  #$0180,d2
        moveq   #7,d3
.pal:   move.w  d2,(a0)+
        move.w  (a1)+,(a0)+
        addq.w  #2,d2
        dbf     d3,.pal
        move.l  #$fffffffe,(a0)+
        lea     CUSTOM,a5
        move.l  #coplist,$80(a5)
        move.w  d0,$88(a5)
        move.w  #$8380,$96(a5)          ; SET | DMAEN | BPLEN | COPEN

        ; title: module bytes 0-19, padded with spaces to TW
        lea     title,a1
        moveq   #TW-1,d0
.ts:    move.b  #' ',(a1,d0.w)
        dbf     d0,.ts
        lea     _uade_module_src,a0
        ; Per-format text fields (the MOD layout below only fits MOD-family files).
        ; title and msg stay blank for a format without text fields (FC).
        move.l  (a0),d0
        moveq   #0,d7
        moveq   #21,d5                  ; name length - 1 (msg holds 31 names of 22 + space)
        cmp.l   #'DIGI',d0
        beq.w   .digi
        cmp.l   #'BeEp',d0
        beq.w   .jam
        cmp.l   #' MUG',d0
        beq.w   .dmu
        cmp.l   #'FC14',d0
        beq.w   .nomsg
        ; SUN-Tronic (movem.l d0-d7/a0-a6 prologue) and CustomMade (jmp abs.l table): compiled 68k
        ; modules with no text fields.
        cmp.l   #$48e7fffe,d0
        beq.w   .nomsg
        swap    d0
        cmp.w   #$4ef9,d0
        beq.w   .nomsg
        swap    d0
        ; Anders 0land ("mpl1"/"mpl2" + compiled player): only a credit string, no song fields.
        cmp.w   #'mp',(a0)
        bne.b   .nhot
        cmp.b   #'l',2(a0)
        beq.w   .nomsg
.nhot:  cmp.l   #'SMOD',d0
        beq.w   .nomsg
        cmp.l   #'FC13',d0
        beq.w   .nomsg
        ; AHX/THX: bytes 0-19 are a header, not a title. Name list at BE16(4):
        ; song name, then one name per instrument (byte 12), all NUL-terminated.
        move.l  (a0),d0
        and.l   #$ffffff00,d0
        cmp.l   #$54485800,d0
        bne.w   .notthx
        moveq   #0,d0
        move.w  4(a0),d0
        lea     (a0,d0.l),a2
        moveq   #0,d7
        move.b  12(a0),d7
        moveq   #TW-1,d0
.hn:    move.b  (a2)+,d1
        beq.b   .hnd
        cmp.b   #$20,d1
        blo.b   .hnc
        move.b  d1,(a1)+
.hnc:   dbf     d0,.hn
.hns:   tst.b   (a2)+                   ; skip the rest of an over-long name
        bne.b   .hns
.hnd:   lea     msg,a1
        subq.w  #1,d7
        bmi.b   .hmend
        cmp.w   #30,d7
        bls.b   .hl
        moveq   #30,d7                  ; msg holds 31 names of 22 + space
.hl:    move.l  a1,a4
        moveq   #21,d0
.hc:    move.b  (a2)+,d1
        beq.b   .hcd
        cmp.b   #$20,d1
        blo.b   .hcn
        move.b  d1,(a1)+
.hcn:   dbf     d0,.hc
.hcs:   tst.b   (a2)+
        bne.b   .hcs
.hcd:   cmp.l   a4,a1
        beq.b   .hnx
        move.b  #' ',(a1)+
.hnx:   dbf     d7,.hl
.hmend: move.l  a1,d0
        sub.l   #msg,d0
        move.w  d0,msglen
        bra.w   .bars
        ; DigiBooster 1.x: song name at 610 (32), 31 sample names at 642 (30 each)
.digi:  lea     title,a1
        lea     610(a0),a2
        moveq   #TW-1,d0
        bsr.b   .fld
        lea     642(a0),a2
        moveq   #30,d6
        moveq   #30,d7
        bra.b   .names
        ; JamCracker: no song name; NOI at 4, then NOI x 40 bytes starting with a 31 byte name
.jam:   lea     6(a0),a2
        moveq   #40,d6
        move.w  4(a0),d7
        cmp.w   #31,d7
        bls.b   .jn
        moveq   #31,d7
.jn:    subq.w  #1,d7
        bra.b   .names
        ; Digital Mugician: 8 song headers of 16 bytes at 76, title (12) at +4.
        ; Song 0 is the title, songs 1-7 are the message.
.dmu:   lea     title,a1
        lea     80(a0),a2
        moveq   #11,d0
        bsr.b   .fld
        lea     96(a0),a2
        moveq   #16,d6
        moveq   #6,d7
        bra.b   .names
.nomsg: moveq   #-1,d7
.names: lea     msg,a1
        tst.w   d7
        bmi.b   .nend
.nl:    move.w  d5,d0
        bsr.b   .fld
        cmp.l   a4,a1
        beq.b   .nx
        move.b  #' ',(a1)+
.nx:    add.l   d6,a2
        dbf     d7,.nl
.nend:  move.l  a1,d0
        sub.l   #msg,d0
        move.w  d0,msglen
        bra.w   .bars
        ; copy printable bytes of the field at a2 (d0+1 max, NUL ends) to a1, trim trailing blanks; a4 = start
.fld:   move.l  a2,a3
        move.l  a1,a4
.f1:    move.b  (a3)+,d1
        beq.b   .f2
        cmp.b   #$20,d1
        blo.b   .f3
        cmp.b   #$7f,d1
        bhs.b   .f3
        move.b  d1,(a1)+
.f3:    dbf     d0,.f1
.f2:    cmp.l   a4,a1
        beq.b   .f5
        cmp.b   #' ',-1(a1)
        bne.b   .f5
        subq.l  #1,a1
        bra.b   .f2
.f5:    rts
.notthx:
        moveq   #19,d0
.tc:    move.b  (a0)+,d1
        beq.b   .td
        move.b  d1,(a1)+
        dbf     d0,.tc
.td:
        ; message: the sample names, empty ones skipped, joined with a space.
        ; 31 samples when bytes 1080-1083 are a printable tag (M.K. etc), else 15.
        lea     _uade_module_src,a0
        moveq   #30,d7
        lea     1080(a0),a2
        moveq   #3,d0
.tag:   move.b  (a2)+,d1
        cmp.b   #$20,d1
        blo.b   .st15
        cmp.b   #$7f,d1
        bhs.b   .st15
        dbf     d0,.tag
        bra.b   .stok
.st15:  moveq   #14,d7
.stok:  lea     20(a0),a2
        lea     msg,a1
.sn:    move.l  a2,a3
        move.l  a1,a4
        moveq   #21,d0
.sc:    move.b  (a3)+,d1
        beq.b   .tr
        move.b  d1,(a1)+
        dbf     d0,.sc
.tr:    cmp.l   a4,a1
        beq.b   .empty
        cmp.b   #' ',-1(a1)
        bne.b   .named
        subq.l  #1,a1
        bra.b   .tr
.named: move.b  #' ',(a1)+
.empty: lea     30(a2),a2
        dbf     d7,.sn
        move.l  a1,d0
        sub.l   #msg,d0
        move.w  d0,msglen

.bars:
        ; bar source: find the player's channel shadow (see header)
        cmp.w   #1,chanstride           ; hooks already patched in: keep them
        beq.b   .havevol
        clr.l   chanvol
        move.l  _uade_reloc_base,d0
        beq.b   .noscan
        move.l  d0,a0
        move.l  #54*1024/2,d7
.scan:  cmp.w   #$4a39,(a0)
        bne.b   .snext
        cmp.b   #$66,6(a0)
        bne.b   .snext
        cmp.w   #$4a39,8(a0)
        bne.b   .snext
        move.l  2(a0),d0
        move.l  10(a0),d1
        sub.l   d0,d1
        cmp.l   #44,d1
        bne.b   .snext
        sub.l   #34-19,d0               ; pt_audchan1temp + n_volume
        move.l  d0,chanvol
        bra.b   .noscan
.snext: addq.l  #2,a0
        subq.l  #1,d7
        bne.b   .scan
.noscan:
        tst.l   chanvol
        bne.b   .havevol
        bsr     hook_install
.havevol:
        lea     str_logo,a0
        moveq   #1,d1
        moveq   #1,d2
        moveq   #C_LOGO,d3
        bsr     draw_str
        lea     str_chip,a0
        moveq   #1,d1
        moveq   #3,d2
        moveq   #C_BAR,d3
        bsr     draw_str
        lea     str_plat,a0
        moveq   #40-1-5,d1
        moveq   #3,d2
        moveq   #C_DIM,d3
        bsr     draw_str
        moveq   #4,d2
        bsr     draw_rule
        moveq   #29,d2
        bsr     draw_rule
        moveq   #'1',d0
        moveq   #13,d1
        moveq   #27,d2
        moveq   #C_DIM,d3
.lab:   bsr     draw_char
        addq.w  #4,d1
        addq.b  #1,d0
        cmp.b   #'5',d0
        blo.b   .lab
        movem.l (sp)+,d0-d7/a0-a6
        rts

; ---------------------------------------------------------------------------
; hook_install: patch volume stores in the relocated player (see header).
hook_install:
        movem.l d0-d7/a0-a6,-(sp)
        move.l  _uade_reloc_base,d0
        beq.w   .hdone
        move.l  _uprough_vbr,a0         ; vector first: the player may run from an IRQ
        lea     hook_trap(pc),a1
        move.l  a1,$bc(a0)
        lea     hook_flush(pc),a1               ; trap #14: cache flush (below)
        move.l  a1,$b8(a0)
        move.l  _uade_reloc_base,d0
        move.l  d0,a0
        lea     hooktab,a1
        moveq   #0,d6
        move.l  #54*1024/2,d7
.hs:    move.w  (a0),d0
        move.w  d0,d1
        and.w   #$f1f8,d1
        cmp.w   #$3140,d1
        beq.b   .hplain
        cmp.w   #$1140,d1               ; move.b Dn,disp(An): EMS stores bytes
        beq.b   .hplain
        cmp.w   #$3180,d1               ; move.w Dn,8(An,Dx.w)
        bne.b   .hn
        move.w  2(a0),d3
        move.w  d3,d5
        and.w   #$8fff,d5
        cmp.w   #8,d5
        bne.b   .hn
        bra.b   .hbase
.hplain:
        move.w  2(a0),d3
.hbase: move.w  d0,d2
        lsr.w   #8,d2
        lsr.w   #1,d2
        and.w   #7,d2
        cmp.w   #7,d2
        beq.b   .hn
        btst    #7,d0
        bne.b   .hok                    ; indexed form: disp already checked
        cmp.w   #8,d3
        beq.b   .hok
        cmp.w   #$a8,d3
        beq.b   .hok
        cmp.w   #$a6,d3                 ; AUDxPER: note-on fallback for players that never rewrite volume
        beq.b   .hok
        cmp.w   #$b6,d3
        beq.b   .hok
        cmp.w   #$c6,d3
        beq.b   .hok
        cmp.w   #$d6,d3
        beq.b   .hok
        cmp.w   #$b8,d3
        beq.b   .hok
        cmp.w   #$c8,d3
        beq.b   .hok
        cmp.w   #$d8,d3
        bne.b   .hn
.hok:   cmp.w   #HOOKMAX,d6
        bhs.b   .hfin
        move.w  d0,(a1)+
        move.w  d3,(a1)+
        move.l  #$4e4f0000,d4
        or.w    d6,d4
        move.l  d4,(a0)
        addq.w  #1,d6
.hn:    addq.l  #2,a0
        subq.l  #1,d7
        bne.w   .hs
.hfin:
        tst.w   d6
        beq.b   .hdone
        move.l  #hookvol,chanvol
        move.w  #1,chanstride
        trap    #14                     ; Supervisor() is gone once the takeover has run
.hdone: movem.l (sp)+,d0-d7/a0-a6
        rts

; trap #14: flush the caches after patching code. Same CPU choice as
; cache_flush.i, but entered by trap: exec's Supervisor() rides the privilege
; vector, which the takeover has replaced by then.
hook_flush:
        movem.l d0-d1/a0,-(sp)
        move.l  _uade_saved_execbase,d0
        beq.b   .fdone
        move.l  d0,a0
        move.w  $128(a0),d1             ; AttnFlags
        andi.w  #$00C2,d1
        beq.b   .fdone                  ; 68000/68010: no cache
        andi.w  #$0088,d1
        bne.b   .f040
        dc.w    $4E7A,$0002             ; movec cacr,d0
        ori.w   #$0808,d0               ; clear I and D cache
        dc.w    $4E7B,$0002             ; movec d0,cacr
        bra.b   .fdone
.f040:  dc.w    $F4F8                   ; cpusha bc
.fdone: movem.l (sp)+,d0-d1/a0
        rte

; trap #15: the patched store. Frame after movem: SR at 60(sp), PC at 62(sp).
hook_trap:
        movem.l d0-d7/a0-a6,-(sp)
        move.l  62(sp),a0
        moveq   #0,d0
        move.w  (a0)+,d0
        move.l  a0,62(sp)
        lsl.w   #2,d0
        lea     hooktab,a1
        move.w  (a1,d0.w),d1
        move.w  d1,d5
        move.w  2(a1,d0.w),d2
        ext.l   d2
        move.w  d1,d3
        and.w   #7,d3
        lsl.w   #2,d3
        move.w  2(sp,d3.w),d4           ; Dn low word
        lsr.w   #8,d1
        lsr.w   #1,d1
        and.w   #7,d1
        lsl.w   #2,d1
        move.l  32(sp,d1.w),a1          ; An
        btst    #7,d5                   ; opcode bit 7: indexed form
        beq.b   .tplain
        move.w  d2,d0
        rol.w   #4,d0
        and.w   #7,d0
        lsl.w   #2,d0
        move.w  2(sp,d0.w),d0           ; Dx low word
        ext.l   d0
        add.l   d0,a1
        moveq   #8,d2
.tplain:
        add.l   d2,a1
        btst    #13,d5                  ; opcode bit 13 set: word, clear: byte
        beq.b   .tbyte
        move.w  d4,(a1)
        moveq   #0,d6                   ; N/Z of the store (V,C clear), X kept;
        tst.w   d4                      ; move sr is privileged on a 68010+
        bra.b   .tflag
.tbyte: move.b  d4,(a1)
        moveq   #0,d6
        tst.b   d4
.tflag:
        bpl.b   .tpos
        moveq   #8,d6
.tpos:  bne.b   .tnz
        moveq   #4,d6
.tnz:
        move.b  61(sp),d0
        andi.b  #$10,d0
        or.b    d0,d6
        move.b  d6,61(sp)
        move.l  a1,d0
        sub.l   #$dff0a6,d0
        cmp.l   #$32,d0
        bhi.b   .out
        move.w  d0,d1
        and.w   #$f,d1
        beq.b   .period
        cmp.w   #2,d1
        bne.b   .out
        lsr.w   #4,d0
        lea     hookvol,a2
        move.b  d4,(a2,d0.w)
        st      volwrites               ; a real volume store: period fallback off
        bra.b   .out
.period:
        tst.b   volwrites
        bne.b   .out
        lsr.w   #4,d0
        lea     hookvol,a2
        move.b  #64,(a2,d0.w)           ; note-on level; draw_bars decays it
.out:   movem.l (sp)+,d0-d7/a0-a6
        rte

; ---------------------------------------------------------------------------
_screen_frame:
        movem.l d0-d7/a0-a6,-(sp)
        bsr     _input_poll
        move.l  #KEY_SPACE,-(sp)
        bsr     _input_key_pressed
        addq.l  #4,sp
        tst.l   d0
        beq.b   .nospace
        bsr     toggle_pause
.nospace:
        move.l  #KEY_LEFT,-(sp)
        bsr     _input_key_pressed
        addq.l  #4,sp
        tst.l   d0
        beq.b   .noleft
        moveq   #-1,d0
        bsr     change_song
.noleft:
        move.l  #KEY_RIGHT,-(sp)
        bsr     _input_key_pressed
        addq.l  #4,sp
        tst.l   d0
        beq.b   .noright
        moveq   #1,d0
        bsr     change_song
.noright:
        ; step()
        tst.b   paused
        bne.b   .nostep
        addq.l  #1,ticks
.nostep:
        addq.w  #1,scroll
        tst.w   drop
        beq.b   .nodrop
        subq.w  #1,drop
.nodrop:
        tst.w   wipe
        bmi.b   .nowipe
        addq.w  #2,wipe
        cmp.w   #40,wipe
        ble.b   .nowipe
        move.w  #-1,wipe
        st      titledirty
.nowipe:
        ; title, with the subsong wipe block
        tst.w   wipe
        bpl.b   .dotitle
        tst.b   titledirty
        beq.b   .notitle
.dotitle:
        sf      titledirty
        lea     title,a4
        moveq   #10,d1
        moveq   #1,d2
        moveq   #C_TEXT,d3
        moveq   #0,d5
.tl:    move.b  (a4,d5.w),d0
        cmp.w   wipe,d5
        bne.b   .tch
        moveq   #'}',d0
.tch:   bsr     draw_char
        addq.w  #1,d1
        addq.w  #1,d5
        cmp.w   #TW,d5
        blo.b   .tl
.notitle:
        bsr     draw_bars
        bsr     draw_time
        tst.b   songdirty
        beq.b   .nosong
        sf      songdirty
        bsr     draw_song
.nosong:
        bsr     draw_scroll
        movem.l (sp)+,d0-d7/a0-a6
        rts

; Pause: the probe skips play1/play2 while _screen_paused is set; Paula's
; channels are stopped here and the same AUDxEN bits are put back on resume.
toggle_pause:
        lea     CUSTOM,a5
        not.b   paused
        beq.b   .resume
        move.w  2(a5),d0
        and.w   #$000f,d0
        move.w  d0,savedma
        move.w  #$000f,$96(a5)
        rts
.resume:
        move.w  savedma,d0
        or.w    #$8000,d0
        move.w  d0,$96(a5)
        rts

; d0 = -1 / +1. Subsong range is UADE's (_uade_sub_min.._uade_sub_max).
change_song:
        move.l  _uade_sub_cur,d1
        add.l   d0,d1
        cmp.l   _uade_sub_min,d1
        blt.b   .no
        cmp.l   _uade_sub_max,d1
        bgt.b   .no
        move.l  d1,_uade_sub_cur
        move.l  d1,-(sp)
        bsr     _music_set_pos
        addq.l  #4,sp
        clr.l   ticks
        clr.w   scroll
        clr.w   wipe
        move.w  #16,drop
        st      songdirty
.no:    rts

; Motion per the design: t = round(v*176/15); lv = t > lv ? t : max(t, lv-5);
; cap holds 32 frames then falls 1 px per frame.
draw_bars:
        tst.b   volwrites
        bne.b   .nodecay
        lea     hookvol,a0              ; period-only players: decay the note-on level
        moveq   #3,d0
.dec:   move.b  (a0),d1
        subq.b  #3,d1
        bpl.b   .decok
        moveq   #0,d1
.decok: move.b  d1,(a0)+
        dbra    d0,.dec
.nodecay:
        lea     CUSTOM,a5
        move.w  2(a5),d6
        move.l  chanvol,a4
        moveq   #0,d7
.ch:    moveq   #0,d0
        tst.b   paused
        bne.b   .v0
        tst.w   drop
        bne.b   .v0
        move.l  a4,d1
        beq.b   .v0
        btst    d7,d6
        beq.b   .v0
        move.w  d7,d1
        mulu    chanstride,d1
        move.b  (a4,d1.w),d0
        cmp.b   #64,d0
        bls.b   .vok
        moveq   #64,d0
.vok:   mulu    #15,d0
        lsr.w   #6,d0
.v0:    mulu    #176,d0
        addq.w  #7,d0
        divu    #15,d0
        and.l   #$ffff,d0
        move.w  d7,d1
        add.w   d1,d1
        lea     lv,a3
        move.w  (a3,d1.w),d2
        cmp.w   d2,d0
        bgt.b   .setlv
        subq.w  #5,d2
        cmp.w   d2,d0
        bge.b   .setlv
        move.w  d2,d0
.setlv: move.w  d0,(a3,d1.w)
        lea     cap,a2
        lea     hold,a6
        move.w  (a2,d1.w),d2
        cmp.w   d2,d0
        blt.b   .capfall
        move.w  d0,(a2,d1.w)
        move.w  #32,(a6,d1.w)
        bra.b   .capdone
.capfall:
        tst.w   (a6,d1.w)
        beq.b   .capdec
        subq.w  #1,(a6,d1.w)
        bra.b   .capdone
.capdec:
        subq.w  #1,d2
        cmp.w   d0,d2
        bge.b   .cd2
        move.w  d0,d2
.cd2:   move.w  d2,(a2,d1.w)
.capdone:
        move.w  (a2,d1.w),d3
        move.w  #BOT,d4
        sub.w   d0,d4                   ; first filled y
        moveq   #-1,d5                  ; cap y, none
        tst.w   d3
        beq.b   .nocap
        move.w  #BOT-2,d5
        sub.w   d3,d5
        cmp.w   #40,d5
        bge.b   .nocap
        moveq   #40,d5
.nocap: lea     planes+40*ROWB+12,a0
        move.w  d7,d1
        lsl.w   #2,d1
        add.w   d1,a0
        moveq   #40,d2
.y:     move.w  d2,d1
        sub.w   d5,d1
        cmp.w   #1,d1
        bls.b   .pcap
        cmp.w   d4,d2
        bge.b   .pfill
        clr.l   (a0)
        clr.l   PLANE(a0)
        clr.l   2*PLANE(a0)
        bra.b   .pn
.pcap:  move.l  #$fffffffe,(a0)         ; colour 5 cap, 31 px
        clr.l   PLANE(a0)
        move.l  #$fffffffe,2*PLANE(a0)
        bra.b   .pn
.pfill: move.l  #$fffffffc,(a0)         ; colour 3 bar, px 30 colour 4 barlo
        move.l  #$fffffffc,PLANE(a0)
        move.l  #$00000002,2*PLANE(a0)
.pn:    lea     ROWB(a0),a0
        addq.w  #1,d2
        cmp.w   #BOT,d2
        blo.b   .y
        addq.w  #1,d7
        cmp.w   #4,d7
        blo.w   .ch
        rts

; Row 28: play/pause glyph + MM:SS at 50 Hz in the cap colour.
draw_time:
        move.l  ticks,d0
        cmp.l   #50*6000-1,d0
        bls.b   .tok
        move.l  #50*6000-1,d0
.tok:   divu    #50,d0
        and.l   #$ffff,d0
        divu    #60,d0
        lea     timestr+2,a0
        bsr     put2
        move.b  #':',(a0)+
        swap    d0
        bsr     put2
        move.b  #'{',timestr
        tst.b   paused
        beq.b   .pl
        move.b  #'|',timestr
.pl:    lea     timestr,a0
        moveq   #1,d1
        moveq   #28,d2
        moveq   #C_CAP,d3
        bra.w   draw_str

put2:   moveq   #0,d1
        move.w  d0,d1
        divu    #10,d1
        add.b   #'0',d1
        move.b  d1,(a0)+
        swap    d1
        add.b   #'0',d1
        move.b  d1,(a0)+
        rts

; 'SONG n/count', right aligned at column 39 - length.
draw_song:
        moveq   #' ',d0
        moveq   #20,d1
        moveq   #28,d2
        moveq   #C_TEXT,d3
.cl:    bsr     draw_char
        addq.w  #1,d1
        cmp.w   #39,d1
        blo.b   .cl
        lea     songstr,a0
        move.l  #'SONG',(a0)+
        move.b  #' ',(a0)+
        move.l  _uade_sub_cur,d0
        sub.l   _uade_sub_min,d0
        addq.l  #1,d0
        bsr     putn
        move.b  #'/',(a0)+
        move.l  _uade_sub_max,d0
        sub.l   _uade_sub_min,d0
        addq.l  #1,d0
        bsr     putn
        clr.b   (a0)
        move.l  a0,d1
        sub.l   #songstr,d1
        neg.w   d1
        add.w   #39,d1
        lea     songstr,a0
        moveq   #28,d2
        bra.w   draw_str

putn:   and.l   #$ffff,d0
        divu    #10,d0
        swap    d0
        move.w  d0,-(sp)
        clr.w   d0
        swap    d0
        beq.b   .out
        bsr     putn
.out:   move.w  (sp)+,d0
        add.b   #'0',d0
        move.b  d0,(a0)+
        rts

; Row 30 scroll: x 8..311, start = scroll % (len*8), text colour (plane 0).
draw_scroll:
        move.w  msglen,d7
        beq.b   .none
        moveq   #0,d0
        move.w  scroll,d0
        move.w  d7,d1
        lsl.w   #3,d1
        divu    d1,d0
        swap    d0
        move.w  d0,d6
        and.w   #7,d6
        lsr.w   #3,d0
        lea     planes+240*ROWB+1,a1
        moveq   #0,d5
.sr:    move.w  d0,d4
        move.l  a1,a3
        moveq   #37,d3
        bsr     msgbyte
.sb:    move.w  d1,d2
        lsl.w   #8,d2
        addq.w  #1,d4
        cmp.w   d7,d4
        blo.b   .nw
        moveq   #0,d4
.nw:    bsr     msgbyte
        move.b  d1,d2
        lsl.w   d6,d2
        lsr.w   #8,d2
        move.b  d2,(a3)+
        dbf     d3,.sb
        lea     ROWB(a1),a1
        addq.w  #1,d5
        cmp.w   #8,d5
        blo.b   .sr
.none:  rts

msgbyte:                                ; d4 char index, d5 glyph row -> d1.w byte
        movem.l d0/a0,-(sp)
        lea     msg,a0
        move.b  (a0,d4.w),d0
        bsr     glyph
        moveq   #0,d1
        move.b  (a0,d5.w),d1
        movem.l (sp)+,d0/a0
        rts

; d0.b character -> a0 = 8-byte glyph. Lower case folds to upper case; '{' play,
; '|' pause, '}' block (the design's charIdx); anything else is a space.
glyph:  and.w   #$ff,d0
        cmp.b   #'a',d0
        blo.b   .g1
        cmp.b   #'z',d0
        bhi.b   .g1
        sub.b   #32,d0
.g1:    cmp.b   #'{',d0
        bne.b   .g2
        moveq   #64,d0
        bra.b   .gok
.g2:    cmp.b   #'|',d0
        bne.b   .g3
        moveq   #65,d0
        bra.b   .gok
.g3:    cmp.b   #'}',d0
        bne.b   .g4
        moveq   #66,d0
        bra.b   .gok
.g4:    sub.b   #$20,d0
        cmp.b   #$40,d0
        blo.b   .gok
        moveq   #0,d0
.gok:   lsl.w   #3,d0
        lea     screen_font,a0
        add.w   d0,a0
        rts

draw_str:                               ; a0 string, d1 col, d2 row, d3 colour
        movem.l d0-d1/a2,-(sp)
        move.l  a0,a2
.l:     move.b  (a2)+,d0
        beq.b   .e
        bsr     draw_char
        addq.w  #1,d1
        bra.b   .l
.e:     movem.l (sp)+,d0-d1/a2
        rts

draw_char:                              ; d0 char, d1 col, d2 row, d3 colour
        movem.l d0-d5/a0-a3,-(sp)
        bsr     glyph
        move.w  d2,d4
        mulu    #ROWB*8,d4
        add.w   d1,d4
        lea     planes,a1
        add.l   d4,a1
        moveq   #2,d4
        moveq   #0,d1
.pl:    moveq   #7,d2
        move.l  a0,a2
        move.l  a1,a3
.row:   moveq   #0,d0
        btst    d1,d3
        beq.b   .w
        move.b  (a2),d0
.w:     addq.l  #1,a2
        move.b  d0,(a3)
        lea     ROWB(a3),a3
        dbf     d2,.row
        add.l   #PLANE,a1
        addq.w  #1,d1
        dbf     d4,.pl
        movem.l (sp)+,d0-d5/a0-a3
        rts

draw_rule:                              ; d2 row; pixel row row*8+3, x 8..311, colour 7
        movem.l d0-d2/a0,-(sp)
        mulu    #ROWB*8,d2
        add.l   #ROWB*3+1,d2
        lea     planes,a0
        add.l   d2,a0
        moveq   #2,d1
.p:     moveq   #37,d0
.b:     move.b  #$ff,(a0,d0.w)
        dbf     d0,.b
        add.l   #PLANE,a0
        dbf     d1,.p
        movem.l (sp)+,d0-d2/a0
        rts

; ---------------------------------------------------------------------------
        section uadedata,data
_screen_paused:
paused:         dc.b 0
songdirty:      dc.b -1
titledirty:     dc.b -1
        even
savedma:        dc.w 0
wipe:           dc.w -1
drop:           dc.w 0
scroll:         dc.w 0
msglen:         dc.w 0
ticks:          dc.l 0
chanvol:        dc.l 0
chanstride:     dc.w 44
hookvol:        dc.b 0,0,0,0
volwrites:      dc.b 0,0
hooktab:        ds.b 4*HOOKMAX
lv:             dc.w 0,0,0,0
cap:            dc.w 0,0,0,0
hold:           dc.w 0,0,0,0
title:          ds.b TW+1
msg:            ds.b 31*23+2
timestr:        dc.b '{ 00:00',0
        even
songstr:        ds.b 24
str_logo:       dc.b 'DEVILBOX',0
str_chip:       dc.b 'PAULA',0
str_plat:       dc.b 'AMIGA',0
        even
; PAL lowres 320x256, 3 planes; FMODE/BPLCON3 are AGA/ECS defaults, OCS ignores
; them; SPRxCTL writes disarm any sprite the OS left.
copinit:
        dc.w    $0100,$3200,$0102,0,$0104,0,$0108,0,$010a,0
        dc.w    $008e,$2c81,$0090,$2cc1,$0092,$0038,$0094,$00d0
        dc.w    $01fc,0,$0106,$0c00
        dc.w    $0142,0,$014a,0,$0152,0,$015a,0,$0162,0,$016a,0,$0172,0,$017a,0
        dc.l    0
        include "amiga/screen_font.i"

        section uadechip,bss_c
planes:         ds.b PLANE*3
coplist:        ds.l 64
