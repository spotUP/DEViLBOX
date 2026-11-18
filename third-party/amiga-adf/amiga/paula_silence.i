; paula_silence.i -- drive all four Paula channels to a TRUE zero output.
;
; Shared by every exit path that hands the machine back to the OS: the two
; demo startups (hdd_startup.s, main_glue.s) and the 4k intro (intro/startup.s).
; One definition, so the exit paths cannot drift apart again.
;
; WHY CLEARING DMA AND WRITING AUDxVOL=0 IS NOT ENOUGH (2026-09-20, the buzz
; after the sanctuary mouse-quit):
;
;   With audio DMA off a channel does not go quiet. Paula keeps converting
;   the LAST sample byte it latched, at the LAST volume it latched, forever:
;   a DC level. Both latches are only reloaded at a period boundary, and an
;   idle channel has no period boundaries -- so a bare AUDxVOL=0 changes the
;   register and not the sound, and a bare AUDxDAT=0 is IGNORED while that
;   channel's audio interrupt bit is still pending in INTREQ (HRM audio state
;   diagram: idle -> 010 needs AUDxDAT written AND AUDxIP clear; the music
;   player leaves all four bits pending, masked). UAE models exactly this
;   (audio.cpp: mixvol latched in loadper, dat_written && !isirq).
;
;   The maker's host audio then turns that DC into a buzz at every buffer
;   gap. On hardware it is a DC offset on the line out.
;
; THE ONLY WAY OUT IS THROUGH A PERIOD: play one zero word CPU-driven.
;   1. clear the four AUDx bits in INTREQ, so the DAT write is accepted
;   2. AUDxPER = 124 (the shortest legal period): the word is over in ~70 us
;   3. AUDxVOL = 0, AUDxDAT = 0: Paula plays the word once, latching
;      volume 0 and sample 0 as it goes -- the DAC lands on zero and stays
;   4. wait until the one-shot has certainly finished: 3 changes of the
;      raster line counter guarantee 2 whole lines (128 us) against
;      2 x 124 x 0.28 us = 70 us. Raster time, not CPU loops, so the wait
;      is the same on a 68000 and an 060.
;   5. the one-shot sets the AUDx interrupt bits again; clear them, so the
;      OS gets INTREQ back the way the music player left it.
;
; Trashes a0, a1, d0, d1. Needs no interrupts and no OS. DMA for AUD0-3 is
; cleared here too, first, so this is complete on its own. Written as a
; loop over the four channel blocks (16 bytes apart) because the 4k intro
; pays for every byte: 44 bytes of code.
;
; tests/the_exit_path_must_leave_paula_at_zero_test.py runs this exact write
; sequence through a Paula model that latches like the chip.

PAULA_SILENCE   macro
        lea     $dff000,a1
        move.w  #$000f,$096(a1)         ; DMACON: CLR AUD0-3, no more refills
        move.w  #$0780,$09c(a1)         ; INTREQ: CLR AUD0-3 -- pending bits would veto the DAT writes
        lea     $0a0(a1),a0             ; AUD0's register block; AUD1-3 follow 16 bytes apart
        moveq   #0,d1
        moveq   #4-1,d0
.ps_ch\@:
        move.w  #$007c,6(a0)            ; AUDxPER = 124
        move.w  d1,8(a0)                ; AUDxVOL = 0 -- latched by the one-shot below
        move.w  d1,10(a0)               ; AUDxDAT = 0 -- one CPU-driven word: the DAC lands on zero
        lea     16(a0),a0
        dbf     d0,.ps_ch\@
        moveq   #3-1,d1                 ; 3 line changes >= 2 whole lines = 128 us > the 70 us one-shot
.ps_line\@:
        move.b  $006(a1),d0             ; VHPOSR high byte: vertical line, low 8 bits
.ps_same\@:
        cmp.b   $006(a1),d0
        beq.b   .ps_same\@
        dbf     d1,.ps_line\@
        move.w  #$0780,$09c(a1)         ; INTREQ: CLR the AUDx bits the one-shots just set
        endm
