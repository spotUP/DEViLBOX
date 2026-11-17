---
date: 2026-11-17
topic: Native NES ROM player for DEViLBOX/Furnace songs, 1:1 on real hardware (full scope)
status: research, read-only; items marked UNVERIFIED were not checked in this pass
---

# Native NES player: fidelity-first design

Scope note: this file is the REPO side only. Mapper choice, multi-chip cart combinations, emulator support (MAME, Mesen) and open driver licences (FamiStudio, FamiTone2, GGSound) are researched in `thoughts/shared/research/2026-11-17-nes-external.md`. Statements on those topics in sections 2, 4 and 7 here are from memory, not verified, and that file wins on any conflict.

Owner scope (2026-11-17): maximum. All expansion chips, several chips per song, DPCM with bank switching,
NTSC + PAL + Dendy, subsongs, full player screen, large mapper, and a first test song that exercises every feature.
Decisions below are only about HOW.

## 1. Which Furnace NES chip classes are register-level models

Lesson from ZX: the capture must be of writes a real driver could issue. All classes below queue or dump real chip register writes, so a per-frame register stream is the right capture. Furnace-only behaviour is listed per row (`F` = third-party/furnace-master/src/engine/platform).

| Chip | Class / file | Register-level? | Evidence | What a 6502 per-frame driver cannot do |
|---|---|---|---|---|
| 2A03 | DivPlatformNES `F/nes.cpp` | Yes. `rWrite` pushes (addr,val) into a queue and `addWrite` into the dump (nes.cpp:31) | $4000-$4017 writes at nes.cpp:309-526 | (a) PCM mode ($4011 raw): per-sample `doWrite(i,0x4011,..)` inside the sample loop (nes.cpp:80-92) = sub-frame writes at the sample rate, with anti-click ramp. (b) DPCM mode writes $4015/$4010/$4012/$4013 per note and loop restart (nes.cpp:440-526). (c) Furnace drains `writes` queue spread across the tick (nes.cpp:122-215), so intra-frame spacing exists in the capture. |
| 2A03 pseudo writes | same | Not hardware: `0xffff0001` = DAC rate, `0xffff0004` = DPCM bank (nes.cpp:464,503) | | Capture must treat 0xffffxxxx as control events, not APU writes. |
| VRC6 | DivPlatformVRC6 `F/vrc6.cpp` | Yes: `chWrite` = $9000/$A000/$B000 + reg, plus $9003/$F000-$F002 (vrc6.cpp:26,513-517) | pseudo addrs 0xffff0001+(chan<<8), 0xffff0002 (vrc6.cpp:197,233,279) = PCM-ish saw/pulse sample mode | VRC6 PCM sample mode (channel written at sample rate). |
| MMC5 | DivPlatformMMC5 `F/mmc5.cpp` | Yes (APU-like pulses at $5000-$5015, PCM at $5011); command list has SAMPLE_POS | | MMC5 PCM = sample-rate writes. |
| FDS | DivPlatformFDS `F/fds.cpp` | Yes, but `rWrite` also writes the emulator directly (fds.cpp:28); $4040-$407F wave RAM (fds.cpp:107-111), $4080/$4084-$4087 mod (173-184), wave RAM only writable while $4089 bit7 set | uses nes_nsfplay core `F/sound/nes_nsfplay/nes_fds.*` | Wave and mod table loads need $4089 enable windows; mod table is written through $4088 (two-entry-per-write) UNVERIFIED in this pass. |
| N163 | DivPlatformN163 `F/n163.cpp` | Yes, via $4800/$F800 address+data port; wave RAM shares the channel register file | CMDs WAVE_POSITION, WAVE_LENGTH, GLOBAL_WAVE_LOAD, CHANNEL_LIMIT (n163.cpp:422-475) | Chip updates one channel per 15 CPU cycles; channel count 1..8 sets the rate. Furnace models that; the driver does not need to, the chip does. |
| VRC7 | DivPlatformOPLL `F/opll.cpp` (platform NES_VRC7 = 9 in src/engine/furnace-dispatch/platforms.ts:14) | Yes: register/data pair $9010/$9030 | | VRC7 has no write-readback; custom patch = registers $00-$07 write. Fidelity depends on which emulator's OPLL patch ROM is used (the VRC7 patch table differs from YM2413's; exact set UNVERIFIED). |
| Sunsoft 5B | DivPlatformAY8910 with `sunsoft` flag (`F/ay.cpp:30,235,336`) | Yes: $C000 address / $E000 data | sunsoft volume table ay.cpp:73 | 5B has no stereo, no I/O ports; envelope and noise are plain AY. Note: Furnace halves period (ay.cpp:235-237) so the register stream (not notes) carries it. |

Rates (`F/nes.cpp:933-940`): NTSC chip clock = COLOR_NTSC/2 (1.789773 MHz), PAL = COLOR_PAL*3/8 (1.662607 MHz, 2A07), Dendy = COLOR_PAL*2/5 (1.773448 MHz). Furnace songs have arbitrary tick rates (Hz field, virtual tempo). A hardware driver ticks once per NMI (60.0988 / 50.007 Hz). Handling: capture at the song's real tick rate; if tick rate is not the console frame rate, either (a) schedule ticks off a timer IRQ (mapper IRQ on VRC/MMC5/MMC3, or DMC IRQ) at the exact rate, or (b) resample to frames and flag as non-1:1. Recommended: (a) when the mapper has a cycle/scanline IRQ, since it keeps 1:1.

Other hardware-only issues a Furnace model glosses over (all UNVERIFIED against Furnace code in this pass, known from hardware):
- Length counter, sweep unit and triangle linear counter run off the 2A03 frame counter (4-step/5-step, $4017). Furnace writes $4017 as the song says; the driver must set the same frame-counter mode and must not re-trigger $4003/$4007 when only a pitch change is meant (writing $4003 restarts duty phase and envelope; Furnace avoids by writing only when `freqChanged`, nes.cpp:413-418). Replaying the exact write sequence preserves this.
- Pulse sweep mute on target > $7FF; negate difference between pulse 1 and 2 (one's vs two's complement). The stream replays the same writes so hardware matches, but an emulator with a wrong sweep unit would differ from Furnace; the nsfplay core is accurate.
- DMC cycle steal changes CPU timing during sample playback (1-4 cycles per DMC fetch); a cycle-timed $4011 loop must account for this.

## 2. Expansion chips: mapper, emulator, how several coexist

| Chip | Real cart mapper (iNES id) | Notes |
|---|---|---|
| 2A03 only | NROM(0), UxROM(2), MMC1(1), MMC3(4), or a custom mapper with a swappable $C000 window | DMC reads $8000-$FFFF only, DPCM addresses are $C000 + 64*n (nes.cpp:458 `(addr>>6)&0xff`). UxROM fixes the last bank at $C000, so DPCM bank-switching needs the window switchable: Furnace records bank = addr>>14 (nes.cpp:461). |
| VRC6 | VRC6 (24 / 26, Konami) | PRG up to 512 KB |
| VRC7 | VRC7 (85) | $9010/$9030; cannot coexist with VRC6 (same $9000/$A000/$B000 decode region) |
| MMC5 | MMC5 (5) | PRG up to 1 MB, own PCM channel; $5000-$5015 |
| N163 | Namco 163 (19) | $4800/$F800; collides with nothing in APU, but conflicts with MMC5 only in mapper hardware terms |
| 5B | Sunsoft FME-7 / 5B (69) | $8000/$A000 mapper regs, $C000/$E000 sound |
| FDS | Famicom Disk System, `.fds` image | Audio regs $4040-$4097 exist on the Famicom side only; a ROM cart cannot carry it. Needs FDS BIOS RAM-adapter, or an emulator that maps FDS audio for a cart-based RAM program (NSF-style). |

A real single cart that carries several expansion chips does not exist (mapper registers collide, and none of the mappers carry two sound chips). So:
- Real hardware 1:1: one ROM per mapper/chip family; Furnace songs using several expansion chips cannot all run on one real cart. Songs mixing e.g. VRC6 + N163 would only be NSF-style multichip, which exists in emulators and NSF players (Mesen/Mesen2, NSFPlay, Furnace itself) UNVERIFIED which of them accept a `.nes` file with several expansions rather than an NSF.
- Therefore the player needs two output targets: (1) per-chip real cart ROMs (bold 1:1 claim on hardware), (2) an NSF-style multi-expansion container for emulators when a song mixes chips. NSFExporter already exists (src/lib/export/NSFExporter.ts, 385 lines, header says VRC6, VRC7, FDS, MMC5, N163, S5B optional). A native-player ROM version of multichip can be an emulator-only custom mapper (all chip register spaces decoded) - plan for this in the one emulator that supports it, and say so in the export dialog.
- Emulators available locally: `which mame` = /opt/homebrew/bin/mame (NES driver `nes` exists with .nes/.unf/.unif cartridges); `mesen` NOT installed; ~/mame/roms has only spec128, spectrum, vectrex.zip (no NES BIOS needed for carts, but nothing NES there; NES carts load from a file path). MAME expansion-audio support per mapper: UNVERIFIED (`mame -listslots nes` returned nothing, `nes` is a cartridge-only device). Recommendation: Mesen2 (GPL-3, archived 2026) is the reference for VRC6/VRC7/MMC5/N163/5B/FDS audio; MAME NES core covers 2A03 + maybe VRC6/VRC7 UNVERIFIED; check before the first export.

Per-chip fidelity limits:
- VRC7: custom patches = registers $00-$07 of the OPLL-style patch; built-in patches 1-15 come from the chip's internal ROM, which differs from the YM2413 table (exact ROM values per emulator UNVERIFIED - Furnace's opll.cpp selects a VRC7 patch set; use the same set the target emulator uses, or driver output will differ in timbre).
- FDS: wavetable must be loaded with $4089 bit7 set and written $4040-$407F; modulation table via $4088; modulation counter reset ($4085) must be reproduced. Capture already contains these writes (fds.cpp:107-111, 173-184), so replay is 1:1 if the stream delivers them in order with the enable window.
- N163: channel count n makes each channel update every 15*n cycles; output gets noisier above 4 channels (hardware effect, reproduced by the chip). CPU time on the 6502: only register writes, so cost is small; the cost is wave RAM sharing - the 128 bytes of RAM hold both waves and channel registers, so a stream must never overwrite channel regs with wave data.
- MMC5: PCM at $5011 and the extra mode bits; mapper + audio on same IRQ-capable chip - good for a sample-rate timer.
- VRC6: saw accumulator behaviour and PCM mode; chip is deterministic, replay is 1:1.
- 5B: only 1 chip variant; envelope/noise are replayed as registers.
- 2A03: DMC IRQ can desync with rate; PCM writes ($4011) via a cycle-exact loop on the 6502 (about 1789773/rate cycles per sample, 224 at 8 kHz). Stream must carry them as timed events, not per-frame values.

## 3. Capture path reuse

- Vectrex/ZX: `ChipRecordingSession` + `parseRegisterLog` from `src/lib/export/ChipExporter.ts`; `captureToFrames`/`encodeFrames` (delta + mask) and `packBanks` in `src/lib/export/zx/zxAyStream.ts`; Vectrex capture `src/lib/export/vectrex/vectrexCapture.ts:22` records the playing song through the worklet (`furnace_dispatch_reg_writes` -> `dispatchRegCapture.ts`).
- NES capture status: `VGMExporter.ts` already maps NES APU (VGM_CMD.NES_APU, clock 1789773, lines 52, 121, 287, 431). `dispatchRegCapture.ts` `vgmChipTypeOfPlatform` currently maps YM2610 and AY8910 explicitly (lines 29-41); NES/VRC6/FDS/N163/MMC5/VRC7 were NOT confirmed mapped in this pass (my grep for them in that file returned nothing, only 40: AY8910). Needed: extend the platform switch to return the NES-family chips and to preserve 0xffffxxxx control events, or capture to a NES-native frame struct like AyFrame.
- Existing: `src/lib/export/NSFExporter.ts` (385 lines), `ChipExporter.ts:122` 'NES Sound Format', `canExportNSF(writes)` at 194, `exportToNSF` at 313. NSF is a player (the NSF driver is the emulator) - reusable for: register-write to chip-address tables (APU_REGS in NSFExporter.ts:27+) and expansion detection.
- Nothing for FamiTracker/FamiStudio export exists (grep for famitracker/ftm in src and tools matched only unrelated files).
- Build chain: Vectrex built by `tools/build-vectrex-player.sh` (lwasm -> player.bin + player.json with patch offsets; queued via `~/.claude/bin/buildq`). Pattern to copy for NES: `tools/build-nes-player.sh` -> `public/nes/player.bin` + `player.json`, with a staleness guard like `tools/mame-wasm-staleness.py`.
- Toolchain: `ca65`, `ld65`, `cc65` at /opt/homebrew/bin; asm6 and nesasm absent. Use ca65/ld65 (zlib licence UNVERIFIED).

## 4. Data budget (estimates, not measured)

Frame record: 2-byte presence mask over the 22 APU regs ($4000-$4015/$4017) + values only when changed. Typical Furnace NES song: 4-10 changed bytes per frame (volume envelopes change often, pitch macros), so ~6-12 B/frame -> 360-720 B/s NTSC. 32 KB NROM (minus ~2 KB player + CHR for font/bars) holds ~50-80 s of 2A03 data; no room for DPCM beyond a few KB (DPCM max 4081 B per sample; shared $C000 window).
Expansion chips add: VRC6 +9 regs, MMC5 +8, N163 +up to 128 wave bytes/ch + 8 ch regs, FDS +64 wave +mod, VRC7 +14, 5B +14. With all active: 20-40 B/frame -> 1.2-2.4 KB/s. Wave/patch loads are rare and cheap if delta-coded.
Therefore: stream-compress (LZ/dictionary of repeated frames, similar to Furnace's own pattern repetition; or store the song as pattern data, which is a re-implementation and not the register-stream model) and use a large mapper (128 KB-1 MB). A 3-minute song at 700 B/s uncompressed = 126 KB. Mapper recommendation for the large 2A03 target: MMC3-class or a custom UNROM/ 512 KB with fixed player bank + switchable 16 KB data bank + a separate switchable DPCM window (MMC1 can't switch $C000 separately from $8000 in common modes; MMC3 maps $C000 8K via R7/R6 swap bit; UNROM-512 fixed last bank blocks DPCM switching). Choose: mapper 4 (MMC3) for 2A03-only: IRQ counter available for tick timing (scanline IRQ counts, resolution coarse: exact-rate needs the DMC or CPU-cycle IRQ; MMC3 IRQ is scanline-based so approximate the tick rate to ~113.667 cycle granularity UNVERIFIED), 8 KB bank windows for DPCM at $C000.

## 5. Full-design feature list with hardware/emulator cost

1. 2A03 five channels, sweep, length counter, linear counter, frame-counter mode: pure register replay; zero extra cost. Emulator accuracy of sweep matters.
2. DPCM with loop and bank switching: needs $C000-$FFFF window bank-switchable: mapper cost (MMC3/MMC5/VRC with 8K banks; NROM/UxROM cannot).
3. PCM mode ($4011 raw): cycle-timed loop, ~220 cycles/sample at 8 kHz; steals the main loop; screen update only on vblank; needs IRQ/DMC timer.
4. Expansion chips: per mapper cart (table in section 2) plus emulator multichip target; FDS not on a plain cart.
5. Several chips at once: NSF-style container; real cart impossible; capture must tag chip per write.
6. NTSC/PAL/Dendy: three timing profiles; 2A07 period tables differ (nes.cpp:933-940) so noise/DMC rate tables differ: store raw register writes, not notes, so no table needed; tick rate set from region; video mode 256x240 vs 50 Hz.
7. Subsongs: song table in ROM, restart by reset of stream pointers; mapper bank per song.
8. Player screen: PPU only (NES: 256x240, 64 sprites 8/line, 25 of 54 colours; plan page row 146). Per-channel bars for every chip channel (up to 5 + 3 VRC6 + 8 N163 + 1 FDS + 2 MMC5 + 3 5B + 6 VRC7 = ~28 bars): sprites for bars (64 sprites, 8/line) is the limit; use background tiles with attribute colouring (16x16 attribute area limit). Scroller via nametable scroll register; song info via CHR font. Each bar needs live channel volume: derive from the replayed register values (shadow state in RAM, ~100 B).
9. Large mapper: UNIF/NES 2.0 header with PRG size up to 1 MB; emulator support varies: UNVERIFIED for custom mappers.
10. First test song with every feature (section 6).

## 6. First test song: coverage table

Furnace effect codes live in `F/engine/platform/<chip>.cpp` `case DIV_CMD_*` handlers (and the effect table in `F/engine/engine.cpp`, commands mapped by `F/engine/dispatch.h` DIV_CMD_* names). A song covers a feature only if the capture shows the matching register write. Check method for all rows: record the song through the capture, then assert per chip that every register in the row appears in the log at least once (a table-driven test in src/lib/export/__tests__/, same shape as zxAyStream tests), and also play it in the emulator and compare to the Furnace render.

| Chip | Features | Effect/CMD source | Registers that must appear |
|---|---|---|---|
| 2A03 | sweep, envelope mode, length counter, count mode, linear counter, DMC (+loop), noise mode, duty, all macros | nes.cpp:695 SWEEP, 709 ENV_MODE, 717 LENGTH, 723 COUNT_MODE, 727 LINEAR_LENGTH, 737 DMC | $4001/$4005, $4000/$4004/$400C, $4003 len bits, $4008 reload, $4010 loop, $4011, $4012/$4013, $4015, $4017 |
| VRC6 | pulse duty, saw, PCM sample mode | vrc6.cpp:26 chWrite | $9000-$9002, $A000-$A002, $B000-$B002, $9003 |
| MMC5 | pulses, PCM | mmc5.cpp (SAMPLE_POS command) | $5000-$5007, $5010/$5011, $5015 |
| FDS | wavetable, modulation table, mod depth/speed/pos/auto | fds.cpp:318-357 MOD_DEPTH/HIGH/LOW/POS/WAVE/AUTO | $4040-$407F, $4080, $4082/$4083, $4084-$4087, $4088, $4089 |
| N163 | wavetables at max channel count (8), wave pos/length, global load, channel limit | n163.cpp:422-475 | wave RAM via $4800/$F800 incl. channel reg $7F, all 8 channels |
| VRC7 | built-in patches 1-15, custom patch | opll.cpp (INSTRUMENT handler) | $9010/$9030 regs $00-$07 (custom), $10-$38 |
| 5B | tone, noise, envelope (shape+period), mixer | ay.cpp:30,336 | $C000/$E000 regs 0-13 incl. R13 |

Gap: the exact effect-code list per chip (hex effects like 1x/2x/3x) is in Furnace docs (`F/doc/` UNVERIFIED location); the song author needs it before writing the song; the DEViLBOX MCP `get_mcp_help` topic exists for format families but no NES topic is documented here.

## 7. Real-driver alternative

- FamiStudio sound engine (MIT, UNVERIFIED licence beyond plan row 88): supports 2A03 + all expansions; requires converting `.fur` into FamiStudio's song model; it is a pattern/effect driver, not a register-stream driver. A faithful Furnace render in effects such as arpeggios, macros with release loops, and sample timing is not guaranteed 1:1: the driver's rounding and period tables differ. This is exactly the ZX lesson.
- FamiTone2 (zlib/free): 2A03 only, no 1:1 with Furnace macros.
- GGSound (UNVERIFIED licence): 2A03 only.
- Register stream: 1:1 by construction against Furnace's dispatch (the same writes), costs more ROM, and is not a "real" driver but it plays exactly what Furnace's chip emulation emitted; hardware differences then trace to the emulator/hardware difference only. The "ZX lesson" applies in the other direction: because the stream is the Furnace-driver output, the risk is the Furnace driver's tick-quantisation vs hardware, not a chip model.

## Recommendation

Register-stream player, one ROM per mapper/chip family, ca65/ld65 build modelled on tools/build-vectrex-player.sh, stream = per-tick delta records with chip tag + timestamp (frame or IRQ tick) + control events for PCM and DPCM bank; MMC3-class or MMC5/VRC mappers per chip; NSF-style container for multichip emulator target (NSFExporter reuse). Verify emulator support per chip in Mesen2 and MAME before building.

## Decisions for the owner (how, not whether)

1. Capture format: (a, recommended) frame/tick records with chip tag + sub-frame timestamp events for PCM/DPCM; (b) frames only (loses $4011 PCM).
2. Multi-chip songs: (a, recommended) NSF-style emulator target + warning, one real cart per chip family; (b) custom emulator-only mapper; (c) one ROM per chip with channel splitting (loses 1:1).
3. 2A03 mapper: (a, recommended) MMC3 (8K windows, DPCM at $C000, IRQ); (b) MMC5 (PCM + IRQ, 1 MB); (c) custom mapper (needs custom emulator).
4. Tick source for non-60/50 Hz songs: (a, recommended) mapper IRQ / DMC IRQ timer; (b) NMI + resample (not 1:1).
5. Stream compression: (a, recommended) LZ-style frame dictionary decoded in 6502 (small RAM); (b) none (limits to ~1 min per 32 KB, fits only NROM-size).
6. Emulator for verification: (a, recommended) Mesen2 installed; (b) MAME NES driver (already installed; expansion audio support UNVERIFIED).
7. Player screen bars for ~28 channels: (a, recommended) background-tile bars with attribute colouring; (b) sprite bars (sprite per line limit).
8. First test song: (a, recommended) one song per chip family covering table 6 plus a combined multichip file for the NSF-style target.

## Owner answers

Owner answers 2026-11-17 (AskUserQuestion): (1) Targets: all three. Custom multi-chip cart .nes, NSFe, and per-chip ROMs on the original cart types (VRC6 mapper 24/26, VRC7 85, MMC5 5, N163 19, 5B 69, FDS disk). (2) Regions: three streams (NTSC/PAL/Dendy), region detected at boot. (3) Install Mesen2 for automated register-log checks; normal window, never fullscreen. (4) Full-rate raw samples (DPCM $4011 writes, MMC5 PCM); level bars and scroller freeze while a raw sample plays. Defaults chosen by me (implementation, not owner veto): music source is a raw per-frame register stream like Vectrex (1:1 by construction); custom cart uses mapper-31-style 4 KB banking up to 8 MB, NES 2.0 header with custom multi-chip decode.

## Not checked

- Mesen/MAME expansion audio support, exact iNES mapper ids' IRQ granularity, FamiStudio/GGSound licences, FDS $4088 details, VRC7 patch ROM variants, location of Furnace effect documentation, Furnace tick-rate handling for the NES tick clock, dispatchRegCapture NES-family mapping.
