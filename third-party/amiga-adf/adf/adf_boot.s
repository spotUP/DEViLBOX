; DEViLBOX Amiga ADF bootblock trackloader.
;
; Kickstart reads the two boot sectors to any address and calls boot+12 with
; a1 = the trackdisk IOStdReq for DF0: and a6 = ExecBase. We keep Exec running
; (the UADE glue needs Supervisor() and graphics.library), so the loader just
; uses that IOStdReq: trackdisk does MFM decoding, motor and retries on every
; Kickstart version. Hardware-banging disk DMA would add MFM decode and drive
; stepping for nothing, because the OS is not being killed anyway.
;
; KS 1.x trackdisk decodes with the blitter into io_Data, so io_Data must be
; chip RAM. Every chunk goes through a chip bounce buffer, then the CPU copies
; it to the image address (slow RAM on an A500 with a trapdoor expansion).
;
; Build-time symbols (vasm -D, written by build_adf.py):
;   IMG_BASE   load address of the raw image (code + data + module slot)
;   IMG_LEN    image bytes on disk, a multiple of 512
;   IMG_DISK   disk byte offset of the image (1024: right after the bootblock)
;   BSS_BASE / BSS_LEN    zeroed BSS after the image (same memory region)
;   CHIP_BASE / CHIP_LEN  zeroed chip BSS (the UADE arena)
;   ENTRY      _start of the host

ExecAllocMem    equ     -198
ExecAllocAbs    equ     -204
ExecDoIO        equ     -456
IO_COMMAND      equ     28
IO_ERROR        equ     31
IO_LENGTH       equ     36
IO_DATA         equ     40
IO_OFFSET       equ     44
CMD_READ        equ     2
TD_MOTOR        equ     9
CHUNK           equ     11*512          ; one track
MEMF_CHIP       equ     2

        dc.b    'DOS',0
        dc.l    0                       ; checksum, filled by build_adf.py
        dc.l    880
boot:
        move.l  a1,a5                   ; a5 = IOStdReq
        ; Claim the fixed regions so nothing Exec owns is overwritten. A
        ; failed claim means the memory map is not what the layout assumes.
        move.l  #BSS_BASE+BSS_LEN-IMG_BASE,d0
        lea     IMG_BASE,a1
        jsr     ExecAllocAbs(a6)
        moveq   #1,d7
        tst.l   d0
        beq     fail
        move.l  #CHIP_LEN,d0
        lea     CHIP_BASE,a1
        jsr     ExecAllocAbs(a6)
        moveq   #2,d7
        tst.l   d0
        beq     fail
        move.l  #CHUNK,d0
        moveq   #MEMF_CHIP,d1
        jsr     ExecAllocMem(a6)
        moveq   #3,d7
        tst.l   d0
        beq     fail
        move.l  d0,a4                   ; a4 = chip bounce buffer

        lea     IMG_BASE,a3             ; a3 = destination
        move.l  #IMG_DISK,d5            ; d5 = disk offset
        move.l  #IMG_LEN,d6             ; d6 = bytes left
.next:
        move.l  #CHUNK,d4
        cmp.l   d4,d6
        bhs.b   .full
        move.l  d6,d4
.full:
        move.l  a5,a1
        move.w  #CMD_READ,IO_COMMAND(a1)
        move.l  a4,IO_DATA(a1)
        move.l  d4,IO_LENGTH(a1)
        move.l  d5,IO_OFFSET(a1)
        jsr     ExecDoIO(a6)
        moveq   #4,d7
        tst.b   IO_ERROR(a5)
        bne.b   fail
        move.l  a4,a0
        move.l  d4,d0
        lsr.l   #2,d0
        subq.l  #1,d0
.copy:  move.l  (a0)+,(a3)+
        dbf     d0,.copy                ; CHUNK/4 < 65536
        add.l   d4,d5
        sub.l   d4,d6
        bne.b   .next

        move.l  a5,a1
        move.w  #TD_MOTOR,IO_COMMAND(a1)
        clr.l   IO_LENGTH(a1)
        jsr     ExecDoIO(a6)

        lea     BSS_BASE,a0
        move.l  #BSS_LEN/4,d0
        bsr.b   clear
        lea     CHIP_BASE,a0
        move.l  #CHIP_LEN/4,d0
        bsr.b   clear

        jsr     ENTRY                   ; returns when the host exits (LMB)
.idle:  bra.b   .idle

clear:  subq.l  #1,d0
        bmi.b   .done
.loop:  clr.l   (a0)+
        subq.l  #1,d0
        bpl.b   .loop
.done:  rts

; d7 = failing step; the colour tells which (1 red, 2 green, 3 blue, 4 yellow).
fail:   lea     colours(pc),a0
        add.w   d7,d7
        move.w  -2(a0,d7.w),d0
.hang:  move.w  d0,$dff180
        bra.b   .hang
colours: dc.w   $f00,$0f0,$00f,$ff0
