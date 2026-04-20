/**
 * MCP Server — tool definitions for DEViLBOX tracker control.
 *
 * All tools delegate to the browser via the WS relay.
 * Organized into categories: Song, Pattern, Cell, Transport, Mixer, Editor, UI, Instrument, History, Transforms.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile, readdir, stat as fsStat } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { callBrowser } from './wsRelay';

const API_BASE = `http://localhost:${process.env.PORT || 3001}`;

// Helper: wrap callBrowser result as MCP text content
function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

async function call(method: string, params: Record<string, unknown> = {}) {
  return textResult(await callBrowser(method, params));
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'devilbox-tracker',
    version: '2.0.0',
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // SONG & PROJECT INFO
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_song_info',
    'Get comprehensive song state: BPM, speed, pattern count, channel count, pattern order, editor mode, playback, project name',
    {},
    () => call('get_song_info'),
  );

  server.tool(
    'get_full_state',
    'Get a comprehensive dump of ALL tracker state: song, playback, cursor, selection, editor settings, mixer, UI, history, instruments, patterns. Useful for debugging.',
    {},
    () => call('get_full_state'),
  );

  server.tool(
    'get_project_metadata',
    'Get project metadata: name, author, description, timestamps, dirty state',
    {},
    () => call('get_project_metadata'),
  );

  server.tool(
    'set_project_metadata',
    'Update project metadata',
    {
      name: z.string().optional().describe('Project name'),
      author: z.string().optional().describe('Author name'),
      description: z.string().optional().describe('Project description'),
    },
    (p) => call('set_project_metadata', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // PATTERN DATA — Reading
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_pattern',
    'Get pattern data with rows and cells. Use compact=true to skip empty rows. Filter by channel indices.',
    {
      patternIndex: z.number().int().min(0).optional().describe('Pattern index (default: current)'),
      startRow: z.number().int().min(0).optional().describe('First row (default: 0)'),
      endRow: z.number().int().min(0).optional().describe('Last row (default: pattern length - 1)'),
      channels: z.array(z.number().int().min(0)).optional().describe('Channel indices to include (default: all)'),
      compact: z.boolean().optional().describe('Skip empty rows (default: false)'),
    },
    (p) => call('get_pattern', p),
  );

  server.tool(
    'get_pattern_list',
    'Get list of all patterns with index, name, length, and channel count',
    {},
    () => call('get_pattern_list'),
  );

  server.tool(
    'get_pattern_order',
    'Get the song arrangement (pattern order), current position, and length',
    {},
    () => call('get_pattern_order'),
  );

  server.tool(
    'get_cell',
    'Get a single cell with all fields including flags, probability, period',
    {
      channel: z.number().int().min(0).describe('Channel index'),
      row: z.number().int().min(0).describe('Row index'),
      patternIndex: z.number().int().min(0).optional().describe('Pattern index (default: current)'),
    },
    (p) => call('get_cell', p),
  );

  server.tool(
    'get_channel_column',
    'Get a column of data from a single channel (note, instrument, volume, effect) across all rows',
    {
      channel: z.number().int().min(0).describe('Channel index'),
      column: z.enum(['note', 'instrument', 'volume', 'effect']).optional().describe('Column to read (default: note)'),
      patternIndex: z.number().int().min(0).optional().describe('Pattern index (default: current)'),
    },
    (p) => call('get_channel_column', p),
  );

  server.tool(
    'search_pattern',
    'Search for cells matching criteria (note, instrument, effect type) across a pattern',
    {
      patternIndex: z.number().int().min(0).optional().describe('Pattern index (default: current)'),
      note: z.number().int().optional().describe('Note value to search for'),
      instrument: z.number().int().optional().describe('Instrument number to search for'),
      effTyp: z.number().int().optional().describe('Effect type to search for'),
      channel: z.number().int().min(0).optional().describe('Restrict search to this channel'),
    },
    (p) => call('search_pattern', p),
  );

  server.tool(
    'get_pattern_stats',
    'Get pattern statistics: note density, instrument usage, effect usage, note distribution',
    {
      patternIndex: z.number().int().min(0).optional().describe('Pattern index (default: current)'),
    },
    (p) => call('get_pattern_stats', p),
  );

  server.tool(
    'diff_patterns',
    'Compare two patterns and show all differences cell-by-cell',
    {
      patternA: z.number().int().min(0).describe('First pattern index'),
      patternB: z.number().int().min(0).describe('Second pattern index'),
    },
    (p) => call('diff_patterns', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // PATTERN DATA — Writing
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'set_cell',
    'Set a cell. Note: number 1-96 (97=off) or string "C-4"/"F#5"/"OFF". Supports all fields including effects, flags, probability.',
    {
      channel: z.number().int().min(0).describe('Channel index'),
      row: z.number().int().min(0).describe('Row index'),
      patternIndex: z.number().int().min(0).optional().describe('Pattern index (default: current)'),
      note: z.union([z.number(), z.string()]).optional().describe('Note: 1-96, 97=off, or "C-4"/"OFF"'),
      instrument: z.number().int().min(0).max(128).optional().describe('Instrument (1-128, 0=none)'),
      volume: z.number().int().min(0).max(255).optional().describe('Volume column'),
      effTyp: z.number().int().min(0).max(35).optional().describe('Effect type'),
      eff: z.number().int().min(0).max(255).optional().describe('Effect param'),
      effTyp2: z.number().int().min(0).max(35).optional().describe('2nd effect type'),
      eff2: z.number().int().min(0).max(255).optional().describe('2nd effect param'),
      flag1: z.number().optional().describe('Flag 1 (TB-303: 1=accent)'),
      flag2: z.number().optional().describe('Flag 2 (TB-303: 2=slide)'),
      probability: z.number().int().min(0).max(100).optional().describe('Play probability 0-100%'),
    },
    (p) => call('set_cell', p),
  );

  server.tool(
    'set_cells',
    'Batch-set multiple cells. Each cell specifies channel, row, and data fields.',
    {
      patternIndex: z.number().int().min(0).optional().describe('Pattern index (default: current)'),
      cells: z.array(z.object({
        channel: z.number().int().min(0),
        row: z.number().int().min(0),
        note: z.union([z.number(), z.string()]).optional(),
        instrument: z.number().int().min(0).max(128).optional(),
        volume: z.number().int().min(0).max(255).optional(),
        effTyp: z.number().int().min(0).max(35).optional(),
        eff: z.number().int().min(0).max(255).optional(),
        effTyp2: z.number().int().min(0).max(35).optional(),
        eff2: z.number().int().min(0).max(255).optional(),
      })).describe('Array of cells to set'),
    },
    (p) => call('set_cells', p),
  );

  server.tool(
    'clear_cell',
    'Clear a single cell (reset to empty)',
    {
      channel: z.number().int().min(0).describe('Channel index'),
      row: z.number().int().min(0).describe('Row index'),
      patternIndex: z.number().int().min(0).optional().describe('Pattern index (default: current)'),
    },
    (p) => call('clear_cell', p),
  );

  server.tool(
    'clear_pattern',
    'Clear all cells in a pattern',
    { patternIndex: z.number().int().min(0).optional().describe('Pattern index (default: current)') },
    (p) => call('clear_pattern', p),
  );

  server.tool(
    'clear_channel',
    'Clear all cells in a single channel of the current pattern',
    { channel: z.number().int().min(0).describe('Channel index') },
    (p) => call('clear_channel', p),
  );

  server.tool(
    'fill_range',
    'Fill a range of rows in a channel with a repeating cell pattern (every N rows)',
    {
      channel: z.number().int().min(0).describe('Channel index'),
      startRow: z.number().int().min(0).describe('First row'),
      endRow: z.number().int().min(0).describe('Last row'),
      step: z.number().int().min(1).optional().describe('Place every N rows (default: 1)'),
      patternIndex: z.number().int().min(0).optional().describe('Pattern index (default: current)'),
      note: z.union([z.number(), z.string()]).optional().describe('Note value'),
      instrument: z.number().int().min(0).max(128).optional(),
      volume: z.number().int().min(0).max(255).optional(),
      effTyp: z.number().int().min(0).max(35).optional(),
      eff: z.number().int().min(0).max(255).optional(),
    },
    (p) => call('fill_range', p),
  );

  server.tool(
    'write_note_sequence',
    'Write a sequence of notes to consecutive rows. Great for melodies, scales, arpeggios.',
    {
      channel: z.number().int().min(0).describe('Channel index'),
      startRow: z.number().int().min(0).describe('Starting row'),
      notes: z.array(z.union([z.number(), z.string()])).describe('Note values: ["C-4","D-4","E-4"] or [49,51,53]'),
      instrument: z.number().int().min(0).max(128).optional().describe('Instrument for all notes'),
      step: z.number().int().min(1).optional().describe('Row spacing between notes (default: 1)'),
      patternIndex: z.number().int().min(0).optional().describe('Pattern index (default: current)'),
    },
    (p) => call('write_note_sequence', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // PATTERN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'add_pattern',
    'Create a new empty pattern',
    { length: z.number().int().min(1).max(256).optional().describe('Pattern length in rows (default: 64)') },
    (p) => call('add_pattern', p),
  );

  server.tool(
    'duplicate_pattern',
    'Duplicate a pattern (creates a copy)',
    { patternIndex: z.number().int().min(0).optional().describe('Pattern to duplicate (default: current)') },
    (p) => call('duplicate_pattern', p),
  );

  server.tool(
    'resize_pattern',
    'Change pattern length (rows)',
    {
      patternIndex: z.number().int().min(0).optional().describe('Pattern to resize (default: current)'),
      length: z.number().int().min(1).max(256).describe('New length in rows'),
    },
    (p) => call('resize_pattern', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // PATTERN ORDER (SONG ARRANGEMENT)
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'set_pattern_order',
    'Set the entire song arrangement (array of pattern indices)',
    { order: z.array(z.number().int().min(0)).describe('Pattern indices in play order') },
    (p) => call('set_pattern_order', p),
  );

  server.tool(
    'add_to_order',
    'Add a pattern to the song arrangement',
    {
      patternIndex: z.number().int().min(0).describe('Pattern index to add'),
      position: z.number().int().min(0).optional().describe('Insert position (default: end)'),
    },
    (p) => call('add_to_order', p),
  );

  server.tool(
    'remove_from_order',
    'Remove a position from the song arrangement',
    { positionIndex: z.number().int().min(0).describe('Position index to remove') },
    (p) => call('remove_from_order', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // ROW & CHANNEL OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'insert_row',
    'Insert an empty row at a position in a channel (shifts rows down)',
    {
      channel: z.number().int().min(0).describe('Channel index'),
      row: z.number().int().min(0).describe('Row position for insertion'),
    },
    (p) => call('insert_row', p),
  );

  server.tool(
    'delete_row',
    'Delete a row from a channel (shifts rows up)',
    {
      channel: z.number().int().min(0).describe('Channel index'),
      row: z.number().int().min(0).describe('Row to delete'),
    },
    (p) => call('delete_row', p),
  );

  server.tool(
    'swap_channels',
    'Swap the data of two channels in the current pattern',
    {
      channel1: z.number().int().min(0).describe('First channel'),
      channel2: z.number().int().min(0).describe('Second channel'),
    },
    (p) => call('swap_channels', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // TRANSPORT — Playback Control
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'play',
    'Start playback (requires prior AudioContext unlock by user gesture). Default mode is "song" which plays through all patterns in order. Use "pattern" to loop the current pattern.',
    {
      mode: z.enum(['song', 'pattern']).optional().describe('Playback mode: "song" plays through all patterns (default), "pattern" loops current pattern'),
    },
    (p) => call('play', p),
  );
  server.tool('stop', 'Stop playback and reset position', {}, () => call('stop'));
  server.tool('pause', 'Pause playback (resume with play)', {}, () => call('pause'));

  server.tool(
    'get_playback_state',
    'Get full playback state: playing, position, BPM, speed, swing, groove, metronome, pitch',
    {},
    () => call('get_playback_state'),
  );

  server.tool(
    'set_bpm',
    'Set tempo in BPM',
    { bpm: z.number().min(20).max(999).describe('Beats per minute') },
    (p) => call('set_bpm', p),
  );

  server.tool(
    'set_speed',
    'Set speed (ticks per row). Lower = faster.',
    { speed: z.number().int().min(1).max(31).describe('Ticks per row') },
    (p) => call('set_speed', p),
  );

  server.tool(
    'set_swing',
    'Set swing amount',
    { swing: z.number().min(0).max(200).describe('Swing amount (100 = straight, 0-200 range)') },
    (p) => call('set_swing', p),
  );

  server.tool(
    'set_global_pitch',
    'Transpose all playback up/down in semitones',
    { pitch: z.number().int().min(-16).max(16).describe('Semitones (-16 to +16)') },
    (p) => call('set_global_pitch', p),
  );

  server.tool(
    'toggle_metronome',
    'Toggle the metronome on/off',
    {},
    () => call('toggle_metronome'),
  );

  server.tool(
    'seek_to',
    'Seek to a position in the song',
    {
      position: z.number().int().min(0).optional().describe('Position in pattern order'),
      row: z.number().int().min(0).optional().describe('Row number'),
    },
    (p) => call('seek_to', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // CURSOR & SELECTION
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_cursor',
    'Get cursor position: row, channel, column type, digit index',
    {},
    () => call('get_cursor'),
  );

  server.tool(
    'move_cursor',
    'Move the cursor to a position',
    {
      row: z.number().int().min(0).optional().describe('Row'),
      channel: z.number().int().min(0).optional().describe('Channel'),
      pattern: z.number().int().min(0).optional().describe('Switch to pattern'),
      columnType: z.enum(['note', 'instrument', 'volume', 'effTyp', 'effParam', 'effTyp2', 'effParam2']).optional().describe('Column type'),
    },
    (p) => call('move_cursor', p),
  );

  server.tool(
    'get_selection',
    'Get current block selection (if any)',
    {},
    () => call('get_selection'),
  );

  server.tool(
    'select_range',
    'Select a rectangular block of cells',
    {
      startChannel: z.number().int().min(0).describe('Start channel'),
      startRow: z.number().int().min(0).describe('Start row'),
      endChannel: z.number().int().min(0).describe('End channel'),
      endRow: z.number().int().min(0).describe('End row'),
    },
    (p) => call('select_range', p),
  );

  server.tool(
    'select_all',
    'Select all cells in the current pattern',
    {},
    () => call('select_all'),
  );

  server.tool(
    'clear_selection',
    'Clear the current block selection',
    {},
    () => call('clear_selection'),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // PATTERN TRANSFORMS
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'transpose_selection',
    'Transpose selected notes by N semitones (select a range first)',
    { semitones: z.number().int().describe('Semitones to transpose (+/-)') },
    (p) => call('transpose_selection', p),
  );

  server.tool(
    'interpolate_selection',
    'Interpolate values between start and end in the selected range',
    {
      column: z.enum(['volume', 'cutoff', 'resonance', 'envMod', 'pan', 'effParam', 'effParam2']).optional().describe('Column to interpolate (default: volume)'),
      startValue: z.number().int().min(0).max(255).describe('Start value'),
      endValue: z.number().int().min(0).max(255).describe('End value'),
      curve: z.enum(['linear', 'log', 'exp', 'scurve']).optional().describe('Curve shape (default: linear)'),
    },
    (p) => call('interpolate_selection', p),
  );

  server.tool(
    'humanize_selection',
    'Add random volume variation to the selected cells',
    { volumeVariation: z.number().int().min(0).max(64).optional().describe('Max random variation (default: 10)') },
    (p) => call('humanize_selection', p),
  );

  server.tool(
    'scale_volume',
    'Scale volume of selected cells / track / pattern by a factor',
    {
      scope: z.enum(['block', 'track', 'pattern']).optional().describe('Scope (default: block)'),
      factor: z.number().min(0).max(4).describe('Volume multiplier (1.0 = unchanged)'),
    },
    (p) => call('scale_volume', p),
  );

  server.tool(
    'fade_volume',
    'Create a volume fade across selected cells / track / pattern',
    {
      scope: z.enum(['block', 'track', 'pattern']).optional().describe('Scope (default: block)'),
      startVolume: z.number().int().min(0).max(64).describe('Start volume'),
      endVolume: z.number().int().min(0).max(64).describe('End volume'),
    },
    (p) => call('fade_volume', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // MIXER — Volume, Pan, Mute/Solo
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_mixer_state',
    'Get full mixer state: master volume, all channel volumes/pans/mute/solo, bus gains',
    {},
    () => call('get_mixer_state'),
  );

  server.tool(
    'get_channel_state',
    'Get a single mixer channel state',
    { channel: z.number().int().min(0).describe('Channel index') },
    (p) => call('get_channel_state', p),
  );

  server.tool(
    'set_master_volume',
    'Set master output volume in dB',
    { volume: z.number().min(-60).max(0).describe('Volume in dB (-60 to 0)') },
    (p) => call('set_master_volume', p),
  );

  server.tool(
    'set_master_mute',
    'Mute/unmute master output',
    { muted: z.boolean().describe('Mute state') },
    (p) => call('set_master_mute', p),
  );

  server.tool(
    'set_channel_volume',
    'Set channel volume (0-1, 1=unity)',
    {
      channel: z.number().int().min(0).describe('Channel index'),
      volume: z.number().min(0).max(1).describe('Volume (0-1)'),
    },
    (p) => call('set_channel_volume', p),
  );

  server.tool(
    'set_channel_pan',
    'Set channel panning',
    {
      channel: z.number().int().min(0).describe('Channel index'),
      pan: z.number().min(-1).max(1).describe('Pan (-1=left, 0=center, 1=right)'),
    },
    (p) => call('set_channel_pan', p),
  );

  server.tool(
    'set_channel_mute',
    'Mute/unmute a channel',
    {
      channel: z.number().int().min(0).describe('Channel index'),
      muted: z.boolean().describe('Mute state'),
    },
    (p) => call('set_channel_mute', p),
  );

  server.tool(
    'set_channel_solo',
    'Solo/unsolo a channel',
    {
      channel: z.number().int().min(0).describe('Channel index'),
      soloed: z.boolean().describe('Solo state'),
    },
    (p) => call('set_channel_solo', p),
  );

  server.tool(
    'solo_channel',
    'Solo a single channel (unsolos all others)',
    { channel: z.number().int().min(0).describe('Channel to solo') },
    (p) => call('solo_channel', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // DUB BUS — live dub performance (tracker + drumpad + DJ share the same bus)
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'set_channel_dub_send',
    'Set dub-send level for a tracker channel (0-1). First non-zero value lazily activates the WASM worklet dub output for that channel.',
    {
      channel: z.number().int().min(0).describe('Channel index'),
      amount: z.number().min(0).max(1).describe('Dub send level (0=off, 1=full)'),
    },
    (p) => call('set_channel_dub_send', p),
  );

  server.tool(
    'set_dub_bus_enabled',
    'Turn the shared DubBus on/off. When disabled, dub-send audio does not reach master even if channel sends are non-zero.',
    { enabled: z.boolean().describe('Bus enabled') },
    (p) => call('set_dub_bus_enabled', p),
  );

  server.tool(
    'set_dub_bus_settings',
    'Adjust dub bus parameters (echoIntensity, echoRateMs, echoWet, springWet, returnGain, hpfCutoff, sidechainAmount).',
    { settings: z.record(z.any()).describe('Partial DubBusSettings object') },
    (p) => call('set_dub_bus_settings', p),
  );

  server.tool(
    'fire_dub_move',
    'Fire a dub move by id through DubRouter. Returns heldHandle for hold-kind moves (pass to release_dub_move to stop). Trigger-kind moves return heldHandle:null. Requires bus enabled (see set_dub_bus_enabled). Processors need channel sends > 0 to be audible. Valid moveIds: echoThrow, dubStab, filterDrop, dubSiren, springSlam, channelMute, channelThrow, delayTimeThrow, tapeWobble, masterDrop, snareCrack, tapeStop, backwardReverb, toast, transportTapeStop, tubbyScream, stereoDoubler, reverseEcho, sonarPing, radioRiser, subSwell, oscBass, echoBuildUp, delayPreset380, delayPresetDotted, crushBass, subHarmonic.',
    {
      moveId: z.string().describe('Move id (e.g. "echoThrow", "tubbyScream")'),
      channelId: z.number().int().optional().describe('Tracker channel index when the move is channel-scoped'),
      params: z.record(z.number()).optional().describe('Override move defaults (e.g. throwBeats)'),
      source: z.enum(['live', 'lane']).optional().describe('Source for telemetry (default "live")'),
    },
    (p) => call('fire_dub_move', p),
  );

  server.tool(
    'get_dub_bus_state',
    'Return DubBus diagnostics: hasBus, store settings, per-channel dubSend values, which channels have registered taps in the bus.',
    {},
    () => call('get_dub_bus_state'),
  );

  server.tool(
    'mute_all_channels',
    'Mute all channels',
    {},
    () => call('mute_all_channels'),
  );

  server.tool(
    'unmute_all_channels',
    'Unmute all channels and clear solos',
    {},
    () => call('unmute_all_channels'),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // EDITOR SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_editor_state',
    'Get editor settings: octave, record mode, edit step, follow playback, etc.',
    {},
    () => call('get_editor_state'),
  );

  server.tool(
    'set_octave',
    'Set the current editing octave (0-7)',
    { octave: z.number().int().min(0).max(7).describe('Octave number') },
    (p) => call('set_octave', p),
  );

  server.tool(
    'set_edit_step',
    'Set edit step (cursor advance after entering a note)',
    { step: z.number().int().min(0).max(16).describe('Edit step (0=no advance, 1=next row, etc.)') },
    (p) => call('set_edit_step', p),
  );

  server.tool(
    'toggle_record_mode',
    'Toggle record mode on/off',
    {},
    () => call('toggle_record_mode'),
  );

  server.tool(
    'set_follow_playback',
    'Set whether the cursor follows playback position',
    { follow: z.boolean().describe('Follow playback') },
    (p) => call('set_follow_playback', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // UI CONTROL
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_ui_state',
    'Get UI state: active view, zoom, hex mode, panels, oscilloscope, modals, dialogs, status',
    {},
    () => call('get_ui_state'),
  );

  server.tool(
    'set_active_view',
    'Switch the main view',
    { view: z.enum(['tracker', 'arrangement', 'dj', 'drumpad', 'pianoroll', 'vj', 'mixer', 'studio', 'split']).describe('View to activate') },
    (p) => call('set_active_view', p),
  );

  server.tool(
    'set_status_message',
    'Display a message in the bottom status bar',
    { message: z.string().describe('Status message text') },
    (p) => call('set_status_message', p),
  );

  server.tool(
    'set_tracker_zoom',
    'Set tracker zoom level',
    { zoom: z.number().min(80).max(200).describe('Zoom percentage (80-200)') },
    (p) => call('set_tracker_zoom', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // INSTRUMENTS
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_instruments_list',
    'Get list of all instruments with id, name, type, and synth type',
    {},
    () => call('get_instruments_list'),
  );

  server.tool(
    'get_instrument',
    'Get full instrument configuration (minus sample binary)',
    { id: z.number().int().min(0).describe('Instrument ID') },
    (p) => call('get_instrument', p),
  );

  server.tool(
    'get_current_instrument',
    'Get the currently selected instrument configuration',
    {},
    () => call('get_current_instrument'),
  );

  server.tool(
    'select_instrument',
    'Select an instrument as current',
    { id: z.number().int().min(0).describe('Instrument ID') },
    (p) => call('select_instrument', p),
  );

  server.tool(
    'create_instrument',
    'Create a new instrument. Pass config as a JSON object with optional fields like name, synthType, oscillator, etc.',
    {
      name: z.string().optional().describe('Instrument name'),
      synthType: z.string().optional().describe('Synth type (e.g., "sample", "tb303", "wavetable")'),
    },
    (p) => call('create_instrument', { config: p }),
  );

  server.tool(
    'update_instrument',
    'Update an instrument config. Pass any instrument config fields as key-value pairs.',
    {
      id: z.number().int().min(0).describe('Instrument ID'),
      name: z.string().optional().describe('Instrument name'),
      synthType: z.string().optional().describe('Synth type'),
    },
    (p) => {
      const { id, ...updates } = p;
      return call('update_instrument', { id, updates });
    },
  );

  server.tool(
    'delete_instrument',
    'Delete an instrument',
    { id: z.number().int().min(0).describe('Instrument ID') },
    (p) => call('delete_instrument', p),
  );

  server.tool(
    'clone_instrument',
    'Clone an instrument (creates a copy)',
    { id: z.number().int().min(0).describe('Instrument ID to clone') },
    (p) => call('clone_instrument', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // HISTORY
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_history_state',
    'Get undo/redo stack sizes and availability',
    {},
    () => call('get_history_state'),
  );

  server.tool('undo', 'Undo the last pattern edit', {}, () => call('undo'));
  server.tool('redo', 'Redo the last undone edit', {}, () => call('redo'));

  // ═══════════════════════════════════════════════════════════════════════════════
  // OSCILLOSCOPE
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_oscilloscope_info',
    'Get oscilloscope state: active, channel count, channel names, data availability',
    {},
    () => call('get_oscilloscope_info'),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // COMMAND REGISTRY (Escape Hatch)
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'execute_command',
    'Execute any named command from the keyboard command registry (e.g., "selectAll", "transposeUp", "toggleRecordMode")',
    { command: z.string().describe('Command name') },
    (p) => call('execute_command', p),
  );

  server.tool(
    'release_dub_move',
    'Release a held dub move by its heldHandle (returned from fire_dub_move for hold-kind moves). Trigger-kind moves return null heldHandle and don\'t need releasing.',
    {
      heldHandle: z.string().describe('Handle returned from fire_dub_move'),
    },
    (p) => call('release_dub_move', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // AUDIO DIAGNOSTICS
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_audio_state',
    'Get audio engine diagnostics: context state, initialized, master volume, bus gains, master effects chain with parameters',
    {},
    () => call('get_audio_state'),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // ERROR DIAGNOSTICS
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_synth_errors',
    'Get all synth errors (init failures, WASM crashes, runtime errors) with debug data and timestamps',
    {},
    () => call('get_synth_errors'),
  );

  server.tool(
    'dismiss_errors',
    'Dismiss all synth error notifications',
    {},
    () => call('dismiss_errors'),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // FORMAT-SPECIFIC STATE
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_format_state',
    'Get format-specific state: editor mode, loaded WASM engines, Furnace/Hively/SID metadata, SongDB info',
    {},
    () => call('get_format_state'),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // MIDI STATE
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_midi_state',
    'Get MIDI device state: supported, initialized, input/output devices, CC mappings, knob banks',
    {},
    () => call('get_midi_state'),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // ARRANGEMENT (DAW TIMELINE)
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_arrangement_state',
    'Get full arrangement timeline: tracks, clips, markers, selection, tool, playback position',
    {},
    () => call('get_arrangement_state'),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // CLIPBOARD
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_clipboard_state',
    'Get clipboard state: whether data exists, dimensions (width x height)',
    {},
    () => call('get_clipboard_state'),
  );

  server.tool(
    'copy_selection',
    'Copy the current selection to clipboard (select a range first with select_range)',
    {},
    () => call('copy_selection'),
  );

  server.tool(
    'cut_selection',
    'Cut the current selection to clipboard (copies and clears)',
    {},
    () => call('cut_selection'),
  );

  server.tool(
    'paste',
    'Paste clipboard at cursor position. Modes: "paste" (overwrite), "mix" (only fill empty cells), "flood" (repeat to end).',
    {
      mode: z.enum(['paste', 'mix', 'flood']).optional().describe('Paste mode (default: paste)'),
    },
    (p) => call('paste', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // COMMAND LIST
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_command_list',
    'Get all available keyboard commands with names, labels, shortcuts, and valid contexts. Use with execute_command.',
    {},
    () => call('get_command_list'),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // PATTERN TEXT RENDERING
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'render_pattern_text',
    'Render a pattern as ASCII tracker-style text (Row | Ch00 | Ch01 | ...). Great for visual inspection.',
    {
      patternIndex: z.number().int().min(0).optional().describe('Pattern index (default: current)'),
      startRow: z.number().int().min(0).optional().describe('First row (default: 0)'),
      endRow: z.number().int().min(0).optional().describe('Last row (default: pattern end)'),
      channels: z.array(z.number().int().min(0)).optional().describe('Channel indices (default: all)'),
    },
    (p) => call('render_pattern_text', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // PATTERN VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'validate_pattern',
    'Check a pattern for issues: notes without instruments, missing instruments, orphan note-offs, unusual volumes',
    {
      patternIndex: z.number().int().min(0).optional().describe('Pattern index (default: current)'),
    },
    (p) => call('validate_pattern', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // EDITOR COLUMN VISIBILITY
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'set_column_visibility',
    'Show/hide tracker columns (note, instrument, volume, effectType, effectValue, effectType2, effectValue2)',
    {
      note: z.boolean().optional(),
      instrument: z.boolean().optional(),
      volume: z.boolean().optional(),
      effectType: z.boolean().optional(),
      effectValue: z.boolean().optional(),
      effectType2: z.boolean().optional(),
      effectValue2: z.boolean().optional(),
    },
    (p) => call('set_column_visibility', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // BOOKMARKS
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'toggle_bookmark',
    'Toggle a bookmark on a row (for quick navigation)',
    { row: z.number().int().min(0).describe('Row number to bookmark/unbookmark') },
    (p) => call('toggle_bookmark', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // SAMPLE INSTRUMENTS
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_sample_info',
    'Get sample instrument metadata: loop points, sampleRate, base note, slices, decoded buffer info, multi-map',
    { id: z.number().int().min(0).describe('Instrument ID') },
    (p) => call('get_sample_info', p),
  );

  server.tool(
    'get_sample_waveform',
    'Get downsampled waveform overview of a decoded sample (min/max pairs for display)',
    {
      id: z.number().int().min(0).describe('Instrument ID'),
      resolution: z.number().int().min(16).max(2048).optional().describe('Number of points (default: 256)'),
    },
    (p) => call('get_sample_waveform', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // SYNTH CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_synth_config',
    'Get synth-specific configuration for an instrument. Returns all sub-configs: TB303, Furnace, wavetable, envelope, filter, effects, LFO, etc.',
    { id: z.number().int().min(0).describe('Instrument ID') },
    (p) => call('get_synth_config', p),
  );

  server.tool(
    'update_synth_config',
    'Update a synth sub-config (e.g., tb303, envelope, filter, furnace). Merges with existing config.',
    {
      id: z.number().int().min(0).describe('Instrument ID'),
      configKey: z.string().describe('Sub-config key (e.g., "tb303", "envelope", "filter", "oscillator", "furnace")'),
      updates: z.record(z.string(), z.any()).describe('Key-value pairs to merge into the sub-config'),
    },
    (p) => call('update_synth_config', p),
  );

  server.tool(
    'set_synth_param',
    'Set a real-time parameter on a running synth instance (DevilboxSynth .set() or Tone.js .set())',
    {
      id: z.number().int().min(0).describe('Instrument ID'),
      param: z.string().describe('Parameter name (e.g., "cutoff", "resonance", "frequency")'),
      value: z.number().describe('Parameter value'),
    },
    (p) => call('set_synth_param', p),
  );

  server.tool(
    'get_loaded_synths',
    'List all synth instances currently loaded in the audio engine',
    {},
    () => call('get_loaded_synths'),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // NOTE TRIGGERING (for testing & preview)
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'trigger_note',
    'Trigger a note on an instrument for testing/preview. If duration is set, auto-releases after that time.',
    {
      id: z.number().int().min(0).describe('Instrument ID'),
      note: z.string().describe('Note name (e.g., "C4", "F#3")'),
      velocity: z.number().int().min(0).max(127).optional().describe('MIDI velocity 0-127 (default: 100)'),
      duration: z.number().min(0).optional().describe('Auto-release after N seconds (omit to hold)'),
    },
    (p) => call('trigger_note', p),
  );

  server.tool(
    'release_note',
    'Release a held note on an instrument',
    {
      id: z.number().int().min(0).describe('Instrument ID'),
      note: z.string().describe('Note name to release (e.g., "C4")'),
    },
    (p) => call('release_note', p),
  );

  server.tool(
    'release_all_notes',
    'Release all currently held notes across all instruments',
    {},
    () => call('release_all_notes'),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // AUDIO ANALYSIS & DEBUGGING
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_audio_analysis',
    'Get real-time audio analysis: RMS level, peak, FFT spectrum (64 bins), waveform snapshot, band energy (sub/bass/mid/high), beat detection',
    {},
    () => call('get_audio_analysis'),
  );

  server.tool(
    'get_audio_context_info',
    'Get Web Audio context info: sampleRate, state (running/suspended/closed), currentTime, base/output latency',
    {},
    () => call('get_audio_context_info'),
  );

  server.tool(
    'get_voice_state',
    'Get voice allocation state: active/free/max voices, utilization %, per-voice details (note, instrument, velocity, age)',
    {},
    () => call('get_voice_state'),
  );

  server.tool(
    'get_instrument_level',
    'Get the audio level (RMS & peak) of a specific instrument from its analyser node',
    { id: z.number().int().min(0).describe('Instrument ID') },
    (p) => call('get_instrument_level', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // MASTER EFFECTS CHAIN
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'add_master_effect',
    'Add an effect to the master effects chain (Reverb, Delay, Distortion, Chorus, Phaser, EQ3, Compressor, etc.)',
    { effectType: z.string().describe('Effect type name') },
    (p) => call('add_master_effect', p),
  );

  server.tool(
    'update_master_effect',
    'Update parameters of a master effect',
    {
      effectId: z.string().describe('Effect ID (from get_audio_state)'),
      updates: z.record(z.string(), z.any()).describe('Parameter updates (e.g., { "wet": 50, "parameters": { "decay": 2.5 } })'),
    },
    (p) => call('update_master_effect', p),
  );

  server.tool(
    'remove_master_effect',
    'Remove a master effect from the chain',
    { effectId: z.string().describe('Effect ID') },
    (p) => call('remove_master_effect', p),
  );

  server.tool(
    'toggle_master_effect',
    'Toggle a master effect on/off',
    { effectId: z.string().describe('Effect ID') },
    (p) => call('toggle_master_effect', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // BUS GAINS
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'set_sample_bus_gain',
    'Set the sample/tracker bus gain offset in dB',
    { gain: z.number().min(-60).max(12).describe('Gain in dB') },
    (p) => call('set_sample_bus_gain', p),
  );

  server.tool(
    'set_synth_bus_gain',
    'Set the synth/chip bus gain offset in dB',
    { gain: z.number().min(-60).max(12).describe('Gain in dB') },
    (p) => call('set_synth_bus_gain', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // FILE LOADING & AUDIO MEASUREMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'load_file',
    'Load a music file into DEViLBOX from disk. Supports all 188+ formats (MOD, XM, IT, S3M, FUR, HVL, SID, VGM, TFMX, etc.). The file is read server-side and sent to the browser for parsing and import.',
    {
      path: z.string().describe('Absolute path to the music file on disk'),
      subsong: z.number().optional().describe('Subsong index for multi-song formats (default 0)'),
      useLibopenmpt: z.boolean().optional().describe('Force libopenmpt playback for PC tracker formats'),
    },
    async (p) => {
      try {
        const fileData = await readFile(p.path);
        const base64 = fileData.toString('base64');
        const filename = basename(p.path);
        const dir = dirname(p.path);

        // Auto-discover companion files in the same directory.
        // Many Amiga formats use multi-file layouts:
        //   TFMX: mdat.songname + smpl.songname
        //   MIDI-Loriciel: MIDI.songname + SMPL.songname
        //   StartrekkerAM: song.mod + song.mod.nt
        //   MusicMaker: song.ip + song.ip.l + song.ip.n + song.sdata
        //   SUNTronic: song.src + instr/ directory with .x files
        //   AudioSculpture: song.adsc + song.adsc.as
        // All companion files in the same directory with matching base name are included.
        const companionFiles: Record<string, string> = {};
        const lowerFilename = filename.toLowerCase();
        try {
          const dirFiles = await readdir(dir);

          // Prefix-pair formats: mdat↔smpl, MIDI↔SMPL, jpn↔smp, thm↔smp, mfp↔smp,
          // sjs↔smp, MAX↔SMP, mcr↔mcs
          const prefixPairs: [string, string][] = [
            ['mdat.', 'smpl.'], ['smpl.', 'mdat.'],
            ['midi.', 'smpl.'], ['smpl.', 'midi.'],
            ['jpn.', 'smp.'], ['smp.', 'jpn.'],
            ['jpnd.', 'smp.'], ['smp.', 'jpnd.'],
            ['thm.', 'smp.'], ['smp.', 'thm.'],
            ['mfp.', 'smp.'], ['smp.', 'mfp.'],
            ['sjs.', 'smp.'], ['smp.', 'sjs.'],
            ['max.', 'smp.'], ['smp.', 'max.'],
            ['mcr.', 'mcs.'], ['mcs.', 'mcr.'],
          ];
          for (const [myPrefix, pairPrefix] of prefixPairs) {
            if (lowerFilename.startsWith(myPrefix)) {
              const suffix = filename.slice(myPrefix.length);
              const pairName = dirFiles.find(f => f.toLowerCase() === `${pairPrefix}${suffix.toLowerCase()}`);
              if (pairName) {
                const pairData = await readFile(join(dir, pairName));
                companionFiles[pairName] = pairData.toString('base64');
              }
            }
          }

          // Extension-pair companions: .sng↔.ins, .dum↔.ins, .4v↔.set
          const extensionPairs: [string, string][] = [
            ['.sng', '.ins'], ['.ins', '.sng'],
            ['.dum', '.ins'], ['.ins', '.dum'],
            ['.4v', '.set'], ['.set', '.4v'],
          ];
          for (const [myExt, pairExt] of extensionPairs) {
            if (lowerFilename.endsWith(myExt)) {
              const baseName = filename.slice(0, filename.length - myExt.length);
              const pairName = dirFiles.find(f => f.toLowerCase() === `${baseName.toLowerCase()}${pairExt}`);
              if (pairName) {
                const pairData = await readFile(join(dir, pairName));
                companionFiles[pairName] = pairData.toString('base64');
              }
            }
          }

          // Shared sample set companions: smp.set or SMP.set (used by Synth Pack, Quartet,
          // Maximum Effect). Loaded when the main file is NOT already smp.set itself.
          if (lowerFilename !== 'smp.set') {
            const smpSet = dirFiles.find(f => f.toLowerCase() === 'smp.set');
            if (smpSet) {
              const data = await readFile(join(dir, smpSet));
              companionFiles[smpSet] = data.toString('base64');
            }
          }

          // Kris Hatlelid: .kh song + songplay companion
          if (lowerFilename.endsWith('.kh')) {
            const songplay = dirFiles.find(f => f.toLowerCase() === 'songplay');
            if (songplay) {
              const data = await readFile(join(dir, songplay));
              companionFiles[songplay] = data.toString('base64');
            }
          }

          // Extension-suffix companions: song.mod.nt, song.adsc.as, song.ip.l, song.ip.n
          const suffixCompanions = ['.nt', '.as', '.l', '.n'];
          for (const suffix of suffixCompanions) {
            const companionName = dirFiles.find(f => f.toLowerCase() === lowerFilename + suffix);
            if (companionName) {
              const data = await readFile(join(dir, companionName));
              companionFiles[companionName] = data.toString('base64');
            }
          }

          // Same-basename companion: song.sdata alongside song.ip
          const dotPos = lowerFilename.lastIndexOf('.');
          if (dotPos > 0) {
            const baseName = filename.slice(0, dotPos);
            const sdataName = dirFiles.find(f => f.toLowerCase() === `${baseName.toLowerCase()}.sdata`);
            if (sdataName && sdataName.toLowerCase() !== lowerFilename) {
              const data = await readFile(join(dir, sdataName));
              companionFiles[sdataName] = data.toString('base64');
            }
          }

          // SCI (Sierra) companion: <first3chars>patch.003 (e.g. kq1patch.003 for kq1 march.sci)
          if (lowerFilename.endsWith('.sci')) {
            const prefix = filename.slice(0, 3);
            const patchName = dirFiles.find(f => f.toLowerCase() === `${prefix.toLowerCase()}patch.003`);
            if (patchName) {
              const data = await readFile(join(dir, patchName));
              companionFiles[patchName] = data.toString('base64');
            }
          }

          // SUNTronic: look for instr/ subdirectory with .x sample files
          if (dirFiles.includes('instr')) {
            try {
              const instrFiles = await readdir(join(dir, 'instr'));
              for (const instrFile of instrFiles.filter(f => f.endsWith('.x'))) {
                const data = await readFile(join(dir, 'instr', instrFile));
                companionFiles[`instr/${instrFile}`] = data.toString('base64');
              }
            } catch { /* instr dir might not be readable */ }
          }

          // ZoundMonitor: look for Samples/ subdirectory with raw PCM sample files.
          // Samples may be in the same dir OR the parent dir (Modland layout:
          // artist/song.sng + Samples/ at the collection root).
          if (lowerFilename.endsWith('.sng')) {
            const searchDirs = [dir, dirname(dir)];
            for (const searchDir of searchDirs) {
              try {
                const searchFiles = await readdir(searchDir);
                const samplesDir = searchFiles.find(f => f.toLowerCase() === 'samples');
                if (!samplesDir) continue;
                const sampleFiles = await readdir(join(searchDir, samplesDir));
                for (const sf of sampleFiles) {
                  if (sf.startsWith('.')) continue;
                  const sfPath = join(searchDir, samplesDir, sf);
                  try {
                    const st = await fsStat(sfPath);
                    if (!st.isFile()) continue;
                  } catch { continue; }
                  const data = await readFile(sfPath);
                  companionFiles[`Samples/${sf}`] = data.toString('base64');
                }
                break; // Found Samples/ dir, stop searching
              } catch { /* dir might not be readable */ }
            }
          }
        } catch { /* companion discovery is best-effort */ }

        return textResult(await callBrowser('load_file', {
          filename,
          data: base64,
          subsong: p.subsong,
          useLibopenmpt: p.useLibopenmpt,
          ...(Object.keys(companionFiles).length > 0 ? { companionFiles } : {}),
        }));
      } catch (e) {
        return textResult({ error: `Failed to read file: ${(e as Error).message}` });
      }
    },
  );

  server.tool(
    'get_audio_level',
    'Measure audio output level over a time window. Returns RMS average/max, peak max, and whether audio is silent. Useful for verifying a loaded file produces sound.',
    {
      durationMs: z.number().optional().describe('Measurement duration in milliseconds (default 2000)'),
    },
    (p) => call('get_audio_level', p),
  );

  server.tool(
    'wait_for_audio',
    'Wait until audio output is detected (non-silent) or timeout. Polls the audio bus until RMS exceeds threshold. Useful after play() to confirm audio is actually playing.',
    {
      timeoutMs: z.number().optional().describe('Maximum wait time in milliseconds (default 5000)'),
      thresholdRms: z.number().optional().describe('RMS threshold to consider as "audio detected" (default 0.001)'),
    },
    (p) => call('wait_for_audio', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // SONG ANALYSIS & AI COMPOSITION
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'analyze_song',
    'Analyze the loaded song musically: detect key/scale (Krumhansl-Schmuckler algorithm), identify chord progressions, classify channel roles (bass/lead/chord/percussion), compute note distribution and density per channel. Returns comprehensive musical analysis.',
    {},
    () => call('analyze_song'),
  );

  server.tool(
    'generate_pattern',
    'Generate musical content in a pattern channel. Supports: bass (root-heavy, low octave), drums (kick/snare/hihat), arpeggio (chord tone cycling), chord (stacked chord tones on beats), melody (scale-aware random walk), euclidean (Bjorklund rhythm). Auto-detects key/scale from existing song if not specified.',
    {
      type: z.enum(['bass', 'drums', 'arpeggio', 'chord', 'melody', 'fill', 'euclidean']).describe('Generator type'),
      channel: z.number().optional().describe('Target channel index (default 0)'),
      patternIndex: z.number().optional().describe('Target pattern index (default 0)'),
      instrument: z.number().optional().describe('Instrument number to use (default 1)'),
      key: z.string().optional().describe('Root note (e.g., "C", "F#"). Auto-detected if omitted.'),
      scale: z.string().optional().describe('Scale type: major, minor, dorian, phrygian, lydian, mixolydian, pentatonic, pentatonicMinor, blues, chromatic (default: minor)'),
      octave: z.number().optional().describe('Base octave (default 3)'),
      density: z.number().optional().describe('Note density 0-1 (default 0.5, higher = more notes)'),
      params: z.record(z.string(), z.number()).optional().describe('Algorithm-specific params: drums={kick,snare,hihat,rowsPerBeat}, arpeggio={rate}, euclidean={steps,pulses}'),
    },
    (p) => call('generate_pattern', p),
  );

  server.tool(
    'transform_pattern',
    'Apply musical transformations to a channel: transpose (shift semitones), reverse (flip note order), rotate (circular shift), invert (mirror around pivot), retrograde (reverse pitch keep rhythm), augment (double durations), diminish (halve durations), humanize (random velocity variation).',
    {
      patternIndex: z.number().optional().describe('Pattern index (default 0)'),
      channel: z.number().optional().describe('Channel index (default 0)'),
      operation: z.enum(['transpose', 'reverse', 'rotate', 'invert', 'retrograde', 'augment', 'diminish', 'humanize']).describe('Transformation type'),
      params: z.record(z.string(), z.number()).optional().describe('Transform params: transpose={semitones}, rotate={amount}, invert={pivot}, humanize={amount 0-1}'),
    },
    (p) => call('transform_pattern', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // SYNTH PROGRAMMING ASSISTANT
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'analyze_instrument_spectrum',
    'Trigger a note on an instrument, capture FFT data, and compute spectral metrics: fundamental frequency, harmonics, spectral centroid, brightness, RMS level, and envelope shape. Essential for iterative sound design — adjust parameters, re-analyze, compare.',
    {
      instrumentId: z.number().describe('Instrument index to analyze'),
      note: z.string().optional().describe('Note to play (default "C-3"). Format: "C-3", "F#4", "A-2"'),
      durationMs: z.number().optional().describe('Note duration in ms (default 1000)'),
      captureDelayMs: z.number().optional().describe('Delay before starting FFT capture to skip initial transient (default 100ms)'),
    },
    (p) => call('analyze_instrument_spectrum', p),
  );

  server.tool(
    'sweep_parameter',
    'Sweep a synth parameter across a range of values, triggering a note at each step and measuring spectral response (centroid, brightness, RMS). Returns an array of measurements. Use this to find sweet spots for cutoff, resonance, envMod, etc.',
    {
      instrumentId: z.number().describe('Instrument index'),
      parameter: z.string().describe('Parameter name to sweep (e.g., "cutoff", "resonance", "envMod", "decay", "filterInputDrive")'),
      from: z.number().optional().describe('Start value (default 0)'),
      to: z.number().optional().describe('End value (default 1)'),
      steps: z.number().optional().describe('Number of steps (default 10)'),
      note: z.string().optional().describe('Note to play at each step (default "C-3")'),
      noteDurationMs: z.number().optional().describe('Duration of each test note in ms (default 500)'),
      settleMs: z.number().optional().describe('Settle time after parameter change before playing note (default 100ms)'),
    },
    (p) => call('sweep_parameter', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // LIVE PERFORMANCE AGENT
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'start_monitoring',
    'Start the audio monitoring ring buffer. Captures audio snapshots (RMS, peak, band energy, beat detection) at regular intervals. Use get_monitoring_data to read the buffer. Stop with stop_monitoring.',
    {
      bufferSize: z.number().optional().describe('Number of snapshots to keep (default 120 = ~30s at 250ms interval)'),
      intervalMs: z.number().optional().describe('Capture interval in milliseconds (default 250)'),
    },
    (p) => call('start_monitoring', p),
  );

  server.tool(
    'get_monitoring_data',
    'Get current audio monitoring data: energy profile (band breakdown), estimated BPM from beat detection, and a time-series of audio snapshots. Monitor must be running (start_monitoring first).',
    {},
    () => call('get_monitoring_data'),
  );

  server.tool(
    'stop_monitoring',
    'Stop the audio monitoring ring buffer',
    {},
    () => call('stop_monitoring'),
  );

  server.tool(
    'auto_mix',
    'Apply reactive mixer adjustments based on current audio analysis. Modes: "balance" (equalize channel loudness), "duck_bass" (duck non-bass channels when bass is heavy), "emphasize_melody" (boost mid-range channels), "reset" (restore default volumes/pans).',
    {
      mode: z.enum(['balance', 'duck_bass', 'emphasize_melody', 'reset']).describe('Mixing strategy'),
      intensity: z.number().optional().describe('Effect intensity 0-1 (default 0.5)'),
      channels: z.array(z.number()).optional().describe('Channel indices to affect (default: all)'),
    },
    (p) => call('auto_mix', p),
  );

  server.tool(
    'set_auto_effect',
    'Set up an audio-reactive modulation on a master effect parameter. The parameter will be continuously modulated by an audio source (RMS, peak, bass, mid, high, sub, beat) mapped to a value range. Use cancel_auto_effect to stop.',
    {
      effectId: z.string().describe('Master effect ID (from get_audio_state)'),
      parameter: z.string().describe('Effect parameter to modulate (e.g., "wet", "decay", "frequency")'),
      source: z.enum(['rms', 'peak', 'bass', 'mid', 'high', 'sub', 'beat']).optional().describe('Audio source for modulation (default "rms")'),
      min: z.number().optional().describe('Output minimum value (default 0)'),
      max: z.number().optional().describe('Output maximum value (default 100)'),
      smoothing: z.number().optional().describe('Smoothing factor 0-1, higher = smoother (default 0.5)'),
    },
    (p) => call('set_auto_effect', p),
  );

  server.tool(
    'cancel_auto_effect',
    'Cancel an active audio-reactive effect modulation',
    {
      key: z.string().describe('The cancelKey from the set_auto_effect response'),
    },
    (p) => call('cancel_auto_effect', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // MODAL CONTROL
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'dismiss_modal',
    'Dismiss any open modal/dialog in the DEViLBOX UI. Call this after loading a file or on startup to clear the welcome dialog.',
    {},
    () => call('dismiss_modal'),
  );

  server.tool(
    'get_modal_state',
    'Check if any modal/dialog is currently open and what type it is',
    {},
    () => call('get_modal_state'),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // MODLAND SEARCH & BROWSE
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'search_modland',
    'Search the Modland archive (190K+ tracker modules from ftp.modland.com). Returns matching files with format, author, filename, and download path. Use load_modland to play a result.',
    {
      query: z.string().optional().describe('Search text (matches filename, author, format). Prefix-matching supported.'),
      format: z.string().optional().describe('Filter by format name (e.g., "Protracker", "Future Composer 1.4", "TFMX"). Use get_modland_formats to see available formats.'),
      author: z.string().optional().describe('Filter by author/composer name'),
      limit: z.number().optional().describe('Max results (default 20, max 100)'),
      offset: z.number().optional().describe('Pagination offset (default 0)'),
    },
    async (p) => {
      try {
        const params = new URLSearchParams();
        if (p.query) params.set('q', p.query);
        if (p.format) params.set('format', p.format);
        if (p.author) params.set('author', p.author);
        params.set('limit', String(p.limit ?? 20));
        params.set('offset', String(p.offset ?? 0));

        const resp = await fetch(`${API_BASE}/api/modland/search?${params}`);
        if (!resp.ok) return textResult({ error: `Search API returned ${resp.status}` });
        return textResult(await resp.json());
      } catch (e) {
        return textResult({ error: `search_modland failed: ${(e as Error).message}` });
      }
    },
  );

  server.tool(
    'get_modland_formats',
    'List all available Modland formats with file counts. Use format names to filter search_modland results.',
    {},
    async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/modland/formats`);
        if (!resp.ok) return textResult({ error: `Formats API returned ${resp.status}` });
        return textResult(await resp.json());
      } catch (e) {
        return textResult({ error: `get_modland_formats failed: ${(e as Error).message}` });
      }
    },
  );

  server.tool(
    'load_modland',
    'Download a module from Modland and load it into DEViLBOX for playback. Use search_modland first to find the full_path. The file is downloaded (with server-side caching), then sent to the browser for parsing and import.',
    {
      full_path: z.string().describe('The full_path from a search_modland result (e.g., "pub/modules/Future Composer 1.4/Blaizer/horizon v2.fc")'),
      subsong: z.number().optional().describe('Subsong index for multi-song formats (default 0)'),
      autoplay: z.boolean().optional().describe('Automatically start playback after loading (default true)'),
    },
    async (p) => {
      try {
        const remotePath = p.full_path.trim();
        if (!remotePath.startsWith('pub/modules/')) {
          return textResult({ error: 'Invalid path — must start with pub/modules/' });
        }

        // Download via the server's download proxy (handles caching + rate limiting)
        const downloadResp = await fetch(`${API_BASE}/api/modland/download?path=${encodeURIComponent(remotePath)}`);
        if (!downloadResp.ok) {
          const errBody = await downloadResp.text();
          return textResult({ error: `Download failed (${downloadResp.status}): ${errBody}` });
        }

        const buffer = Buffer.from(await downloadResp.arrayBuffer());
        const filename = remotePath.split('/').pop() || 'download';
        const base64 = buffer.toString('base64');

        // Auto-discover and download companion files for multi-file formats
        // (TFMX: mdat.songname + smpl.songname, MIDI-Loriciel: MIDI.songname + SMPL.songname)
        const companionFiles: Record<string, string> = {};
        const lowerFilename = filename.toLowerCase();
        const dirPath = remotePath.slice(0, remotePath.lastIndexOf('/'));

        // Prefix-pair formats: mdat↔smpl, MIDI↔SMPL, jpn↔smp, thm↔smp, mfp↔smp,
        // sjs↔smp, MAX↔SMP, mcr↔mcs
        const prefixPairs: [string, string][] = [
          ['mdat.', 'smpl.'], ['smpl.', 'mdat.'],
          ['midi.', 'smpl.'], ['smpl.', 'midi.'],
          ['jpn.', 'smp.'], ['smp.', 'jpn.'],
          ['jpnd.', 'smp.'], ['smp.', 'jpnd.'],
          ['thm.', 'smp.'], ['smp.', 'thm.'],
          ['mfp.', 'smp.'], ['smp.', 'mfp.'],
          ['sjs.', 'smp.'], ['smp.', 'sjs.'],
          ['max.', 'smp.'], ['smp.', 'max.'],
          ['mcr.', 'mcs.'], ['mcs.', 'mcr.'],
        ];
        for (const [myPrefix, pairPrefix] of prefixPairs) {
          if (lowerFilename.startsWith(myPrefix)) {
            const suffix = filename.slice(myPrefix.length);
            const pairName = `${pairPrefix}${suffix}`;
            const pairPath = `${dirPath}/${pairName}`;
            try {
              const pairResp = await fetch(`${API_BASE}/api/modland/download?path=${encodeURIComponent(pairPath)}`);
              if (pairResp.ok) {
                const pairBuf = Buffer.from(await pairResp.arrayBuffer());
                companionFiles[pairName] = pairBuf.toString('base64');
              }
            } catch { /* companion download is best-effort */ }
          }
        }

        // Extension-pair companions: .sng↔.ins, .dum↔.ins, .4v↔.set
        const extensionPairs: [string, string][] = [
          ['.sng', '.ins'], ['.dum', '.ins'], ['.4v', '.set'],
        ];
        for (const [myExt, pairExt] of extensionPairs) {
          if (lowerFilename.endsWith(myExt)) {
            const baseName = filename.slice(0, filename.length - myExt.length);
            const pairName = `${baseName}${pairExt}`;
            const pairPath = `${dirPath}/${pairName}`;
            try {
              const pairResp = await fetch(`${API_BASE}/api/modland/download?path=${encodeURIComponent(pairPath)}`);
              if (pairResp.ok) {
                const pairBuf = Buffer.from(await pairResp.arrayBuffer());
                companionFiles[pairName] = pairBuf.toString('base64');
              }
            } catch { /* companion download is best-effort */ }
          }
        }

        // Shared sample set: smp.set (Synth Pack, Quartet, Maximum Effect)
        if (lowerFilename !== 'smp.set') {
          const smpSetPath = `${dirPath}/smp.set`;
          try {
            const smpResp = await fetch(`${API_BASE}/api/modland/download?path=${encodeURIComponent(smpSetPath)}`);
            if (smpResp.ok) {
              const smpBuf = Buffer.from(await smpResp.arrayBuffer());
              companionFiles['smp.set'] = smpBuf.toString('base64');
            }
          } catch { /* best-effort */ }
        }

        // Kris Hatlelid: .kh + songplay companion
        if (lowerFilename.endsWith('.kh')) {
          const songplayPath = `${dirPath}/songplay`;
          try {
            const spResp = await fetch(`${API_BASE}/api/modland/download?path=${encodeURIComponent(songplayPath)}`);
            if (spResp.ok) {
              const spBuf = Buffer.from(await spResp.arrayBuffer());
              companionFiles['songplay'] = spBuf.toString('base64');
            }
          } catch { /* best-effort */ }
        }

        // Send to browser for loading
        const loadResult = await callBrowser('load_file', {
          filename,
          data: base64,
          subsong: p.subsong,
          ...(Object.keys(companionFiles).length > 0 ? { companionFiles } : {}),
        });

        // Auto-play in song mode unless explicitly disabled
        if (p.autoplay !== false) {
          try {
            await callBrowser('play', { mode: 'song' });
          } catch { /* ignore play errors */ }
        }

        return textResult({
          ...((typeof loadResult === 'object' && loadResult !== null) ? loadResult : { result: loadResult }),
          source: 'modland',
          path: remotePath,
          filename,
          autoplay: p.autoplay !== false,
        });
      } catch (e) {
        return textResult({ error: `load_modland failed: ${(e as Error).message}` });
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // HVSC (HIGH VOLTAGE SID COLLECTION) — C64 SID TUNES
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'search_hvsc',
    'Search the High Voltage SID Collection (80K+ C64 SID tunes) via the DeepSID database. Matches filename, author, path, and copyright. Returns SID metadata including author, SID model (6581/8580), subtune count, and download path. Use load_hvsc to play a result.',
    {
      query: z.string().describe('Search text (matches filename, author, HVSC path, copyright)'),
      limit: z.number().optional().describe('Max results (default 20, max 100)'),
      offset: z.number().optional().describe('Pagination offset (default 0)'),
    },
    async (p) => {
      try {
        const params = new URLSearchParams();
        params.set('q', p.query);
        params.set('limit', String(p.limit ?? 20));
        params.set('offset', String(p.offset ?? 0));

        const resp = await fetch(`${API_BASE}/api/hvsc/search?${params}`);
        if (!resp.ok) return textResult({ error: `HVSC search API returned ${resp.status}` });
        return textResult(await resp.json());
      } catch (e) {
        return textResult({ error: `search_hvsc failed: ${(e as Error).message}` });
      }
    },
  );

  server.tool(
    'get_hvsc_featured',
    'Get a curated list of classic C64 SID tunes (Rob Hubbard, Martin Galway, Jeroen Tel). Good starting point for exploring the HVSC.',
    {},
    async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/hvsc/featured`);
        if (!resp.ok) return textResult({ error: `HVSC featured API returned ${resp.status}` });
        return textResult(await resp.json());
      } catch (e) {
        return textResult({ error: `get_hvsc_featured failed: ${(e as Error).message}` });
      }
    },
  );

  server.tool(
    'browse_hvsc',
    'Browse the HVSC directory tree. Start with no path for root (DEMOS, GAMES, MUSICIANS), then drill into subdirectories. For finding specific tunes, use search_hvsc instead.',
    {
      path: z.string().optional().describe('HVSC directory path (e.g., "MUSICIANS/H/Hubbard_Rob"). Empty for root.'),
    },
    async (p) => {
      try {
        const params = new URLSearchParams();
        if (p.path) params.set('path', p.path);

        const resp = await fetch(`${API_BASE}/api/hvsc/browse?${params}`);
        if (!resp.ok) return textResult({ error: `HVSC browse API returned ${resp.status}` });
        return textResult(await resp.json());
      } catch (e) {
        return textResult({ error: `browse_hvsc failed: ${(e as Error).message}` });
      }
    },
  );

  server.tool(
    'load_hvsc',
    'Download a SID tune from HVSC mirrors and load it into DEViLBOX for playback. Use search_hvsc first to find the path. The server proxies the download (HVSC mirrors block CORS), caches for 24h, then sends to the browser.',
    {
      path: z.string().describe('HVSC path from a search_hvsc result (e.g., "MUSICIANS/H/Hubbard_Rob/Commando.sid")'),
      subsong: z.number().optional().describe('Subtune index (default 0). Many SID files contain multiple tunes.'),
      autoplay: z.boolean().optional().describe('Automatically start playback after loading (default true)'),
    },
    async (p) => {
      try {
        const sidPath = p.path.trim();

        // Download via the server's HVSC proxy (handles mirrors + caching + rate limiting)
        const downloadResp = await fetch(`${API_BASE}/api/hvsc/download?path=${encodeURIComponent(sidPath)}`);
        if (!downloadResp.ok) {
          const errBody = await downloadResp.text();
          return textResult({ error: `HVSC download failed (${downloadResp.status}): ${errBody}` });
        }

        const buffer = Buffer.from(await downloadResp.arrayBuffer());
        const filename = sidPath.split('/').pop() || 'tune.sid';
        const base64 = buffer.toString('base64');

        // Send to browser for loading
        const loadResult = await callBrowser('load_file', {
          filename,
          data: base64,
          subsong: p.subsong,
        });

        // Auto-play in song mode unless explicitly disabled
        if (p.autoplay !== false) {
          try {
            await callBrowser('play', { mode: 'song' });
          } catch { /* ignore play errors */ }
        }

        return textResult({
          ...((typeof loadResult === 'object' && loadResult !== null) ? loadResult : { result: loadResult }),
          source: 'hvsc',
          path: sidPath,
          filename,
          autoplay: p.autoplay !== false,
        });
      } catch (e) {
        return textResult({ error: `load_hvsc failed: ${(e as Error).message}` });
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELP & BATCH OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_mcp_help',
    'List all available MCP tools grouped by category with brief descriptions. Use this to discover what DEViLBOX can do. Optionally filter by category.',
    {
      category: z.string().optional().describe('Filter by category name (e.g., "transport", "mixer", "pattern", "synth", "modland", "hvsc", "performance")'),
    },
    async (p) => {
      const categories: Record<string, Array<{ tool: string; description: string }>> = {
        'Song & Project': [
          { tool: 'get_song_info', description: 'Song state: BPM, speed, channels, patterns, order' },
          { tool: 'get_full_state', description: 'Comprehensive dump of ALL tracker state' },
          { tool: 'get_project_metadata', description: 'Project name, author, comments' },
          { tool: 'set_project_metadata', description: 'Update project name, author, comments' },
        ],
        'Pattern Editing': [
          { tool: 'get_pattern', description: 'Get pattern data (notes, instruments, effects)' },
          { tool: 'get_pattern_list', description: 'List all patterns with metadata' },
          { tool: 'get_cell', description: 'Get a single cell value' },
          { tool: 'get_channel_column', description: 'Get all cells in a channel column' },
          { tool: 'set_cell', description: 'Set a cell (note, instrument, volume, effects)' },
          { tool: 'set_cells', description: 'Set multiple cells atomically' },
          { tool: 'clear_cell', description: 'Clear a cell' },
          { tool: 'clear_pattern', description: 'Clear an entire pattern' },
          { tool: 'clear_channel', description: 'Clear a channel in a pattern' },
          { tool: 'fill_range', description: 'Fill a range with values' },
          { tool: 'write_note_sequence', description: 'Write a note sequence string' },
          { tool: 'add_pattern', description: 'Add a new empty pattern' },
          { tool: 'duplicate_pattern', description: 'Duplicate an existing pattern' },
          { tool: 'resize_pattern', description: 'Change pattern row count' },
          { tool: 'insert_row', description: 'Insert a row, shifting others down' },
          { tool: 'delete_row', description: 'Delete a row, shifting others up' },
          { tool: 'swap_channels', description: 'Swap two channels' },
          { tool: 'render_pattern_text', description: 'Render pattern as ASCII text' },
          { tool: 'validate_pattern', description: 'Check pattern for issues' },
          { tool: 'search_pattern', description: 'Search for notes/values in a pattern' },
          { tool: 'get_pattern_stats', description: 'Pattern statistics (note density, etc.)' },
          { tool: 'diff_patterns', description: 'Diff two patterns' },
        ],
        'Pattern Order': [
          { tool: 'get_pattern_order', description: 'Get the song arrangement order' },
          { tool: 'set_pattern_order', description: 'Set the full pattern order' },
          { tool: 'add_to_order', description: 'Add a pattern to the order' },
          { tool: 'remove_from_order', description: 'Remove a position from the order' },
        ],
        'Transport': [
          { tool: 'play', description: 'Start playback' },
          { tool: 'stop', description: 'Stop playback' },
          { tool: 'pause', description: 'Pause playback' },
          { tool: 'set_bpm', description: 'Set tempo (BPM)' },
          { tool: 'set_speed', description: 'Set tracker speed' },
          { tool: 'set_swing', description: 'Set swing amount' },
          { tool: 'set_global_pitch', description: 'Set global pitch offset' },
          { tool: 'toggle_metronome', description: 'Toggle metronome click' },
          { tool: 'set_looping', description: 'Enable/disable pattern looping' },
          { tool: 'seek_to', description: 'Seek to a position' },
          { tool: 'get_playback_state', description: 'Get playback state (playing, position, BPM)' },
        ],
        'Mixer': [
          { tool: 'get_mixer_state', description: 'Get all channel volumes, pans, mutes, solos' },
          { tool: 'set_master_volume', description: 'Set master volume' },
          { tool: 'set_master_mute', description: 'Mute/unmute master' },
          { tool: 'set_channel_volume', description: 'Set a channel volume' },
          { tool: 'set_channel_pan', description: 'Set a channel pan' },
          { tool: 'set_channel_mute', description: 'Mute/unmute a channel' },
          { tool: 'set_channel_solo', description: 'Solo/unsolo a channel' },
          { tool: 'solo_channel', description: 'Solo one channel, muting others' },
          { tool: 'mute_all_channels', description: 'Mute all channels' },
          { tool: 'unmute_all_channels', description: 'Unmute all channels' },
          { tool: 'set_sample_bus_gain', description: 'Set sample bus gain (dB)' },
          { tool: 'set_synth_bus_gain', description: 'Set synth bus gain (dB)' },
        ],
        'Master Effects': [
          { tool: 'add_master_effect', description: 'Add effect to master chain' },
          { tool: 'update_master_effect', description: 'Update effect parameters' },
          { tool: 'remove_master_effect', description: 'Remove effect from chain' },
          { tool: 'toggle_master_effect', description: 'Toggle effect on/off' },
        ],
        'Instruments': [
          { tool: 'get_instruments_list', description: 'List all instruments' },
          { tool: 'get_instrument', description: 'Get instrument details' },
          { tool: 'get_current_instrument', description: 'Get currently selected instrument' },
          { tool: 'select_instrument', description: 'Select an instrument' },
          { tool: 'create_instrument', description: 'Create a new instrument' },
          { tool: 'update_instrument', description: 'Update instrument properties' },
          { tool: 'delete_instrument', description: 'Delete an instrument' },
          { tool: 'clone_instrument', description: 'Clone an instrument' },
        ],
        'Synth & Sound Design': [
          { tool: 'get_synth_config', description: 'Get synth sub-configs (TB303, envelope, etc.)' },
          { tool: 'update_synth_config', description: 'Update synth sub-config' },
          { tool: 'set_synth_param', description: 'Set real-time synth parameter' },
          { tool: 'get_loaded_synths', description: 'List active synth instances' },
          { tool: 'trigger_note', description: 'Trigger a note for preview' },
          { tool: 'release_note', description: 'Release a held note' },
          { tool: 'release_all_notes', description: 'Release all notes' },
          { tool: 'analyze_instrument_spectrum', description: 'Capture FFT spectrum of a note' },
          { tool: 'sweep_parameter', description: 'Sweep param range, measuring spectral response' },
        ],
        'Samples': [
          { tool: 'get_sample_info', description: 'Sample metadata: loops, rate, slices' },
          { tool: 'get_sample_waveform', description: 'Downsampled waveform for display' },
        ],
        'AI Composition': [
          { tool: 'analyze_song', description: 'Detect key, scale, chords, channel roles' },
          { tool: 'generate_pattern', description: 'Generate bass/drums/arpeggio/melody/chords' },
          { tool: 'transform_pattern', description: 'Transform: transpose, reverse, invert, rotate, etc.' },
        ],
        'Live Performance': [
          { tool: 'start_monitoring', description: 'Start audio monitoring ring buffer' },
          { tool: 'get_monitoring_data', description: 'Get energy profile, BPM, snapshots' },
          { tool: 'stop_monitoring', description: 'Stop audio monitoring' },
          { tool: 'auto_mix', description: 'Reactive mixer: balance, duck, emphasize, reset' },
          { tool: 'set_auto_effect', description: 'Audio-reactive effect parameter modulation' },
          { tool: 'cancel_auto_effect', description: 'Cancel an auto-effect modulation' },
        ],
        'Audio Analysis': [
          { tool: 'get_audio_analysis', description: 'RMS, peak, FFT, band energy, beat detection' },
          { tool: 'get_audio_context_info', description: 'Web Audio context state' },
          { tool: 'get_voice_state', description: 'Voice allocation state' },
          { tool: 'get_instrument_level', description: 'Per-instrument audio level' },
          { tool: 'get_audio_state', description: 'Audio engine diagnostics' },
          { tool: 'get_audio_level', description: 'Measure audio output level over time' },
          { tool: 'wait_for_audio', description: 'Wait until audio output is detected' },
        ],
        'File Loading': [
          { tool: 'load_file', description: 'Load a music file from disk (188+ formats)' },
        ],
        'Modland Archive': [
          { tool: 'search_modland', description: 'Search 190K+ tracker modules' },
          { tool: 'get_modland_formats', description: 'List available formats' },
          { tool: 'load_modland', description: 'Download & play a Modland module' },
        ],
        'HVSC (C64 SID)': [
          { tool: 'search_hvsc', description: 'Search 80K+ SID tunes' },
          { tool: 'get_hvsc_featured', description: 'Curated classic SID tunes' },
          { tool: 'browse_hvsc', description: 'Browse HVSC directory tree' },
          { tool: 'load_hvsc', description: 'Download & play a SID tune' },
        ],
        'Editor & UI': [
          { tool: 'get_cursor', description: 'Current cursor position' },
          { tool: 'get_selection', description: 'Current selection range' },
          { tool: 'get_editor_state', description: 'Editor settings (octave, step, record mode)' },
          { tool: 'get_ui_state', description: 'UI state (active view, zoom, status)' },
          { tool: 'get_channel_state', description: 'Channel visibility and naming' },
          { tool: 'move_cursor', description: 'Move cursor position' },
          { tool: 'select_range', description: 'Select a range of cells' },
          { tool: 'select_all', description: 'Select all cells in pattern' },
          { tool: 'clear_selection', description: 'Clear the selection' },
          { tool: 'set_octave', description: 'Set editor octave' },
          { tool: 'set_edit_step', description: 'Set edit step (row advance)' },
          { tool: 'toggle_record_mode', description: 'Toggle record/edit mode' },
          { tool: 'set_follow_playback', description: 'Follow playback cursor' },
          { tool: 'set_active_view', description: 'Switch UI view' },
          { tool: 'set_status_message', description: 'Show status bar message' },
          { tool: 'set_tracker_zoom', description: 'Set tracker zoom level' },
          { tool: 'set_column_visibility', description: 'Show/hide tracker columns' },
          { tool: 'toggle_bookmark', description: 'Toggle row bookmark' },
        ],
        'Transforms': [
          { tool: 'transpose_selection', description: 'Transpose selection by semitones' },
          { tool: 'interpolate_selection', description: 'Interpolate values in selection' },
          { tool: 'humanize_selection', description: 'Add random velocity variation' },
          { tool: 'scale_volume', description: 'Scale volume in selection' },
          { tool: 'fade_volume', description: 'Fade volume across selection' },
        ],
        'Clipboard': [
          { tool: 'copy_selection', description: 'Copy selection to clipboard' },
          { tool: 'cut_selection', description: 'Cut selection to clipboard' },
          { tool: 'paste', description: 'Paste clipboard at cursor' },
          { tool: 'get_clipboard_state', description: 'Clipboard state' },
        ],
        'History': [
          { tool: 'undo', description: 'Undo last edit' },
          { tool: 'redo', description: 'Redo last undone edit' },
          { tool: 'get_history_state', description: 'Undo/redo stack info' },
        ],
        'Diagnostics': [
          { tool: 'get_synth_errors', description: 'Get synth error log' },
          { tool: 'dismiss_errors', description: 'Dismiss error notifications' },
          { tool: 'get_format_state', description: 'Format-specific state' },
          { tool: 'get_midi_state', description: 'MIDI device state' },
          { tool: 'get_oscilloscope_info', description: 'Oscilloscope state' },
          { tool: 'get_arrangement_state', description: 'Arrangement timeline state' },
          { tool: 'get_command_list', description: 'All keyboard commands' },
          { tool: 'execute_command', description: 'Execute a named command' },
        ],
        'Testing': [
          { tool: 'run_format_test', description: 'Load→play→measure single file, return pass/fail' },
          { tool: 'run_regression_suite', description: 'Batch test multiple files, return pass rate' },
        ],
        'Export': [
          { tool: 'export_wav', description: 'Render pattern/song to WAV (base64)' },
          { tool: 'export_pattern_text', description: 'Export pattern as tracker text or CSV' },
          { tool: 'export_midi', description: 'Export pattern/song to MIDI (base64)' },
          { tool: 'export_mod', description: 'Export loaded song to ProTracker MOD (base64); bakes OctaMED synths to PCM' },
          { tool: 'export_native', description: 'Export loaded song to its native format (55+ formats) with edits preserved' },
        ],
        'Soak Test / Telemetry': [
          { tool: 'dj_vj_action', description: 'Execute DJ/VJ soak-test action (dev-only)' },
          { tool: 'get_frame_stats', description: 'Frame-time percentiles from rAF recorder (dev-only)' },
          { tool: 'get_gpu_stats', description: 'GPU info from WebGL context (dev-only)' },
        ],
        'Utility': [
          { tool: 'get_mcp_help', description: 'This help listing' },
          { tool: 'batch', description: 'Execute multiple tool calls atomically' },
        ],
      };

      const filter = p.category?.toLowerCase();
      let result: Record<string, Array<{ tool: string; description: string }>>;

      if (filter) {
        result = {};
        for (const [cat, tools] of Object.entries(categories)) {
          if (cat.toLowerCase().includes(filter)) {
            result[cat] = tools;
          }
        }
        if (Object.keys(result).length === 0) {
          return textResult({
            error: `No category matching "${p.category}". Available: ${Object.keys(categories).join(', ')}`,
          });
        }
      } else {
        result = categories;
      }

      // Add summary
      const totalTools = Object.values(result).reduce((sum, tools) => sum + tools.length, 0);
      return textResult({
        totalTools,
        categories: Object.keys(result).length,
        tools: result,
      });
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // FORMAT REGRESSION TESTING
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'run_format_test',
    'Load a single music file, play it, measure audio output, and return pass/fail with metrics. The file must be base64-encoded. Returns: load time, audio detection time, RMS levels, and pass/fail.',
    {
      filename: z.string().describe('Filename with extension (e.g. "test.mod")'),
      data: z.string().describe('Base64-encoded file data'),
      subsong: z.number().optional().describe('Subsong index (default 0)'),
      playDurationMs: z.number().optional().describe('How long to play before measuring (default 3000ms)'),
      measureDurationMs: z.number().optional().describe('How long to measure audio levels (default 2000ms)'),
      audioTimeoutMs: z.number().optional().describe('Max wait for audio to start (default 5000ms)'),
    },
    (p) => call('run_format_test', p),
  );

  server.tool(
    'run_regression_suite',
    'Run a batch of format tests. Pass an array of files, each with filename + base64 data. Returns per-file pass/fail results and overall pass rate.',
    {
      files: z.array(z.object({
        filename: z.string().describe('Filename with extension'),
        data: z.string().describe('Base64-encoded file data'),
        subsong: z.number().optional().describe('Subsong index'),
      })).describe('Array of files to test'),
      playDurationMs: z.number().optional().describe('Play duration per file (default 2000ms)'),
      measureDurationMs: z.number().optional().describe('Measure duration per file (default 1000ms)'),
    },
    (p) => call('run_regression_suite', p as Record<string, unknown>),
  );

  server.tool(
    'run_synth_tests',
    'Run synth load+trigger tests in the browser. Suite: "tone" (Tone.js), "custom" (TB303/Buzz/etc), "furnace" (Furnace chips), "mame" (MAME chips), "all" (everything). Returns per-synth pass/fail with loaded/producedSound/noteOnWorked flags. For "mame", use startIndex+batchSize to test in small batches (e.g. batchSize:3) to avoid CPU overload.',
    {
      suite: z.enum(['tone', 'custom', 'furnace', 'mame', 'all']).optional().describe('Which synth suite to test (default: "all")'),
      timeout: z.number().optional().describe('Per-synth timeout in ms (default: 5000; use 30000 for MAME)'),
      startIndex: z.number().optional().describe('For mame suite: index of first synth to test (default: 0)'),
      batchSize: z.number().optional().describe('For mame suite: number of synths to test (default: 0 = all). Use 3 to avoid CPU overload.'),
    },
    (p) => call('run_synth_tests', p),
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // EXPORT TOOLS
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'export_wav',
    'Render current pattern or full song to WAV audio. Returns base64-encoded WAV data in `wavBase64`. Works for all formats (Tone.js synths, OctaMED, ProTracker MOD, and native WASM engines). For live-capture formats (native engines), this is two-phase: first call returns a captureId; poll with that captureId until status is "done". Pass `format: "mp3"` to receive MP3 data in `mp3Base64` instead.',
    {
      scope: z.enum(['pattern', 'song']).optional().describe('Export scope: "pattern" (default) or "song" (all patterns in order)'),
      patternIndex: z.number().optional().describe('Pattern index to export (default: current pattern). Only used when scope="pattern".'),
      captureId: z.string().optional().describe('Poll a running live-capture by its ID (returned from a previous export_wav/export_mp3 call). When provided, returns status "capturing" or "done" with the encoded audio.'),
      maxDurationSec: z.number().optional().describe('Cap live-capture duration in seconds (default 60). Ignored for offline renders.'),
      format: z.enum(['wav', 'mp3']).optional().describe('Output format: "wav" (default, lossless 16-bit PCM) or "mp3" (lossy, smaller files — good for posting to chat / web).'),
      kbps: z.number().optional().describe('MP3 bitrate in kbps (default 192). Only used when format="mp3". Common values: 128 (small), 192 (good), 320 (archival).'),
    },
    (p) => call('export_wav', p),
  );

  server.tool(
    'export_mp3',
    'Render current pattern or full song to MP3 audio. Returns base64-encoded MP3 data in `mp3Base64`. Sibling of `export_wav` that defaults to MP3 output — smaller files, good for chat / web sharing. Same two-phase live-capture flow (first call returns captureId, poll until status="done"). Default bitrate is 192 kbps.',
    {
      scope: z.enum(['pattern', 'song']).optional().describe('Export scope: "pattern" (default) or "song" (all patterns in order)'),
      patternIndex: z.number().optional().describe('Pattern index to export (default: current pattern). Only used when scope="pattern".'),
      captureId: z.string().optional().describe('Poll a running live-capture by its ID (returned from a previous export_wav/export_mp3 call).'),
      maxDurationSec: z.number().optional().describe('Cap live-capture duration in seconds (default 60).'),
      kbps: z.number().optional().describe('MP3 bitrate in kbps (default 192). Common values: 128, 192, 320.'),
    },
    (p) => call('export_mp3', p),
  );

  server.tool(
    'export_stems',
    'Render every channel as its own audio file via live-solo capture (one channel unmuted per pass). Returns an array of `{channelIndex, channelName, format, mimeType, sizeBytes, wavBase64|mp3Base64}` — one entry per channel. Correct for every format (WASM synths, master FX, dub bus all included) but real-time cost is N × song duration: a 16-channel 3-minute song takes ~48 minutes. Use sparingly; this does not return until every stem is captured.',
    {
      format: z.enum(['wav', 'mp3']).optional().describe('Output format (default "wav"). "mp3" uses 192 kbps by default.'),
      kbps: z.number().optional().describe('MP3 bitrate in kbps (default 192). Only used when format="mp3".'),
    },
    (p) => call('export_stems', p),
  );

  server.tool(
    'export_pattern_text',
    'Export a pattern as formatted text (tracker ASCII view or CSV). Useful for analysis, documentation, or piping to other tools.',
    {
      patternIndex: z.number().optional().describe('Pattern index (default: current)'),
      format: z.enum(['tracker', 'csv']).optional().describe('"tracker" (ASCII tracker view, default) or "csv" (row,channel,note,instrument,volume,effectType,effectValue)'),
    },
    (p) => call('export_pattern_text', p),
  );

  server.tool(
    'export_midi',
    'Export current pattern or full song to Standard MIDI File. Returns base64-encoded MIDI data.',
    {
      scope: z.enum(['pattern', 'song']).optional().describe('Export scope: "pattern" (default) or "song"'),
      patternIndex: z.number().optional().describe('Pattern index (default: current). Only used when scope="pattern".'),
    },
    (p) => call('export_midi', p),
  );

  server.tool(
    'export_mod',
    'Export the loaded song to a tracker module format via OpenMPT WASM. Returns base64-encoded file data plus any warnings.',
    {
      format: z.enum(['mod', 'xm', 'it', 's3m']).optional().describe('Output format (default: mod)'),
    },
    (p) => call('export_mod', p),
  );

  server.tool(
    'export_native',
    'Export the loaded song to its native tracker format (e.g. HVL, FC, OKT, TFMX, etc.) with all edits preserved. Returns base64-encoded file data. Supports 55+ formats with dedicated serializers plus chip RAM readback fallback for UADE formats. Optionally saves to disk via outputPath.',
    {
      outputPath: z.string().optional().describe('Absolute path to save the exported file to disk (optional — if omitted, only returns base64)'),
    },
    async (p) => {
      const result = await call('export_native', {});
      // Save to disk server-side if outputPath provided
      if (p.outputPath && result?.content?.[0]?.type === 'text') {
        const parsed = JSON.parse(result.content[0].text);
        if (parsed.nativeBase64) {
          const fs = await import('fs');
          const buf = Buffer.from(parsed.nativeBase64, 'base64');
          fs.writeFileSync(p.outputPath, buf);
          parsed.savedTo = p.outputPath;
          delete parsed.nativeBase64; // Don't send huge base64 back when saving to disk
          return { content: [{ type: 'text' as const, text: JSON.stringify(parsed) }] };
        }
      }
      return result;
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONSOLE CAPTURE & DEBUGGING
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_console_errors',
    'Get browser console errors and warnings captured since the last clear_console_errors call. Returns an array of {level, message, timestamp} entries. Use this after loading a song to see WASM crashes, JS errors, and worklet failures.',
    {},
    () => call('get_console_errors'),
  );

  server.tool(
    'clear_console_errors',
    'Clear the browser console error buffer. Call before loading a song to get clean per-song error output.',
    {},
    () => call('clear_console_errors'),
  );

  server.tool(
    'play_fur',
    'Load a .fur file from disk and immediately start playback. Combines load_file + play in one call.',
    {
      path: z.string().describe('Absolute path to the .fur file'),
      subsong: z.number().optional().describe('Subsong index (default 0)'),
    },
    async (p) => {
      try {
        const fileData = await readFile(p.path);
        const base64 = fileData.toString('base64');
        const filename = basename(p.path);
        await callBrowser('load_file', { filename, data: base64, subsong: p.subsong });
        return textResult(await callBrowser('play', {}));
      } catch (e) {
        return textResult({ error: `Failed to load/play file: ${(e as Error).message}` });
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // SOAK TEST / TELEMETRY (dev-only tools for DJ/VJ stress testing)
  // ═══════════════════════════════════════════════════════════════════════════════

  server.tool(
    'dj_vj_action',
    'Execute a DJ/VJ soak-test action in the browser (dev-only). Actions: switchView, loadDeck, playDeck, stopDeck, setCrossfader, setEQ, setFilter, setDeckVolume, nextVjPreset.',
    {
      action: z.string().describe('Action name (e.g. "switchView", "loadDeck", "playDeck")'),
      args: z.record(z.string(), z.any()).optional().describe('Action arguments'),
    },
    async (p) => {
      // For loadDeck, read the file server-side and pass base64 data
      if (p.action === 'loadDeck' && p.args?.path && !p.args?.data) {
        const filePath = p.args.path as string;
        const fileData = await readFile(filePath);
        const base64 = fileData.toString('base64');
        const filename = basename(filePath);
        return call('dj_vj_action', {
          action: p.action,
          args: { ...p.args, filename, data: base64 },
        });
      }
      return call('dj_vj_action', { action: p.action, args: p.args ?? {} });
    },
  );

  server.tool(
    'get_frame_stats',
    'Get frame-time statistics from the browser rAF recorder (dev-only soak telemetry). Returns p50/p95/p99/max/jankRatio, then resets the ring buffer.',
    {},
    () => call('get_frame_stats'),
  );

  server.tool(
    'get_gpu_stats',
    'Get GPU information from the browser WebGL context (dev-only soak telemetry). Returns renderer, vendor, maxTextureSize.',
    {},
    () => call('get_gpu_stats'),
  );

  server.tool(
    'batch',
    'Execute multiple tool calls in sequence, returning all results. Useful for atomic multi-step operations (e.g., set multiple cells then play). Stops on first error unless continueOnError is true.',
    {
      operations: z.array(z.object({
        tool: z.string().describe('Tool name to call'),
        args: z.record(z.string(), z.any()).optional().describe('Tool arguments'),
      })).describe('List of operations to execute in order'),
      continueOnError: z.boolean().optional().describe('Continue executing after an error (default false)'),
    },
    async (p) => {
      const results: Array<{ tool: string; success: boolean; result?: unknown; error?: string }> = [];

      for (const op of p.operations) {
        try {
          const result = await callBrowser(op.tool, op.args ?? {});
          results.push({ tool: op.tool, success: true, result });
        } catch (e) {
          const error = (e as Error).message;
          results.push({ tool: op.tool, success: false, error });
          if (!p.continueOnError) {
            return textResult({
              completed: results.length,
              total: p.operations.length,
              stoppedOnError: true,
              results,
            });
          }
        }
      }

      return textResult({
        completed: results.length,
        total: p.operations.length,
        allSucceeded: results.every(r => r.success),
        results,
      });
    },
  );

  return server;
}
