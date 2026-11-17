; DEViLBOX Game Boy player, hUGEDriver route (plan 2026-11-17-gameboy-native-player, Phase 2h-5h).
; Assembled once at dev time by tools/build-gb-player.sh; the exporter (src/lib/export/gb/hugeSong.ts)
; writes the song blob (hUGEDriver song descriptor + data, absolute pointers) into bank 1 at $4000
; and recomputes the global checksum. Dual-mode DMG + GBC (rgbfix -c, decision D3): the APU is the same.
include "include/hardware.inc"

SECTION "VBlank", ROM0[$0040]
    reti

SECTION "Header", ROM0[$0100]
    nop
    jp start
    ds $150 - @, 0          ; rgbfix fills the logo, title, CGB flag and checksums

SECTION "Main", ROM0[$0150]
start:
    di
    ld sp, $DFFF
    ld a, $80
    ldh [rAUDENA], a        ; NR52: APU on (the Furnace dispatch never writes it)
    ld a, $FF
    ldh [rAUDTERM], a       ; NR51: all channels to both sides (hUGE pans with effect 8)
    ld a, $77
    ldh [rAUDVOL], a        ; NR50: full master volume
    ld hl, song
    call hUGE_init
    ld a, IEF_VBLANK
    ldh [rIE], a
    xor a
    ldh [rIF], a
    ei
idle:
    halt
    nop
player_tick::                    ; one hUGEDriver tick per VBlank (59.7275 Hz); the harness counts executions here
    call hUGE_dosound
    jr idle

; 32 KiB ROM-only cart linked tiny (rgblink -t): $0000-$7FFF is one flat space, so the song gets 24 KiB
; without MBC banking (hUGEDriver reads song data through plain pointers).
SECTION "Song", ROM0[$2000]
song::
    ds $6000, $FF
