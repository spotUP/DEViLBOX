# Agent guide: driving the tracker through the MCP

For any agent (Claude Code session, subagent, the in-app composing chat) that reads or writes a song through the DEViLBOX MCP tools. Connection problems and the full tool catalogue: [`MCP_DEBUGGING_GUIDE.md`](MCP_DEBUGGING_GUIDE.md). This guide covers how to use the tracker correctly once connected.

Last checked against the code: 2026-11-12.

## 1. Setup

1. Start the stack with `DEVILBOX_NO_RELOAD=1 npm run dev:fullstack` (Vite :5174, Express :3011, relay :4003). Without the variable a source edit reloads the page and the song you are building is gone.
2. Open exactly one tab at `http://localhost:5174/?quiet`. `?quiet` skips the welcome dialog and the start jingle for that page load. The jingle writes cells into the pattern while it runs, so a plain load corrupts what you read.
3. After a code change, reload the tab on purpose, then wait for the relay: `lsof -nP -iTCP:4003 | grep -c "Google.*->.*:4003"` prints 1.
4. A dev-server restart drops the `devilbox-tracker` MCP server. The owner reconnects it with `/mcp`.
5. A second tab on an older IndexedDB version blocks the database upgrade (song revisions). One tab only.

## 2. Confirm which page you drive, before every write batch

The hosted page at `devilbox.uprough.net` connects to the same local relay. A local MCP call can therefore land on the owner's live-site tab.

Before each batch of writes:

```
evaluate_script  ({host: location.host, search: location.search})   -> host must be "localhost:5174"
get_song_info                                                        -> project name must be the song you expect
```

If the host is not `localhost:5174`, stop and report. If the song is not yours (the owner may have loaded something), do not overwrite it: ask. A song that another song replaces is kept as a revision (menu "Revisions", last 20).

`evaluate_script` is for read-only probes. The composing chat does not have it.

## 3. Two tool sets

- **Composing chat allowlist** (`server/src/ai/freeToolset.ts`): the only tools the in-app chat can call. No `load_file`, `evaluate_script`, `hard_reload`, `batch`, `new_song`, `execute_command`, `run_*`, `export_*`. Adding a tool to this list is an owner decision.
- **Tester tools** (full MCP): everything else, for agents that set a page up or measure it: `new_song`, `dismiss_modal`, `dismiss_errors`, `unlock_audio`, `get_audio_level`, `get_console_errors`, `get_synth_errors`, `seek_to`, `release_all_notes`, mute/unmute all.

When the task is "prove the composing chat can do X", write the song with allowlist tools only. A tester tool that does the job proves nothing about the chat.

## 4. Order of work for writing music

1. `get_song_info`, `get_instruments_list`, `get_pattern_list`, `get_pattern_order`: read what is there.
2. `get_mcp_help` with the topic for the song's format (section 6) before the first effect or instrument write.
3. Channels: `set_channel_count` grows only (1 to 16, error above the loaded format's limit).
4. Instruments: `create_instrument`, then `update_synth_config`. An FM update of one operator keeps the others. FM operator storage order is index 0 = operator 1, 1 = operator 3, 2 = operator 2, 3 = operator 4.
5. Patterns: `add_pattern {length}`, then notes, then `set_pattern_order {order}`.
6. Read back with `render_pattern_text` or `get_pattern`. A tool's `ok` is not proof of a write (section 7).
7. Play, measure, then always `stop` and `release_all_notes`.

## 5. Write-tool argument shapes

Row and channel numbers start at 0. Without `patternIndex` most tools use the current pattern; `generate_pattern` and `transform_pattern` default to pattern 0. Pass `patternIndex` always.

```
set_cells            { patternIndex, cells: [{ channel, row, note, instrument, volume, effTyp, eff, effTyp2, eff2 }] }
write_note_sequence  { patternIndex, channel, startRow, step, instrument, notes: ["C-4", "E-4", ...] }
fill_range           { patternIndex, channel, startRow, endRow, step, note, instrument, volume, effTyp, eff }
add_pattern          { length }
duplicate_pattern    { patternIndex }
set_pattern_order    { order: [0, 0, 1, ...] }
render_pattern_text  { patternIndex, channels: [0, 1], startRow, endRow }
set_channel_solo     { channel, soloed }
get_audio_level      { durationMs }
```

Cell fields are flat (`note`, `instrument`, `effTyp`, `eff`), never wrapped in a `cell` object. `fill_range` with no cell field returns an error.

Effects are two numbers: `effTyp` (command id) and `eff` (parameter byte). `effTyp` is one global id space: standard tracker commands below 0x40, format-private blocks from 0x500. Look the number up in the help topic; do not guess it from the letter shown in the grid.

## 6. Effect commands per format family

Call `get_mcp_help { topic }` and follow the text it returns. The topic text is generated from the same table the editor uses, so it is the truth, not this file.

| Family | Formats | Help topic | Skill | State |
|--------|---------|-----------|-------|-------|
| PC tracker standard | MOD, XM, S3M, IT and relatives | `pc-tracker-composing` | `/pc-tracker-effects` | Done. Unverified: W (effTyp 32), Z (35) playback; MOD export with effTyp above 15. |
| Furnace chip | Neo Geo (YM2610) | `neo-geo-composing` | `/furnace-fm` | Pilot done. Other Furnace chips: no topic yet. |
| Amiga native mapped to standard ids | 46 formats | none yet | - | Use `pc-tracker-composing` numbers with care; per-format limits not documented. |
| Format-private effect blocks | 24 formats | none yet | - | Glyph tables in `src/lib/import/formats/*EffectGlyphs.ts`. |
| Command-stream | 15 formats | none yet | - | [`FORMAT_COMMAND_STREAM_GRID.md`](FORMAT_COMMAND_STREAM_GRID.md), `commandStreamEffectGlyphs.ts`. |
| No effects | 71 formats | - | - | Notes and instruments only. |

Full inventory with every format's family: `thoughts/spot/2026-11-12_format-effects-inventory.md` (local, git-ignored). `get_command_list` returns keyboard commands, not effect commands.

Not every format is editable. `src/lib/formats/EditableFormatRegistry.builtins.ts` is the list. A cell write into a format that is not registered there changes the grid but never reaches the exported module.

### Neo Geo quick facts (from `neo-geo-composing`)

- Channels: FM 0-3, SSG 4-6, ADPCM-A 7-12, ADPCM-B 13.
- An instrument's voice kind must match the channel kind. A wrong-kind note is refused (one toast, cell stays empty). The same refusal covers swap, remap, apply-instrument, channel swap, randomize and channel drag.
- Volume: Cxx (effTyp 12), 00 to 40. Arpeggio 0xy, slides and vibrato 1xx to 4xx, chip commands from 10.
- SSG instrument config: `{ furnace: { divInsType: 6, chipType: 14, macros: [...] } }`. Macro shape `{ code, type: 0, data, loop: -1, release: -1, mode: 0 }`; codes: volume 0, arpeggio 1, noise 2, wave 3. Drums on SSG are short volume macros plus a noise macro.
- No tool loads ADPCM samples yet.

## 7. Verify, never trust `ok`

- Read back what you wrote (`render_pattern_text` for a few rows is enough).
- Known handlers that returned `ok` after doing nothing (fix in progress 2026-11-12): `duplicate_pattern` with an out-of-range index, `set_pattern_order` with an empty list, `delete_instrument` / `update_instrument` / `clone_instrument` with an unknown id. `resize_pattern` above the limit waits on a confirm dialog.
- Sound: `play`, then `get_audio_level { durationMs }`; a non-zero `rmsAvg` means signal, not that it sounds right. Solo a channel to check one voice. `get_audio_level` does not see engines that own a separate native audio context (SunTronic).
- `get_note_trigger_log` output is very large and lists notes on muted channels: avoid it.
- `get_playback_state.currentGlobalRow` and `getCurrentRow()` have read 0 during play: do not use them as a position check.
- Mutes and solos persist across a reload. Clear them (`unmute_all_channels`) before you conclude a channel is silent.
- A human hears the result last. Hand the owner the exact URL and what PASS sounds like.

## 8. Things that confuse agents

- Welcome dialog or synth-error dialog open: writes still work but playback and focus do not. `get_modal_state`, then `dismiss_modal` / `dismiss_errors`. With `?quiet` the welcome dialog never opens.
- Audio locked until one click on the page: `unlock_audio`, or ask the owner to click once.
- "worker never loaded after 12 s" after a fresh load plus `new_song`: seen, cause unknown. Reload the tab and retry once.
- The stored song is restored at boot before any MCP call runs. A reload does not give an empty song; use `new_song` (tester tool) for that.
- `get_mixer_state` lists 16 channels for any song, `get_loaded_synths` lists ids 131071 as "unknown": ignore both.
- Format ids differ in spelling between tables (`hippelCoSo` / `hippelCoso`, `hivelyHVL` / `hvl`, `dtm_204` / `dtm`). Take the id from the registry, not from a file name.

## 9. Before you end

`stop`, `release_all_notes`, unmute what you muted, and say in the report which page you drove and which song is left on it.
