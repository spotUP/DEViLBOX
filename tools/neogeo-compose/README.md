# neogeo-compose

Write Neo Geo (YM2610, extended FM, chip 0xa6) songs as TypeScript specs and build them into `.fur`
files with the repo's own Furnace exporter (`exportFurnaceModule`). Each build is linted against what
ngdevkit's `furtool.py` converts for the nullsound driver, so a song that builds clean loses nothing
on the way into the game.

## Run

```sh
npx tsx --tsconfig tsconfig.app.json tools/neogeo-compose/run.ts <song-name> <out.fur>
```

`<song-name>` is a file in `songs/` without `.ts`. The tool prints the file size, the order list and
the V ROM bytes of every ADPCM-B sample. Lines tagged `[BUILD]` or `[LINT]` are problems and make the
exit code 1 (the file is still written for inspection). Then run furtool on the result and record its
warnings.

## Write a song

A spec exports `default function (repoRoot: string): NeoGeoSongBuilder`. Use the helpers in
`src/lib/export/neogeo/neoGeoCompose.ts`:

- `NEO` names the 17 channels: `FM1`, `OP1`-`OP4` (FM 2 split into operators), `FM3`, `FM4`,
  `SSG1`-`SSG3`, `A1`-`A6` (ADPCM-A, never for music), `B` (ADPCM-B).
- `new NeoGeoSongBuilder(name, speed, rows)`, then `addInstrument`, `pattern()` and `order.push(...)`.
- `pattern.put(channel, row, { note: 'F-4', ins, vol, fx: [[0x04, 0x34]] })`. `vol` is in the
  channel's own range (FM 0-127, SSG 0-15, ADPCM-B 0-255).

`songs/gumbirds-title.ts` is the worked example: hand-made FM patches, SSG volume and arpeggio
macros, an ADPCM-B kick sample and effects on every phrase.

## Rules the lint enforces

- No ADPCM-A anywhere: it is reserved for sound effects.
- FM 2 operator channels take only effects 03, 04, 0A, EA and ED, and share one algorithm and feedback.
- SSG macros: sequence mode, one shared loop point, no release, delay or speed, no pitch, phase reset
  or noise-frequency macro. SSG has no panning.
- Only effects in furtool's table; 12-15 on FM channels only.
- The last pattern in the order ends with a `0B` loop jump.

When the driver grows (new effects or macros in furtool), update the sets at the top of
`neoGeoCompose.ts` in the same commit.

## Scramble hardware (two AY-3-8910)

A spec that returns a `ScrambleSongBuilder` (`src/lib/export/neogeo/scrambleCompose.ts`) builds a
Scramble-board `.fur` instead: AY-3-8910 at 1789772 Hz, 58.3 Hz tick, written by
`exportFurnaceAyScramble`. The Neo Geo lint does not run; exporter warnings print as `[EXPORT]`.

```
npx tsx --tsconfig tsconfig.app.json tools/neogeo-compose/run.ts peter-motif /path/to/motif.fur
```

- `new ScrambleSongBuilder(name, speed, rows, 6)`: 6 channels = two chips, 3 = one chip.
- Channels: `AY.LEAD`, `AY.BASS`, `AY.DRUMS` (chip 0), `AY.AY1_A`, `AY.AY1_B`, `AY.AY1_C` (chip 1).
- Instruments: `ayInstrument([ayMacro(AY_MACRO.VOL, [15, 13, 11], loop)])`.
- Volume column: `vol: ayVol(0..15)`.
- Effects BossGame's player builds: 04 0A 0B 0D 0F FF. 00 01 02 03 EC ED export with a warning and
  BossGame's `tools/ay_music.py` rejects them.
- Check the result: `python3 -I tools/ay_music.py --dump music/<tune>.fur` in the BossGame repo.

`songs/peter-motif.ts` is the smallest example.

### Test tunes outside the player contract

`songs/test-fx1.ts` .. `test-fx6.ts` write BossGame's feature test tunes (plan
`thoughts/spot/2026-11-14-fur-features-plan.md` in the BossGame repo). They use features
`ay_music.py` does not accept yet, so the dump rejects some of them until BossGame builds the feature.

- `builder.keepOutsideContract = true`: effects and macros outside the player contract are kept
  in the file with a warning instead of dropped.
- `builder.linearPitch = 0 | 1 | 2`: Furnace compat flag "linear pitch" (file compat byte 1).
  Unset writes 1.
- `note: 'REL'` writes a note release (`~~~`, file note 181). `'OFF'` is note off (180).
- `AY_MACRO.PITCH` (4) and `AY_MACRO.PHASE_RESET` (14) join VOL, ARP, DUTY, WAVE.
- `ayMacro(code, data, loop, { release, delay, speed, mode })`: macro release point, delay, speed
  and mode. Without `keepOutsideContract` the exporter keeps only what the player contract allows.
