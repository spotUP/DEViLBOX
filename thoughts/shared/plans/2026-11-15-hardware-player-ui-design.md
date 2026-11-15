---
date: 2026-11-15
author: spot (design agent)
status: design, not implemented
topic: Playing screen for hardware exports. One player UI per native platform, shared by every song format on that platform, same look on every machine
related: thoughts/shared/plans/2026-11-15-hardware-rom-export.md (drivers, toolchains, emulators), src/index.css (colour tokens), build/icon.png (brand mark)
---

# Hardware player UI design

Design only. No code exists yet. Drivers, toolchains and emulators are in
`2026-11-15-hardware-rom-export.md`; this file covers only what the screen shows.

An animated mock of every screen in this file (native resolution, platform palette,
shared font, the motion rules of section 4) was generated at
`/private/tmp/claude-501/-Users-spot-Code-DEViLBOX/245b4d97-ec4e-44ae-ba78-7251e8f5afdf/scratchpad/playerui/player-mock.html`.
That is a scratch path; copy it somewhere durable if it should be kept. The ASCII
mockups below were printed by the same layout function as the mock, so the two agree.

## Owner decisions already fixed

- Visualizer: one volume bar per channel, height from the channel volume / envelope in driver state.
- Branding: small DEViLBOX logo in a corner only.
- Controls: play/pause and next/previous subsong on the joypad.
- Info: song name, author, elapsed MM:SS, subsong number ("Song 2/5"), chip / platform name, one scrolling text line built from the song comments / message.

Joypad mapping, same on every pad: Left = previous subsong, Right = next subsong,
primary button (A / button 1 / fire) or Start = play/pause. Keyboard machines
(Spectrum, CPC, Atari 8-bit, X16, Amiga) also take cursor left/right and Space.

## 1. Reference layout

Everything sits on an 8x8 tile grid. One layout rule set produces every tile
platform; only four numbers change per platform: columns, rows, margin, bar count.

Zones, top to bottom (T = top margin row, B = first row below the bottom margin, C = columns, mx = side margin):

| Zone | Rows | Columns | Content |
|------|------|---------|---------|
| Logo | T .. T+1 | mx .. mx+1 | 16x16 logo (2x2 tiles) |
| Title | T | mx+3 .. C-mx-1 | Song name, cut at the zone width |
| Author | T+1 | mx+3 .. C-mx-1 | "BY " + author |
| Chip | T+2 | mx .. | Chip name in the bar colour; platform name right-aligned in the dim colour if both fit, else dropped |
| Rule | T+3 | mx .. C-mx-1 | 1 pixel line |
| Bars | T+4 .. B-5 | centred | One bar per channel, bar width = min(4, floor((C - 2 mx) / channels)) tiles, 1 pixel gap |
| Labels | B-4 | under each bar | Channel number 1-9, then A, B, C ... |
| Status | B-3 | mx .. / right | Play or pause glyph + MM:SS on the left, "SONG n/m" on the right |
| Rule | B-2 | | 1 pixel line |
| Scroller | B-1 | mx .. C-mx-1 | Comment / message text, one line, loops |

Bar height in rows = total rows - 2 x margin - 8. Margin is 1 tile on TV machines
(overscan), 2 tiles on NES (attribute alignment, see section 2), 0 on handheld LCDs.

320-wide class (40x28 tiles, Mega Drive shown; Neo Geo, CPC, Atari 8-bit, X16 and Amiga use the same columns):

```
+----------------------------------------+
|                                        |
| @@ EXAMPLE SONG TITLE                  |
| @@ BY AUTHOR NAME                      |
| YM2612 + SN76489            MEGA DRIVE |
| -------------------------------------- |
|        ##                              |
|        ##                   ##         |
|        ##                   ##         |
|        ##             ##    ##         |
|        ##             ##    ##         |
|        ##       ##    ##    ##         |
|        ##       ##    ##    ##         |
|        ## ##    ##    ##    ##         |
|        ## ##    ##    ##    ##         |
|     ## ## ##    ##    ##    ## ##      |
|     ## ## ##    ##    ## ## ## ##      |
|     ## ## ##    ##    ## ## ## ##      |
|     ## ## ##    ## ## ## ## ## ##      |
|     ## ## ##    ## ## ## ## ## ##      |
|     ## ## ## ## ## ## ## ## ## ##      |
|     ## ## ## ## ## ## ## ## ## ##      |
|     ## ## ## ## ## ## ## ## ## ##      |
|     ## ## ## ## ## ## ## ## ## ##      |
|      1  2  3  4  5  6  7  8  9  A      |
| > 01:23                       SONG 2/5 |
| -------------------------------------- |
| THIS LINE IS BUILT FROM THE SONG COMME |
|                                        |
+----------------------------------------+
```

256-wide class (32x24 tiles, Master System shown; Spectrum, DS, SNES and NES use the same columns):

```
+--------------------------------+
|                                |
| @@ EXAMPLE SONG TITLE          |
| @@ BY AUTHOR NAME              |
| SN76489          MASTER SYSTEM |
| ------------------------------ |
|            ###                 |
|            ###                 |
|            ###                 |
|            ###                 |
|            ###                 |
|            ### ###             |
|            ### ###             |
|        ### ### ###             |
|        ### ### ###             |
|        ### ### ###             |
|        ### ### ###             |
|        ### ### ### ###         |
|        ### ### ### ###         |
|        ### ### ### ###         |
|         1   2   3   4          |
| > 01:23               SONG 2/5 |
| ------------------------------ |
| THIS LINE IS BUILT FROM THE SO |
|                                |
+--------------------------------+
```

Legend: `@@` logo, `#` bar, `>` play glyph, `-` rule.

## 2. Per-platform adaptation

### Shared palette roles

Eight roles, mapped from the default DEViLBOX theme tokens in `src/index.css`:

| Role | Token | Hex | Used for |
|------|-------|-----|----------|
| bg | `--color-bg` | `#1a1a1a` | Backdrop |
| rule | `--color-border` | `#383838` | Rules |
| text | `--color-text` | `#f0f0f0` | Title, subsong, scroller |
| dim | `--color-text-secondary` | `#a0a0a0` | Author, platform name, labels |
| bar | `--color-accent` | `#f59e0b` | Bars, chip name, logo horns |
| barlo | `--color-accent-secondary` | `#b45309` | Right edge shade of each bar |
| cap | `--color-accent-highlight` | `#22d3ee` | Peak caps, timer |
| logo | `--color-error` | `#ef4444` | Logo "D" (the app icon is a red D on a dark field) |
| green (optional) | `--color-success` | `#22c55e` | Only if the zone-coloured bars are chosen (section 6) |

Machines with an RGB palette get these values rounded to the bits per channel the
hardware has. Machines with a fixed palette get the nearest fixed entry, listed below.

### Per-platform table

Grid = columns x rows of 8x8 tiles. Bar height is in tile rows; bars move in 1 pixel
steps unless stated. "Checked" names where the hardware numbers came from;
UNVERIFIED means from memory, no document fetched.

| Platform | Grid | Bars x height | Palette | What gets cut | Hardware facts checked |
|----------|------|---------------|---------|---------------|------------------------|
| Mega Drive | 40x28 | 10 x 18 (6 FM + 4 PSG) | Roles at 3 bits per channel (bg `#242424`, bar `#ffb600`) | Nothing | 320x224 and 512-colour palette: Wikipedia. 4 palettes of 16, 2 planes + window, 80 sprites: UNVERIFIED (segaretro fetch was blocked) |
| Master System | 32x24 | 4 x 14 | Roles at 2 bits per channel: bg `#000000`, rule `#555555`, text `#ffffff`, dim `#aaaaaa`, bar `#ffaa00`, barlo `#aa5500`, cap `#00aaff`, logo `#ff5555` | Nothing | 256x192, 32 on screen from 64: Wikipedia. 2 palettes of 16, 8 sprites per line: UNVERIFIED (smspower fetch failed) |
| Game Gear | 20x18 | 4 x 10 | Roles at 4 bits per channel | Platform name; title cut to 17 characters; no margins | 160x144 window and 12-bit palette: UNVERIFIED |
| Game Boy (DMG) | 20x18 | 4 x 10 | 4 shades: bg = darkest, rule and barlo = dark, bar and dim = light, text, cap, logo = lightest | Colour; logo is told apart by shape only; title cut to 17 characters | 160x144, 4 shades, BG palette 1x4: Pan Docs |
| Game Boy Color | 20x18 | 4 x 10 | Roles at 5 bits per channel, 3 BG palettes (text, bars, logo) | Same text cuts as DMG | 8 BG palettes of 4, 15-bit: Pan Docs |
| NES | 32x30, margin 2 | 5 x 18 | Fixed: bg `$0F`, dim and rule `$10`, text `$30`, bar `$27`, barlo `$17`, cap `$2C`, logo `$16`, green `$2A`. 4 BG palettes: text (black, grey, white, orange), bars (black, dark orange, orange, cyan), logo (black, red, orange), zones (black, green, orange, red) | Timer is white, not cyan (no cyan in the text palette). Caps drop if zone colours are chosen (no cyan in that palette) | 4 BG palettes of 4, shared backdrop, attribute quadrant = 16x16 pixels, 240 lines: nesdev wiki. Exact `$27`/`$17` hue pick and 32x30 nametable: UNVERIFIED |
| SNES | 32x28 | 8 x 18 | Roles at 5 bits per channel | Nothing | 256x224, 15-bit palette: Wikipedia. BG mode 1 and layer count: UNVERIFIED |
| Atari 2600 | No tiles, 160 colour clocks x 192 lines | 2 x 15 steps | TIA NTSC nearest: black bg, grey, white, orange bar, cyan timer, red logo. PAL build needs its own colour table | See "Atari 2600" below: no author line, no chip line, no comment scroller, no caps | Playfield 20 bits mirrored / repeated, 4 clocks per bit, 2 players 8 pixels, 128 NTSC colours, 192 lines: Wikipedia. Exact TIA colour codes: UNVERIFIED |
| ZX Spectrum | 32x24 | 3 x 14 | Fixed: black paper; white, bright white, bright yellow (bar), bright cyan (cap), bright red (logo) inks | barlo shade (one ink per 8x8 cell); logo horns are red, not amber; scroller steps 8 pixels; the cell holding a cap turns cyan | 256x192, 8x8 attribute cells, 2 colours per cell, bright per cell: Wikipedia. Hex values: UNVERIFIED |
| Amstrad CPC | 40x25, mode 1 | 3 x 17 | 4 inks from the 27: black, orange (bar, rule), bright white (all text), bright red (logo) | dim and barlo shades, cyan caps (caps are white), amber horns; scroller steps 8 pixels (software scroll of one text row) | Mode 1 320x200 4 colours, 27-colour palette: Wikipedia. 25 rows: UNVERIFIED |
| Atari 8-bit | 40x24 | 4 x 16 | GTIA nearest to the roles, same hues as the 2600 table | Text rows are ANTIC mode 2 (one hue per row, set by display list interrupt); bar rows are ANTIC mode 4, so bars move in 2 pixel horizontal units; logo is one player sprite: the 8x8 logo at double size | Mode 2 40 columns, mode 4 4 colours per character, display list interrupts: Wikipedia ANTIC. 256-colour GTIA palette: UNVERIFIED |
| Commander X16 | 40x30 (VERA scaled 2x) | 16 x 20 | Roles at 4 bits per channel | 24 voices exist (8 FM + 16 PSG); only 16 bars fit at 2 tiles each (section 6, question 7) | 640x480 output, 2 layers, 8 or 16 pixel tiles, 256 from 4096: x16-docs. 40x30 at 2x scale: UNVERIFIED |
| GBA | 30x20 | 6 x 12 (4 DMG + 2 Direct Sound) | Roles at 5 bits per channel | Platform name when the chip name is long; no margins | 240x160, mode 0 with 4 layers, 15-bit: GBATEK |
| Nintendo DS | 32x24, top screen | 16 x 14 | Roles at 5 bits per channel | Bars are 1 tile wide (7 pixels); bottom screen unused (section 6, question 8) | Two 256x192 screens, one 2D engine each: Wikipedia. Layer and sprite counts: UNVERIFIED |
| Neo Geo | 40x28, fix layer | 14 x 18 (4 FM + 3 SSG + 6 ADPCM-A + 1 ADPCM-B) | Roles at 5 bits per channel, fix palettes 0-3 | Fix layer cannot scroll: scroller and bars step 8 pixels (tile rewrite). Outer column each side is outside the 38-column safe zone and stays empty | 40x28 visible, 38x28 safe, 8x8 4bpp, first 16 palettes, no scroll: neogeodev wiki |
| Amiga | 40x32 (PAL) | 4 x 22 | Roles at 4 bits per channel; 3 bitplanes = exactly the 8 roles | Zone-coloured bars need a 4th bitplane or a copper colour change. NTSC (320x200) drops to 40x25 with 15-row bars | 320x256 PAL, 1-5 bitplanes, 4096 colours, copper: Wikipedia |

### Mockups

Game Boy, Game Boy Color, Game Gear (20x18; Game Gear shows `SN76489` / no platform name):

```
+--------------------+
|@@ EXAMPLE SONG TITL|
|@@ BY AUTHOR NAME   |
|DMG APU     GAME BOY|
|--------------------|
|      ###           |
|      ###           |
|      ###           |
|      ###           |
|      ### ###       |
|  ### ### ###       |
|  ### ### ###       |
|  ### ### ###       |
|  ### ### ### ###   |
|  ### ### ### ###   |
|   1   2   3   4    |
|> 01:23     SONG 2/5|
|--------------------|
|THIS LINE IS BUILT F|
+--------------------+
```

NES (32x30, margin 2 so the logo and every bar row sit on 16x16 attribute cells):

```
+--------------------------------+
|                                |
|                                |
|  @@ EXAMPLE SONG TITLE         |
|  @@ BY AUTHOR NAME             |
|  2A03                     NES  |
|  ----------------------------  |
|          ###                   |
|          ###                   |
|          ###                   |
|          ###                   |
|          ###                   |
|          ###         ###       |
|          ###         ###       |
|          ### ###     ###       |
|          ### ###     ###       |
|      ### ### ###     ###       |
|      ### ### ###     ###       |
|      ### ### ###     ###       |
|      ### ### ###     ###       |
|      ### ### ###     ###       |
|      ### ### ### ### ###       |
|      ### ### ### ### ###       |
|      ### ### ### ### ###       |
|      ### ### ### ### ###       |
|       1   2   3   4   5        |
|  > 01:23             SONG 2/5  |
|  ----------------------------  |
|  THIS LINE IS BUILT FROM THE   |
|                                |
|                                |
+--------------------------------+
```

SNES (32x28):

```
+--------------------------------+
|                                |
| @@ EXAMPLE SONG TITLE          |
| @@ BY AUTHOR NAME              |
| SPC700 + S-DSP       SUPER NES |
| ------------------------------ |
|       ##                       |
|       ##                       |
|       ##                       |
|       ##             ##        |
|       ##             ##        |
|       ##       ##    ##        |
|       ##       ##    ##        |
|       ## ##    ##    ##        |
|       ## ##    ##    ##        |
|    ## ## ##    ##    ##        |
|    ## ## ##    ##    ## ##     |
|    ## ## ##    ##    ## ##     |
|    ## ## ##    ## ## ## ##     |
|    ## ## ##    ## ## ## ##     |
|    ## ## ## ## ## ## ## ##     |
|    ## ## ## ## ## ## ## ##     |
|    ## ## ## ## ## ## ## ##     |
|    ## ## ## ## ## ## ## ##     |
|     1  2  3  4  5  6  7  8     |
| > 01:23               SONG 2/5 |
| ------------------------------ |
| THIS LINE IS BUILT FROM THE SO |
|                                |
+--------------------------------+
```

ZX Spectrum (32x24; every bar is 4 attribute cells wide):

```
+--------------------------------+
|                                |
| @@ EXAMPLE SONG TITLE          |
| @@ BY AUTHOR NAME              |
| AY-3-8912          ZX SPECTRUM |
| ------------------------------ |
|              ###               |
|              ###               |
|              ###               |
|              ###               |
|              ###               |
|              ### ###           |
|              ### ###           |
|          ### ### ###           |
|          ### ### ###           |
|          ### ### ###           |
|          ### ### ###           |
|          ### ### ###           |
|          ### ### ###           |
|          ### ### ###           |
|           1   2   3            |
| > 01:23               SONG 2/5 |
| ------------------------------ |
| THIS LINE IS BUILT FROM THE SO |
|                                |
+--------------------------------+
```

Amstrad CPC mode 1 (40x25, no vertical margin):

```
+----------------------------------------+
| @@ EXAMPLE SONG TITLE                  |
| @@ BY AUTHOR NAME                      |
| AY-3-8912                  AMSTRAD CPC |
| -------------------------------------- |
|                  ###                   |
|                  ###                   |
|                  ###                   |
|                  ###                   |
|                  ###                   |
|                  ###                   |
|                  ### ###               |
|                  ### ###               |
|              ### ### ###               |
|              ### ### ###               |
|              ### ### ###               |
|              ### ### ###               |
|              ### ### ###               |
|              ### ### ###               |
|              ### ### ###               |
|              ### ### ###               |
|              ### ### ###               |
|               1   2   3                |
| > 01:23                       SONG 2/5 |
| -------------------------------------- |
| THIS LINE IS BUILT FROM THE SONG COMME |
+----------------------------------------+
```

Atari 8-bit (40x24):

```
+----------------------------------------+
| @@ EXAMPLE SONG TITLE                  |
| @@ BY AUTHOR NAME                      |
| POKEY                      ATARI 8-BIT |
| -------------------------------------- |
|                ###                     |
|                ###                     |
|                ###                     |
|                ###                     |
|                ###                     |
|                ###                     |
|                ### ###                 |
|                ### ###                 |
|            ### ### ###                 |
|            ### ### ###                 |
|            ### ### ###                 |
|            ### ### ###                 |
|            ### ### ### ###             |
|            ### ### ### ###             |
|            ### ### ### ###             |
|            ### ### ### ###             |
|             1   2   3   4              |
| > 01:23                       SONG 2/5 |
| -------------------------------------- |
| THIS LINE IS BUILT FROM THE SONG COMME |
+----------------------------------------+
```

Commander X16 (40x30):

```
+----------------------------------------+
|                                        |
| @@ EXAMPLE SONG TITLE                  |
| @@ BY AUTHOR NAME                      |
| YM2151 + VERA PSG        COMMANDER X16 |
| -------------------------------------- |
|      #                 #               |
|      #                 #               |
|      #             #   #               |
|      #             #   #               |
|      #         #   #   #         #     |
|      #         #   #   #         #     |
|      #     #   #   #   #     #   #     |
|      #     #   #   #   #     #   #     |
|      # #   #   #   #   # #   #   #     |
|      # #   #   #   #   # #   #   #     |
|    # # #   #   #   # # # #   #   #     |
|    # # #   #   #   # # # #   #   #     |
|    # # #   #   # # # # # #   #   #     |
|    # # #   #   # # # # # #   #   #     |
|    # # #   # # # # # # # #   # # #     |
|    # # #   # # # # # # # #   # # #     |
|    # # # # # # # # # # # # # # # #     |
|    # # # # # # # # # # # # # # # #     |
|    # # # # # # # # # # # # # # # #     |
|    # # # # # # # # # # # # # # # #     |
|    1 2 3 4 5 6 7 8 9 A B C D E F G     |
| > 01:23                       SONG 2/5 |
| -------------------------------------- |
| THIS LINE IS BUILT FROM THE SONG COMME |
|                                        |
+----------------------------------------+
```

GBA (30x20):

```
+------------------------------+
|@@ EXAMPLE SONG TITLE         |
|@@ BY AUTHOR NAME             |
|DMG + DIRECT SOUND         GBA|
|------------------------------|
|       ###                    |
|       ###                    |
|       ###                    |
|       ###         ###        |
|       ### ###     ###        |
|       ### ###     ###        |
|   ### ### ###     ###        |
|   ### ### ###     ###        |
|   ### ### ###     ### ###    |
|   ### ### ### ### ### ###    |
|   ### ### ### ### ### ###    |
|   ### ### ### ### ### ###    |
|    1   2   3   4   5   6     |
|> 01:23               SONG 2/5|
|------------------------------|
|THIS LINE IS BUILT FROM THE SO|
+------------------------------+
```

Nintendo DS top screen (32x24):

```
+--------------------------------+
|                                |
| @@ EXAMPLE SONG TITLE          |
| @@ BY AUTHOR NAME              |
| 16 CH PCM          NINTENDO DS |
| ------------------------------ |
|         #        #             |
|         #      # #             |
|         #    # # #    #        |
|         #    # # #    #        |
|         #  # # # #  # #        |
|         ## # # # ## # #        |
|         ## # # # ## # #        |
|        ### # # #### # #        |
|        ### # ###### # #        |
|        ### ######## ###        |
|        ### ######## ###        |
|        ################        |
|        ################        |
|        ################        |
|        123456789ABCDEFG        |
| > 01:23               SONG 2/5 |
| ------------------------------ |
| THIS LINE IS BUILT FROM THE SO |
|                                |
+--------------------------------+
```

Neo Geo (40x28, same grid as Mega Drive, 14 bars):

```
+----------------------------------------+
|                                        |
| @@ EXAMPLE SONG TITLE                  |
| @@ BY AUTHOR NAME                      |
| YM2610                         NEO GEO |
| -------------------------------------- |
|        #                 #             |
|        #             #   #             |
|        #             #   #             |
|        #         #   #   #             |
|        #         #   #   #             |
|        #     #   #   #   #     #       |
|        #     #   #   #   #     #       |
|        # #   #   #   #   # #   #       |
|        # #   #   #   #   # #   #       |
|      # # #   #   #   # # # #   #       |
|      # # #   #   # # # # # #   #       |
|      # # #   #   # # # # # #   #       |
|      # # #   # # # # # # # #   #       |
|      # # #   # # # # # # # #   #       |
|      # # # # # # # # # # # # # #       |
|      # # # # # # # # # # # # # #       |
|      # # # # # # # # # # # # # #       |
|      # # # # # # # # # # # # # #       |
|      1 2 3 4 5 6 7 8 9 A B C D E       |
| > 01:23                       SONG 2/5 |
| -------------------------------------- |
| THIS LINE IS BUILT FROM THE SONG COMME |
|                                        |
+----------------------------------------+
```

Amiga PAL (40x32):

```
+----------------------------------------+
|                                        |
| @@ EXAMPLE SONG TITLE                  |
| @@ BY AUTHOR NAME                      |
| PAULA                            AMIGA |
| -------------------------------------- |
|                ###                     |
|                ###                     |
|                ###                     |
|                ###                     |
|                ###                     |
|                ###                     |
|                ###                     |
|                ###                     |
|                ### ###                 |
|                ### ###                 |
|                ### ###                 |
|            ### ### ###                 |
|            ### ### ###                 |
|            ### ### ###                 |
|            ### ### ###                 |
|            ### ### ###                 |
|            ### ### ###                 |
|            ### ### ### ###             |
|            ### ### ### ###             |
|            ### ### ### ###             |
|            ### ### ### ###             |
|            ### ### ### ###             |
|             1   2   3   4              |
| > 01:23                       SONG 2/5 |
| -------------------------------------- |
| THIS LINE IS BUILT FROM THE SONG COMME |
|                                        |
+----------------------------------------+
```

### Atari 2600

No tile map and no frame buffer: the kernel draws each line as it is scanned. The
screen is a stack of bands, each using one kernel trick. Shown at 1 character = 8
colour clocks x 8 lines (20x24):

```
+--------------------+
| @                  |   lines 6-21: logo, player 0, 8x8 art, each row 2 lines
|                    |
|                    |
|       TITLE        |   lines 28-34: 6 characters (48 pixels), marquee of
|                    |                "TITLE BY AUTHOR - TIA", 1 character per 16 frames
|  ####        ####  |
|  ####        ####  |   lines 40-159: 2 bars from the playfield registers,
|  ####        ####  |                 32 colour clocks wide each, 15 steps of 8 lines
|  ####        ####  |                 (TIA volume is 0-15, so 1 step per volume unit)
|  ####        ####  |
|  ####        ####  |
|  ####        ####  |
|  ####        ####  |
|  ####        ####  |
|  ####        ####  |
|  ####        ####  |
|  ####        ####  |
|  ####        ####  |
|  ####        ####  |
|  ####        ####  |
|                    |
|        01:23       |   lines 168-174: timer, 6-character kernel, dim when paused
|       2 OF 5       |   lines 180-186: subsong
+--------------------+
```

- Text uses the 48-pixel "six digit score" kernel (two players, three copies each). Well-known technique; UNVERIFIED against a fetched document, and the cycle budget next to the music driver must be measured.
- Bars use the playfield in mirrored mode: both bars cannot differ with a plain mirrored playfield. The kernel must rewrite PF registers mid-line (asymmetric playfield). UNVERIFIED cycle cost.
- Cut: separate author and chip lines (folded into the marquee), the comment scroller, peak caps, bar edge shade, rules.
- Fire = play/pause, joystick left/right = subsong.

### Font

One shared font, defined once: 67 glyphs, 1 bit per pixel, 5x7 glyph in an 8x8 cell
(1 pixel left pad, bottom row empty, so adjacent rows and columns never touch).
Characters: ASCII 32-95 (space, punctuation, digits, upper case) plus three extras:
play triangle, pause bars, solid block (the wipe cursor). Lower case in song text
folds to upper case; any other character becomes `?`. Size: 67 x 8 = 536 bytes.
The glyph data in the mock (`FONT_HEX`, 5 column bytes per glyph) is the first
draft of the font and can be converted straight into the shared source file.

## 3. Logo

A capital D, as on the app icon, with two horn pixels. `#` = red (logo role),
`^` = amber (bar role) on colour machines.

16x16 (2x2 tiles):

```
^^..........^^..
.^^........^^...
.############...
.#############..
.####.....#####.
.####......####.
.####.......####
.####.......####
.####.......####
.####.......####
.####......####.
.####.....#####.
.#############..
.############...
................
................
```

8x8 (1 tile; used at double size as a player sprite on the Atari 8-bit, at 1x2 on the 2600):

```
^....^..
#####...
##..##..
##...##.
##...##.
##..##..
#####...
........
```

1bpp version: the same two bitmaps with `^` and `#` both set. Hex rows, most significant bit = left pixel:

- 16x16: `C00C 6018 7FF8 7FFC 783E 781E 780F 780F 780F 780F 781E 783E 7FFC 7FF8 0000 0000`
- 8x8: `84 F8 CC C6 C6 CC F8 00`

Plain variant (section 6, question 1): leave out the horn rows (rows 0-1 of the 16x16, row 0 of the 8x8).

## 4. Motion

All rules are integer, per frame, with no multiply or divide.

**Bars.** Per channel the driver exposes a volume 0-15 (other ranges are shifted
into 0-15). A 16-entry table per platform turns it into a target height in pixels.

```
target = HEIGHT_TABLE[volume]
if target > level: level = target                    ; instant attack
else:              level = max(target, level - FALL) ; linear fall
```

`FALL` = bar height in rows / 4, in pixels per frame (4 on an 18-row bar: full
scale to zero in 36 frames). Only the tiles between the old and the new level are
rewritten, at most `FALL / 8 + 1` tiles per bar per frame. Bar tiles are 9
pre-drawn tiles (0 to 8 pixels filled). Tile-step platforms (Neo Geo fix layer)
use the full and empty tiles plus the 7 partial ones the same way; only the
scroller is coarse there.

**Peak caps.** A 2 pixel cap per bar. When the level reaches the cap, the cap
follows and a hold counter is set to 32 frames. After the hold the cap falls 1
pixel per frame. Drawn as a sprite where sprites are free (Mega Drive, SNES, GBA,
DS, Amiga, Master System up to 8 per line), as tiles elsewhere.

**Scroller.** 1 pixel per frame using the hardware scroll register of the row
(a split or a second layer); one new character is written off-screen every 8
frames. Machines with no cheap per-row scroll (Spectrum, CPC, Neo Geo fix layer)
move 1 character every 8 frames: same reading speed, coarse step. 2600: 1
character every 16 frames.

**Timer.** A frame counter counts to 50 or 60 (per video standard), then
increments seconds in binary coded decimal. Wraps at 99:59.

**Pause.** Targets are forced to 0, so bars fall by the normal rule; the play
glyph becomes the pause glyph; the timer stops; the scroller keeps moving.

**Subsong change.** Bar targets are forced to 0 for 16 frames. At the same time a
block cursor wipes the title line left to right, 2 characters per frame, leaving
the new title behind it. Timer and scroller restart at once. Cost: 2 tile writes
per frame.

## 5. Asset plan

| Asset | Source of truth | Shared or converted |
|-------|-----------------|---------------------|
| Font | One text file of 67 glyphs, 8 rows each | Converted per platform: 1bpp (Game Boy 2bpp, NES 2bpp, Spectrum, CPC, Amiga planes), 4bpp (Mega Drive, Master System, SNES, GBA, DS, Neo Geo fix), 2600 as column data for the 6-character kernel |
| Logo | The 16x16 and 8x8 art of section 3, 2 colours + background | Converted with the font converter |
| Bar tiles | Generated: 9 fill levels, with and without the edge shade | Generated by the converter, not drawn |
| Palette | One table: role name to RGB hex (section 2) | RGB machines: rounded by the converter to the hardware bit depth. Fixed-palette machines (NES, Spectrum, CPC, Atari 8-bit, 2600, Game Boy DMG): a hand-picked row per platform in the same table |
| Layout | Four numbers per platform (columns, rows, margin, bar count) + the zone rules of section 1 | Shared as generated constants; the 2600 is hand-written |
| Strings | Title, author, chip name, subsong count, comment text | Written by the exporter into a fixed header in the ROM: upper-cased, mapped to the 67 glyphs, title and author padded to the zone width, comment text cut at a per-platform byte limit |
| Height table | 16 entries per platform | Generated from the bar height |

One converter script produces every per-platform file from the four sources
(font, logo, palette table, layout numbers). Player code per platform is separate
and is the subject of the hardware-rom-export plan.

## 6. Open choices for the owner

1. **Which logo goes in the corner?**
   - Horned D: red D, two amber horn pixels (Recommended; reads as "devil" at 16 pixels, shown in the mock)
   - Plain red D, as on the app icon
   - Text "DEViLBOX" in the font on the title row instead of a mark (costs 8 title characters)
2. **How are bars coloured?**
   - Single amber with a darker edge (Recommended; fits every palette, including 4-colour machines)
   - Green / amber / red zones by height (not possible on Game Boy DMG or CPC mode 1; costs the caps on NES)
3. **Peak caps?**
   - On (Recommended; cheap, makes short notes visible)
   - Off (saves sprites or tile writes; the 2600 has none either way)
4. **Subsong change transition?**
   - Bars drop + title wipe, 16-20 frames (Recommended)
   - Instant cut
5. **Game Boy colour support?**
   - One ROM, 4 shades on DMG, colour palette when a Game Boy Color is detected (Recommended)
   - 4 shades only
   - Two separate ROMs
6. **Atari 2600 scope?**
   - Bars + title marquee + timer + subsong, as drawn (Recommended; needs the kernel cycle budget measured first)
   - Bars and logo only, no text
   - No playing screen on the 2600: black screen, sound only
7. **Chips with more voices than columns (X16: 24 voices, DS: 16)?**
   - Cap at 16 bars; X16 shows 8 FM + the first 8 PSG voices (Recommended)
   - Two rows of half-height bars
   - Merge voices into groups (one bar per chip section)
8. **Nintendo DS bottom screen?**
   - Off / black (Recommended; nothing more to show)
   - Full comment text as a static page
   - Mirror of the top screen
9. **What drives bar height when the driver has both a volume register and an envelope?**
   - Volume register only (Recommended; same code on every chip, one read per channel)
   - Volume x envelope level where the driver tracks it (FM operators, Paula has none)

## Not covered / not checked

- Mega Drive, Master System, Game Gear and DS palette / layer / sprite numbers are from memory (source sites refused the fetch). They are marked UNVERIFIED in the table and need checking before code.
- Fixed-palette hex values (NES, Spectrum, TIA / GTIA) in the mock are approximations.
- CPU cost was reasoned, not measured, on every platform; the 2600 and Spectrum are the ones at risk.
- The mock was syntax-checked and its layout function run headless; it was not viewed in a browser by the design agent.

## Owner answers 2026-11-15

These override section 6 and the per-platform palette column.

- Palette: every platform uses the Game Gear palette, the DEViLBOX roles at 4 bits per channel (12-bit). Platforms with fewer bits round down from those values. Fixed-palette machines (NES, Spectrum, CPC, TIA, GTIA) take the nearest entry to the Game Gear value, not the 8-bit token. Layout stays per platform as in section 2 ("palette only"; margins unchanged).
- Logo: the text "DEViLBOX" in the font, not a mark. Costs 8 title characters on the title row; the horned D and the 8x8 logo drop.
- Bars: single amber with the darker edge.
- Peak caps: on.
- Subsong change: bars drop + title wipe.
- Game Boy: two separate ROMs, DMG (4 shades) and GBC (Game Gear palette).
- Atari 2600: bars + title marquee + timer + subsong. Measure the kernel cycle budget first.
- More voices than columns: cap at 16 bars; X16 shows 8 FM + the first 8 PSG voices.
- DS bottom screen: full song comment text as a static page.
- Bar source: volume register only.
