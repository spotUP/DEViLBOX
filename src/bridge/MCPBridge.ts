/**
 * MCP Bridge — Browser-side WebSocket client.
 *
 * Connects to the MCP server's WS relay (port 4003), receives method calls,
 * dispatches them to the appropriate handler, and sends back responses.
 * Auto-reconnects with exponential backoff (1s, 2s, 4s, capped at 4s).
 */

import type { BridgeRequest, BridgeResponse } from './protocol';
import {
  getSongInfo,
  getFullState,
  getProjectMetadata,
  getPattern,
  getPatternList,
  getPatternOrder,
  getCell,
  getChannelColumn,
  searchPattern,
  getPatternStats,
  diffPatterns,
  getInstrumentsList,
  getInstrument,
  getCurrentInstrument,
  getPlaybackState,
  getCursor,
  getSelection,
  getEditorState,
  getMixerState,
  getChannelState,
  getUIState,
  getHistoryState,
  getOscilloscopeInfo,
  getAudioState,
  getDubBusState,
  getSynthErrors,
  getFormatState,
  getMIDIState,
  getClipboardState,
  getCommandList,
  renderPatternText,
  validatePattern,
  getSampleInfo,
  getSampleWaveform,
  getSynthConfig,
  getAudioAnalysis,
  getAudioContextInfo,
  getVoiceState,
  getInstrumentLevel,
  getLoadedSynths,
  getConsoleErrors,
} from './handlers/readHandlers';
import {
  setCell,
  setCells,
  clearCell,
  clearPattern,
  clearChannel,
  addPattern,
  duplicatePattern,
  resizePattern,
  setPatternOrder,
  addToOrder,
  removeFromOrder,
  insertRow,
  deleteRow,
  swapChannels,
  setBpm,
  setSpeed,
  play,
  stop,
  pause,
  setSwing,
  setGlobalPitch,
  toggleMetronome,
  setLooping,
  seekTo,
  moveCursor,
  selectRange,
  selectAll,
  clearSelection,
  transposeSelection,
  interpolateSelection,
  humanizeSelection,
  scaleVolume,
  fadeVolume,
  setMasterVolume,
  setMasterMute,
  setChannelVolume,
  setChannelPan,
  setChannelMute,
  setChannelSolo,
  setChannelDubSend,
  setDubBusEnabled,
  setDubBusSettings,
  fireDubMove,
  soloChannel,
  muteAllChannels,
  unmuteAllChannels,
  setOctave,
  setEditStep,
  toggleRecordMode,
  setFollowPlayback,
  setActiveView,
  setStatusMessage,
  setTrackerZoom,
  selectInstrument,
  createInstrument,
  updateInstrument,
  deleteInstrument,
  cloneInstrument,
  setProjectMetadata,
  undo,
  redo,
  executeCommand,
  fillRange,
  writeNoteSequence,
  copySelection,
  cutSelection,
  pasteClipboard,
  dismissErrors,
  setColumnVisibility,
  toggleBookmark,
  setSynthParam,
  triggerNote,
  releaseNote,
  releaseAllNotes,
  updateSynthConfig,
  addMasterEffect,
  updateMasterEffect,
  removeMasterEffect,
  toggleMasterEffect,
  setMasterEffects,
  setSampleBusGain,
  setSynthBusGain,
  loadFile,
  testTone,
  getAudioLevel,
  waitForAudio,
  analyzeInstrumentSpectrum,
  sweepParameter,
  startMonitoring,
  getMonitoringData,
  stopMonitoring,
  autoMix,
  setAutoEffect,
  cancelAutoEffect,
  dismissModal,
  getModalState,
  runFormatTest,
  runRegressionSuite,
  runSynthTests,
  exportWav,
  exportMp3,
  exportPatternText,
  exportMidi,
  exportMod,
  exportNative,
  clearConsoleErrors,
  evaluateScript,
} from './handlers/writeHandlers';
import { analyzeSongHandler } from './handlers/analysisHandlers';
import { generatePattern, transformPattern } from './handlers/generatorHandlers';
import {
  getDJState, getDJPlaylistState,
  djTogglePlay, djStop, djCue, djSync,
  djCrossfader, djCrossfaderCurve,
  djEQ, djEQKill, djFilter,
  djVolume, djMasterVolume,
  djPitch, djKeyLock, djNudge,
  djLoop, djLoopClear,
  djAutoDJEnable, djAutoDJDisable, djAutoDJSkip,
  djDuck, djUnduck,
} from './handlers/djHandlers';

const WS_URL = 'ws://localhost:4003';
const INITIAL_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 30000;
// Give up after this many consecutive failed reconnects with no messages ever
// received. The browser logs an unsuppressible "WebSocket connection failed"
// on each attempt, and retrying forever pollutes the console when the relay
// isn't running (common in prod builds and when the user hasn't run dev.sh).
// 5 attempts with 2s/4s/8s/16s/30s backoff = ~60s of trying before giving up.
const MAX_RECONNECT_ATTEMPTS = 5;

type Handler = (params: Record<string, unknown>) => unknown | Promise<unknown>;

const handlers: Record<string, Handler> = {
  // ─── Read ────────────────────────────────────────────────────────────────────
  get_song_info: getSongInfo,
  get_full_state: getFullState,
  get_project_metadata: getProjectMetadata,
  get_pattern: getPattern,
  get_pattern_list: getPatternList,
  get_pattern_order: getPatternOrder,
  get_cell: getCell,
  get_channel_column: getChannelColumn,
  search_pattern: searchPattern,
  get_pattern_stats: getPatternStats,
  diff_patterns: diffPatterns,
  get_instruments_list: getInstrumentsList,
  get_instrument: getInstrument,
  get_current_instrument: getCurrentInstrument,
  get_playback_state: getPlaybackState,
  get_cursor: getCursor,
  get_selection: getSelection,
  get_editor_state: getEditorState,
  get_mixer_state: getMixerState,
  get_channel_state: getChannelState,
  get_ui_state: getUIState,
  get_history_state: getHistoryState,
  get_oscilloscope_info: getOscilloscopeInfo,
  get_audio_state: getAudioState,
  get_dub_bus_state: getDubBusState,
  get_synth_errors: getSynthErrors,
  get_format_state: getFormatState,
  get_midi_state: getMIDIState,
  get_clipboard_state: getClipboardState,
  get_command_list: getCommandList,
  render_pattern_text: renderPatternText,
  validate_pattern: validatePattern,

  // ─── Write: Cells ────────────────────────────────────────────────────────────
  set_cell: setCell,
  set_cells: setCells,
  clear_cell: clearCell,
  clear_pattern: clearPattern,
  clear_channel: clearChannel,
  fill_range: fillRange,
  write_note_sequence: writeNoteSequence,

  // ─── Write: Pattern Management ───────────────────────────────────────────────
  add_pattern: addPattern,
  duplicate_pattern: duplicatePattern,
  resize_pattern: resizePattern,

  // ─── Write: Pattern Order ────────────────────────────────────────────────────
  set_pattern_order: setPatternOrder,
  add_to_order: addToOrder,
  remove_from_order: removeFromOrder,

  // ─── Write: Row/Channel ──────────────────────────────────────────────────────
  insert_row: insertRow,
  delete_row: deleteRow,
  swap_channels: swapChannels,

  // ─── Write: Transport ────────────────────────────────────────────────────────
  set_bpm: setBpm,
  set_speed: setSpeed,
  play: () => play(),
  stop: () => stop(),
  pause: () => pause(),
  set_swing: setSwing,
  set_global_pitch: setGlobalPitch,
  toggle_metronome: () => toggleMetronome(),
  set_looping: setLooping,
  seek_to: seekTo,

  // ─── Write: Cursor & Selection ───────────────────────────────────────────────
  move_cursor: moveCursor,
  select_range: selectRange,
  select_all: () => selectAll(),
  clear_selection: () => clearSelection(),

  // ─── Write: Transforms ──────────────────────────────────────────────────────
  transpose_selection: transposeSelection,
  interpolate_selection: interpolateSelection,
  humanize_selection: humanizeSelection,
  scale_volume: scaleVolume,
  fade_volume: fadeVolume,

  // ─── Write: Mixer ────────────────────────────────────────────────────────────
  set_master_volume: setMasterVolume,
  set_master_mute: setMasterMute,
  set_channel_volume: setChannelVolume,
  set_channel_pan: setChannelPan,
  set_channel_mute: setChannelMute,
  set_channel_solo: setChannelSolo,
  set_channel_dub_send: setChannelDubSend,
  set_dub_bus_enabled: setDubBusEnabled,
  set_dub_bus_settings: setDubBusSettings,
  fire_dub_move: fireDubMove,
  solo_channel: soloChannel,
  mute_all_channels: () => muteAllChannels(),
  unmute_all_channels: () => unmuteAllChannels(),

  // ─── Write: Editor ──────────────────────────────────────────────────────────
  set_octave: setOctave,
  set_edit_step: setEditStep,
  toggle_record_mode: () => toggleRecordMode(),
  set_follow_playback: setFollowPlayback,

  // ─── Write: UI ──────────────────────────────────────────────────────────────
  set_active_view: setActiveView,
  set_status_message: setStatusMessage,
  set_tracker_zoom: setTrackerZoom,

  // ─── Write: Instruments ──────────────────────────────────────────────────────
  select_instrument: selectInstrument,
  create_instrument: createInstrument,
  update_instrument: updateInstrument,
  delete_instrument: deleteInstrument,
  clone_instrument: cloneInstrument,

  // ─── Write: Project ─────────────────────────────────────────────────────────
  set_project_metadata: setProjectMetadata,

  // ─── Write: History ─────────────────────────────────────────────────────────
  undo: () => undo(),
  redo: () => redo(),

  // ─── Write: Clipboard ────────────────────────────────────────────────────────
  copy_selection: () => copySelection(),
  cut_selection: () => cutSelection(),
  paste: pasteClipboard,

  // ─── Write: Error Management ─────────────────────────────────────────────────
  dismiss_errors: () => dismissErrors(),

  // ─── Write: Editor Config ───────────────────────────────────────────────────
  set_column_visibility: setColumnVisibility,
  toggle_bookmark: toggleBookmark,

  // ─── Write: Commands ────────────────────────────────────────────────────────
  execute_command: executeCommand,

  // ─── Read: Sample & Synth ──────────────────────────────────────────────────
  get_sample_info: getSampleInfo,
  get_sample_waveform: getSampleWaveform,
  get_synth_config: getSynthConfig,
  get_loaded_synths: getLoadedSynths,

  // ─── Read: Audio Analysis ─────────────────────────────────────────────────
  get_audio_analysis: getAudioAnalysis,
  get_audio_context_info: getAudioContextInfo,
  get_voice_state: getVoiceState,
  get_instrument_level: getInstrumentLevel,

  // ─── Write: Synth Control ─────────────────────────────────────────────────
  set_synth_param: setSynthParam,
  trigger_note: triggerNote,
  release_note: releaseNote,
  release_all_notes: () => releaseAllNotes(),
  update_synth_config: updateSynthConfig,

  // ─── Write: Master Effects ────────────────────────────────────────────────
  add_master_effect: addMasterEffect,
  update_master_effect: updateMasterEffect,
  remove_master_effect: removeMasterEffect,
  toggle_master_effect: toggleMasterEffect,
  set_master_effects: setMasterEffects,

  // ─── Write: Bus Gains ─────────────────────────────────────────────────────
  set_sample_bus_gain: setSampleBusGain,
  set_synth_bus_gain: setSynthBusGain,

  // ─── File Loading & Audio Measurement ───────────────────────────────────
  load_file: loadFile,
  test_tone: testTone,
  get_audio_level: getAudioLevel,
  wait_for_audio: waitForAudio,

  // ─── Analysis & Composition ─────────────────────────────────────────────
  analyze_song: analyzeSongHandler,
  generate_pattern: generatePattern,
  transform_pattern: transformPattern,

  // ─── Synth Programming ──────────────────────────────────────────────────────
  analyze_instrument_spectrum: analyzeInstrumentSpectrum,
  sweep_parameter: sweepParameter,

  // ─── Live Performance ─────────────────────────────────────────────────────
  start_monitoring: startMonitoring,
  get_monitoring_data: getMonitoringData,
  stop_monitoring: stopMonitoring,
  auto_mix: autoMix,
  set_auto_effect: setAutoEffect,
  cancel_auto_effect: cancelAutoEffect,

  // ─── Modal Control ────────────────────────────────────────────────────────
  dismiss_modal: dismissModal,
  get_modal_state: getModalState,

  // ─── Format Regression Testing ──────────────────────────────────────────
  run_format_test: runFormatTest,
  run_regression_suite: runRegressionSuite,
  run_synth_tests: runSynthTests,

  // ─── Export Tools ───────────────────────────────────────────────────────
  export_wav: exportWav,
  export_mp3: exportMp3,
  export_pattern_text: exportPatternText,
  export_midi: exportMidi,
  export_mod: exportMod,
  export_native: exportNative,

  // ─── Console Capture ────────────────────────────────────────────────────
  get_console_errors: () => getConsoleErrors(),
  clear_console_errors: () => clearConsoleErrors(),
  evaluate_script: evaluateScript,

  // ─── Soak Test (dev-only) ───────────────────────────────────────────────
  dj_vj_action: async (params: Record<string, unknown>) => {
    const action = params.action as string;
    const args = (params.args as Record<string, unknown>) || {};
    const fn = window.__soakActions__?.[action];
    if (!fn) throw new Error(`Unknown soak action: ${action} (hooks not installed — is DEV mode active?)`);
    return fn(args);
  },
  get_frame_stats: () => {
    if (!window.__soakTelemetry__) throw new Error('Soak telemetry not installed (DEV mode only)');
    return window.__soakTelemetry__.getFrameStats();
  },
  get_gpu_stats: () => {
    if (!window.__soakTelemetry__) throw new Error('Soak telemetry not installed (DEV mode only)');
    return window.__soakTelemetry__.getGpuStats();
  },

  // ─── DJ Remote Control ─────────────────────────────────────────────────
  dj_get_state: getDJState,
  dj_get_playlist_state: getDJPlaylistState,
  dj_toggle_play: djTogglePlay,
  dj_stop: djStop,
  dj_cue: djCue,
  dj_sync: djSync,
  dj_crossfader: djCrossfader,
  dj_crossfader_curve: djCrossfaderCurve,
  dj_eq: djEQ,
  dj_eq_kill: djEQKill,
  dj_filter: djFilter,
  dj_volume: djVolume,
  dj_master_volume: djMasterVolume,
  dj_pitch: djPitch,
  dj_key_lock: djKeyLock,
  dj_nudge: djNudge,
  dj_loop: djLoop,
  dj_loop_clear: djLoopClear,
  dj_auto_dj_enable: djAutoDJEnable,
  dj_auto_dj_disable: djAutoDJDisable,
  dj_auto_dj_skip: djAutoDJSkip,
  dj_duck: djDuck,
  dj_unduck: djUnduck,
};

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoffMs = INITIAL_BACKOFF_MS;
let disposed = false;
let connectAttempts = 0;

function send(msg: BridgeResponse): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

async function handleMessage(data: string): Promise<void> {
  let request: BridgeRequest;
  try {
    request = JSON.parse(data) as BridgeRequest;
  } catch {
    return;
  }

  if (request.type !== 'call') return;

  const handler = handlers[request.method];
  if (!handler) {
    send({ id: request.id, type: 'error', error: `Unknown method: ${request.method}` });
    return;
  }

  try {
    const result = await handler(request.params ?? {});
    send({ id: request.id, type: 'result', data: result });
  } catch (e) {
    send({ id: request.id, type: 'error', error: (e as Error).message });
  }
}

function connect(): void {
  if (disposed) return;

  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  let receivedMessage = false;

  ws.onopen = () => {
    if (connectAttempts === 0) {
      console.log('[mcp-bridge] Connected to MCP relay');
    }
  };

  ws.onmessage = (event) => {
    // Only reset backoff when we actually receive a message (real MCP server is connected)
    if (!receivedMessage) {
      receivedMessage = true;
      backoffMs = INITIAL_BACKOFF_MS;
      connectAttempts = 0;
      console.log('[mcp-bridge] MCP server active');
    }
    handleMessage(typeof event.data === 'string' ? event.data : event.data.toString());
  };

  ws.onclose = () => {
    connectAttempts++;
    if (connectAttempts === 1) {
      console.log('[mcp-bridge] MCP relay not available, will retry in background');
    }
    ws = null;
    // Stop retrying after MAX_RECONNECT_ATTEMPTS consecutive failures WITHOUT
    // ever receiving a message. If the relay eventually comes up, a page
    // reload will resume the bridge. If we HAVE received messages before
    // (relay was up, then dropped) we keep retrying forever.
    if (!receivedMessage && connectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log(`[mcp-bridge] Giving up after ${connectAttempts} failed attempts — reload the page if the relay comes up later`);
      return;
    }
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleReconnect(): void {
  if (disposed || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }, backoffMs);
}

export function initMCPBridge(): void {
  if (ws || disposed) return;
  connect();
}

export function disposeMCPBridge(): void {
  disposed = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}
