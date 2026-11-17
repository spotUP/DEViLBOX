; NROM-256 player for the vendored FamiStudio sound engine (third-party/famistudio).
; The converter (src/lib/export/nes/famistudioSong.ts) patches the song data in at
; fs_music ($8000) and the DPCM samples at $C000. NTSC, song 0, famistudio_update once per NMI.

.define FAMISTUDIO_CA65_ZP_SEGMENT   ZEROPAGE
.define FAMISTUDIO_CA65_RAM_SEGMENT  BSS
.define FAMISTUDIO_CA65_CODE_SEGMENT CODE
FAMISTUDIO_CFG_EXTERNAL          = 1
FAMISTUDIO_CFG_NTSC_SUPPORT      = 1
FAMISTUDIO_CFG_DPCM_SUPPORT      = 1
FAMISTUDIO_USE_FAMITRACKER_TEMPO = 1
FAMISTUDIO_USE_VOLUME_TRACK      = 1
FAMISTUDIO_USE_RELEASE_NOTES     = 1
FAMISTUDIO_USE_DUTYCYCLE_EFFECT  = 1
FAMISTUDIO_USE_VIBRATO = 1
FAMISTUDIO_USE_ARPEGGIO = 1
FAMISTUDIO_USE_PITCH_TRACK = 1
FAMISTUDIO_USE_SLIDE_NOTES = 1
FAMISTUDIO_USE_VOLUME_SLIDES = 1
FAMISTUDIO_USE_FAMITRACKER_DELAYED_NOTES_OR_CUTS = 1
FAMISTUDIO_DPCM_OFF              = $c000

.include "famistudio_ca65.s"

.segment "HEADER"
    .byte "NES", $1a, 2, 1, $00, $00, 0, 0, 0, 0, 0, 0, 0, 0

.segment "MUSIC"
fs_music:
.segment "DPCM"
fs_dpcm:

.segment "CODE"
fs_reset:
    sei
    cld
    ldx #$40
    stx $4017
    ldx #$ff
    txs
    inx
    stx $2000
    stx $2001
    stx $4010
:   bit $2002
    bpl :-
    txa
:   sta $0000,x
    sta $0100,x
    sta $0200,x
    sta $0300,x
    sta $0400,x
    sta $0500,x
    sta $0600,x
    sta $0700,x
    inx
    bne :-
:   bit $2002
    bpl :-
    lda #$3f                    ; backdrop $3F00 = black: rendering is off, so the screen shows this colour
    sta $2006
    stx $2006
    lda #$0f
    sta $2007
    stx $2006
    stx $2006
    lda #1                      ; NTSC
    ldx #<fs_music
    ldy #>fs_music
    jsr famistudio_init
    lda #0
    jsr famistudio_music_play
    lda #$80
    sta $2000                   ; NMI on
fs_idle:
    jmp fs_idle

fs_nmi:
    pha
    txa
    pha
    tya
    pha
    jsr famistudio_update
fs_tick:
    pla
    tay
    pla
    tax
    pla
fs_irq:
    rti

.segment "VECTORS"
    .word fs_nmi, fs_reset, fs_irq
