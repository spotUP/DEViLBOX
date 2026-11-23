; pt4_glue.s -- the music backend of the native ProTracker 4 ADF template.
;
; Takes uade_glue.s's place next to uade_probe.s, input_sdk.s and screen.s:
; same _music_* entry points and the same symbols screen.s reads, but the
; replayer is libpt4 (ProTracker 4's own replay code, built with vbcc) and the
; tick comes from CIA-B timer A on level 6 at the song's BPM, as in PT4. The C
; side (pt4_amiga.c) copies libpt4's Paula shadow to the hardware each tick.
;
; Bars: screen.s scans _uade_reloc_base for PT's "tst.b x / bne / tst.b x+44"
; signature and reads one volume byte per channel at stride 44. pt4_barpat is
; that signature pointing at _pt4_vols, which pt4a_tick fills.

        section code,code

        xdef    _music_init
        xdef    _music_start
        xdef    _music_stop
        xdef    _music_shutdown
        xdef    _music_play1
        xdef    _music_play2
        xdef    _music_select
        xdef    _music_select_pump
        xdef    _music_set_pos
        xdef    uade_regs
        xdef    uade_priv_handler
        xdef    _uade_sub_min
        xdef    _uade_sub_cur
        xdef    _uade_sub_max
        xdef    _uade_reloc_base
        xdef    _uade_mod_base
        xdef    _uade_saved_execbase
        xdef    _uade_module_len
        xdef    _uade_module_src
        xdef    _pt4_vols
        xdef    _pt4_pool
        xdef    _pt4_pool_end

        xref    _pt4a_init
        xref    _pt4a_tick
        xref    _pt4a_cia
        xref    _input_own_keyboard
        xref    _uprough_vbr
        xref    _screen_paused

CIAB_TALO       equ     $bfd400
CIAB_TAHI       equ     $bfd500
CIAB_ICR        equ     $bfdd00
CIAB_CRA        equ     $bfde00

; pt4a_init: pt4__load + reset, about 3 KB of C stack; run it on our own.
_music_init:
        movem.l d2-d7/a2-a6,-(sp)
        move.l  sp,pt4_save_sp
        lea     pt4_stack_top,sp
        jsr     _pt4a_init
        move.l  pt4_save_sp,sp
        jsr     _input_own_keyboard     ; the keyboard ISR on $68 (as uade_glue.s)
        move.l  _uprough_vbr,a0
        lea     pt4_lev6(pc),a1
        move.l  a1,$78(a0)
        movem.l (sp)+,d2-d7/a2-a6
        rts

; CIA-B timer A, continuous, latch = 1773447 / BPM (PT's CIA tempo).
_music_start:
        move.l  d2,-(sp)
        jsr     _pt4a_cia
        move.b  #$7f,CIAB_ICR           ; all CIA-B sources off
        tst.b   CIAB_ICR                ; and acknowledged
        clr.b   CIAB_CRA                ; timer stopped, continuous
        move.b  d0,CIAB_TALO
        lsr.w   #8,d0
        move.b  d0,CIAB_TAHI
        move.b  #$11,CIAB_CRA           ; force load, start
        move.b  #$81,CIAB_ICR           ; timer A interrupt on
        move.w  #$2000,$dff09c          ; INTREQ EXTER clear
        move.w  #$e000,$dff09a          ; INTENA master + EXTER
        move.l  (sp)+,d2
        rts

_music_stop:
        move.w  #$2000,$dff09a          ; EXTER off
        move.b  #$7f,CIAB_ICR
        clr.b   CIAB_CRA
        move.w  #$000f,$dff096          ; audio DMA off
        clr.w   $dff0a8
        clr.w   $dff0b8
        clr.w   $dff0c8
        clr.w   $dff0d8
_music_shutdown:
_music_play1:
_music_play2:
_music_select:
_music_select_pump:
_music_set_pos:
        rts

; Level 6: CIA-B. One libpt4 tick per timer A underflow, on its own stack.
; pt4a_tick returns the next timer value when the BPM changed (Fxx >= 32):
; written to the latch, it takes effect at the next underflow, so the tick
; that changed the tempo keeps the old interval, as in libpt4's do_tick.
pt4_lev6:
        movem.l d0-d1/a0-a1,-(sp)
        move.b  CIAB_ICR,d0             ; read = acknowledge
        move.w  #$2000,$dff09c
        move.w  #$2000,$dff09c          ; twice: the A4000 bus quirk
        btst    #0,d0
        beq.b   .out
        tst.b   _screen_paused
        bne.b   .out
        move.l  sp,pt4_irq_sp
        lea     pt4_irqstack_top,sp
        jsr     _pt4a_tick
        move.l  pt4_irq_sp,sp
        tst.l   d0
        beq.b   .out
        move.b  d0,CIAB_TALO
        lsr.w   #8,d0
        move.b  d0,CIAB_TAHI
.out:   movem.l (sp)+,d0-d1/a0-a1
        rte

; screen.s's bar scan target: tst.b X / bne.b / tst.b X+44, X = vols + 15.
pt4_barpat:
        dc.w    $4a39
        dc.l    _pt4_vols+15
        dc.w    $6600
        dc.w    $4a39
        dc.l    _pt4_vols+15+44
        dc.w    0

        section uadedata,data
        cnop    0,4
uade_regs:              ds.b    64      ; the probe's crash register dump
uade_priv_handler:      dc.l    0
_uade_sub_min:          dc.l    0
_uade_sub_cur:          dc.l    0
_uade_sub_max:          dc.l    0
_uade_reloc_base:       dc.l    pt4_barpat
_uade_mod_base:         dc.l    0
_uade_saved_execbase:   dc.l    0
pt4_save_sp:            dc.l    0
pt4_irq_sp:             dc.l    0
_pt4_vols:              ds.b    4*44
; The module slot the browser patches: length word, then the module padded to
; the slot (build_adf.py stages current.uademod and passes PT4_MODULE_LEN).
        cnop    0,4
_uade_module_len:       dc.l    PT4_MODULE_LEN
_uade_module_src:
        incbin  "current.uademod"
        even

        section uadestack,bss
        cnop    0,4
                        ds.b    8192
pt4_stack_top:
                        ds.b    4096
pt4_irqstack_top:

; libpt4's arena (the samples Paula fetches) and song state: chip RAM.
        section uadechip,bss_c
        cnop    0,4
_pt4_pool:              ds.b    PT4_POOL_BYTES
_pt4_pool_end:
