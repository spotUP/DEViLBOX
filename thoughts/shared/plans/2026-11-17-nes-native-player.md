---
date: 2026-11-17
status: draft
topic: NES native ROM player - raw per-frame register stream from the Furnace WASM capture, replayed by a ca65 6502 player; custom multi-chip cart, NSFe, per-chip original-cart ROMs
related: thoughts/shared/research/2026-11-17-nes-native-player.md, thoughts/shared/research/2026-11-17-nes-external.md, thoughts/spot/2026-11-15-snes-tad-export.md ("NEXT native ROM player: NES"), thoughts/shared/plans/2026-11-15-hardware-rom-export.md (player screen, lines 117-204)
---

# NES native ROM player

All sizes, cycle counts and durations below are UNMEASURED estimates unless a row says "measured".

## Rule

Playback inside DEViLBOX stays the Furnace WASM engine. The ROM is only an export target. No TypeScript port of Furnace sound code, no register-level chip model in TS. The 6502 player is a dumb writer of what the Furnace dispatch emitted (1:1 by construction, same as the Vectrex player).

## Binding decisions (owner 2026-11-17, from the research "Owner answers")

1. Targets, all three: custom multi-chip `.nes` (NES 2.0, mapper-31-style 4 KB banking up to 8 MB, custom multi-chip decode), NSFe, and per-chip ROMs on original carts (VRC6 24/26, VRC7 85, MMC5 5, N163 19, 5B 69, FDS disk).
2. Three region streams (NTSC/PAL/Dendy), region detected at boot.
3. Mesen2 installed for automated register-log checks; normal window, never fullscreen.
4. Full-rate raw samples (DPCM/$4011 writes, MMC5 PCM, VRC6 PCM mode); bars and scroller freeze while a raw sample plays.
5. Scope maximum: all expansion chips, several chips per song, DPCM with bank switching, subsongs, full player screen, large mapper. No "later phase" trimming. First test song covers every effect and wavetable.
Defaults I chose (not owner decisions): raw per-frame register stream like Vectrex; ca65/ld65 toolchain (installed at /opt/homebrew/bin).

## Reuse map (search done 2026-11-17: grep for vectrex, ChipRecordingSession, dispatchRegCapture, NSFExporter, zxAyStream)

| Need | Existing module | Use |
|---|---|---|
| Record a playing song through the worklet | `src/lib/export/vectrex/vectrexCapture.ts` (`recordVectrexCartridge`, `orderPassLength`, `cutToFrames`), `ChipRecordingSession` + `parseRegisterLog` in `src/lib/export/ChipExporter.ts` | copy as `nesCapture.ts` |
| Raw dispatch writes to log entries | `src/lib/export/dispatchRegCapture.ts` (`vgmChipTypeOfPlatform`, `batchesToRegisterWrites`; today maps only YM2610 family + AY8910) | extend (Phase 1) |
| Frame/delta encode, bank packing | `src/lib/export/zx/zxAyStream.ts` (`captureToFrames`, `encodeFrames`, `packBanks`), `vectrex/vectrexCartridge.ts` (`runLengthFrames`, `decodeVectrexStream`, `VECTREX_CTRL_REPEAT`) | extract shared parts if generic, else copy pattern |
| Cartridge builder + patched player binary | `vectrex/vectrexCartridge.ts` (`fetchVectrexPlayer`, `buildVectrexCartridge`), `tools/build-vectrex-player.sh` (builds `public/vectrex/player.bin` + `player.json`, run through `buildq`) | copy as `tools/build-nes-player.sh` -> `public/nes/` |
| NSF header, APU register tables, expansion detection | `src/lib/export/NSFExporter.ts` (`APU_REGS`, `canExportNSF`, `exportToNSF`), `ChipExporter.ts` 'NES Sound Format' entry | reuse tables + detection; NSFe chunks are new |
| Export dialog | `src/hooks/dialogs/useExportDialog.ts` (`ExportMode` incl. `vectrexCart`, `handleExportVectrexCart`, `furnaceAyScrambleExportAvailable`) | add `nesRom` mode (Phase 11) |
| Platform ids | `src/engine/furnace-dispatch/platforms.ts` (NES 8, NES_VRC7 9, NES_FDS 10, VRC6 27, FDS 29, MMC5 30, N163 31, VRC7 48; 5B is AY8910 with sunsoft flag) | chip tags |
| Player screen spec | hardware-rom-export plan lines 117-204 (NES row: 256x240, 64 sprites/8 per line, colour per 16x16 attribute area; assets via `tools/hwplayer/assets.ts`) | Phase 8 |

## Phases (in order)

### Phase 0 - Tooling and unverified-fact checks (no product code)
- Install Mesen2 (macOS, needs SDL2; owner approved). Verify headless flags against `--help`: `--testRunner`, `--timeout`, Lua `emu.stop()`, io access flag. Record real flags in `tools/nes/README`-style header of the check script (comment, not a new doc).
- Write three tiny hand-made ROMs with ca65 (no DEViLBOX data): (a) writes a known register sequence per chip, (b) mid-sample DPCM bank switch, (c) multi-chip decode. Run in Mesen2 to settle risks R1, R2, R3 below.
- Done-check: Lua log of a hand ROM matches the expected write list for 2A03, VRC6, VRC7, N163, FDS, MMC5, 5B; Mesen2 multi-expansion behaviour recorded.
- Verification: Mesen2 Lua write callbacks (memory write on $4000-$4017, $5000-$5015, $9000-$B003, $9010/$9030, $4040-$408A, $4800/$F800, $C000/$E000) to a text log; compare with expected list.

**Result 2026-11-17 (Phase 0 done).** Tools: Mesen 2.1.1 (macOS ARM64 zip from the GitHub release, NOT in Homebrew; copied to `~/Applications/Mesen.app`), cc65 2.19 via brew. Sources and check: `tools/nes/phase0/` (`run-checks.sh` header holds the real flags).
- Real headless form: `Mesen --testRunner --timeout=N --doNotSaveSettings --enableStdout <script.lua> <rom>`. `--timeout` exits 255 on expiry. Stop with `emu.stop(code)`: the help text says `emu.exit`, which does not exist. Lua `print()` reaches stdout, `emu.log()` does not. `io`/`os` unavailable by default, so the log goes through stdout. Without a `Settings.json` the first run opens a setup wizard and hangs the runner forever; the script writes `{"FirstRun":false}`. No window opens.
- (a) 42 writes across 2A03, VRC6, VRC7, N163, FDS, MMC5, 5B on the bus ranges match the expected list exactly, order included. Caveat: the callback sees CPU bus writes regardless of mapper, so this proves the logger and write sequence, not chip behaviour.
- (b) Mapper 31 DMC sample ($CF00, 513 bytes, crosses $D000) with both banks switched at frame 10: reads were $AA x87, $11 x169, $22 x256 (then byte 513 at $D100, outside the log range). Mesen2 applies a bank switch per DMC byte fetch.
- (c) NSF with expansion byte $3F loads: "Sound Chips: VRC6, VRC7, FDS, MMC5, Namco 163, Sunsoft 5B"; the 42 init writes are logged. A custom multi-chip `.nes` mapper was not tried: Mesen2 has no mapper for it (mapper 31 only banks).
- Not verified: audible/register-state result of the chips (Mesen2 `emu.getState()` exposes only apu/cpu/mapper/ppu keys in the NSF run, no per-chip state); real hardware; FDS `.fds` BIOS need.

### Phase 1 - NES-family capture mapping
- Files: `src/lib/export/dispatchRegCapture.ts` (extend `vgmChipTypeOfPlatform` or add a separate NES-native entry point so VGM mapping is not forced where VGMExporter has no support), `src/engine/furnace-dispatch/platforms.ts` (read only), new `src/lib/export/nes/nesCapture.ts`, tests in `src/lib/export/__tests__/` (same shape as the zxAyStream tests).
- Verify the actual address space from Furnace source before coding (count from the dispatch, not grep): 2A03 `$4000-$4017`; VRC6 `$9000-$9003/$A000-$A002/$B000-$B002`; VRC7 `$9010/$9030` register/data; FDS `$4040-$408A`; MMC5 `$5000-$5015`; N163 `$4800/$F800`; 5B `$C000/$E000`.
- Control events, not writes: pseudo-addresses `0xffff0001` (DAC rate, 2A03; VRC6 `0xffff0001+(chan<<8)`), `0xffff0002` (VRC6), `0xffff0004` (DPCM bank). Capture keeps them as tagged events, never as APU writes.
- Sample-rate `$4011` writes (and VRC6/MMC5 PCM) are kept as timed events with sample-accurate position (worklet `sample` field), not folded into the per-frame record.
- Tick rate: record the song's real Furnace tick rate (Hz) with the capture (needed by Phase 6).
- Region: NTSC/PAL/Dendy capture = three recordings with the chip clock set per region in the Furnace NES config; verify Furnace exposes this (R7).
- Done-check: unit test feeds synthetic batches for each chip and asserts chip tag, address, value, event kind; real-song capture of the Phase 9 song shows every row of its coverage table.
- Verification: capture log vs Furnace `furnace_dispatch_reg_writes` raw batches (count and order equal).

### Phase 2 - Stream format and encoder
- Files: new `src/lib/export/nes/nesStream.ts`; reuse `captureToFrames`/`encodeFrames`/`runLengthFrames`/`packBanks` patterns.
- Format: per tick, chip-tagged delta records (presence mask per chip + changed values), run-length for repeated/empty ticks (as Vectrex `VECTREX_CTRL_REPEAT`), control opcodes: set-bank, raw-sample-block (sample-rate event list), wave/patch load blocks (FDS 64+32 bytes, N163 wave RAM, VRC7 custom patch) with the required enable-window bracketing emitted by the player, end/loop. Compression: LZ-style frame dictionary decoded in 6502 with small RAM (decision 5 from research, recommended).
- Three region streams + subsong table. `decodeNesStream` test decoder (round-trip, like `decodeVectrexStream`).
- Done-check: round-trip test: encode -> decode equals the captured write list per tick for every chip, including PCM events.
- Verification: round-trip test; size report per chip (raw vs encoded, unmeasured until run).
- BUILT 2026-11-17: `src/lib/export/nes/nesStream.ts` + `src/lib/export/__tests__/nesStream.test.ts` (round trip passes for all 7 chips incl. timed PCM and control events, with and without 4 KiB bank splitting; loop tick restored). Format spec is the file's header comment. Summary: tick header byte (0 empty, 1-0x7f chip mask, 0xFE repeat-n, 0xC0-0xFD / 0xFF static dictionary refs, 0x80 end, 0x81 loop u24, 0x82 events prefix, 0x83 set-bank); chip block = (reg index, value) items, ascending/fixed-register run items for wave RAM, FDS $4088 table and VRC7 patch, terminated 0xFF; per subsong static dictionary of tick records (1-byte refs for the 62 most used); region stream = subsong table (u24 offset + u16 tick centiHz) + subsong streams. Three region streams from `encodeNesStreams` (a missing PAL/Dendy capture falls back to NTSC). Register numbers stored for VRC7/N163/5B; player port mapping is in the header comment. Wave-enable bracketing ($4089, $F800 auto-increment, OPLL patch) is not in the stream: the capture already contains those writes, so the stream replays them verbatim.
- MEASURED (synthetic 480-tick capture, 60 Hz, all chips active; NOT a real song, so ratios are indicative only; raw = 3 bytes per write/PCM, 5 per control; each chip encoded alone including tick framing): nes 1474 -> 764, vrc6 1685 -> 587, vrc7 168 -> 96, fds 870 -> 435, mmc5 504 -> 290, n163 912 -> 358, s5b 864 -> 333; all chips together 6477 -> 1761. Re-measure on the Phase 9 song capture.
- Open: dictionary is static per subsong (6502 reads it in ROM, zero RAM); no cross-tick LZ back-references. Revisit if real-song sizes miss the ROM budget.

### Phase 3 - ca65 player core (2A03 only, NROM-size, NTSC)
- Files: `public/nes/player.s` (+ includes), `tools/build-nes-player.sh` (copy of `build-vectrex-player.sh`: ca65/ld65, `player.bin` + `player.json` with title/data offsets, run via `~/.claude/bin/buildq --purpose "<session>: <task>" -- tools/build-nes-player.sh`), staleness guard modelled on `tools/mame-wasm-staleness.py`.
- Player: NMI tick, stream decoder, canonical-address writer, per-chip register shadow (for bars), subsong restart.
- Done-check: ROM builds; Mesen2 runs it.
- Verification: Mesen2 Lua log of $4000-$4017 vs the capture, per tick per register, on a 2A03-only .fur.

**Result 2026-11-17 (Phase 3 built).** `public/nes/player.s`, `nes.cfg`, `player.bin` (iNES NROM-256, 32784 bytes: stream area $8000-$EFFF = 28672 bytes at file offset 16, code at $F000), `player.json` (offsets for stream, title, start subsong, nmi address), `tools/build-nes-player.sh`, `tools/nes-player-staleness.py` (`--files` / `<base> <head>`, fails when player.s/nes.cfg/build script change without player.bin+json).
- Player: one stream tick per NMI, decodes empty, mask, chip blocks (items, $80 ascending and $81 constant runs), dictionary refs (short and long), repeat, loop, end; chip 0 (2A03) is written to $4000-$4017 and mirrored in a RAM shadow at $0200; other chips' blocks are parsed and skipped; events prefix parsed and skipped (PCM and control events ignored); set-bank skipped (Phase 4); `restart` (A = subsong) walks the subsong table and dictionary.
- Verified: `src/lib/export/__tests__/nesPlayerMesen.test.ts` encodes a 2A03 capture (run item, dictionary repeats, empty ticks, VRC6/FDS blocks mixed in) with `encodeNesStreams`, patches it into player.bin, runs Mesen2 headless with a Lua write callback ($4000-$4017) plus an exec callback on the NMI address, and the per-tick write list equals the capture for END (then silent) and for a LOOP (three passes). Init writes ($4017, $4010) come before the first NMI and are excluded by the tick markers.
- Not done: tick rate is the NMI rate (tick-rate dividers, Phase 6); PCM/control events; other chips; PAL/Dendy; banking.

### Phase 4 - Mapper, banking, large cart
- Files: `public/nes/player.s` banking code, `src/lib/export/nes/nesCartridge.ts` (copy of `vectrexCartridge.ts` structure: `fetchNesPlayer`, `buildNesCartridge`, header, size check).
- Custom mapper: mapper-31-style 4 KB banking at $5FF8-$5FFF (eight 4 KB windows over $8000-$FFFF), NES 2.0 header up to 8 MB PRG, fixed player bank, stream banks switched by the decoder, DPCM window kept mapped while a sample plays.
- DPCM at $C000-$FFFF: sample must not cross a bank unless neighbours are mapped consecutively; packer enforces this; bank switch only after the last byte fetched (wait on $4015 bit 4 or DMC IRQ). Uses the captured `0xffff0004` bank events.
- Done-check: a >32 KB stream plays across bank boundaries without a gap; DPCM sample in a switched bank plays.
- Verification: Mesen2 Lua log across a bank boundary; DMC address/length registers in the log match capture.

**Phase 4 result.** Mapper 31 (NES 2.0 header, 32 KB player image, `$5FF8-$5FFF`) is what Mesen2 runs, and it caps PRG at 1 MB (8-bit bank registers, 256 banks), not the 8 MB above; 8 MB needs a different mapper. Layout: window 0 ($8000) = subsong's first bank, window 1 ($9000) = current stream bank (SET_BANK / LOOP), windows 4-6 ($C000-$EFFF) = DPCM window, window 7 = fixed player bank (last bank, power-on state). SET_BANK is relative to the subsong start; streams are now encoded with bankSize 4096 (Phase 3 included); the dictionary is capped at 255 entries (256 wrapped the u8 count to 0). `nesCartridge.ts` builds the ROM (power-of-two bank count, max 255 stream banks). DPCM_BANK control (4) = first ROM bank of the three-bank window; applied at once if the DMC is idle, else deferred until $4015 bit 4 clears (checked at NMI and event parse). Limit: DMC loop mode never goes idle, so a deferred switch never applies. Verified in Mesen2 headless: a >32 KB stream (4400 ticks, 5 writes per tick) across bank boundaries plus a loop back over the boundary, per-tick $4000-$4017 write log equals the capture; DPCM window stays on the old bank while the DMC fetches, then switches. UNVERIFIED: real audio from DMC samples (only the window mapping and $4015 are checked), PAL, hardware.

### Phase 5 - Expansion chip writers (custom multi-chip cart)
- Files: `public/nes/player.s` chip modules, `nesCartridge.ts` custom-mapper decode documentation (NES 2.0 submapper note in header comment).
- Per chip, canonical non-mirrored addresses only: VRC6 ($9003 init 0), VRC7 (address write then >= 6 cycles, data write then >= 42 cycles padding), FDS ($4089 bit 7 set -> 64 wave bytes -> clear; mod table via $4088, 32 entries, $4085 reset, $4087 bit 7 handling), MMC5 ($5000-$5015, $5011 PCM), N163 ($F800 address with autoincrement, $4800 data; channel-count register $7F written exactly as captured; never overwrite channel regs with wave data), 5B ($C000 select then $E000 data; select $0E/$0F before using $F800 on a shared build).
- Done-check: multi-chip test ROM from the Phase 9 song reaches every row of the per-chip coverage tables.
- Verification: Mesen2 Lua log vs capture, per chip. Note: write gaps (VRC7 6/42 cycles) make exact intra-frame timing differ from Furnace's; the comparison is on (order, address, value) per tick, not cycle position (state this in the check script header).

### Phase 6 - Tick source for non-60/50 Hz songs, regions
- Files: `public/nes/player.s` (region detect at boot by counting cycles between two vblanks; NTSC 29780.5, PAL 33247.5, Dendy 35464 cycles per frame; select NTSC/PAL/Dendy stream), IRQ tick module.
- Tick: NMI when the song tick equals the frame rate; otherwise timer IRQ (MMC5 / VRC IRQ cycle mode / DMC IRQ) at the exact song rate. MMC3-style scanline IRQ is too coarse. Custom mapper: add a cycle IRQ to the custom decode (same as VRC cycle mode). Which IRQ per original-cart ROM: VRC6/VRC7 cycle IRQ, MMC5 scanline (coarse; R5), N163 and 5B (5B has a cycle IRQ; N163 has IRQ only in some variants, UNVERIFIED), FDS (disk IRQ timer). A song rate that no IRQ source reaches is flagged in the export dialog as non-1:1 resampled.
- Done-check: a 1:1 song at an odd Furnace rate (e.g. 75 Hz) ticks at that rate; PAL and Dendy boot-detect pick the right stream.
- Verification: Mesen2 Lua: cycle delta between tick-start register writes vs expected; run the same ROM with Mesen2 NTSC, PAL, Dendy region settings.

### Phase 7 - Full-rate raw samples
- Files: `public/nes/player.s` sample loop, `nesStream.ts` raw-sample-block opcode.
- Cycle-counted $4011 loop (about 1789773/rate cycles per sample, 224 at 8 kHz, plus DMC cycle steal while DPCM plays). MMC5 $5011 and VRC6 PCM mode same loop. The main loop (video, bars, scroller) freezes while the loop runs (owner decision 4); music ticks continue inside the loop only for the sample channel.
- Done-check: a PCM-mode song plays; bars freeze and resume.
- Verification: Mesen2 Lua $4011/$5011 write log with CPU cycle stamps vs the captured sample-rate event list (tolerance rule written down before the first run).

### Phase 8 - Player screen
- Files: `public/nes/player.s` PPU code, `public/nes/*.chr` generated, `tools/hwplayer/assets.ts` (from the hardware-rom-export plan; font/logo/layout are generated, never hand-drawn), `thoughts/shared/plans/2026-11-15-hardware-rom-export.md` open design items stay as defined there.
- Layout per the shared spec: header (small DEViLBOX logo corner + platform/chip name), info block (song, author), status line (`Song n/m`, `MM:SS`, play/pause), bar field, scroller line. Joypad: play/pause, next/previous subsong. Text upper-case ASCII from one 8x8 font, truncated at export time.
- Bars: up to ~28 channels (5 + 3 VRC6 + 8 N163 + 1 FDS + 2 MMC5 + 3 5B + 6 VRC7). Background tiles with attribute colouring (sprite limit 8/line; colour per 16x16 area). Height from the player's register shadow (~100 B RAM). Grouping rule when bars exceed the budget: open owner decision (hardware-rom-export decision 8).
- Scroller: nametable scroll register; text from song comments; empty-comment fallback is an open owner decision (decision 6 there).
- Done-check: screen shows all items for a 2A03-only and a full multi-chip song.
- Verification: text checks first (Mesen2 Lua reads nametable/OAM state, asserts strings and bar tile values); a visual check only via a haiku subagent on a Mesen2 window opened with a purpose title ("<session>: NES player screen check"), normal window, never fullscreen; screenshots deleted after the answer.

### Phase 9 - Full-coverage first test song and coverage tables
- Files: new `.fur` under `public/data/songs/` (name chosen at authoring), table-driven test `src/lib/export/nes/__tests__/nesCoverage.test.ts`, effect help via `get_mcp_help` (never guessed; there is no NES topic yet, add one if absent: extend the MCP, do not hack around it).
- Song covers every Furnace NES and expansion effect, all macros, plus the register tables below. Authoring uses the MCP and `docs/AGENT_TRACKER_GUIDE.md` (read first); read cells back after writes.
- Per-chip register coverage (every register must appear at least once in the capture log):

| Chip | Features | Registers that must appear |
|---|---|---|
| 2A03 | sweep, envelope mode, length counter, count mode, linear counter, noise mode, duty, DMC with loop, delta counter ($4011) | $4000-$4017 incl. $4001/$4005, $4008, $400C, $4010 loop, $4011, $4012/$4013, $4015, $4017 |
| VRC6 | pulse duties, saw, PCM sample mode | $9000-$9003, $A000-$A002, $B000-$B002 |
| MMC5 | two pulses, PCM | $5000-$5007, $5010/$5011, $5015 |
| FDS | wavetable, modulation table, mod depth/speed/pos/auto | $4040-$407F, $4080, $4082/$4083, $4084-$4087, $4088, $4089 |
| N163 | wavetables at 8 channels, wave position/length, global load, channel limit | wave RAM via $4800/$F800, channel reg $7F, all 8 channels |
| VRC7 | built-in patches 1-15, custom patch | $9010/$9030 regs $00-$07, $10-$38 |
| 5B | tone, noise, envelope shape + period, mixer | $C000/$E000 regs 0-13 incl. R13 |

- Because VRC6 and VRC7 share $9000 decode, and the song mixes all chips, it is a custom-cart/NSFe test; split variants per original cart (Phase 10) are generated from the same capture by channel filter, not authored separately.
- Done-check: coverage test passes (every row); an uncovered register is a test failure, not a warning.
- Verification: coverage test on the capture; Mesen2 Lua log then must contain the same register set.

### Phase 10 - NSFe and per-chip original-cart ROMs
- NSFe: reuse `NSFExporter.ts` (`APU_REGS`, expansion detection, header $07B mask). New: NSFe chunks `regn` (NTSC/PAL/Dendy), `mixe` (per-chip loudness), `tlbl` (subsongs), `auth`, `BANK`, `DATA`. The NSFe play routine is NSF INIT/PLAY driven by the same stream decoder (shared 6502 core, no video). Keep chip writes off mirrored addresses; keep code/data out of $8000-$DFFF when FDS is on (writable then).
- Per-chip ROMs: mapper 24/26 (VRC6, note A0/A1 swap in 26), 85 (VRC7), 5 (MMC5), 19 (N163), 69 (5B), FDS disk image (`.fds` with the player on disk, FDS BIOS needed). One builder, chip filter on the stream, mapper-specific banking + IRQ include; player screen kept where the mapper has RAM/CHR for it. Multi-chip songs: one ROM per chip family with channel splitting is NOT 1:1 and is refused with a message; multi-chip goes to custom cart / NSFe.
- Done-check: each ROM boots in Mesen2 and plays the chip-filtered song; NSFe loads in Mesen2 and NSFPlay (if available).
- Verification: Mesen2 Lua log per ROM vs capture filtered to that chip; nes-audio-tests ROMs for sanity on VRC7 patch set and N163.

### Phase 11 - Export dialog wiring, end to end
- Files: `src/hooks/dialogs/useExportDialog.ts` (add `nesRom` to `ExportMode`, extension map, `handleExportNesRom` modelled on `handleExportVectrexCart`, availability check like `furnaceAyScrambleExportAvailable`, tempo/rate warning like `ayScrambleTempoWarning`), the export dialog component that renders the `vectrexCart` entry (find it by grep for `vectrexCart`), `src/lib/export/nes/nesCapture.ts`.
- Options in the dialog: target (custom cart, NSFe, per-chip original cart), region(s), subsongs; warnings: non-1:1 tick rate, multi-chip songs on single-chip targets, DPCM bank limits, ROM size.
- Walk: menu item exists, routes to handler, handler records the song (3 region recordings), encodes, builds, downloads; result shown. After any MCP-driven test: `stop`.
- Done-check: click-through on `http://localhost:5174/?quiet` (LOCAL) produces a .nes that Phase 12 verifies. Human test requested at the end with that URL; live deploy only after a push (deploy proof: bundle hash).

### Phase 12 - Automated verification harness
- Files: `tools/nes-rom-check.ts` (resumable, results to `test-data/nes-rom-check.json`, `--only <name>`, `--failed`; run with `nice -n 19`), Lua script `tools/nes/regLog.lua`.
- Flow per song and target: DEViLBOX capture (Phase 1) -> build ROM -> Mesen2 headless with the Lua write-callback log -> normalise both to per-tick (chip, address, value) lists -> diff. PCM events compared in order and count with a stated cycle tolerance. Pass = zero diffs for a 1:1 song.
- Run subset: only the songs/targets the change touched (rule 6a); a full run only to land.
- Done-check: harness green on the Phase 9 song for custom cart and NSFe, and each per-chip ROM.

## Open risks (unverified in the research docs)

- R1 [SETTLED 2026-11-17: flags known; multi-chip NSF accepted; custom multi-chip .nes has no Mesen2 mapper, so it gets bus-write verification only, not chip audio] Mesen2 headless flag names and Lua io access; whether Mesen2 accepts a custom-mapper multi-expansion `.nes` or multi-expansion NSF (nothing confirmed). If not, the custom cart has no automated verifier and needs a different emulator or an own mapper patch.
- R2 [SETTLED for Mesen2 2026-11-17: bank switch applied per DMC byte; hardware and flash carts still OPEN] Mid-sample DPCM bank switch behaviour in emulators and on hardware; per-chip hardware behaviour on flash carts (Everdrive N8 Pro multi-chip) unverified; custom mapper runs only on emulators or custom boards (state it in the dialog).
- R3 [SETTLED 2026-11-17 by reading third-party/furnace-master/src/engine/platform/{nes,vrc6,mmc5,fds,n163,opll,ay}.cpp; counts are the distinct addresses the rWrite/chWrite/immWrite call sites can reach, derived per call site, not grep totals]
  KEY FINDING: the dispatch address is NOT always a CPU bus address. 2A03, VRC6, MMC5, FDS emit real bus addresses; VRC7 emits OPLL register numbers; N163 emits internal sound-RAM addresses; 5B emits AY register numbers (regRemap = reg&0x0f). The $9010/$9030, $4800/$F800, $C000/$E000 ports in the Phase 1 spec are the player's job (it maps register number to port + data), not what the capture holds.
  | Chip (platform id) | Real writes | Count | Pseudo-addresses (0xffff....) |
  |---|---|---|---|
  | 2A03 (8) | $4000-$400C, $400E, $400F (400D unreached: sweep write is c.chan*4, guarded to pulse), $4010-$4013, $4015, $4017, plus $0015 (softReset writes the alias 0x15, not 0x4015) | 22 | 4: 0xffff0000 sample, 0xffff0001 rate, 0xffff0002 stop, 0xffff0004 DPCM bank (0xffff0003 never emitted) |
  | VRC6 (27) | $9000-$9002, $A000-$A002, $B000-$B002 (chWrite c<<12, a&3, a in 0..2), $9003, $F000-$F002 | 13 | 6: 0xffff0000/1/2 + (ch<<8), ch 0 and 1 only (ch 2 saw and pcm-mode ch are excluded in code) |
  | MMC5 (30) | $5000, $5002, $5003, $5004, $5006, $5007, $5010, $5015 | 8 | 3: 0xffff0000/1/2 |
  | FDS (29) | $4023, $4040-$407F (wave RAM, 64), $4080, $4082-$4089 (8; $4081 never written) | 74 | 0 |
  | N163 (31) | sound RAM 0x00-0x7f: wave nibbles via addr>>1 below the channel area, channel regs 0x78-(c<<3)+{0,2,4,6,7}, $7f chanMax | 128 reachable | 0 |
  | VRC7 (48), OPLL core | 0x00-0x07 (custom patch), 0x10-0x15, 0x20-0x25, 0x30-0x35 (6 channels) | 26 | 0 |
  | 5B (AY8910 + sunsoft flag, 17) | AY regs 0x00-0x0f (0x00-0x0d used, 0x0e/0x0f port regs) | 16 | 0 (the 0xffff... lines in ay.cpp are commented out) |
  Traps for the player and capture: (1) the worklet posts pairs as Int32Array, so 0xffff0001 arrives as -65535; `batchesToRegisterWrites` masks `& 0x1FF` and would turn it into a real write to address 0x001, so NES capture must not reuse it (nesCapture.ts reads with `>>> 0`). (2) N163 `rWriteMask(a,v,m)` logs only (a,v): the mask is lost, so a wave nibble write has the other nibble zero in the log; the player must merge nibbles (or Furnace needs addWrite to carry the mask) before this is 1:1. OPEN. (3) VRC7 rhythm/drum addresses (0x0e, 0x16-0x18, 0x26-0x28, 0x36-0x38) exist in opll.cpp but belong to the OPLL variant; not shown to be unreachable for VRC7 (unverified). (4) `poke()` lets the UI/MCP write any address; a capture with pokes can hold addresses outside these sets. (5) Platform ids 9 (NES_VRC7) and 10 (NES_FDS) are compound; nesCapture does not map them (unverified what chip batches they produce). (6) FDS dispatch writes go through doWrite directly; addWrite still logs them, so the capture sees them.
- R4 Capture timing: Furnace drains its write queue spread across the tick, so intra-tick spacing exists; a per-tick player flattens it. Acceptable only if no chip behaviour depends on it (check FDS, DMC, VRC7).
- R5 Tick rates: Furnace NES tick-rate handling not checked; MMC5/MMC3 scanline IRQ is too coarse for exact rates; N163 IRQ availability unverified.
- R6 VRC7 built-in patch ROM differs between emulators and Furnace's `opll.cpp` set (unverified); custom patch only instrument 0.
- R7 [SETTLED 2026-11-17: yes, as a per-system flag] Furnace's NES setFlags reads `clockSel` (0 NTSC, 1 PAL, 2 Dendy: chipClock = COLOR_NTSC/2, COLOR_PAL*3/8, COLOR_PAL*2/5; nes.cpp setFlags, sysDef.cpp clockSel entries), so the three recordings differ in period values. The dispatch engine takes it through `FurnaceDispatchEngine.setChipFlags(flagsStr, platformType)` (worklet message `setChipFlags`, wasm `furnace_dispatch_set_flags`). Not run: no capture was made with clockSel=1/2; the PAL/Dendy tick rate is separate (`setTickRate`).
- R8 FDS: $4088 mod-table details, click while writing wave RAM, FDS BIOS requirement for the `.fds` target.
- R9 ROM size/ratio: all stream and compression numbers are unmeasured; 28-bar screen under the attribute-colour limit unverified.
- R10 Licences: ca65/cc65 licence and any reused open driver code unverified (none planned; stream player is own code).
- R11 Furnace effect-code documentation location and a NES topic in `get_mcp_help` not found; song authoring needs it first.
- R12 Mesen2 GitHub repo is archived (about 2.1.1); successor MesenCE may be the maintained choice.
