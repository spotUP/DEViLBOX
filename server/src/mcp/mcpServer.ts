/**
 * MCP Server — tool definitions for DEViLBOX tracker control.
 *
 * All tools delegate to the browser via the WS relay.
 * Organized into categories: Song, Pattern, Cell, Transport, Mixer, Editor, UI, Instrument, History, Transforms.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callBrowser } from './wsRelay';

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

  server.tool('play', 'Start playback (requires prior AudioContext unlock by user gesture)', {}, () => call('play'));
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
      updates: z.record(z.unknown()).describe('Key-value pairs to merge into the sub-config'),
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
      updates: z.record(z.unknown()).describe('Parameter updates (e.g., { "wet": 50, "parameters": { "decay": 2.5 } })'),
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

  return server;
}
