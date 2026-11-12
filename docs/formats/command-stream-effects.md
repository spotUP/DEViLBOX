# Command-stream format effects (Riff Raff, Howie Davies, Hippel CoSo, Sound Programming Language, Ron Klaren)

Source: src/lib/import/formats/commandStreamEffectGlyphs.ts, the table the grid renderer imports. These formats store compiled per-channel command streams; the editor shows them as a tick grid. None of their commands is a standard effect: a cell stores the effTyp below and the one-byte eff operand verbatim (the stream's argument byte). effTyp is one global id space, so write exactly these numbers with set_cells; the standard table (topic pc-tracker-composing) does not apply.

Cell example: {"note":60,"instrument":1,"effTyp":1296,"eff":64} writes the Riff Raff set volume command with operand 64.

Where a row says "parameter meaning not documented", no machine-readable table states it; do not guess it. Background on the grid recipe: docs/FORMAT_COMMAND_STREAM_GRID.md.

### Riff Raff

Formats: riffRaff.

- effTyp 1296 (0x510), grid Vxx: set volume. Parameter: parameter meaning not documented.
- effTyp 1297 (0x511), grid Sxx: volume slide. Parameter: parameter meaning not documented.
- effTyp 1298 (0x512), grid Rxx: volume slide rate. Parameter: parameter meaning not documented.
- effTyp 1299 (0x513), grid Fxx: master fade. Parameter: parameter meaning not documented.
- effTyp 1300 (0x514), grid Gxx: master fade rate. Parameter: parameter meaning not documented.
- effTyp 1301 (0x515), grid Pxx: pitch slide. Parameter: parameter meaning not documented.
- effTyp 1302 (0x516), grid Qxx: pitch slide low. Parameter: parameter meaning not documented.
- effTyp 1303 (0x517), grid Oxx: pitch slide off. Parameter: parameter meaning not documented.

### Howie Davies

Formats: howieDavies.

- effTyp 1312 (0x520), grid Sxx: speed. Parameter: parameter meaning not documented.
- effTyp 1313 (0x521), grid Vxx: max volume. Parameter: parameter meaning not documented.

### Jochen Hippel CoSo

Formats: hippelCoso.

- effTyp 1328 (0x530), grid Pxx: portamento. Parameter: parameter meaning not documented.
- effTyp 1329 (0x531), grid Fxx: alt sequence. Parameter: parameter meaning not documented.

### Sound Programming Language

Formats: soundProgrammingLanguage.

- effTyp 1344 (0x540), grid Nxx: extra note1. Parameter: parameter meaning not documented.
- effTyp 1345 (0x541), grid Nxx: extra note2. Parameter: parameter meaning not documented.
- effTyp 1346 (0x542), grid Nxx: extra note3. Parameter: parameter meaning not documented.

### Ron Klaren

Formats: ronKlaren.

- effTyp 1360 (0x550), grid Axx: arpeggio. Parameter: parameter meaning not documented.
- effTyp 1361 (0x551), grid Pxx: portamento end. Parameter: parameter meaning not documented.
- effTyp 1362 (0x552), grid Pxx: portamento increment. Parameter: parameter meaning not documented.
- effTyp 1363 (0x553), grid Wxx: portamento wait. Parameter: parameter meaning not documented.
- effTyp 1364 (0x554), grid Sxx: adsr speed. Parameter: parameter meaning not documented.

### Sawteeth (effect byte split: effTyp from the high nibble, eff the low nibble)

Formats: sawteeth.

- effTyp 1376 (0x560), grid 0xx: effect0. Parameter: parameter meaning not documented.
- effTyp 1377 (0x561), grid 1xx: effect1. Parameter: parameter meaning not documented.
- effTyp 1378 (0x562), grid 2xx: effect2. Parameter: parameter meaning not documented.
- effTyp 1379 (0x563), grid 3xx: effect3. Parameter: parameter meaning not documented.
- effTyp 1380 (0x564), grid 4xx: effect4. Parameter: parameter meaning not documented.
- effTyp 1381 (0x565), grid 5xx: effect5. Parameter: parameter meaning not documented.
- effTyp 1382 (0x566), grid 6xx: effect6. Parameter: parameter meaning not documented.
- effTyp 1383 (0x567), grid 7xx: effect7. Parameter: parameter meaning not documented.
- effTyp 1384 (0x568), grid 8xx: effect8. Parameter: parameter meaning not documented.
- effTyp 1385 (0x569), grid 9xx: effect9. Parameter: parameter meaning not documented.
- effTyp 1386 (0x56A), grid Axx: effect a. Parameter: parameter meaning not documented.
- effTyp 1387 (0x56B), grid Bxx: effect b. Parameter: parameter meaning not documented.
- effTyp 1388 (0x56C), grid Cxx: effect c. Parameter: parameter meaning not documented.
- effTyp 1389 (0x56D), grid Dxx: effect d. Parameter: parameter meaning not documented.
- effTyp 1390 (0x56E), grid Exx: effect e. Parameter: parameter meaning not documented.
- effTyp 1391 (0x56F), grid Fxx: effect f. Parameter: parameter meaning not documented.

### Jochen Hippel ST (note event with info bit 0x20: eff is the extra byte, the speed per tick)

Formats: jochenHippelST.

- effTyp 1392 (0x570), grid Pxx: portamento. Parameter: parameter meaning not documented.

## Not verified

- Names are the table's own identifiers; glyphs are what the grid shows. Playback was not checked per command.
- Other command-stream formats (SidMon 2, Face The Music, IFF SMUS, KT, David Hanney, EMS v6, Dynamic Synthesizer, Synth Dream, Tim Follin) have no command-stream table in the repo: see thoughts/spot/2026-11-12_effect-mapping-gaps.md.
