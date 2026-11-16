; DEViLBOX SNES player: auto-plays the exported Terrific Audio Driver songs and shows the song title,
; author, a play timer, the subsong number, the sound chip name, a comment scroller and 8 channel bars.
;
; Built by tools/build-tad-player.sh with the TAD ca65 API (tad-audio.s), the sound-test text buffer
; (text-buffer.s, font, VBlank DMA) and the _common reset/NMI code. The level meter comes from a patch in
; tad-wasm/audio-driver/src/audio-driver.asm: every main-loop pass the driver writes
; $80 | voice << 4 | level (0-15, from the voice volume registers, 0 when the envelope is silent) to port 3.
;
; Controls: Left/Right = previous/next subsong, A or Start = pause/resume.
;
; Song titles, author and comment live in the "DVBXMETA" block in RODATA; the exporter
; (src/lib/export/tad/tadPlayerRom.ts) overwrites it. Only `#LAST_SONG_ID` immediates may use LAST_SONG_ID:
; the build script finds the patch positions by diffing two builds with different values.

.define ROM_NAME "DEVILBOX SNES PLAYER"
VERSION     = 0
ROM_SIZE    = 2
REGION      = REGION__Japan
CART_TYPE   = CART_TYPE__RomOnly
ROM_SPEED   = ROM_SPEED__Slow

.include "text-buffer.inc"
.include "_common/registers.inc"
.include "_common/snes-header.inc"
.include "tad-audio.inc"
.include "gen/audio.inc"

.p816
.smart

.export Main, NmiHandler, IrqHandler, CopHandler
.exportzp zpTmpByte, zpTmpWord, zpTmpFarPtr

.import BreakHandler, EmptyHandler
.import DmaToCgram_ForceBlank

.export TEXT_BUFFER_VRAM_MAP_WADDR   : absolute = $0000
.export TEXT_BUFFER_VRAM_TILES_WADDR : absolute = $1000

.define SnesRgb(r, g, b) ((r) | ((g) << 5) | ((b) << 10))
; No parentheses on the inner call: ca65 2.18 expands TextBuffer_PosToIndex(x, y) here as (x + y) * 32.
.define Pos(xPos, yPos) TextBuffer_PosToIndex xPos, yPos

TILE_ASCII_OFFSET = 31          ; font tile = ASCII - 31 (font.inc FONT_ASCII_OFFSET)
TILE_BAR_LEFT     = 128         ; + fill (0-8 rows)
TILE_BAR_RIGHT    = 137         ; + fill (0-8 rows)
TILE_RULE         = 146
TILE_BLOCK        = TILE_BAR_LEFT + 8

ATTR_TEXT  = 0 << 2
ATTR_DIM   = 1 << 2
ATTR_LOGO  = 2 << 2
ATTR_RULE  = 3 << 2
ATTR_BAR   = 4 << 2

JOY_RIGHT = $0100
JOY_LEFT  = $0200
JOY_START = $1000
JOY_A     = $0080

N_BARS      = 8
BAR_TOP_ROW = 7
BAR_ROWS    = 15
BAR_BOTTOM_Y = (BAR_TOP_ROW + BAR_ROWS) * 8
CAP_HOLD    = 32
QUIET_FRAMES = 16
TITLE_LEN   = 28
N_TITLES    = 32
COMMENT_LEN = 256
SCROLL_ROW  = 26
BG2_MAP_WADDR = $0800
OBJ_TILES_WADDR = $2000

.zeropage
    zpTmpByte:      .res 1
    zpTmpWord:      .res 2
    zpTmpFarPtr:    .res 3

    joypadCurrent:  .res 2
    joypadPressed:  .res 2

    song:           .res 1
    paused:         .res 1
    quietFrames:    .res 1
    frameCount:     .res 1
    seconds:        .res 1
    minutes:        .res 1
    wipePos:        .res 1
    scrollX:        .res 2
    commentPos:     .res 2
    scrollPending:  .res 1
    scrollAddr:     .res 2
    scrollTile:     .res 2

.bss
    levelMax:       .res N_BARS
    barH:           .res N_BARS
    capH:           .res N_BARS
    capHold:        .res N_BARS
    oamBuffer:      .res 544

.rodata
; Overwritten by the exporter: magic, N_TITLES x TITLE_LEN titles, TITLE_LEN author, COMMENT_LEN comment + 0.
Meta:
    .byte "DVBXMETA"
MetaTitles:
    .repeat N_TITLES
        .byte "                            "
    .endrepeat
MetaAuthor:
    .byte "                            "
MetaComment:
    .byte "DEVILBOX SNES PLAYER    "
    .res COMMENT_LEN - 24, 0
    .byte 0
.assert MetaAuthor - MetaTitles = N_TITLES * TITLE_LEN, error

ChipLabel:      .byte "SNES S-DSP"
LogoLabel:      .byte "DEViLBOX"
SongLabel:      .byte "SONG"
PlayingLabel:   .byte "PLAYING"
PausedLabel:    .byte "PAUSED "
LoadingLabel:   .byte "LOADING"
ChannelLabels:  .byte "1  2  3  4  5  6  7  8"

; DEViLBOX roles (12-bit colours) as BGR555.
COL_BG    = SnesRgb( 3,  3,  3)
COL_RULE  = SnesRgb( 7,  7,  7)
COL_TEXT  = SnesRgb(30, 30, 30)
COL_DIM   = SnesRgb(20, 20, 20)
COL_BAR   = SnesRgb(30, 19,  1)
COL_BARLO = SnesRgb(22, 10,  1)
COL_CAP   = SnesRgb( 4, 26, 29)
COL_LOGO  = SnesRgb(29,  8,  8)

Palette:
    .word COL_BG, COL_BAR,  COL_BG,    COL_TEXT     ; BG1 0: text (1 = wipe cursor)
    .word COL_BG, COL_BG,   COL_BG,    COL_DIM      ; BG1 1: dim text
    .word COL_BG, COL_BG,   COL_BG,    COL_LOGO     ; BG1 2: logo
    .word COL_BG, COL_RULE, COL_BG,    COL_BG       ; BG1 3: rules
    .word COL_BG, COL_BAR,  COL_BARLO, COL_BG       ; BG1 4: bars
    .word COL_BG, COL_BG,   COL_BG,    COL_BG
    .word COL_BG, COL_BG,   COL_BG,    COL_BG
    .word COL_BG, COL_BG,   COL_BG,    COL_BG
    .word COL_BG, COL_BG,   COL_BG,    COL_CAP      ; BG2 0: scroller
Palette_SIZE = * - Palette

ObjPalette:
    .word COL_BG, COL_CAP
ObjPalette_SIZE = * - ObjPalette

; 2bpp tiles from TILE_BAR_LEFT: left bar fill 0-8, right bar fill 0-8 (darker right edge), rule.
CustomTiles:
    .repeat 9, L
        .repeat 8, R
            .if R >= 8 - L
                .byte $ff, $00
            .else
                .byte $00, $00
            .endif
        .endrepeat
    .endrepeat
    .repeat 9, L
        .repeat 8, R
            .if R >= 8 - L
                .byte $fc, $03
            .else
                .byte $00, $00
            .endif
        .endrepeat
    .endrepeat
    .repeat 8, R
        .if R = 3 || R = 4
            .byte $ff, $00
        .else
            .byte $00, $00
        .endif
    .endrepeat
CustomTiles_SIZE = * - CustomTiles

; Cap sprite x positions: two 8x8 sprites per bar, bar b at column 4 + b * 3.
CapX:
    .repeat N_BARS, B
        .byte (4 + B * 3) * 8, (4 + B * 3) * 8 + 8
    .endrepeat

.code

.macro PrintAt xPos, yPos, label, len
    ldx     #.loword(label)
    stx     zpTmpFarPtr
    lda     #.bankbyte(label)
    sta     zpTmpFarPtr + 2
    ldx     #Pos(xPos, yPos)
    ldy     #len
    jsr     PrintN
.endmacro

.macro FillAttr xPos, yPos, len, value
    ldx     #Pos(xPos, yPos)
    ldy     #len
    lda     #value
    jsr     FillAttrN
.endmacro

.macro Rule yPos
    ldx     #Pos(0, yPos)
    ldy     #32
    lda     #TILE_RULE
    jsr     FillCharN
    FillAttr 0, yPos, 32, ATTR_RULE
.endmacro

;; IN: zpTmpFarPtr source, X buffer index, Y length
;; A8 I16 DB access lowram
.a8
.i16
.proc PrintN
    sty     zpTmpWord
    ldy     #0
    Loop:
        cpy     zpTmpWord
        bcs     End
        lda     [zpTmpFarPtr],y
        cmp     #' '
        bcc     Bad
        cmp     #127
        bcc     :+
    Bad:
            lda     #'?'
        :
        sec
        sbc     #TILE_ASCII_OFFSET
        sta     f:TextBuffer_charBuffer,x
        inx
        iny
        bra     Loop
End:
    stz     TextBuffer_charBufferChangedIfZero
    rts
.endproc

;; IN: X index, Y count, A tile
.a8
.i16
.proc FillCharN
    :
        sta     f:TextBuffer_charBuffer,x
        inx
        dey
        bne     :-
    stz     TextBuffer_charBufferChangedIfZero
    rts
.endproc

;; IN: X index, Y count, A attribute byte
.a8
.i16
.proc FillAttrN
    :
        sta     f:TextBuffer_attrBuffer,x
        inx
        dey
        bne     :-
    stz     TextBuffer_attrBufferChangedIfZero
    rts
.endproc

;; Prints A (0-99) as two digits at buffer index X.
.a8
.i16
.proc Print2
    ldy     #0
    :
        cmp     #10
        bcc     :+
        sbc     #10
        iny
        bra     :-
    :
    clc
    adc     #'0' - TILE_ASCII_OFFSET
    sta     f:TextBuffer_charBuffer + 1,x
    tya
    clc
    adc     #'0' - TILE_ASCII_OFFSET
    sta     f:TextBuffer_charBuffer,x
    stz     TextBuffer_charBufferChangedIfZero
    rts
.endproc

;; Sets zpTmpFarPtr to the title of `song`.
.a8
.i16
.proc TitlePtr
    rep     #$20
.a16
    lda     song
    dec
    and     #N_TITLES - 1
    sta     zpTmpWord
    asl                     ; * 28 = * 32 - * 4
    asl
    sta     zpTmpWord
    asl
    asl
    asl
    sec
    sbc     zpTmpWord
    clc
    adc     #.loword(MetaTitles)
    sta     zpTmpFarPtr
    sep     #$20
.a8
    lda     #.bankbyte(MetaTitles)
    sta     zpTmpFarPtr + 2
    rts
.endproc

;; Starts `song`: load, reset timer, scroller and bars, start the title wipe.
.a8
.i16
.proc StartSong
    lda     song
    jsr     Tad_LoadSong
    rep     #$10
    sep     #$20
    stz     paused
    stz     frameCount
    stz     seconds
    stz     minutes
    stz     wipePos
    lda     #QUIET_FRAMES
    sta     quietFrames
    ldx     #0
    stx     commentPos
    stx     scrollX
    ldx     #N_BARS - 1
    :
        stz     barH,x
        stz     capH,x
        stz     capHold,x
        dex
        bpl     :-
    ldx     #Pos(25, 24)
    lda     song
    jsr     Print2
    lda     #LAST_SONG_ID
    ldx     #Pos(28, 24)
    jsr     Print2
    rts
.endproc

.a8
.i16
.proc UpdateTitleWipe
    lda     wipePos
    cmp     #TITLE_LEN
    bcs     Done
    jsr     TitlePtr
    rep     #$20
.a16
    lda     wipePos
    and     #$ff
    tay
    clc
    adc     #Pos(2, 3)
    tax
    sep     #$20
.a8
    lda     #2
    sta     zpTmpByte
    Loop:
        lda     [zpTmpFarPtr],y
        cmp     #' '
        bcc     Bad
        cmp     #127
        bcc     :+
    Bad:
            lda     #'?'
        :
        sec
        sbc     #TILE_ASCII_OFFSET
        sta     f:TextBuffer_charBuffer,x
        inx
        iny
        inc     wipePos
        lda     wipePos
        cmp     #TITLE_LEN
        bcs     :+
        dec     zpTmpByte
        bne     Loop
        lda     #TILE_BLOCK
        sta     f:TextBuffer_charBuffer,x
    :
    stz     TextBuffer_charBufferChangedIfZero
Done:
    rts
.endproc

;; Reads the driver level meter on port 3 many times during the frame; keeps the highest level per voice.
.a8
.i16
.proc PollLevels
    ldx     #N_BARS - 1
    :
        stz     levelMax,x
        dex
        bpl     :-
    rep     #$20
    lda     #0              ; B = 0 for tax below
    sep     #$20
    ldy     #400
    Loop:
        lda     APUIO_IN_3
        cmp     APUIO_IN_3
        bne     Next
        and     #$ff
        bpl     Next
        sta     zpTmpByte
        and     #$70
        lsr
        lsr
        lsr
        lsr
        tax
        lda     zpTmpByte
        and     #$0f
        cmp     levelMax,x
        bcc     Next
        sta     levelMax,x
    Next:
        dey
        bne     Loop
    rts
.endproc

;; Bars: instant attack, fall 4 px per frame. Caps: rise with the bar, hold, fall 1 px per frame.
.a8
.i16
.proc UpdateBars
    ldx     #N_BARS - 1
    BarLoop:
        lda     levelMax,x
        asl
        asl
        asl
        sta     zpTmpByte       ; target height in pixels
        lda     barH,x
        cmp     zpTmpByte
        bcs     :+
            lda     zpTmpByte
            bra     SetBar
        :
        sec
        sbc     #4
        bcc     :+
        cmp     zpTmpByte
        bcs     SetBar
        :
        lda     zpTmpByte
    SetBar:
        sta     barH,x

        cmp     capH,x
        bcc     :+
            sta     capH,x
            lda     #CAP_HOLD
            sta     capHold,x
            bra     CapDone
        :
        lda     capHold,x
        beq     :+
            dec     capHold,x
            bra     CapDone
        :
        dec     capH,x
    CapDone:
        dex
        bpl     BarLoop

    ; draw the bars into the text buffer
    ldx     #N_BARS - 1
    DrawLoop:
        stx     zpTmpWord
        lda     barH,x
        sta     zpTmpByte
        txa
        asl
        adc     zpTmpWord       ; b * 3 (carry clear: b < 8)
        clc
        adc     #4
        rep     #$20
.a16
        and     #$ff
        clc
        adc     #Pos(0, BAR_TOP_ROW + BAR_ROWS - 1)
        tax
        sep     #$20
.a8
        ldy     #BAR_ROWS
        RowLoop:
            lda     zpTmpByte
            cmp     #8
            bcc     :+
                lda     #8
            :
            pha
            clc
            adc     #TILE_BAR_LEFT
            sta     f:TextBuffer_charBuffer,x
            pla
            clc
            adc     #TILE_BAR_RIGHT
            sta     f:TextBuffer_charBuffer + 1,x
            lda     zpTmpByte
            sec
            sbc     #8
            bcs     :+
                lda     #0
            :
            sta     zpTmpByte
            rep     #$21
.a16
            txa
            sbc     #32 - 1         ; carry clear: subtracts 32
            tax
            sep     #$20
.a8
            dey
            bne     RowLoop
        ldx     zpTmpWord
        dex
        bpl     DrawLoop
    stz     TextBuffer_charBufferChangedIfZero

    ; cap sprites
    ldx     #0
    ldy     #0
    CapLoop:
        sty     zpTmpWord
        lda     #BAR_BOTTOM_Y - 3
        sec
        sbc     capH,x
        ldy     zpTmpWord
        sta     oamBuffer + 1,y
        sta     oamBuffer + 5,y
        tya
        clc
        adc     #8
        tay
        inx
        cpx     #N_BARS
        bcc     CapLoop
    rts
.endproc

.a8
.i16
.proc UpdateTimer
    lda     paused
    bne     Done
    jsr     Tad_IsSongPlaying
    bcc     Done
    inc     frameCount
    lda     STAT78
    and     #$10
    beq     :+
        lda     #50
        bra     :++
    :
        lda     #60
    :
    cmp     frameCount
    bne     Done
    stz     frameCount
    inc     seconds
    lda     seconds
    cmp     #60
    bcc     Done
    stz     seconds
    inc     minutes
    lda     minutes
    cmp     #100
    bcc     Done
    stz     minutes
Done:
    lda     minutes
    ldx     #Pos(12, 24)
    jsr     Print2
    lda     #':' - TILE_ASCII_OFFSET
    sta     f:TextBuffer_charBuffer + Pos(14, 24)
    lda     seconds
    ldx     #Pos(15, 24)
    jsr     Print2
    rts
.endproc

.a8
.i16
.proc UpdateStatus
    lda     paused
    beq     :+
        PrintAt 2, 24, PausedLabel, 7
        rts
    :
    jsr     Tad_IsSongPlaying
    bcc     :+
        PrintAt 2, 24, PlayingLabel, 7
        rts
    :
    PrintAt 2, 24, LoadingLabel, 7
    rts
.endproc

;; Queues the next scroller character for the NMI handler when a new 8 px column enters the screen.
.a8
.i16
.proc UpdateScroller
    rep     #$20
.a16
    lda     scrollX
    inc
    and     #511
    sta     scrollX
    bit     #7
    bne     Done
    lsr
    lsr
    lsr
    clc
    adc     #32
    and     #63
    cmp     #32
    bcc     :+
        adc     #$400 - 32 - 1      ; carry set: second 32x32 screen
    :
    clc
    adc     #BG2_MAP_WADDR + SCROLL_ROW * 32
    sta     scrollAddr

    ldx     commentPos
    lda     f:MetaComment,x
    and     #$ff
    bne     :+
        ldx     #0
        lda     f:MetaComment
        and     #$ff
        bne     :+
            lda     #' '
    :
    inx
    stx     commentPos
    cmp     #' '
    bcc     Bad
    cmp     #127
    bcc     :+
Bad:
        lda     #'?'
    :
    sec
    sbc     #TILE_ASCII_OFFSET
    sta     scrollTile
    sep     #$20
.a8
    lda     #1
    sta     scrollPending
    rts
Done:
    sep     #$20
    rts
.endproc

.a8
.i16
.proc ProcessInput
    lda     joypadPressed + 1
    bit     #>JOY_LEFT
    beq     :++
        lda     song
        dec
        bne     :+
            lda     #LAST_SONG_ID
        :
        sta     song
        jmp     StartSong
    :
    bit     #>JOY_RIGHT
    beq     :++
        lda     song
        cmp     #LAST_SONG_ID
        bcc     :+
            lda     #0
        :
        inc
        sta     song
        jmp     StartSong
    :
    lda     joypadPressed + 1
    bit     #>JOY_START
    bne     Toggle
    lda     joypadPressed
    bit     #<JOY_A
    beq     Done
Toggle:
    lda     paused
    eor     #1
    sta     paused
    beq     :+
        lda     #TadCommand::PAUSE_MUSIC_PLAY_SFX
        bra     :++
    :
        lda     #TadCommand::UNPAUSE
    :
    jsr     Tad_QueueCommandOverride
    rep     #$10
    sep     #$20
Done:
    rts
.endproc

.a8
.i16
.proc SetupScreen
    jsr     TextBuffer_SetupPpu

    stz     BGMODE
    stz     BG1SC
    lda     #(BG2_MAP_WADDR >> 10) << 2 | 1
    sta     BG2SC
    lda     #(TEXT_BUFFER_VRAM_TILES_WADDR >> 12) | ((TEXT_BUFFER_VRAM_TILES_WADDR >> 12) << 4)
    sta     BG12NBA
    lda     #OBJ_TILES_WADDR >> 13
    sta     OBJSEL
    lda     #$13
    sta     TM

    stz     CGADD
    ldx     #.loword(Palette)
    lda     #.bankbyte(Palette)
    ldy     #Palette_SIZE
    jsr     DmaToCgram_ForceBlank
    lda     #128
    sta     CGADD
    ldx     #.loword(ObjPalette)
    lda     #.bankbyte(ObjPalette)
    ldy     #ObjPalette_SIZE
    jsr     DmaToCgram_ForceBlank

    lda     #$80
    sta     VMAIN
    ldx     #TEXT_BUFFER_VRAM_TILES_WADDR + TILE_BAR_LEFT * 8
    stx     VMADD
    ldx     #0
    :
        rep     #$20
        lda     f:CustomTiles,x
        sta     VMDATAL
        sep     #$20
        inx
        inx
        cpx     #CustomTiles_SIZE
        bcc     :-

    ; cap sprite tile 0 (4bpp): rows 0-1 colour 1
    ldx     #OBJ_TILES_WADDR
    stx     VMADD
    rep     #$20
.a16
    lda     #$00ff
    sta     VMDATAL
    sta     VMDATAL
    lda     #0
    ldy     #14
    :
        sta     VMDATAL
        dey
        bne     :-

    ; clear the BG2 map (64x32)
    ldx     #BG2_MAP_WADDR
    stx     VMADD
    ldy     #64 * 32
    :
        sta     VMDATAL
        dey
        bne     :-
    sep     #$20
.a8

    ; text buffer: everything transparent (tile 0) so BG2 shows through
    ldx     #0
    :
        lda     #0
        sta     f:TextBuffer_charBuffer,x
        sta     f:TextBuffer_attrBuffer,x
        inx
        cpx     #TextBuffer_charBuffer_SIZE
        bcc     :-

    ; OAM: caps at their bar x, others off-screen, high table zero (small, x < 256)
    ldx     #0
    :
        stz     oamBuffer,x
        lda     #$f0
        sta     oamBuffer + 1,x
        stz     oamBuffer + 2,x
        lda     #$30
        sta     oamBuffer + 3,x
        inx
        inx
        inx
        inx
        cpx     #512
        bcc     :-
    :
        stz     oamBuffer,x
        inx
        cpx     #544
        bcc     :-
    ldx     #0
    ldy     #0
    :
        lda     f:CapX,x
        sta     oamBuffer,y
        iny
        iny
        iny
        iny
        inx
        cpx     #N_BARS * 2
        bcc     :-

    PrintAt 2, 1, ChipLabel, 10
    FillAttr 2, 1, 10, ATTR_DIM
    PrintAt 22, 1, LogoLabel, 8
    FillAttr 22, 1, 8, ATTR_LOGO
    Rule 2
    PrintAt 2, 4, MetaAuthor, TITLE_LEN
    FillAttr 2, 4, TITLE_LEN, ATTR_DIM
    Rule 5
    FillAttr 0, BAR_TOP_ROW, 32 * BAR_ROWS, ATTR_BAR
    PrintAt 4, 22, ChannelLabels, 22
    FillAttr 0, 22, 32, ATTR_DIM
    Rule 23
    PrintAt 20, 24, SongLabel, 4
    lda     #'/' - TILE_ASCII_OFFSET
    sta     f:TextBuffer_charBuffer + Pos(27, 24)
    Rule 25
    rts
.endproc

.a8
.i16
;; DB access registers
.proc Main
    jsl     Tad_Init
    rep     #$10
    sep     #$20

    jsr     SetupScreen

    jsr     Tad_SongsStartImmediately
    lda     #1
    sta     song
    jsr     StartSong
    lda     #NMITIMEN_VBLANK | NMITIMEN_JOYPAD
    sta     NMITIMEN
    lda     #15
    sta     INIDISP

    MainLoop:
        jsr     WaitFrame
        jsl     Tad_Process
        rep     #$10
        sep     #$20

        jsr     ProcessInput
        jsr     PollLevels

        lda     quietFrames
        beq     :+
            dec     quietFrames
            bra     Silent
        :
        lda     paused
        bne     Silent
        jsr     Tad_IsSongPlaying
        bcs     :++
    Silent:
            ldx     #N_BARS - 1
            :
                stz     levelMax,x
                dex
                bpl     :-
        :
        jsr     UpdateBars
        jsr     UpdateTitleWipe
        jsr     UpdateTimer
        jsr     UpdateStatus
        jsr     UpdateScroller
        bra     MainLoop
.endproc

IrqHandler = BreakHandler
CopHandler = BreakHandler

;; NMI work: text buffer DMA, OAM DMA, one scroller tile, BG2 scroll, joypad.
;; A8 I16 DB = $80
.macro VBlank
    TextBuffer_VBlank

    ldx     #0
    stx     OAMADD
    ldx     #($00) | (.lobyte(OAMDATA) << 8)
    stx     DMAP0
    ldx     #.loword(oamBuffer)
    stx     A1T0
    lda     #.bankbyte(oamBuffer)
    sta     A1B0
    ldx     #544
    stx     DAS0
    lda     #1
    sta     MDMAEN

    lda     scrollPending
    beq     :+
        lda     #$80
        sta     VMAIN
        ldx     scrollAddr
        stx     VMADD
        ldx     scrollTile
        stx     VMDATAL
        stz     scrollPending
    :
    lda     scrollX
    sta     BG2HOFS
    lda     scrollX + 1
    sta     BG2HOFS

    lda     #1
    :
        bit     HVBJOY
        bne     :-

    rep     #$30
.a16
    lda     JOY1
    bit     #$f
    beq     :+
        lda     #0
    :
    tay
    lda     joypadCurrent
    sty     joypadCurrent
    eor     #$ffff
    and     joypadCurrent
    sta     joypadPressed
    sep     #$20
.a8
.endmacro

.include "_common/nmi-isr.inc"
