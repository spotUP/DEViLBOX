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
