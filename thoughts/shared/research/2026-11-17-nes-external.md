---
date: 2026-11-17
topic: Native NES ROM player for Furnace songs - external research (hardware, emulators, drivers, chip limits, toolchain)
status: draft (web research; items marked UNVERIFIED need a primary-source or bench check)
---

# NES native player: external research

Scope: maximum (VRC6, VRC7, FDS, MMC5, N163, Sunsoft 5B, several at once; DPCM with banking; NTSC/PAL/Dendy; subsongs; large mapper; per-channel level bars). Repo side is covered elsewhere.

## 1. Carts, mappers, multi-chip

| Chip | Hardware | Mapper(s) | Notes |
|---|---|---|---|
| VRC6 | Konami VRC6 cart | iNES 24 (Akumajou Densetsu), 26 (Madara, Esper Dream 2; A0/A1 swapped) | 2 pulse + saw; regs $9000-$B003 |
| VRC7 | Konami VRC7 cart | 85 | 6 FM channels, 15 fixed patches + 1 custom; only Lagrange Point used audio |
| FDS | Famicom Disk System RAM adapter (console add-on, not a cart) | FDS disk / NSF | Real hardware needs the adapter or a flash cart that emulates it |
| MMC5 | Nintendo MMC5 cart | 5 | 2 pulse (no sweep) + 8-bit PCM $5011 |
| N163 | Namco 163 cart | 19 | 1-8 wavetable channels |
| Sunsoft 5B | Sunsoft 5B/FME-7 cart | 69 | 3 AY-like tone channels, noise, envelope; only Gimmick! |

Sources: https://www.nesdev.org/wiki/VRC6_audio , https://www.nesdev.org/wiki/VRC7_audio , https://www.nesdev.org/wiki/FDS_audio , https://www.nesdev.org/wiki/MMC5_audio , https://www.nesdev.org/wiki/Namco_163_audio , https://www.nesdev.org/wiki/Sunsoft_5B_audio . The mapper-number-to-chip mapping is from the wiki's per-chip pages and my own knowledge (the wiki's category page did not state it in the fetched text; UNVERIFIED in-session).

**Multi-chip on one cart: no commercial cart ever had two expansion audio chips.** The wiki list of games with expansion audio shows each game under one chip (https://www.nesdev.org/wiki/List_of_games_with_expansion_audio). Hardware multi-chip players are described as essentially nonexistent, with no authentic standard (https://nesdev.nes.science/f6/t8784.xhtml). So multi-chip exists only as: NSF/NSFe files (emulator/NSF-player semantics) or a custom homebrew board.

**NSF**: header byte $07B bitmask: bit0 VRC6, 1 VRC7, 2 FDS, 3 MMC5, 4 N163, 5 Sunsoft 5B, 6 VT02+, 7 reserved. Banking $5FF8-$5FFF = eight 4 KB banks over $8000-$FFFF, init values in header $070-$077; with FDS, $5FF6/$5FF7 bank $6000-$7FFF and $8000-$DFFF becomes writable. Region byte $07A (bit0 PAL, bit1 dual), NTSC speed $06E, PAL $078. https://www.nesdev.org/wiki/NSF
**NSFe/NSF2**: NSFe adds chunks `regn` (NTSC/PAL/Dendy bitfield; X=2 on INIT for Dendy), `mixe` (per-chip loudness, explicitly for multi-chip homebrew), `tlbl`, `auth`, `BANK`, `DATA` (>1 MB unusable); NSF2 adds IRQ support and uses version byte 2. https://www.nesdev.org/wiki/NSFe
**Register conflicts when several chips are enabled in one NSF** (NSF page): VRC6 vs VRC7 at $9010/$9030; N163 $F800 overlaps a mirror of 5B's $E000 data port (set 5B address port $C000 to $0E/$0F first); VRC7/N163 $E000 mute bit collides with 5B data port; FDS makes $8000-$DFFF writable (keep code/data out of it or accept corruption). A multi-chip driver must write only canonical (non-mirrored) addresses, and the song data must not rely on any chip's mapper side effects.

**Can a .nes ROM do multi-chip?** Only with a mapper that decodes all these ranges. No standard iNES/NES 2.0 mapper does this. Options:
- A. NSF (or NSFe) file with the built-in player shell (the player is the NSF INIT/PLAY routine; the "shell" screen is drawn by a wrapper). NSF has no video, so a level-bar screen needs a ROM wrapper.
- B. One .nes per chip on the real mapper (24/26, 85, 5, 19, 69; FDS as disk image). Real hardware exists for every one, but no multi-chip.
- C. Homebrew mapper (new NES 2.0 mapper, custom CPLD/FPGA board, or emulator-only): NSF-style 4 KB banking (mapper 31 has exactly this, no audio: https://www.nesdev.org/wiki/INES_Mapper_031 ) plus all six chips decoded. Runs on emulators that implement it; on real hardware only on a custom board.
- D. Use mapper 31 for DPCM/data banking in emulators and put chip I/O at the true addresses.

**Flash carts (real hardware):**
- Everdrive N8 Pro: 8 MB PRG, 204 mappers (v2.14), plays NSF including expansion audio, FDS images, Famicom expansion audio supported; mapper 31 reported on the older N8. https://www.nesdev.org/wiki/Everdrive_N8_Pro . A retailer page lists VRC6, VRC7, 5B, N163 for its NSF player; firmware notes mention MMC5 fixes and FDS in NSF (https://dragonbox.de/en/everdrives-flashcarts/everdrive-n8-pro). Per-chip in-game support and multi-chip NSF support: UNVERIFIED; ask Krikzz notes / test with https://github.com/bbbradsmith/nes-audio-tests .
- PowerPak: FDS, VRC6, N163, 5B audio via EXP6 pin (needs console mod to mix); MMC5 audio and VRC7 not supported; plays NSF. https://nesdev.org/wiki/PowerPak
- Net: real-hardware multi-chip is not documented on any flash cart; treat multi-chip NSF on N8 Pro as UNVERIFIED and test.

## 2. Emulators

Installed here: `mame` (/opt/homebrew/bin/mame), no mesen/fceux/nestopia on PATH or in /Applications. `~/mame/roms` has no NES entries (the grep was empty). Not run, per rules.
- **Mesen2** (GPL v3): macOS native nightlies for Intel (macOS 13) and Apple Silicon (macOS 14), require SDL2; GitHub repo is an archive at about 2.1.1, successor MesenCE (nesdev-org/MesenCE). https://github.com/SourMesen/Mesen2 . Headless/test runner with Lua: third-party notes cite `--testRunner`, `--enableStdout`, `--doNotSaveSettings`, `--timeout=30`, Lua `emu.stop()` for exit code, and `--debug.scriptWindow.allowIoOsAccess=true` for io/os (https://skillsmp.com/skills/jonathanpeppers-dotnes-github-skills-nes-emu-debug-skill-md , UNVERIFIED against `--help`). Lua has memory write callbacks (docs index: https://www.mesen.ca/docs/ ), so register logging of $4000-$4017, $9000-$B003, $9010/$9030, $4040-$408A, $5000-$5015, $4800/$F800, $C000/$E000 is scriptable. Mesen's NES core is the reference-quality one for VRC6/VRC7/N163/FDS/MMC5/5B; multi-expansion NSF in Mesen2: UNVERIFIED.
- **MAME**: has MMC5 sound device (`mmc5snd`, PCM IRQ) per https://raw.githubusercontent.com/mamedev/mame/master/src/devices/bus/nes/mmc5.cpp . Other chips and NSF/multi-chip: UNVERIFIED; MAME NES is less accurate for expansion audio. MAME has a Lua console (`-autoboot_script`) and runs in a normal window, but needs a NES driver set and BIOS-free software list.
- **FCEUX**: Lua scripting (memory.registerwrite), windowed; mapper 31 supported since 2.2.3 (mapper 31 page). Expansion audio: VRC6/VRC7/N163/5B/FDS/MMC5 implemented; accuracy of VRC7 and multi-chip UNVERIFIED. No headless mode.
- **Nestopia**: NSF with expansion chips tested on nesdev (https://nesdev.nes.science/f6/t12326.xhtml); no Lua. Weak for automation.
- **NSFPlay** (Windows, nsfplay by bbbradsmith, command-line WAV export): good for multi-chip NSF reference audio and `mixe` handling: https://github.com/bbbradsmith/nsfplay/releases/
- **Test material**: https://github.com/bbbradsmith/nes-audio-tests (expansion audio test ROMs/NSFs for N163, VRC6, VRC7).
- Recommendation for automation: Mesen2/MesenCE headless + Lua write logging, diff against the Furnace capture stream per frame. Install is not done here (rules).

## 3. Drivers

| Driver | Expansion chips | Effects | Licence | 1:1 with Furnace? |
|---|---|---|---|---|
| FamiStudio sound engine (ca65, NESASM, ASM6) | VRC6, VRC7, FDS, 5B, N163 (one at a time per export; MMC5 and EPSM in app) | FamiStudio effect set (vibrato depth > 13 unsupported in engine) | App MIT per repo sidebar; engine licence not separately confirmed | No. Own envelope/arp/slide model; no Furnace macro/effect parity |
| FamiTone2 | none (readme: "Expansion chips are not supported"); DPCM instrument 0 only | minimal | Free-use (UNVERIFIED terms) | No |
| FamiTone5 | UNVERIFIED | UNVERIFIED | UNVERIFIED | No |
| GGSound | no expansion found | game-oriented, ca65/ASM6 | Unlicense (author, nesdev post, 2019; verify repo) | No |
| FamiTracker NSF driver / 0CC / Dn-FT replayers | per exported track (multi-chip variant exists: FamiTracker guide warns chips' memory can overlap) | FT effects | GPL | No (different tracker semantic) |
| Furnace | Supports NES 2A03/2A07 + VRC6, VRC7, MMC5, FDS, 5B, N163, Family Noraebang (OPLL). Exports: VGM, ZSM, TIunA, SAP-R, audio. **No NSF or NES ROM export listed.** | full Furnace | GPL | n/a |

Sources: https://www.nesdev.org/wiki/Audio_drivers (notes FamiStudio engine is FamiTone2-derived, "extensive expansion audio support"), https://github.com/BleuBleu/FamiStudio , https://github.com/tildearrow/furnace , https://tildearrow.org/furnace/doc/latest/1-intro/faq.html (Furnace FAQ: NSF import only via NSFImport->.ftm). FamiStudio importing .fur: not found in any source (UNVERIFIED, likely no). Furnace VGM export is chip-complete for NES but is a time-stamped register log, useful as a cross-check, not as the ROM format.

**Comparison with a raw per-frame register stream** (the Vectrex approach):
- A driver port (FamiStudio etc.) needs a Furnace->driver converter that cannot reproduce Furnace's macros, wavetable sequences, effects, instruments exactly; every mismatch is a fidelity bug. One chip at a time only.
- A raw stream replays exactly what the Furnace engine wrote (captured through our Furnace WASM), so it is 1:1 by construction for every chip and every effect, multi-chip is free (it is just a union of writes), and the 6502 code is a dumb writer. Costs: ROM size (mitigated by per-frame delta, per-chip register shadow, dictionary of repeated frames, 4 KB bank banking), and one stream per region (see 4).
- Verdict: raw stream wins on fidelity and scope; a driver only wins on ROM size. Hybrid later (pattern/macro-level compression) is possible without losing 1:1 if verified against the capture.

## 4. Per-chip limits for the 6502 writer

- **VRC7**: after the address write to $9010 wait >= 6 CPU cycles; after the data write to $9030 wait >= 42 cycles before the next write to $9010/$9030 (https://www.nesdev.org/wiki/VRC7_audio). Cost per register: about 48+ cycles of padding. 6 channels x 3 regs ($10-$15, $20-$25, $30-$35) = 18 writes per frame worst case about 900 cycles plus custom patch (8 regs) when changed; ok in a 29780-cycle frame. Volume: 0 loudest, no silent value (key-off needed). Reset bit in $E000 mutes and ignores writes. Mixing is write-only (no status). Custom patch only instrument 0; hence Furnace instruments with more than one custom patch cannot coexist: capture decides by writes (also a Furnace-side property).
- **N163**: channels 1-8; per-channel update rate = CPU / 15 / enabled-channel-count; 8 channels gives audible 14.9 kHz whine; wave RAM $80 bytes shared with channel regs ($40-$7F, 8 bytes per channel, channel 8 at $78-$7F); at least $40 bytes for waves; $7F bits 4-6 = enabled channel count -1 and volume; 4-bit samples, two per byte; address port $F800 (bit 7 autoincrement, does not wrap), data $4800; do not auto-increment-read RAM while DMC plays. $E000 bit 6 enables sound. https://www.nesdev.org/wiki/Namco_163_audio . Quality rule: Furnace songs using 7-8 N163 channels will whine on hardware, identically to Furnace emulation's multiplex setting (Furnace has a "channel limit" per song); the 6502 must write the count register exactly as captured.
- **FDS**: wave RAM $4040-$407F is writable only when $4089 bit 7 is set (write enable) and, per the wiki, only when sound output is stopped/held; so a wave change = set $4089 bit 7, write 64 bytes, clear bit 7 (the output holds at current level while writing, which produces a click unless volume 0 or the channel halted). Modulation table: set $4087 bit 7, write 32 entries via $4088 (always all 32; ring buffer advances each write), then write $4085 = 0 and clear $4087 bit 7; first tick is delayed. Volume gain changes apply at wave position 0; master volume $4089 bits 0-1 (full, 2/3, 2/4, 2/5). Needs 64 + 32 writes of about 4 cycles each; a handful of cycles is not a problem but do it only on frames that capture changed it. https://www.nesdev.org/wiki/FDS_audio . NSF with FDS: $8000-$DFFF is RAM and writable (data hazard); real FDS needs disk or flash cart.
- **MMC5**: $5011 is 8-bit write PCM; writing $00 triggers an IRQ rather than silence-level; writes ignored in read mode ($5010 bit 0 reads from $8000-$BFFF). Pulses: no sweep, no $5001, periods < 8 do not mute (ultrasonic), length counter runs 2x, envelope clock about 240 Hz fixed, polarity inverted; status $5015 only low 2 bits. https://www.nesdev.org/wiki/MMC5_audio . A 1:1 PCM stream needs a timed write loop (IRQ or cycle-counted); per-frame stream gives only about 60-ish samples per second so true sample playback requires a dedicated sample-rate loop that suspends the video code, or the PCM-read mode with a timer (MMC5 scanline IRQ is poor at audio rates).
- **DPCM / $4011**: sample address = $C000 + A*64, length = L*16+1 (max 4081 bytes), address wraps $FFFF -> $8000; 16 rates, NTSC periods 428..54, PAL 398..50, Dendy uses the NTSC table (https://www.nesdev.org/wiki/APU_DMC). $4011 raw writes set the 7-bit level at any time; if the DMC clocks the counter the same cycle the write can be lost/misapplied; on NTSC 2A03 DMC DMA corrupts reads of $4016/$4017, $2007 and $2002 (use DPCM-safe controller code; the 2A07 PAL does not). Bank switching: the page does not cover it; known practice is a mapper with a switchable $C000-$FFFF window (mapper 31/NSF-style 4 KB: keep the sample's bank mapped while it plays; the driver code and vectors in a fixed bank, or sample banks switched only after the last byte is fetched - typically wait for $4015 bit 4 clear or IRQ). With 4 KB banks a sample must not cross a bank unless both neighbours are mapped consecutively. Needs verification by test ROM in Mesen2 (UNVERIFIED how emulators handle mid-sample bank switches).
- **VRC6**: $9003 write 0 at init; saw rate above 42 wraps; enable clear/set resets phase; mapper 24 vs 26 address-line swap affects the addresses the ROM must write.
- **Sunsoft 5B**: write $C000 (reg select) then $E000 (value); tone/noise/envelope generators never halt; period 0 acts as 1; louder than other chips (set `mixe` or accept).
- **Clocks/frames** (https://www.nesdev.org/wiki/Clock_rate): NTSC 1.789773 MHz, 60.0988 Hz, 29780.5 cycles/frame, VBlank 2273 cycles; PAL 1.662607 MHz, 50.0070 Hz, 33247.5 cycles/frame, VBlank 7459; Dendy 1.773448 MHz, 50.5027 Hz, 35464 cycles/frame, VBlank 2273 (NTSC-like). Consequences: period values (all chips driven from the CPU clock) differ per region, so a "frame stream" captured at NTSC is wrong in pitch and tempo on PAL/Dendy: capture one stream per region from Furnace (Furnace has NTSC/PAL/Dendy clock choice in the NES chip config; verify in repo research), or sped-up/period-rescaled stream. Region detect at boot by counting cycles between two vblanks (standard NESdev technique) selects the stream. Dendy needs a third detection result, since its VBlank is NTSC-length but frame is PAL-length.

## 5. Toolchain

`ca65`, `ld65`, `cc65` are installed (/opt/homebrew/bin, brew cc65). `asm6` is not installed (`brew` has no formula that I verified; asm6 is usually built from source). Use ca65/ld65 (Mesen debugger integrates CC65/ASM6; FamiStudio engine also targets ca65).

## Recommended architecture

1. **Format**: NES 2.0 ROM, custom mapper in the 'NSF-style' family (mapper 31 4 KB banking, $5FF8-$5FFF) extended with a documented multi-chip decode; the same data also exported as NSFe (header $07B multi-chip mask, `regn` for Dendy, `mixe`, `tlbl` per subsong) for NSF players. Use the player shell (video, level bars) only in the .nes build.
2. **Player**: ca65 6502 raw-frame-stream writer. Per frame: read delta-compressed (chip, reg, value) records, write them to the canonical addresses with per-chip delay macros (VRC7 6/42 cycles, N163 address+data port, FDS write-enable sequence, 5B select+data), keep a 256-byte shadow per chip for level bars. NMI draws bars from volume shadow; PLAY runs from NMI or a loop synchronised to NMI. DPCM from a fixed-window bank scheme.
3. **Per-chip real-hardware builds** (mapper 24/26, 85, 5, 19, 69, FDS disk) generated from the same stream, so hardware-testable even if multi-chip is emulator-only.
4. **Regions**: one stream per region (NTSC/PAL/Dendy), boot-time detection; period tables rescaled by Furnace at capture time.
5. **Verification**: Mesen2/MesenCE headless Lua write log vs Furnace capture, diffed per frame per register, plus nes-audio-tests, plus NSFPlay for reference audio of multi-chip.

## Owner decisions

1. Multi-chip target: (a) NSFe + custom-mapper .nes (emulators / custom board), per-chip real-mapper builds for hardware [Recommended]; (b) per-chip ROMs only; (c) NSF only.
2. Music source: (a) raw per-frame register stream from Furnace WASM capture [Recommended]; (b) FamiStudio-engine port with converter; (c) hybrid later.
3. Region handling: (a) three streams + boot detection [Recommended]; (b) NTSC only first; (c) one stream with timer rescale.
4. Large mapper: (a) mapper-31 style 4 KB banking, up to 8 MB on N8 Pro and DPCM windowing [Recommended]; (b) UNROM512/other existing mapper (loses the NSF-compat).
5. First emulator for automation: (a) Mesen2/MesenCE headless Lua (needs install, owner approval) [Recommended]; (b) FCEUX; (c) MAME (already installed, weakest for expansion audio).
6. FDS delivery: (a) .fds disk image + NSF [Recommended]; (b) mapper-style FDS-RAM emulation in the custom mapper only.
7. MMC5 PCM and DPCM sample accuracy: (a) full sample-rate PCM loop when a PCM song is detected, level bars frozen during it [Recommended]; (b) skip PCM.

## Unverified / gaps

Mesen2 headless flag names and multi-expansion NSF support; MAME per-chip audio; FCEUX/Nestopia multi-chip behaviour; Everdrive N8 Pro per-chip and multi-chip NSF; FamiStudio engine licence terms; FamiTone5; whether FamiStudio imports .fur; mid-sample DMC bank switching behaviour; asm6 via brew. Searches were summaries via WebFetch/WebSearch, not primary datasheets.
