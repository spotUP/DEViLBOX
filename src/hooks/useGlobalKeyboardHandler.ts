/**
 * useGlobalKeyboardHandler - Handles global keyboard shortcuts using configurable schemes
 * 
 * This hook integrates the keyboard scheme system with the app:
 * - Loads the active scheme from useKeyboardStore
 * - Listens for keydown events on the window
 * - Maps key combos to commands using SchemeLoader
 * - Executes commands via CommandRegistry
 */

import { useEffect, useRef, useCallback } from 'react';
import { useKeyboardStore } from '@stores/useKeyboardStore';
import { useUIStore } from '@stores/useUIStore';
import { SchemeLoader } from '@engine/keyboard/SchemeLoader';
import { CommandRegistry } from '@engine/keyboard/CommandRegistry';
import { KeyboardNormalizer } from '@engine/keyboard/KeyboardNormalizer';
import { KeyComboFormatter } from '@engine/keyboard/KeyComboFormatter';
import type { PlatformType, CommandContext, Command } from '@engine/keyboard/types';
import { useVocoderStore } from '@stores/useVocoderStore';

// Import command implementations
import { playRow } from '@engine/keyboard/commands/playRow';
import { playFromCursor } from '@engine/keyboard/commands/playFromCursor';
import { clonePattern } from '@engine/keyboard/commands/clonePattern';
import { playStopToggle, playPattern, playSong, stopPlayback } from '@engine/keyboard/commands/transport';
import {
  cursorUp, cursorDown, cursorLeft, cursorRight,
  cursorPageUp, cursorPageDown, cursorHome, cursorEnd,
  cursorPatternStart, cursorPatternEnd, nextChannel, prevChannel,
  nextColumn, prevColumn, jumpToRow0, jumpToRow16, jumpToRow32, jumpToRow48,
  cursorRowStart, cursorRowEnd
} from '@engine/keyboard/commands/cursor';
import {
  deleteNote, deleteAndPull, insertRow, toggleEditMode,
  clearPattern, clearChannel, toggleInsertMode, advanceToNextRow,
  toggleMaskAtCursor, storeEffectMacro, recallEffectMacro,
  setOctave0, setOctave1, setOctave2, setOctave3, setOctave4, setOctave5, setOctave6, setOctave7,
  setStep0, setStep1, setStep2, setStep3, setStep4, setStep5, setStep6, setStep7, setStep8, setStep9
} from '@engine/keyboard/commands/edit';
import { nextPattern, prevPattern } from '@engine/keyboard/commands/pattern';
import {
  muteChannel, soloChannel, unmuteAll,
  setTrack1, setTrack2, setTrack3, setTrack4, setTrack5, setTrack6, setTrack7, setTrack8
} from '@engine/keyboard/commands/channel';
import {
  copySelection, cutSelection, pasteSelection, swapSelection, selectAll, selectChannel, selectColumn,
  markBlockStart, markBlockEnd, clearSelection, copyTrack, cutTrack, pasteTrack
} from '@engine/keyboard/commands/selection';
import {
  transposeUp, transposeDown, transposeOctaveUp, transposeOctaveDown,
  transposeBlockUp, transposeBlockDown, transposeBlockOctaveUp, transposeBlockOctaveDown,
  transposeTrackUp, transposeTrackDown
} from '@engine/keyboard/commands/transpose';
import { prevInstrument, nextInstrument,
  setInstrument1, setInstrument2, setInstrument3, setInstrument4, setInstrument5,
  setInstrument6, setInstrument7, setInstrument8, setInstrument9, setInstrument10
} from '@engine/keyboard/commands/instrument';
import { prevOctave, nextOctave } from '@engine/keyboard/commands/octave';
import { undo, redo } from '@engine/keyboard/commands/history';

// New command modules
import {
  toggleFullscreen, showHelp, viewGeneral, viewPattern, viewSamples, viewInstruments, viewComments,
  openPatternEditor, openSampleEditor, openInstrumentEditor, showSynthEditor, openMessageEditor,
  showOrderList, openSettings, toggleTreeView, viewMidiMapping, viewOptions,
  showFilesPanel, showPlayPanel, showInstrumentsPanel, showBlockPanel, showEditPanel,
  showMiscPanel, showVolumePanel, showMidiPanel, showTransposePanel, showRangePanel
} from '@engine/keyboard/commands/view';
import {
  newFile, openFile, closeFile, saveFile, saveAs,
  newProject, openProject, saveProject, newSong, loadSong, saveSong, loadModule, saveModule
} from '@engine/keyboard/commands/file';
import {
  interpolateVolume, interpolateEffect, amplifySelection, applyCurrentInstrument,
  expandPattern, shrinkPattern, growSelection, shrinkSelection, duplicatePattern,
  doubleBlockLength, halveBlockLength, doubleBlock, halveBlock,
  scaleVolumeTrack, scaleVolumePattern, scaleVolumeBlock, swapChannels, splitPattern,
  joinBlocks, setPatternLength, patternLengthDialog, setBpm, setSpeed, setTempo, appendBlock, insertBlock,
  splitBlock, gotoBlock, findSample, findReplace, findNext, gotoDialog, quantizeSettings
} from '@engine/keyboard/commands/advanced';
import {
  pasteOverwrite, pasteInsert, pasteMix, pasteFlood, pushForwardPaste,
  cutRow, copyRow, cutNote, clearNote, clearRow, deleteRowPullUp, insertRowPushDown,
  copyPattern, pastePattern, cutChannel, copyChannel, pasteChannel
} from '@engine/keyboard/commands/paste';
import {
  toggleFollowSong, toggleLoopPattern, toggleContinuousScroll, toggleMetronome,
  toggleCountIn, toggleMidiInput, toggleRecordQuantize, toggleChordMode, toggleWrapMode,
  toggleAutoRecord, toggleMultiChannelRecord, togglePatternFocus, toggleColumnVisibility,
  toggleSoloChannel, toggleMuteChannel, toggleSamplePreview, togglePluginEditor
} from '@engine/keyboard/commands/follow';
import {
  savePosition0, savePosition1, savePosition2, savePosition3, savePosition4,
  savePosition5, savePosition6, savePosition7, savePosition8, savePosition9,
  gotoPosition0, gotoPosition1, gotoPosition2, gotoPosition3, gotoPosition4,
  gotoPosition5, gotoPosition6, gotoPosition7, gotoPosition8, gotoPosition9,
  gotoPatternStart, gotoPatternEnd, gotoSongStart, gotoSongEnd,
  gotoFirstChannel, gotoLastChannel, gotoRow, gotoPattern, gotoOrderPosition, gotoTime,
  jumpToNextBookmark, jumpToPrevBookmark, toggleBookmark, clearAllBookmarks
} from '@engine/keyboard/commands/position';
import {
  loadLayout1, loadLayout2, loadLayout3, loadLayout4, loadLayout5, loadLayout6, loadLayout7, loadLayout8,
  saveLayout1, saveLayout2, saveLayout3, saveLayout4, saveLayout5, saveLayout6, saveLayout7, saveLayout8,
  toggleDiskBrowser, toggleInstrumentPanel, toggleSamplePanel, toggleMixerPanel, toggleAutomationPanel,
  toggleTrackScopes, toggleMasterSpectrum, maximizePanel, restorePanelSizes, focusNextPanel, focusPrevPanel,
  toggleBottomFrame, toggleUpperFrame, cycleGlobalView
} from '@engine/keyboard/commands/layout';
import {
  showAbout, showKeyboardHelp, openManual, panic, centerCursor,
  insertKeyoff, insertNoteCut, insertFadeOut, renderToSample, renderToInstrument, renderSong, exportMp3,
  quickSave, revertToSaved, resetView, increasePatternSize, decreasePatternSize,
  toggleHexMode, toggleRowHighlight, toggleChannelNames, zoomIn, zoomOut, resetZoom, fitToWindow,
  clonePattern as clonePatternCmd, createPattern, deletePattern, importMidi, exportMidi, importSample, exportSample,
  patternProperties, songProperties, cleanupUnused, toggleRecording, previewInstrument, previewSample, previewNoteAtCursor, stopPreview,
  tempoTap, showQuantizeDialog, showHumanizeDialog, showGrooveSettings, applySwing, runScript, recordMacro,
  escapeCommand, confirmCommand, showContextMenu, showCommandPalette
} from '@engine/keyboard/commands/misc';
import { increaseSpacing, decreaseSpacing, cursorUpByHighlight, cursorDownByHighlight,
  jumpToQuarter1, jumpToQuarter2, jumpToQuarter3
} from '@engine/keyboard/commands/cursor';
import { setStep10, setStep11, setStep12, setStep13, setStep14, setStep15, setStep16,
  increaseStep, decreaseStep, setOctave8, setOctave9
} from '@engine/keyboard/commands/edit';
import {
  djScratchBaby, djScratchTrans, djScratchFlare, djScratchHydro, djScratchCrab, djScratchOrbit,
  djScratchChirp, djScratchStab, djScratchScrbl, djScratchTear,
  djScratchStop, djFaderLFOOff, djFaderLFO14, djFaderLFO18, djFaderLFO116, djFaderLFO132
} from '@engine/keyboard/commands/djScratch';
import {
  trackerFaderCutOn, trackerFaderCutOff,
  trackerCrabOn, trackerCrabOff,
  trackerTransformerOn, trackerTransformerOff,
  trackerFlareOn, trackerFlareOff,
  trackerScratchTransformer, trackerScratchCrab, trackerScratchFlare,
  trackerScratchChirp, trackerScratchStab, trackerScratch8Crab, trackerScratchTwiddle,
  trackerScratchStop, trackerSpinback, trackerPowerCut,
} from '@engine/keyboard/commands/trackerScratch';

import { useTrackerStore } from '@stores/useTrackerStore';
import { useEditorStore } from '@stores/useEditorStore';
import { useCursorStore } from '@stores/useCursorStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { getToneEngine } from '@engine/ToneEngine';

// Singleton registry - populated once with all available commands
const globalRegistry = new CommandRegistry();
let registryInitialized = false;

/**
 * Get the global command registry for use outside React hooks.
 * Used by MIDI button mapping to execute any registered command.
 */
export function getGlobalRegistry(): CommandRegistry {
  return globalRegistry;
}

function setVolumeInCell(volume: number): boolean {
  const { cursor } = useCursorStore.getState();
  const { setCell } = useTrackerStore.getState();
  setCell(cursor.channelIndex, cursor.rowIndex, { volume });
  return true;
}

function adjustVolumeInCell(delta: number): () => boolean {
  return () => {
    const { cursor } = useCursorStore.getState();
    const { patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
    const cell = patterns[currentPatternIndex]?.channels[cursor.channelIndex]?.rows[cursor.rowIndex];
    if (!cell) return true;
    const newVol = Math.max(0, Math.min(64, (cell.volume || 0) + delta));
    setCell(cursor.channelIndex, cursor.rowIndex, { volume: newVol });
    return true;
  };
}

function initializeRegistry() {
  if (registryInitialized) return;

  // Register all available commands
  const commands: Command[] = [
    // === PLAYBACK ===
    { name: 'play_row', contexts: ['pattern'], handler: () => { playRow(); return true; }, description: 'Play the current row (audition)' },
    { name: 'play_from_cursor', contexts: ['pattern', 'global'], handler: playFromCursor, description: 'Start playback from cursor position' },
    { name: 'play_stop_toggle', contexts: ['pattern', 'global'], handler: playStopToggle, description: 'Toggle play/stop' },
    { name: 'play_pattern', contexts: ['pattern', 'global'], handler: playPattern, description: 'Play current pattern from start' },
    { name: 'play_song', contexts: ['pattern', 'global'], handler: playSong, description: 'Play song from beginning' },
    { name: 'stop', contexts: ['pattern', 'global'], handler: stopPlayback, description: 'Stop playback' },
    { name: 'stop_and_reset', contexts: ['pattern', 'global'], handler: stopPlayback, description: 'Stop and reset position' },
    
    // === CURSOR MOVEMENT ===
    { name: 'cursor_up', contexts: ['pattern'], handler: cursorUp, description: 'Move cursor up' },
    { name: 'cursor_down', contexts: ['pattern'], handler: cursorDown, description: 'Move cursor down' },
    { name: 'cursor_left', contexts: ['pattern'], handler: cursorLeft, description: 'Move cursor left' },
    { name: 'cursor_right', contexts: ['pattern'], handler: cursorRight, description: 'Move cursor right' },
    { name: 'cursor_page_up', contexts: ['pattern'], handler: cursorPageUp, description: 'Move cursor up one page' },
    { name: 'cursor_page_down', contexts: ['pattern'], handler: cursorPageDown, description: 'Move cursor down one page' },
    { name: 'cursor_home', contexts: ['pattern'], handler: cursorHome, description: 'Move to start of row' },
    { name: 'cursor_end', contexts: ['pattern'], handler: cursorEnd, description: 'Move to end of row' },
    { name: 'cursor_row_start', contexts: ['pattern'], handler: cursorRowStart, description: 'Move to start of row' },
    { name: 'cursor_row_end', contexts: ['pattern'], handler: cursorRowEnd, description: 'Move to end of row' },
    { name: 'cursor_pattern_start', contexts: ['pattern'], handler: cursorPatternStart, description: 'Move to start of pattern' },
    { name: 'cursor_pattern_end', contexts: ['pattern'], handler: cursorPatternEnd, description: 'Move to end of pattern' },
    { name: 'next_channel', contexts: ['pattern'], handler: nextChannel, description: 'Move to next channel' },
    { name: 'prev_channel', contexts: ['pattern'], handler: prevChannel, description: 'Move to previous channel' },
    { name: 'next_column', contexts: ['pattern'], handler: nextColumn, description: 'Move to next column' },
    { name: 'prev_column', contexts: ['pattern'], handler: prevColumn, description: 'Move to previous column' },
    { name: 'next_track', contexts: ['pattern'], handler: nextChannel, description: 'Move to next track' },
    { name: 'prev_track', contexts: ['pattern'], handler: prevChannel, description: 'Move to previous track' },
    // FT2 row jumps
    { name: 'jump_to_row_0', contexts: ['pattern'], handler: jumpToRow0, description: 'Jump to row 0' },
    { name: 'jump_to_row_16', contexts: ['pattern'], handler: jumpToRow16, description: 'Jump to row 16' },
    { name: 'jump_to_row_32', contexts: ['pattern'], handler: jumpToRow32, description: 'Jump to row 32' },
    { name: 'jump_to_row_48', contexts: ['pattern'], handler: jumpToRow48, description: 'Jump to row 48' },
    // OctaMED/ProTracker position jumps (aliases)
    { name: 'block_start', contexts: ['pattern'], handler: cursorPatternStart, description: 'Go to block/pattern start' },
    { name: 'block_end', contexts: ['pattern'], handler: cursorPatternEnd, description: 'Go to block/pattern end' },
    { name: 'song_start', contexts: ['pattern', 'global'], handler: cursorPatternStart, description: 'Go to song start' },
    { name: 'song_end', contexts: ['pattern', 'global'], handler: cursorPatternEnd, description: 'Go to song end' },
    { name: 'page_up', contexts: ['pattern'], handler: cursorPageUp, description: 'Page up' },
    { name: 'page_down', contexts: ['pattern'], handler: cursorPageDown, description: 'Page down' },
    
    // === EDITING ===
    { name: 'delete_note', contexts: ['pattern'], handler: deleteNote, description: 'Delete note at cursor' },
    { name: 'delete_and_pull', contexts: ['pattern'], handler: deleteAndPull, description: 'Delete and pull up rows' },
    { name: 'delete_and_pull_up', contexts: ['pattern'], handler: deleteAndPull, description: 'Delete and pull up rows' },
    { name: 'delete_line', contexts: ['pattern'], handler: deleteAndPull, description: 'Delete line' },
    { name: 'insert_row', contexts: ['pattern'], handler: insertRow, description: 'Insert empty row' },
    { name: 'insert_line', contexts: ['pattern'], handler: insertRow, description: 'Insert empty line' },
    { name: 'toggle_edit_mode', contexts: ['pattern', 'global'], handler: toggleEditMode, description: 'Toggle edit/record mode' },
    { name: 'toggle_insert_mode', contexts: ['pattern'], handler: toggleInsertMode, description: 'Toggle insert/overwrite mode' },
    { name: 'clear_pattern', contexts: ['pattern'], handler: clearPattern, description: 'Clear entire pattern' },
    { name: 'clear_channel', contexts: ['pattern'], handler: clearChannel, description: 'Clear current channel' },
    { name: 'advance_to_next_row', contexts: ['pattern'], handler: advanceToNextRow, description: 'Advance to next row' },
    { name: 'toggle_mask_at_cursor', contexts: ['pattern'], handler: toggleMaskAtCursor, description: 'Toggle copy/paste mask for current column (IT)' },
    { name: 'store_effect_macro_0', contexts: ['pattern'], handler: () => storeEffectMacro(0), description: 'Store effect to macro slot 0' },
    { name: 'store_effect_macro_1', contexts: ['pattern'], handler: () => storeEffectMacro(1), description: 'Store effect to macro slot 1' },
    { name: 'store_effect_macro_2', contexts: ['pattern'], handler: () => storeEffectMacro(2), description: 'Store effect to macro slot 2' },
    { name: 'store_effect_macro_3', contexts: ['pattern'], handler: () => storeEffectMacro(3), description: 'Store effect to macro slot 3' },
    { name: 'store_effect_macro_4', contexts: ['pattern'], handler: () => storeEffectMacro(4), description: 'Store effect to macro slot 4' },
    { name: 'store_effect_macro_5', contexts: ['pattern'], handler: () => storeEffectMacro(5), description: 'Store effect to macro slot 5' },
    { name: 'store_effect_macro_6', contexts: ['pattern'], handler: () => storeEffectMacro(6), description: 'Store effect to macro slot 6' },
    { name: 'store_effect_macro_7', contexts: ['pattern'], handler: () => storeEffectMacro(7), description: 'Store effect to macro slot 7' },
    { name: 'store_effect_macro_8', contexts: ['pattern'], handler: () => storeEffectMacro(8), description: 'Store effect to macro slot 8' },
    { name: 'store_effect_macro_9', contexts: ['pattern'], handler: () => storeEffectMacro(9), description: 'Store effect to macro slot 9' },
    { name: 'recall_effect_macro_0', contexts: ['pattern'], handler: () => recallEffectMacro(0), description: 'Recall effect macro slot 0' },
    { name: 'recall_effect_macro_1', contexts: ['pattern'], handler: () => recallEffectMacro(1), description: 'Recall effect macro slot 1' },
    { name: 'recall_effect_macro_2', contexts: ['pattern'], handler: () => recallEffectMacro(2), description: 'Recall effect macro slot 2' },
    { name: 'recall_effect_macro_3', contexts: ['pattern'], handler: () => recallEffectMacro(3), description: 'Recall effect macro slot 3' },
    { name: 'recall_effect_macro_4', contexts: ['pattern'], handler: () => recallEffectMacro(4), description: 'Recall effect macro slot 4' },
    { name: 'recall_effect_macro_5', contexts: ['pattern'], handler: () => recallEffectMacro(5), description: 'Recall effect macro slot 5' },
    { name: 'recall_effect_macro_6', contexts: ['pattern'], handler: () => recallEffectMacro(6), description: 'Recall effect macro slot 6' },
    { name: 'recall_effect_macro_7', contexts: ['pattern'], handler: () => recallEffectMacro(7), description: 'Recall effect macro slot 7' },
    { name: 'recall_effect_macro_8', contexts: ['pattern'], handler: () => recallEffectMacro(8), description: 'Recall effect macro slot 8' },
    { name: 'recall_effect_macro_9', contexts: ['pattern'], handler: () => recallEffectMacro(9), description: 'Recall effect macro slot 9' },
    
    // === PATTERN NAVIGATION ===
    { name: 'next_pattern', contexts: ['pattern', 'global'], handler: nextPattern, description: 'Go to next pattern' },
    { name: 'prev_pattern', contexts: ['pattern', 'global'], handler: prevPattern, description: 'Go to previous pattern' },
    { name: 'next_block', contexts: ['pattern', 'global'], handler: nextPattern, description: 'Go to next block' },
    { name: 'prev_block', contexts: ['pattern', 'global'], handler: prevPattern, description: 'Go to previous block' },
    { name: 'clone_pattern', contexts: ['pattern', 'global'], handler: clonePattern, description: 'Clone the current pattern' },
    
    // === CHANNEL OPERATIONS ===
    { name: 'mute_channel', contexts: ['pattern'], handler: muteChannel, description: 'Mute current channel' },
    { name: 'mute_track', contexts: ['pattern'], handler: muteChannel, description: 'Mute current track' },
    { name: 'solo_channel', contexts: ['pattern'], handler: soloChannel, description: 'Solo current channel' },
    { name: 'solo_track', contexts: ['pattern'], handler: soloChannel, description: 'Solo current track' },
    { name: 'unmute_all', contexts: ['pattern', 'global'], handler: unmuteAll, description: 'Unmute all channels' },
    // Channel/track selection (OctaMED Ctrl+1-8)
    { name: 'set_track_1', contexts: ['pattern'], handler: setTrack1, description: 'Select track 1' },
    { name: 'set_track_2', contexts: ['pattern'], handler: setTrack2, description: 'Select track 2' },
    { name: 'set_track_3', contexts: ['pattern'], handler: setTrack3, description: 'Select track 3' },
    { name: 'set_track_4', contexts: ['pattern'], handler: setTrack4, description: 'Select track 4' },
    { name: 'set_track_5', contexts: ['pattern'], handler: setTrack5, description: 'Select track 5' },
    { name: 'set_track_6', contexts: ['pattern'], handler: setTrack6, description: 'Select track 6' },
    { name: 'set_track_7', contexts: ['pattern'], handler: setTrack7, description: 'Select track 7' },
    { name: 'set_track_8', contexts: ['pattern'], handler: setTrack8, description: 'Select track 8' },
    
    // === SELECTION & CLIPBOARD ===
    { name: 'copy_selection', contexts: ['pattern'], handler: copySelection, description: 'Copy selection' },
    { name: 'cut_selection', contexts: ['pattern'], handler: cutSelection, description: 'Cut selection' },
    { name: 'paste_selection', contexts: ['pattern'], handler: pasteSelection, description: 'Paste' },
    { name: 'select_all', contexts: ['pattern'], handler: selectAll, description: 'Select all' },
    { name: 'select_pattern', contexts: ['pattern'], handler: selectAll, description: 'Select pattern' },
    { name: 'select_channel', contexts: ['pattern'], handler: selectChannel, description: 'Select channel' },
    { name: 'select_column', contexts: ['pattern'], handler: selectColumn, description: 'Select column' },
    { name: 'mark_block_start', contexts: ['pattern'], handler: markBlockStart, description: 'Mark block start' },
    { name: 'mark_block_end', contexts: ['pattern'], handler: markBlockEnd, description: 'Mark block end' },
    { name: 'mark_block', contexts: ['pattern'], handler: markBlockStart, description: 'Start marking block' },
    { name: 'unmark_block', contexts: ['pattern'], handler: clearSelection, description: 'Clear block selection' },
    { name: 'copy_track', contexts: ['pattern'], handler: copyTrack, description: 'Copy track' },
    { name: 'cut_track', contexts: ['pattern'], handler: cutTrack, description: 'Cut track' },
    { name: 'paste_track', contexts: ['pattern'], handler: pasteTrack, description: 'Paste track' },
    { name: 'copy_channel', contexts: ['pattern'], handler: copyTrack, description: 'Copy channel' },
    { name: 'paste_channel', contexts: ['pattern'], handler: pasteTrack, description: 'Paste channel' },
    { name: 'copy_pattern', contexts: ['pattern'], handler: copySelection, description: 'Copy pattern' },
    { name: 'paste_pattern', contexts: ['pattern'], handler: pasteSelection, description: 'Paste pattern' },
    { name: 'copy_block', contexts: ['pattern'], handler: copySelection, description: 'Copy block' },
    { name: 'cut_block', contexts: ['pattern'], handler: cutSelection, description: 'Cut block' },
    { name: 'paste_block', contexts: ['pattern'], handler: pasteSelection, description: 'Paste block' },
    
    // === TRANSPOSE ===
    { name: 'transpose_up', contexts: ['pattern'], handler: transposeUp, description: 'Transpose up 1 semitone' },
    { name: 'transpose_down', contexts: ['pattern'], handler: transposeDown, description: 'Transpose down 1 semitone' },
    { name: 'transpose_octave_up', contexts: ['pattern'], handler: transposeOctaveUp, description: 'Transpose up 1 octave' },
    { name: 'transpose_octave_down', contexts: ['pattern'], handler: transposeOctaveDown, description: 'Transpose down 1 octave' },
    { name: 'transpose_block_up', contexts: ['pattern'], handler: transposeBlockUp, description: 'Transpose block up' },
    { name: 'transpose_block_down', contexts: ['pattern'], handler: transposeBlockDown, description: 'Transpose block down' },
    { name: 'transpose_block_octave_up', contexts: ['pattern'], handler: transposeBlockOctaveUp, description: 'Transpose block up octave' },
    { name: 'transpose_block_octave_down', contexts: ['pattern'], handler: transposeBlockOctaveDown, description: 'Transpose block down octave' },
    { name: 'transpose_track_up', contexts: ['pattern'], handler: transposeTrackUp, description: 'Transpose track up' },
    { name: 'transpose_track_down', contexts: ['pattern'], handler: transposeTrackDown, description: 'Transpose track down' },
    
    // === INSTRUMENT ===
    { name: 'prev_instrument', contexts: ['pattern', 'global'], handler: prevInstrument, description: 'Previous instrument' },
    { name: 'next_instrument', contexts: ['pattern', 'global'], handler: nextInstrument, description: 'Next instrument' },
    { name: 'prev_sample', contexts: ['pattern', 'global'], handler: prevInstrument, description: 'Previous sample' },
    { name: 'next_sample', contexts: ['pattern', 'global'], handler: nextInstrument, description: 'Next sample' },
    { name: 'set_instrument_1', contexts: ['pattern'], handler: setInstrument1, description: 'Select instrument 1' },
    { name: 'set_instrument_2', contexts: ['pattern'], handler: setInstrument2, description: 'Select instrument 2' },
    { name: 'set_instrument_3', contexts: ['pattern'], handler: setInstrument3, description: 'Select instrument 3' },
    { name: 'set_instrument_4', contexts: ['pattern'], handler: setInstrument4, description: 'Select instrument 4' },
    { name: 'set_instrument_5', contexts: ['pattern'], handler: setInstrument5, description: 'Select instrument 5' },
    { name: 'set_instrument_6', contexts: ['pattern'], handler: setInstrument6, description: 'Select instrument 6' },
    { name: 'set_instrument_7', contexts: ['pattern'], handler: setInstrument7, description: 'Select instrument 7' },
    { name: 'set_instrument_8', contexts: ['pattern'], handler: setInstrument8, description: 'Select instrument 8' },
    { name: 'set_instrument_9', contexts: ['pattern'], handler: setInstrument9, description: 'Select instrument 9' },
    { name: 'set_instrument_10', contexts: ['pattern'], handler: setInstrument10, description: 'Select instrument 10' },
    
    // === OCTAVE ===
    { name: 'prev_octave', contexts: ['pattern', 'global'], handler: prevOctave, description: 'Previous octave' },
    { name: 'next_octave', contexts: ['pattern', 'global'], handler: nextOctave, description: 'Next octave' },
    { name: 'set_octave_0', contexts: ['pattern'], handler: setOctave0, description: 'Set octave 0' },
    { name: 'set_octave_1', contexts: ['pattern'], handler: setOctave1, description: 'Set octave 1' },
    { name: 'set_octave_2', contexts: ['pattern'], handler: setOctave2, description: 'Set octave 2' },
    { name: 'set_octave_3', contexts: ['pattern'], handler: setOctave3, description: 'Set octave 3' },
    { name: 'set_octave_4', contexts: ['pattern'], handler: setOctave4, description: 'Set octave 4' },
    { name: 'set_octave_5', contexts: ['pattern'], handler: setOctave5, description: 'Set octave 5' },
    { name: 'set_octave_6', contexts: ['pattern'], handler: setOctave6, description: 'Set octave 6' },
    { name: 'set_octave_7', contexts: ['pattern'], handler: setOctave7, description: 'Set octave 7' },
    // ProTracker-style octave selection (F1-F3)
    { name: 'select_octave_1', contexts: ['pattern'], handler: setOctave1, description: 'Select octave 1' },
    { name: 'select_octave_2', contexts: ['pattern'], handler: setOctave2, description: 'Select octave 2' },
    { name: 'select_octave_3', contexts: ['pattern'], handler: setOctave3, description: 'Select octave 3' },
    { name: 'select_octave_1_low', contexts: ['pattern'], handler: setOctave0, description: 'Select low octave 1' },
    { name: 'select_octave_2_low', contexts: ['pattern'], handler: setOctave1, description: 'Select low octave 2' },
    { name: 'select_octave_3_low', contexts: ['pattern'], handler: setOctave2, description: 'Select low octave 3' },
    
    // === EDIT STEP ===
    { name: 'set_step_0', contexts: ['pattern'], handler: setStep0, description: 'Set edit step 0' },
    { name: 'set_step_1', contexts: ['pattern'], handler: setStep1, description: 'Set edit step 1' },
    { name: 'set_step_2', contexts: ['pattern'], handler: setStep2, description: 'Set edit step 2' },
    { name: 'set_step_3', contexts: ['pattern'], handler: setStep3, description: 'Set edit step 3' },
    { name: 'set_step_4', contexts: ['pattern'], handler: setStep4, description: 'Set edit step 4' },
    { name: 'set_step_5', contexts: ['pattern'], handler: setStep5, description: 'Set edit step 5' },
    { name: 'set_step_6', contexts: ['pattern'], handler: setStep6, description: 'Set edit step 6' },
    { name: 'set_step_7', contexts: ['pattern'], handler: setStep7, description: 'Set edit step 7' },
    { name: 'set_step_8', contexts: ['pattern'], handler: setStep8, description: 'Set edit step 8' },
    { name: 'set_step_9', contexts: ['pattern'], handler: setStep9, description: 'Set edit step 9' },
    
    // === UNDO/REDO ===
    { name: 'undo', contexts: ['pattern', 'global'], handler: undo, description: 'Undo' },
    { name: 'redo', contexts: ['pattern', 'global'], handler: redo, description: 'Redo' },
    
    // === OCTAVE EXTENDED ===
    { name: 'set_octave_8', contexts: ['pattern'], handler: setOctave8, description: 'Set octave 8' },
    { name: 'set_octave_9', contexts: ['pattern'], handler: setOctave9, description: 'Set octave 9' },
    
    // === EDIT STEP EXTENDED ===
    { name: 'set_step_10', contexts: ['pattern'], handler: setStep10, description: 'Set edit step 10' },
    { name: 'set_step_11', contexts: ['pattern'], handler: setStep11, description: 'Set edit step 11' },
    { name: 'set_step_12', contexts: ['pattern'], handler: setStep12, description: 'Set edit step 12' },
    { name: 'set_step_13', contexts: ['pattern'], handler: setStep13, description: 'Set edit step 13' },
    { name: 'set_step_14', contexts: ['pattern'], handler: setStep14, description: 'Set edit step 14' },
    { name: 'set_step_15', contexts: ['pattern'], handler: setStep15, description: 'Set edit step 15' },
    { name: 'set_step_16', contexts: ['pattern'], handler: setStep16, description: 'Set edit step 16' },
    { name: 'increase_step', contexts: ['pattern'], handler: increaseStep, description: 'Increase edit step' },
    { name: 'decrease_step', contexts: ['pattern'], handler: decreaseStep, description: 'Decrease edit step' },
    
    // === SPACING ===
    { name: 'increase_spacing', contexts: ['pattern'], handler: increaseSpacing, description: 'Increase row spacing' },
    { name: 'decrease_spacing', contexts: ['pattern'], handler: decreaseSpacing, description: 'Decrease row spacing' },
    
    // === CURSOR EXTENDED ===
    { name: 'cursor_up_by_highlight', contexts: ['pattern'], handler: cursorUpByHighlight, description: 'Move up by highlight' },
    { name: 'cursor_down_by_highlight', contexts: ['pattern'], handler: cursorDownByHighlight, description: 'Move down by highlight' },
    { name: 'jump_to_quarter_1', contexts: ['pattern'], handler: jumpToQuarter1, description: 'Jump to 1/4 mark' },
    { name: 'jump_to_quarter_2', contexts: ['pattern'], handler: jumpToQuarter2, description: 'Jump to 2/4 mark' },
    { name: 'jump_to_quarter_3', contexts: ['pattern'], handler: jumpToQuarter3, description: 'Jump to 3/4 mark' },
    
    // === VIEW COMMANDS ===
    { name: 'toggle_fullscreen', contexts: ['global'], handler: toggleFullscreen, description: 'Toggle fullscreen' },
    { name: 'show_help', contexts: ['global'], handler: showHelp, description: 'Show help' },
    { name: 'view_general', contexts: ['global'], handler: viewGeneral, description: 'View general' },
    { name: 'view_pattern', contexts: ['global'], handler: viewPattern, description: 'View pattern' },
    { name: 'view_samples', contexts: ['global'], handler: viewSamples, description: 'View samples' },
    { name: 'view_instruments', contexts: ['global'], handler: viewInstruments, description: 'View instruments' },
    { name: 'view_comments', contexts: ['global'], handler: viewComments, description: 'View comments' },
    { name: 'open_pattern_editor', contexts: ['global'], handler: openPatternEditor, description: 'Open pattern editor' },
    { name: 'open_sample_editor', contexts: ['global'], handler: openSampleEditor, description: 'Open sample editor' },
    { name: 'open_instrument_editor', contexts: ['global'], handler: openInstrumentEditor, description: 'Open instrument editor' },
    { name: 'show_sample_editor', contexts: ['global'], handler: openSampleEditor, description: 'Show sample editor' },
    { name: 'show_instrument_editor', contexts: ['global'], handler: openInstrumentEditor, description: 'Show instrument editor' },
    { name: 'show_synth_editor', contexts: ['global'], handler: showSynthEditor, description: 'Show synth editor' },
    { name: 'open_message_editor', contexts: ['global'], handler: openMessageEditor, description: 'Open message editor' },
    { name: 'order_list', contexts: ['global'], handler: showOrderList, description: 'Show order list' },
    { name: 'show_order_list', contexts: ['global'], handler: showOrderList, description: 'Show order list' },
    { name: 'configure', contexts: ['global'], handler: openSettings, description: 'Open settings' },
    { name: 'open_settings', contexts: ['global'], handler: openSettings, description: 'Open settings' },
    { name: 'toggle_tree_view', contexts: ['global'], handler: toggleTreeView, description: 'Toggle tree view' },
    { name: 'view_midi_mapping', contexts: ['global'], handler: viewMidiMapping, description: 'View MIDI mapping' },
    { name: 'view_options', contexts: ['global'], handler: viewOptions, description: 'View options' },
    { name: 'show_files_panel', contexts: ['global'], handler: showFilesPanel, description: 'Show files panel' },
    { name: 'show_play_panel', contexts: ['global'], handler: showPlayPanel, description: 'Show play panel' },
    { name: 'show_instruments_panel', contexts: ['global'], handler: showInstrumentsPanel, description: 'Show instruments panel' },
    { name: 'show_block_panel', contexts: ['global'], handler: showBlockPanel, description: 'Show block panel' },
    { name: 'show_edit_panel', contexts: ['global'], handler: showEditPanel, description: 'Show edit panel' },
    { name: 'show_misc_panel', contexts: ['global'], handler: showMiscPanel, description: 'Show misc panel' },
    { name: 'show_volume_panel', contexts: ['global'], handler: showVolumePanel, description: 'Show volume panel' },
    { name: 'show_midi_panel', contexts: ['global'], handler: showMidiPanel, description: 'Show MIDI panel' },
    { name: 'show_transpose_panel', contexts: ['global'], handler: showTransposePanel, description: 'Show transpose panel' },
    { name: 'show_range_panel', contexts: ['global'], handler: showRangePanel, description: 'Show range panel' },
    
    // === FILE COMMANDS ===
    { name: 'new_file', contexts: ['global'], handler: newFile, description: 'New file' },
    { name: 'open_file', contexts: ['global'], handler: openFile, description: 'Open file' },
    { name: 'close_file', contexts: ['global'], handler: closeFile, description: 'Close file' },
    { name: 'save_file', contexts: ['global'], handler: saveFile, description: 'Save file' },
    { name: 'save_as', contexts: ['global'], handler: saveAs, description: 'Save as' },
    { name: 'new_project', contexts: ['global'], handler: newProject, description: 'New project' },
    { name: 'open_project', contexts: ['global'], handler: openProject, description: 'Open project' },
    { name: 'save_project', contexts: ['global'], handler: saveProject, description: 'Save project' },
    { name: 'new_song', contexts: ['global'], handler: newSong, description: 'New song' },
    { name: 'load_song', contexts: ['global'], handler: loadSong, description: 'Load song' },
    { name: 'save_song', contexts: ['global'], handler: saveSong, description: 'Save song' },
    { name: 'load_module', contexts: ['global'], handler: loadModule, description: 'Load module' },
    { name: 'save_module', contexts: ['global'], handler: saveModule, description: 'Save module' },
    
    // === ADVANCED EDITING ===
    { name: 'interpolate_volume', contexts: ['pattern'], handler: interpolateVolume, description: 'Interpolate volume' },
    { name: 'interpolate_effect', contexts: ['pattern'], handler: interpolateEffect, description: 'Interpolate effect' },
    { name: 'amplify_selection', contexts: ['pattern'], handler: amplifySelection, description: 'Amplify selection' },
    { name: 'apply_current_instrument', contexts: ['pattern'], handler: applyCurrentInstrument, description: 'Apply instrument to selection' },
    { name: 'expand_pattern', contexts: ['pattern'], handler: expandPattern, description: 'Expand pattern' },
    { name: 'shrink_pattern', contexts: ['pattern'], handler: shrinkPattern, description: 'Shrink pattern' },
    { name: 'grow_selection', contexts: ['pattern'], handler: growSelection, description: 'Grow selection' },
    { name: 'shrink_selection', contexts: ['pattern'], handler: shrinkSelection, description: 'Shrink selection' },
    { name: 'duplicate_pattern', contexts: ['pattern'], handler: duplicatePattern, description: 'Duplicate pattern' },
    { name: 'double_block_length', contexts: ['pattern'], handler: doubleBlockLength, description: 'Double block length' },
    { name: 'halve_block_length', contexts: ['pattern'], handler: halveBlockLength, description: 'Halve block length' },
    { name: 'double_block', contexts: ['pattern'], handler: doubleBlock, description: 'Double block' },
    { name: 'halve_block', contexts: ['pattern'], handler: halveBlock, description: 'Halve block' },
    { name: 'scale_volume_track', contexts: ['pattern'], handler: scaleVolumeTrack, description: 'Scale volume (track)' },
    { name: 'scale_volume_pattern', contexts: ['pattern'], handler: scaleVolumePattern, description: 'Scale volume (pattern)' },
    { name: 'scale_volume_block', contexts: ['pattern'], handler: scaleVolumeBlock, description: 'Scale volume (block)' },
    { name: 'swap_channels', contexts: ['pattern'], handler: swapChannels, description: 'Swap channels' },
    { name: 'split_pattern', contexts: ['pattern'], handler: splitPattern, description: 'Split pattern' },
    { name: 'join_blocks', contexts: ['pattern'], handler: joinBlocks, description: 'Join blocks' },
    { name: 'set_pattern_length', contexts: ['pattern'], handler: setPatternLength, description: 'Set pattern length' },
    { name: 'pattern_length_dialog', contexts: ['pattern', 'global'], handler: patternLengthDialog, description: 'Pattern length dialog' },
    { name: 'set_bpm', contexts: ['global'], handler: setBpm, description: 'Set BPM' },
    { name: 'set_speed', contexts: ['global'], handler: setSpeed, description: 'Set speed' },
    { name: 'set_tempo', contexts: ['global'], handler: setTempo, description: 'Set tempo' },
    { name: 'append_block', contexts: ['pattern'], handler: appendBlock, description: 'Append block' },
    { name: 'insert_block', contexts: ['pattern'], handler: insertBlock, description: 'Insert block' },
    { name: 'split_block', contexts: ['pattern'], handler: splitBlock, description: 'Split block' },
    { name: 'goto_block', contexts: ['pattern'], handler: gotoBlock, description: 'Go to block' },
    { name: 'find_sample', contexts: ['global'], handler: findSample, description: 'Find sample' },
    { name: 'find_replace', contexts: ['pattern'], handler: findReplace, description: 'Find and replace' },
    { name: 'find_next', contexts: ['pattern'], handler: findNext, description: 'Find next' },
    { name: 'goto_dialog', contexts: ['global'], handler: gotoDialog, description: 'Go to...' },
    { name: 'quantize_settings', contexts: ['global'], handler: quantizeSettings, description: 'Quantize settings' },
    
    // === PASTE VARIANTS ===
    { name: 'paste_overwrite', contexts: ['pattern'], handler: pasteOverwrite, description: 'Paste (overwrite)' },
    { name: 'paste_insert', contexts: ['pattern'], handler: pasteInsert, description: 'Paste (insert)' },
    { name: 'paste_mix', contexts: ['pattern'], handler: pasteMix, description: 'Paste (mix)' },
    { name: 'paste_flood', contexts: ['pattern'], handler: pasteFlood, description: 'Paste (flood)' },
    { name: 'push_forward_paste', contexts: ['pattern'], handler: pushForwardPaste, description: 'Push forward paste' },
    { name: 'cut_row', contexts: ['pattern'], handler: cutRow, description: 'Cut row' },
    { name: 'copy_row', contexts: ['pattern'], handler: copyRow, description: 'Copy row' },
    { name: 'cut_note', contexts: ['pattern'], handler: cutNote, description: 'Cut note' },
    { name: 'clear_note', contexts: ['pattern'], handler: clearNote, description: 'Clear note' },
    { name: 'clear_row', contexts: ['pattern'], handler: clearRow, description: 'Clear row' },
    { name: 'delete_row_pull_up', contexts: ['pattern'], handler: deleteRowPullUp, description: 'Delete row pull up' },
    { name: 'insert_row_push_down', contexts: ['pattern'], handler: insertRowPushDown, description: 'Insert row push down' },
    { name: 'copy_pattern_full', contexts: ['pattern'], handler: copyPattern, description: 'Copy pattern' },
    { name: 'paste_pattern_full', contexts: ['pattern'], handler: pastePattern, description: 'Paste pattern' },
    { name: 'cut_channel', contexts: ['pattern'], handler: cutChannel, description: 'Cut channel' },
    { name: 'copy_channel_full', contexts: ['pattern'], handler: copyChannel, description: 'Copy channel' },
    { name: 'paste_channel_full', contexts: ['pattern'], handler: pasteChannel, description: 'Paste channel' },
    
    // === FOLLOW/TOGGLE COMMANDS ===
    { name: 'toggle_follow_song', contexts: ['global'], handler: toggleFollowSong, description: 'Toggle follow song' },
    { name: 'toggle_loop_pattern', contexts: ['global'], handler: toggleLoopPattern, description: 'Toggle loop pattern' },
    { name: 'toggle_continuous_scroll', contexts: ['global'], handler: toggleContinuousScroll, description: 'Toggle continuous scroll' },
    { name: 'toggle_metronome', contexts: ['global'], handler: toggleMetronome, description: 'Toggle metronome' },
    { name: 'toggle_count_in', contexts: ['global'], handler: toggleCountIn, description: 'Toggle count-in' },
    { name: 'toggle_midi_input', contexts: ['global'], handler: toggleMidiInput, description: 'Toggle MIDI input' },
    { name: 'toggle_record_quantize', contexts: ['global'], handler: toggleRecordQuantize, description: 'Toggle record quantize' },
    { name: 'toggle_chord_mode', contexts: ['global'], handler: toggleChordMode, description: 'Toggle chord mode' },
    { name: 'toggle_wrap_mode', contexts: ['pattern'], handler: toggleWrapMode, description: 'Toggle wrap mode' },
    { name: 'toggle_auto_record', contexts: ['global'], handler: toggleAutoRecord, description: 'Toggle auto-record' },
    { name: 'toggle_multichannel_record', contexts: ['global'], handler: toggleMultiChannelRecord, description: 'Toggle multi-channel record' },
    { name: 'toggle_pattern_focus', contexts: ['global'], handler: togglePatternFocus, description: 'Toggle pattern focus' },
    { name: 'toggle_column_visibility', contexts: ['pattern'], handler: toggleColumnVisibility, description: 'Toggle column visibility' },
    { name: 'toggle_solo_channel', contexts: ['pattern'], handler: toggleSoloChannel, description: 'Toggle solo channel' },
    { name: 'toggle_mute_channel', contexts: ['pattern'], handler: toggleMuteChannel, description: 'Toggle mute channel' },
    { name: 'toggle_sample_preview', contexts: ['global'], handler: toggleSamplePreview, description: 'Toggle sample preview' },
    { name: 'toggle_plugin_editor', contexts: ['global'], handler: togglePluginEditor, description: 'Toggle plugin editor' },
    
    // === POSITION MARKERS ===
    { name: 'save_position_0', contexts: ['pattern'], handler: savePosition0, description: 'Save position 0' },
    { name: 'save_position_1', contexts: ['pattern'], handler: savePosition1, description: 'Save position 1' },
    { name: 'save_position_2', contexts: ['pattern'], handler: savePosition2, description: 'Save position 2' },
    { name: 'save_position_3', contexts: ['pattern'], handler: savePosition3, description: 'Save position 3' },
    { name: 'save_position_4', contexts: ['pattern'], handler: savePosition4, description: 'Save position 4' },
    { name: 'save_position_5', contexts: ['pattern'], handler: savePosition5, description: 'Save position 5' },
    { name: 'save_position_6', contexts: ['pattern'], handler: savePosition6, description: 'Save position 6' },
    { name: 'save_position_7', contexts: ['pattern'], handler: savePosition7, description: 'Save position 7' },
    { name: 'save_position_8', contexts: ['pattern'], handler: savePosition8, description: 'Save position 8' },
    { name: 'save_position_9', contexts: ['pattern'], handler: savePosition9, description: 'Save position 9' },
    { name: 'goto_position_0', contexts: ['pattern'], handler: gotoPosition0, description: 'Go to position 0' },
    { name: 'goto_position_1', contexts: ['pattern'], handler: gotoPosition1, description: 'Go to position 1' },
    { name: 'goto_position_2', contexts: ['pattern'], handler: gotoPosition2, description: 'Go to position 2' },
    { name: 'goto_position_3', contexts: ['pattern'], handler: gotoPosition3, description: 'Go to position 3' },
    { name: 'goto_position_4', contexts: ['pattern'], handler: gotoPosition4, description: 'Go to position 4' },
    { name: 'goto_position_5', contexts: ['pattern'], handler: gotoPosition5, description: 'Go to position 5' },
    { name: 'goto_position_6', contexts: ['pattern'], handler: gotoPosition6, description: 'Go to position 6' },
    { name: 'goto_position_7', contexts: ['pattern'], handler: gotoPosition7, description: 'Go to position 7' },
    { name: 'goto_position_8', contexts: ['pattern'], handler: gotoPosition8, description: 'Go to position 8' },
    { name: 'goto_position_9', contexts: ['pattern'], handler: gotoPosition9, description: 'Go to position 9' },
    { name: 'goto_pattern_start', contexts: ['pattern'], handler: gotoPatternStart, description: 'Go to pattern start' },
    { name: 'goto_pattern_end', contexts: ['pattern'], handler: gotoPatternEnd, description: 'Go to pattern end' },
    { name: 'goto_song_start', contexts: ['global'], handler: gotoSongStart, description: 'Go to song start' },
    { name: 'goto_song_end', contexts: ['global'], handler: gotoSongEnd, description: 'Go to song end' },
    { name: 'goto_first_channel', contexts: ['pattern'], handler: gotoFirstChannel, description: 'Go to first channel' },
    { name: 'goto_last_channel', contexts: ['pattern'], handler: gotoLastChannel, description: 'Go to last channel' },
    { name: 'goto_row', contexts: ['pattern'], handler: gotoRow, description: 'Go to row' },
    { name: 'goto_pattern', contexts: ['global'], handler: gotoPattern, description: 'Go to pattern' },
    { name: 'goto_order_position', contexts: ['global'], handler: gotoOrderPosition, description: 'Go to order position' },
    { name: 'goto_time', contexts: ['global'], handler: gotoTime, description: 'Go to time' },
    { name: 'jump_to_next_bookmark', contexts: ['pattern'], handler: jumpToNextBookmark, description: 'Jump to next bookmark' },
    { name: 'jump_to_prev_bookmark', contexts: ['pattern'], handler: jumpToPrevBookmark, description: 'Jump to prev bookmark' },
    { name: 'toggle_bookmark', contexts: ['pattern'], handler: toggleBookmark, description: 'Toggle bookmark' },
    { name: 'clear_all_bookmarks', contexts: ['pattern'], handler: clearAllBookmarks, description: 'Clear all bookmarks' },
    // ProTracker position jumps
    { name: 'jump_to_position_0', contexts: ['pattern'], handler: gotoPosition0, description: 'Jump to position 0' },
    { name: 'jump_to_position_16', contexts: ['pattern'], handler: jumpToRow16, description: 'Jump to position 16' },
    { name: 'jump_to_position_32', contexts: ['pattern'], handler: jumpToRow32, description: 'Jump to position 32' },
    { name: 'jump_to_position_48', contexts: ['pattern'], handler: jumpToRow48, description: 'Jump to position 48' },
    { name: 'jump_to_position_63', contexts: ['pattern'], handler: cursorPatternEnd, description: 'Jump to position 63' },
    
    // === LAYOUT PRESETS ===
    { name: 'load_layout_1', contexts: ['global'], handler: loadLayout1, description: 'Load layout 1' },
    { name: 'load_layout_2', contexts: ['global'], handler: loadLayout2, description: 'Load layout 2' },
    { name: 'load_layout_3', contexts: ['global'], handler: loadLayout3, description: 'Load layout 3' },
    { name: 'load_layout_4', contexts: ['global'], handler: loadLayout4, description: 'Load layout 4' },
    { name: 'load_layout_5', contexts: ['global'], handler: loadLayout5, description: 'Load layout 5' },
    { name: 'load_layout_6', contexts: ['global'], handler: loadLayout6, description: 'Load layout 6' },
    { name: 'load_layout_7', contexts: ['global'], handler: loadLayout7, description: 'Load layout 7' },
    { name: 'load_layout_8', contexts: ['global'], handler: loadLayout8, description: 'Load layout 8' },
    { name: 'save_layout_1', contexts: ['global'], handler: saveLayout1, description: 'Save layout 1' },
    { name: 'save_layout_2', contexts: ['global'], handler: saveLayout2, description: 'Save layout 2' },
    { name: 'save_layout_3', contexts: ['global'], handler: saveLayout3, description: 'Save layout 3' },
    { name: 'save_layout_4', contexts: ['global'], handler: saveLayout4, description: 'Save layout 4' },
    { name: 'save_layout_5', contexts: ['global'], handler: saveLayout5, description: 'Save layout 5' },
    { name: 'save_layout_6', contexts: ['global'], handler: saveLayout6, description: 'Save layout 6' },
    { name: 'save_layout_7', contexts: ['global'], handler: saveLayout7, description: 'Save layout 7' },
    { name: 'save_layout_8', contexts: ['global'], handler: saveLayout8, description: 'Save layout 8' },
    { name: 'toggle_disk_browser', contexts: ['global'], handler: toggleDiskBrowser, description: 'Toggle disk browser' },
    { name: 'toggle_instrument_panel', contexts: ['global'], handler: toggleInstrumentPanel, description: 'Toggle instrument panel' },
    { name: 'toggle_sample_panel', contexts: ['global'], handler: toggleSamplePanel, description: 'Toggle sample panel' },
    { name: 'toggle_mixer_panel', contexts: ['global'], handler: toggleMixerPanel, description: 'Toggle mixer panel' },
    { name: 'toggle_automation_panel', contexts: ['global'], handler: toggleAutomationPanel, description: 'Toggle automation panel' },
    { name: 'toggle_track_scopes', contexts: ['global'], handler: toggleTrackScopes, description: 'Toggle track scopes' },
    { name: 'toggle_master_spectrum', contexts: ['global'], handler: toggleMasterSpectrum, description: 'Toggle master spectrum' },
    { name: 'maximize_panel', contexts: ['global'], handler: maximizePanel, description: 'Maximize panel' },
    { name: 'restore_panel_sizes', contexts: ['global'], handler: restorePanelSizes, description: 'Restore panel sizes' },
    { name: 'focus_next_panel', contexts: ['global'], handler: focusNextPanel, description: 'Focus next panel' },
    { name: 'focus_prev_panel', contexts: ['global'], handler: focusPrevPanel, description: 'Focus prev panel' },
    { name: 'toggle_bottom_frame', contexts: ['global'], handler: toggleBottomFrame, description: 'Toggle bottom frame' },
    { name: 'toggle_upper_frame', contexts: ['global'], handler: toggleUpperFrame, description: 'Toggle upper frame' },
    { name: 'cycle_global_view', contexts: ['global'], handler: cycleGlobalView, description: 'Cycle global view' },
    
    // === MISC COMMANDS ===
    { name: 'show_about', contexts: ['global'], handler: showAbout, description: 'Show about' },
    { name: 'show_keyboard_help', contexts: ['global'], handler: showKeyboardHelp, description: 'Show keyboard help' },
    { name: 'open_manual', contexts: ['global'], handler: openManual, description: 'Open manual' },
    { name: 'panic', contexts: ['global'], handler: panic, description: 'Panic - all notes off' },
    { name: 'center_cursor', contexts: ['pattern'], handler: centerCursor, description: 'Center cursor' },
    { name: 'insert_keyoff', contexts: ['pattern'], handler: insertKeyoff, description: 'Insert keyoff' },
    { name: 'insert_note_cut', contexts: ['pattern'], handler: insertNoteCut, description: 'Insert note cut' },
    { name: 'insert_fade_out', contexts: ['pattern'], handler: insertFadeOut, description: 'Insert fade out' },
    { name: 'render_to_sample', contexts: ['global'], handler: renderToSample, description: 'Render to sample' },
    { name: 'render_to_instrument', contexts: ['global'], handler: renderToInstrument, description: 'Render to instrument' },
    { name: 'render_song', contexts: ['global'], handler: renderSong, description: 'Render song' },
    { name: 'export_mp3', contexts: ['global'], handler: exportMp3, description: 'Export MP3' },
    { name: 'quick_save', contexts: ['global'], handler: quickSave, description: 'Quick save' },
    { name: 'revert_to_saved', contexts: ['global'], handler: revertToSaved, description: 'Revert to saved' },
    { name: 'reset_view', contexts: ['global'], handler: resetView, description: 'Reset view' },
    { name: 'increase_pattern_size', contexts: ['pattern'], handler: increasePatternSize, description: 'Increase pattern size' },
    { name: 'decrease_pattern_size', contexts: ['pattern'], handler: decreasePatternSize, description: 'Decrease pattern size' },
    { name: 'toggle_hex_mode', contexts: ['global'], handler: toggleHexMode, description: 'Toggle hex mode' },
    { name: 'toggle_row_highlight', contexts: ['pattern'], handler: toggleRowHighlight, description: 'Toggle row highlight' },
    { name: 'toggle_channel_names', contexts: ['pattern'], handler: toggleChannelNames, description: 'Toggle channel names' },
    { name: 'zoom_in', contexts: ['global'], handler: zoomIn, description: 'Zoom in' },
    { name: 'zoom_out', contexts: ['global'], handler: zoomOut, description: 'Zoom out' },
    { name: 'reset_zoom', contexts: ['global'], handler: resetZoom, description: 'Reset zoom' },
    { name: 'fit_to_window', contexts: ['global'], handler: fitToWindow, description: 'Fit to window' },
    { name: 'clone_pattern_new', contexts: ['pattern'], handler: clonePatternCmd, description: 'Clone pattern' },
    { name: 'create_pattern', contexts: ['pattern'], handler: createPattern, description: 'Create pattern' },
    { name: 'delete_pattern', contexts: ['pattern'], handler: deletePattern, description: 'Delete pattern' },
    { name: 'import_midi', contexts: ['global'], handler: importMidi, description: 'Import MIDI' },
    { name: 'export_midi', contexts: ['global'], handler: exportMidi, description: 'Export MIDI' },
    { name: 'import_sample', contexts: ['global'], handler: importSample, description: 'Import sample' },
    { name: 'export_sample', contexts: ['global'], handler: exportSample, description: 'Export sample' },
    { name: 'pattern_properties', contexts: ['pattern'], handler: patternProperties, description: 'Pattern properties' },
    { name: 'song_properties', contexts: ['global'], handler: songProperties, description: 'Song properties' },
    { name: 'cleanup_unused', contexts: ['global'], handler: cleanupUnused, description: 'Cleanup unused' },
    { name: 'toggle_recording', contexts: ['global'], handler: toggleRecording, description: 'Toggle recording' },
    { name: 'preview_instrument', contexts: ['global'], handler: previewInstrument, description: 'Preview instrument' },
    { name: 'preview_sample', contexts: ['global'], handler: previewSample, description: 'Preview sample' },
    { name: 'preview_note_at_cursor', contexts: ['pattern'], handler: previewNoteAtCursor, description: 'Preview note at cursor' },
    { name: 'stop_preview', contexts: ['global'], handler: stopPreview, description: 'Stop preview' },
    { name: 'tempo_tap', contexts: ['global'], handler: tempoTap, description: 'Tempo tap' },
    { name: 'show_quantize_dialog', contexts: ['global'], handler: showQuantizeDialog, description: 'Show quantize dialog' },
    { name: 'show_humanize_dialog', contexts: ['global'], handler: showHumanizeDialog, description: 'Show humanize dialog' },
    { name: 'show_groove_settings', contexts: ['global'], handler: showGrooveSettings, description: 'Show groove settings' },
    { name: 'apply_swing', contexts: ['global'], handler: applySwing, description: 'Apply swing' },
    { name: 'run_script', contexts: ['global'], handler: runScript, description: 'Run script' },
    { name: 'record_macro', contexts: ['global'], handler: recordMacro, description: 'Record macro' },
    { name: 'escape', contexts: ['global', 'pattern', 'dialog'], handler: escapeCommand, description: 'Escape/Cancel' },
    { name: 'confirm', contexts: ['global', 'pattern', 'dialog'], handler: confirmCommand, description: 'Confirm' },
    { name: 'show_context_menu', contexts: ['global', 'pattern'], handler: showContextMenu, description: 'Show context menu' },
    { name: 'show_command_palette', contexts: ['global'], handler: showCommandPalette, description: 'Show command palette' },
    
    // === PLAY VARIANTS ===
    { name: 'play_song_from_order', contexts: ['pattern', 'global'], handler: playPattern, description: 'Play from current pattern' },
    { name: 'play_block', contexts: ['pattern', 'global'], handler: playPattern, description: 'Play current block/pattern' },
    { name: 'continue_song', contexts: ['pattern', 'global'], handler: () => { playFromCursor(); return true; }, description: 'Continue from cursor' },
    { name: 'play_line', contexts: ['pattern'], handler: () => { playRow(); return true; }, description: 'Play current line' },
    { name: 'play_row_and_advance', contexts: ['pattern'], handler: () => { playRow(); cursorDown(); return true; }, description: 'Play row and advance' },

    // === VOLUME ===
    { name: 'set_volume_10', contexts: ['pattern'], handler: () => setVolumeInCell(7), description: 'Set volume 10%' },
    { name: 'set_volume_20', contexts: ['pattern'], handler: () => setVolumeInCell(13), description: 'Set volume 20%' },
    { name: 'set_volume_30', contexts: ['pattern'], handler: () => setVolumeInCell(19), description: 'Set volume 30%' },
    { name: 'set_volume_40', contexts: ['pattern'], handler: () => setVolumeInCell(26), description: 'Set volume 40%' },
    { name: 'set_volume_50', contexts: ['pattern'], handler: () => setVolumeInCell(32), description: 'Set volume 50%' },
    { name: 'set_volume_60', contexts: ['pattern'], handler: () => setVolumeInCell(38), description: 'Set volume 60%' },
    { name: 'set_volume_70', contexts: ['pattern'], handler: () => setVolumeInCell(45), description: 'Set volume 70%' },
    { name: 'set_volume_80', contexts: ['pattern'], handler: () => setVolumeInCell(51), description: 'Set volume 80%' },
    { name: 'set_volume_90', contexts: ['pattern'], handler: () => setVolumeInCell(58), description: 'Set volume 90%' },
    { name: 'set_volume_100', contexts: ['pattern'], handler: () => setVolumeInCell(64), description: 'Set volume 100%' },
    { name: 'decrease_volume', contexts: ['pattern'], handler: adjustVolumeInCell(-4), description: 'Decrease volume' },
    { name: 'increase_volume', contexts: ['pattern'], handler: adjustVolumeInCell(4), description: 'Increase volume' },

    // === FILTER ===
    { name: 'toggle_filter', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Amiga filter: in Settings', false, 1500);
      return true;
    }, description: 'Toggle filter' },

    // === KILL COMMANDS ===
    { name: 'kill_sample', contexts: ['pattern'], handler: () => {
      getToneEngine().releaseAll();
      useUIStore.getState().setStatusMessage('All notes off', false, 800);
      return true;
    }, description: 'Kill sample' },
    { name: 'kill_to_end', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      for (let r = cursor.rowIndex; r < pattern.length; r++) {
        setCell(cursor.channelIndex, r, { note: 97, instrument: 0 });
      }
      useUIStore.getState().setStatusMessage('Killed to end', false, 800);
      return true;
    }, description: 'Kill notes to end of pattern' },
    { name: 'kill_to_start', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { setCell } = useTrackerStore.getState();
      for (let r = 0; r <= cursor.rowIndex; r++) {
        setCell(cursor.channelIndex, r, { note: 97, instrument: 0 });
      }
      useUIStore.getState().setStatusMessage('Killed to start', false, 800);
      return true;
    }, description: 'Kill notes to start of pattern' },

    // === MULTI-CHANNEL MODE ===
    { name: 'toggle_multichannel_mode', contexts: ['global'], handler: () => {
      const { multiChannelRecord, toggleMultiChannelRecord } = useEditorStore.getState();
      toggleMultiChannelRecord();
      useUIStore.getState().setStatusMessage(`Multi-channel: ${!multiChannelRecord ? 'ON' : 'OFF'}`, false, 1000);
      return true;
    }, description: 'Toggle multi-channel record mode' },
    { name: 'set_block_length', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Block length: resize in pattern list', false, 1500);
      return true;
    }, description: 'Set block length' },

    // === OCTAMED HOLD (not applicable) ===
    { name: 'set_hold_0', contexts: ['pattern'], handler: () => { useUIStore.getState().setStatusMessage('Hold: OctaMED only', false, 1000); return true; }, description: 'Set hold 0' },
    { name: 'set_hold_1', contexts: ['pattern'], handler: () => { useUIStore.getState().setStatusMessage('Hold: OctaMED only', false, 1000); return true; }, description: 'Set hold 1' },
    { name: 'set_hold_2', contexts: ['pattern'], handler: () => { useUIStore.getState().setStatusMessage('Hold: OctaMED only', false, 1000); return true; }, description: 'Set hold 2' },
    { name: 'set_hold_3', contexts: ['pattern'], handler: () => { useUIStore.getState().setStatusMessage('Hold: OctaMED only', false, 1000); return true; }, description: 'Set hold 3' },

    // === DJ SCRATCH ===
    { name: 'dj_scratch_baby',   contexts: ['global'], handler: djScratchBaby,  description: 'DJ Scratch: Baby Scratch' },
    { name: 'dj_scratch_trans',  contexts: ['global'], handler: djScratchTrans, description: 'DJ Scratch: Transformer' },
    { name: 'dj_scratch_flare',  contexts: ['global'], handler: djScratchFlare, description: 'DJ Scratch: Flare' },
    { name: 'dj_scratch_hydro',  contexts: ['global'], handler: djScratchHydro, description: 'DJ Scratch: Hydroplane' },
    { name: 'dj_scratch_crab',   contexts: ['global'], handler: djScratchCrab,  description: 'DJ Scratch: Crab' },
    { name: 'dj_scratch_orbit',  contexts: ['global'], handler: djScratchOrbit, description: 'DJ Scratch: Orbit' },
    { name: 'dj_scratch_chirp', contexts: ['global'], handler: djScratchChirp, description: 'DJ Scratch: Chirp' },
    { name: 'dj_scratch_stab',  contexts: ['global'], handler: djScratchStab,  description: 'DJ Scratch: Stab' },
    { name: 'dj_scratch_scrbl', contexts: ['global'], handler: djScratchScrbl, description: 'DJ Scratch: Scribble' },
    { name: 'dj_scratch_tear',  contexts: ['global'], handler: djScratchTear,  description: 'DJ Scratch: Tear' },
    { name: 'dj_scratch_stop',   contexts: ['global'], handler: djScratchStop,  description: 'DJ Scratch: Stop pattern' },
    { name: 'dj_fader_lfo_off',  contexts: ['global'], handler: djFaderLFOOff,  description: 'DJ Fader LFO: Off' },
    { name: 'dj_fader_lfo_14',   contexts: ['global'], handler: djFaderLFO14,   description: 'DJ Fader LFO: 1/4 note' },
    { name: 'dj_fader_lfo_18',   contexts: ['global'], handler: djFaderLFO18,   description: 'DJ Fader LFO: 1/8 note' },
    { name: 'dj_fader_lfo_116',  contexts: ['global'], handler: djFaderLFO116,  description: 'DJ Fader LFO: 1/16 note' },
    { name: 'dj_fader_lfo_132',  contexts: ['global'], handler: djFaderLFO132,  description: 'DJ Fader LFO: 1/32 note' },

    // === TRACKER SCRATCH (works during tracker playback, no DJ mode needed) ===
    // Held-key commands (keydown triggers handler, keyup triggers releaseHandler)
    { name: 'tracker_fader_cut', contexts: ['global'], handler: trackerFaderCutOn, releaseHandler: trackerFaderCutOff, description: 'Tracker: Fader cut (hold to mute)' },
    { name: 'tracker_crab',      contexts: ['global'], handler: trackerCrabOn,      releaseHandler: trackerCrabOff,      description: 'Tracker: Crab scratch (hold)' },
    { name: 'tracker_transformer', contexts: ['global'], handler: trackerTransformerOn, releaseHandler: trackerTransformerOff, description: 'Tracker: Transformer (hold)' },
    { name: 'tracker_flare',     contexts: ['global'], handler: trackerFlareOn,     releaseHandler: trackerFlareOff,     description: 'Tracker: Flare scratch (hold)' },
    // Toggle commands (tap to start/stop)
    { name: 'tracker_scratch_trans', contexts: ['global'], handler: trackerScratchTransformer, description: 'Tracker Scratch: Transformer' },
    { name: 'tracker_scratch_crab',  contexts: ['global'], handler: trackerScratchCrab,        description: 'Tracker Scratch: Crab' },
    { name: 'tracker_scratch_flare', contexts: ['global'], handler: trackerScratchFlare,       description: 'Tracker Scratch: Flare' },
    { name: 'tracker_scratch_chirp', contexts: ['global'], handler: trackerScratchChirp,       description: 'Tracker Scratch: Chirp' },
    { name: 'tracker_scratch_stab',  contexts: ['global'], handler: trackerScratchStab,        description: 'Tracker Scratch: Stab' },
    { name: 'tracker_scratch_8crab', contexts: ['global'], handler: trackerScratch8Crab,       description: 'Tracker Scratch: 8-Finger Crab' },
    { name: 'tracker_scratch_twdl',  contexts: ['global'], handler: trackerScratchTwiddle,     description: 'Tracker Scratch: Twiddle' },
    { name: 'tracker_scratch_stop',  contexts: ['global'], handler: trackerScratchStop,        description: 'Tracker Scratch: Stop pattern' },
    { name: 'tracker_spinback',       contexts: ['global'], handler: trackerSpinback,            description: 'Tracker: Spinback (platter brake + spinup)' },
    { name: 'power_cut_stop',          contexts: ['pattern', 'global'], handler: trackerPowerCut,  description: 'Stop playback with turntable power-off spindown' },

    // ====================================================================
    // MISSING COMMAND REGISTRATIONS
    // All commands referenced in keyboard scheme JSON files that were not
    // previously registered. Grouped by category.
    // ====================================================================

    // === PATTERN/ORDER NAVIGATION ALIASES ===
    { name: 'prev_order', contexts: ['pattern', 'global'], handler: prevPattern, description: 'Previous order/pattern' },
    { name: 'next_order', contexts: ['pattern', 'global'], handler: nextPattern, description: 'Next order/pattern' },
    { name: 'prev_sequence', contexts: ['pattern', 'global'], handler: prevPattern, description: 'Previous sequence position' },
    { name: 'next_sequence', contexts: ['pattern', 'global'], handler: nextPattern, description: 'Next sequence position' },
    { name: 'goto_first_pattern', contexts: ['pattern', 'global'], handler: () => {
      useTrackerStore.getState().setCurrentPattern(0);
      useCursorStore.getState().moveCursorToRow(0);
      return true;
    }, description: 'Go to first pattern' },
    { name: 'goto_last_pattern', contexts: ['pattern', 'global'], handler: () => {
      const { patterns, setCurrentPattern } = useTrackerStore.getState();
      setCurrentPattern(patterns.length - 1);
      useCursorStore.getState().moveCursorToRow(0);
      return true;
    }, description: 'Go to last pattern' },
    { name: 'prev_pattern_4', contexts: ['pattern', 'global'], handler: () => {
      const { currentPatternIndex, setCurrentPattern } = useTrackerStore.getState();
      setCurrentPattern(Math.max(0, currentPatternIndex - 4));
      return true;
    }, description: 'Skip back 4 patterns' },
    { name: 'next_pattern_4', contexts: ['pattern', 'global'], handler: () => {
      const { currentPatternIndex, patterns, setCurrentPattern } = useTrackerStore.getState();
      setCurrentPattern(Math.min(patterns.length - 1, currentPatternIndex + 4));
      return true;
    }, description: 'Skip forward 4 patterns' },
    { name: 'first_block', contexts: ['pattern', 'global'], handler: () => {
      useTrackerStore.getState().setCurrentPattern(0);
      useCursorStore.getState().moveCursorToRow(0);
      return true;
    }, description: 'Go to first block' },
    { name: 'last_block', contexts: ['pattern', 'global'], handler: () => {
      const { patterns, setCurrentPattern } = useTrackerStore.getState();
      setCurrentPattern(patterns.length - 1);
      useCursorStore.getState().moveCursorToRow(0);
      return true;
    }, description: 'Go to last block' },

    // === PLAYBACK VARIANTS ===
    { name: 'pause', contexts: ['pattern', 'global'], handler: playStopToggle, description: 'Pause playback' },
    { name: 'play_from_start', contexts: ['pattern', 'global'], handler: playSong, description: 'Play from song start' },
    { name: 'play_song_alt', contexts: ['pattern', 'global'], handler: playSong, description: 'Play song (alternate)' },
    { name: 'play_pattern_from_start', contexts: ['pattern', 'global'], handler: playPattern, description: 'Play pattern from start' },
    { name: 'play_pattern_loop', contexts: ['pattern', 'global'], handler: playPattern, description: 'Play pattern in loop' },
    { name: 'play_block_loop', contexts: ['pattern', 'global'], handler: playPattern, description: 'Play block/pattern in loop' },
    { name: 'play_pattern_from_cursor', contexts: ['pattern', 'global'], handler: playFromCursor, description: 'Play pattern from cursor' },
    { name: 'play_note_on_line', contexts: ['pattern'], handler: () => { playRow(); return true; }, description: 'Play note on current line' },

    // === CURSOR MOVEMENT EXTENDED ===
    { name: 'cursor_down_by_beat', contexts: ['pattern'], handler: () => {
      const { cursor, moveCursorToRow } = useCursorStore.getState();
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      moveCursorToRow(Math.min(pattern.length - 1, cursor.rowIndex + 4));
      return true;
    }, description: 'Move cursor down by beat (4 rows)' },
    { name: 'cursor_up_by_beat', contexts: ['pattern'], handler: () => {
      const { cursor, moveCursorToRow } = useCursorStore.getState();
      moveCursorToRow(Math.max(0, cursor.rowIndex - 4));
      return true;
    }, description: 'Move cursor up by beat (4 rows)' },
    { name: 'cursor_down_by_spacing', contexts: ['pattern'], handler: () => {
      const { cursor, moveCursorToRow } = useCursorStore.getState();
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const { editStep } = useEditorStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      const step = editStep > 0 ? editStep : 1;
      moveCursorToRow(Math.min(pattern.length - 1, cursor.rowIndex + step));
      return true;
    }, description: 'Move cursor down by edit step' },
    { name: 'cursor_up_by_spacing', contexts: ['pattern'], handler: () => {
      const { cursor, moveCursorToRow } = useCursorStore.getState();
      const { editStep } = useEditorStore.getState();
      const step = editStep > 0 ? editStep : 1;
      moveCursorToRow(Math.max(0, cursor.rowIndex - step));
      return true;
    }, description: 'Move cursor up by edit step' },
    { name: 'goto_first_row_first_channel', contexts: ['pattern'], handler: () => {
      useCursorStore.getState().moveCursorToRow(0);
      useCursorStore.getState().moveCursorToChannel(0);
      useCursorStore.getState().moveCursorToColumn('note');
      return true;
    }, description: 'Go to first row, first channel' },
    { name: 'goto_last_row_last_channel', contexts: ['pattern'], handler: () => {
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      useCursorStore.getState().moveCursorToRow(pattern.length - 1);
      useCursorStore.getState().moveCursorToChannel(pattern.channels.length - 1);
      useCursorStore.getState().moveCursorToColumn('note');
      return true;
    }, description: 'Go to last row, last channel' },
    { name: 'jump_to_row_25_percent', contexts: ['pattern'], handler: () => {
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      useCursorStore.getState().moveCursorToRow(Math.floor(pattern.length * 0.25));
      return true;
    }, description: 'Jump to 25% of pattern' },
    { name: 'jump_to_row_50_percent', contexts: ['pattern'], handler: () => {
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      useCursorStore.getState().moveCursorToRow(Math.floor(pattern.length * 0.50));
      return true;
    }, description: 'Jump to 50% of pattern' },
    { name: 'jump_to_row_75_percent', contexts: ['pattern'], handler: () => {
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      useCursorStore.getState().moveCursorToRow(Math.floor(pattern.length * 0.75));
      return true;
    }, description: 'Jump to 75% of pattern' },
    { name: 'jump_to_block_start', contexts: ['pattern'], handler: cursorPatternStart, description: 'Jump to block start' },
    { name: 'jump_to_block_end', contexts: ['pattern'], handler: cursorPatternEnd, description: 'Jump to block end' },
    { name: 'jump_to_block_middle', contexts: ['pattern'], handler: () => {
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      useCursorStore.getState().moveCursorToRow(Math.floor(pattern.length / 2));
      return true;
    }, description: 'Jump to block middle' },
    { name: 'jump_to_block_quarter_1', contexts: ['pattern'], handler: jumpToQuarter1, description: 'Jump to block 1/4' },
    { name: 'jump_to_block_quarter_3', contexts: ['pattern'], handler: jumpToQuarter3, description: 'Jump to block 3/4' },
    { name: 'scroll_view_up', contexts: ['pattern'], handler: () => {
      const { cursor, moveCursorToRow } = useCursorStore.getState();
      moveCursorToRow(Math.max(0, cursor.rowIndex - 1));
      return true;
    }, description: 'Scroll view up' },
    { name: 'scroll_view_down', contexts: ['pattern'], handler: () => {
      const { cursor, moveCursorToRow } = useCursorStore.getState();
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      moveCursorToRow(Math.min(pattern.length - 1, cursor.rowIndex + 1));
      return true;
    }, description: 'Scroll view down' },
    { name: 'seek_next_note', contexts: ['pattern'], handler: () => {
      const { cursor, moveCursorToRow } = useCursorStore.getState();
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      const ch = pattern.channels[cursor.channelIndex];
      if (!ch) return false;
      for (let r = cursor.rowIndex + 1; r < pattern.length; r++) {
        if (ch.rows[r]?.note && ch.rows[r].note! > 0) {
          moveCursorToRow(r);
          return true;
        }
      }
      return true;
    }, description: 'Seek to next note' },
    { name: 'seek_previous_note', contexts: ['pattern'], handler: () => {
      const { cursor, moveCursorToRow } = useCursorStore.getState();
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      const ch = pattern.channels[cursor.channelIndex];
      if (!ch) return false;
      for (let r = cursor.rowIndex - 1; r >= 0; r--) {
        if (ch.rows[r]?.note && ch.rows[r].note! > 0) {
          moveCursorToRow(r);
          return true;
        }
      }
      return true;
    }, description: 'Seek to previous note' },
    { name: 'snap_to_beat_down', contexts: ['pattern'], handler: () => {
      const { cursor, moveCursorToRow } = useCursorStore.getState();
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      const nextBeat = Math.min(pattern.length - 1, (Math.floor(cursor.rowIndex / 4) + 1) * 4);
      moveCursorToRow(nextBeat);
      return true;
    }, description: 'Snap cursor to next beat boundary' },
    { name: 'snap_to_beat_up', contexts: ['pattern'], handler: () => {
      const { cursor, moveCursorToRow } = useCursorStore.getState();
      const prevBeat = Math.max(0, (Math.ceil(cursor.rowIndex / 4) - 1) * 4);
      moveCursorToRow(prevBeat);
      return true;
    }, description: 'Snap cursor to previous beat boundary' },
    { name: 'stay_in_visible_channels_left', contexts: ['pattern'], handler: prevChannel, description: 'Move left within visible channels' },
    { name: 'stay_in_visible_channels_right', contexts: ['pattern'], handler: nextChannel, description: 'Move right within visible channels' },
    { name: 'screen_left', contexts: ['pattern'], handler: prevChannel, description: 'Screen left (prev channel)' },
    { name: 'screen_right', contexts: ['pattern'], handler: nextChannel, description: 'Screen right (next channel)' },

    // === EDITING EXTENDED ===
    { name: 'backspace_cursor', contexts: ['pattern'], handler: () => {
      const { cursor, moveCursorToRow } = useCursorStore.getState();
      if (cursor.rowIndex > 0) {
        const { deleteRow } = useTrackerStore.getState();
        deleteRow(cursor.channelIndex, cursor.rowIndex - 1);
        moveCursorToRow(cursor.rowIndex - 1);
      }
      return true;
    }, description: 'Delete note above cursor and pull up' },
    { name: 'insert_note_off', contexts: ['pattern'], handler: insertKeyoff, description: 'Insert note off (===)' },
    { name: 'insert_note_off_a', contexts: ['pattern'], handler: insertKeyoff, description: 'Insert note off (alternate)' },
    { name: 'insert_note_fade', contexts: ['pattern'], handler: insertFadeOut, description: 'Insert note fade' },
    { name: 'clear_field', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { setCell } = useTrackerStore.getState();
      const col = cursor.columnType;
      if (col === 'note') setCell(cursor.channelIndex, cursor.rowIndex, { note: 0 });
      else if (col === 'instrument') setCell(cursor.channelIndex, cursor.rowIndex, { instrument: 0 });
      else if (col === 'volume') setCell(cursor.channelIndex, cursor.rowIndex, { volume: 0 });
      else if (col === 'effTyp') setCell(cursor.channelIndex, cursor.rowIndex, { effTyp: 0 });
      else if (col === 'effParam') setCell(cursor.channelIndex, cursor.rowIndex, { eff: 0 });
      else if (col === 'effTyp2') setCell(cursor.channelIndex, cursor.rowIndex, { effTyp2: 0 });
      else if (col === 'effParam2') setCell(cursor.channelIndex, cursor.rowIndex, { eff2: 0 });
      return true;
    }, description: 'Clear current field' },
    { name: 'clear_field_and_step_it', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { setCell } = useTrackerStore.getState();
      const col = cursor.columnType;
      if (col === 'note') setCell(cursor.channelIndex, cursor.rowIndex, { note: 0 });
      else if (col === 'instrument') setCell(cursor.channelIndex, cursor.rowIndex, { instrument: 0 });
      else if (col === 'volume') setCell(cursor.channelIndex, cursor.rowIndex, { volume: 0 });
      else if (col === 'effTyp') setCell(cursor.channelIndex, cursor.rowIndex, { effTyp: 0 });
      else if (col === 'effParam') setCell(cursor.channelIndex, cursor.rowIndex, { eff: 0 });
      else if (col === 'effTyp2') setCell(cursor.channelIndex, cursor.rowIndex, { effTyp2: 0 });
      else if (col === 'effParam2') setCell(cursor.channelIndex, cursor.rowIndex, { eff2: 0 });
      advanceToNextRow();
      return true;
    }, description: 'Clear field and advance (IT style)' },
    { name: 'clear_field_it_style', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { setCell } = useTrackerStore.getState();
      const col = cursor.columnType;
      if (col === 'note') setCell(cursor.channelIndex, cursor.rowIndex, { note: 0 });
      else if (col === 'instrument') setCell(cursor.channelIndex, cursor.rowIndex, { instrument: 0 });
      else if (col === 'volume') setCell(cursor.channelIndex, cursor.rowIndex, { volume: 0 });
      else if (col === 'effTyp') setCell(cursor.channelIndex, cursor.rowIndex, { effTyp: 0 });
      else if (col === 'effParam') setCell(cursor.channelIndex, cursor.rowIndex, { eff: 0 });
      else if (col === 'effTyp2') setCell(cursor.channelIndex, cursor.rowIndex, { effTyp2: 0 });
      else if (col === 'effParam2') setCell(cursor.channelIndex, cursor.rowIndex, { eff2: 0 });
      return true;
    }, description: 'Clear field (IT style)' },
    { name: 'clear_row_and_step', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { setCell } = useTrackerStore.getState();
      setCell(cursor.channelIndex, cursor.rowIndex, { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
      advanceToNextRow();
      return true;
    }, description: 'Clear row and advance' },
    { name: 'insert_rows', contexts: ['pattern'], handler: insertRow, description: 'Insert row(s)' },
    { name: 'insert_rows_all_channels', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { insertRow: insRow, patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      for (let ch = 0; ch < pattern.channels.length; ch++) {
        insRow(ch, cursor.rowIndex);
      }
      return true;
    }, description: 'Insert row in all channels' },
    { name: 'insert_rows_global', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { insertRow: insRow, patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      for (let ch = 0; ch < pattern.channels.length; ch++) {
        insRow(ch, cursor.rowIndex);
      }
      return true;
    }, description: 'Insert row globally' },
    { name: 'delete_rows', contexts: ['pattern'], handler: deleteAndPull, description: 'Delete row(s)' },
    { name: 'delete_rows_all_channels', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { deleteRow: delRow, patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      for (let ch = 0; ch < pattern.channels.length; ch++) {
        delRow(ch, cursor.rowIndex);
      }
      return true;
    }, description: 'Delete row in all channels' },
    { name: 'delete_rows_global', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { deleteRow: delRow, patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      for (let ch = 0; ch < pattern.channels.length; ch++) {
        delRow(ch, cursor.rowIndex);
      }
      return true;
    }, description: 'Delete row globally' },
    { name: 'delete_line_all_channels', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { deleteRow: delRow, patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      for (let ch = 0; ch < pattern.channels.length; ch++) {
        delRow(ch, cursor.rowIndex);
      }
      return true;
    }, description: 'Delete line in all channels' },
    { name: 'insert_line_all_channels', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { insertRow: insRow, patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      for (let ch = 0; ch < pattern.channels.length; ch++) {
        insRow(ch, cursor.rowIndex);
      }
      return true;
    }, description: 'Insert line in all channels' },
    { name: 'insert_space', contexts: ['pattern'], handler: insertRow, description: 'Insert space (push down)' },
    { name: 'delete_note_and_command', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { setCell } = useTrackerStore.getState();
      setCell(cursor.channelIndex, cursor.rowIndex, { note: 0, instrument: 0, effTyp: 0, eff: 0 });
      return true;
    }, description: 'Delete note and command' },
    { name: 'delete_note_and_space', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { setCell } = useTrackerStore.getState();
      setCell(cursor.channelIndex, cursor.rowIndex, { note: 0, instrument: 0 });
      return true;
    }, description: 'Delete note and space' },
    { name: 'roll_up', contexts: ['pattern'], handler: () => {
      // IT-style: scroll pattern data up circularly
      const { cursor } = useCursorStore.getState();
      const { patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      const ch = pattern.channels[cursor.channelIndex];
      if (!ch) return false;
      const firstRow = { ...ch.rows[0] };
      for (let r = 0; r < pattern.length - 1; r++) {
        const next = ch.rows[r + 1];
        setCell(cursor.channelIndex, r, { note: next.note, instrument: next.instrument, volume: next.volume, effTyp: next.effTyp, eff: next.eff });
      }
      setCell(cursor.channelIndex, pattern.length - 1, { note: firstRow.note, instrument: firstRow.instrument, volume: firstRow.volume, effTyp: firstRow.effTyp, eff: firstRow.eff });
      return true;
    }, description: 'Roll channel data up (circular)' },
    { name: 'roll_down', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      const ch = pattern.channels[cursor.channelIndex];
      if (!ch) return false;
      const lastRow = { ...ch.rows[pattern.length - 1] };
      for (let r = pattern.length - 1; r > 0; r--) {
        const prev = ch.rows[r - 1];
        setCell(cursor.channelIndex, r, { note: prev.note, instrument: prev.instrument, volume: prev.volume, effTyp: prev.effTyp, eff: prev.eff });
      }
      setCell(cursor.channelIndex, 0, { note: lastRow.note, instrument: lastRow.instrument, volume: lastRow.volume, effTyp: lastRow.effTyp, eff: lastRow.eff });
      return true;
    }, description: 'Roll channel data down (circular)' },
    { name: 'quick_copy', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      const cell = pattern.channels[cursor.channelIndex]?.rows[cursor.rowIndex];
      if (cell) {
        (window as any).__quickCopyCell = { ...cell };
        useUIStore.getState().setStatusMessage('Quick copied', false, 800);
      }
      return true;
    }, description: 'Quick copy current cell' },
    { name: 'quick_paste', contexts: ['pattern'], handler: () => {
      const saved = (window as any).__quickCopyCell;
      if (!saved) { useUIStore.getState().setStatusMessage('Nothing to quick paste', false, 800); return true; }
      const { cursor } = useCursorStore.getState();
      const { setCell } = useTrackerStore.getState();
      setCell(cursor.channelIndex, cursor.rowIndex, saved);
      useUIStore.getState().setStatusMessage('Quick pasted', false, 800);
      return true;
    }, description: 'Quick paste cell' },

    // === TRANSPOSE ALIASES ===
    { name: 'transpose_up_1', contexts: ['pattern'], handler: transposeUp, description: 'Transpose up 1 semitone' },
    { name: 'transpose_down_1', contexts: ['pattern'], handler: transposeDown, description: 'Transpose down 1 semitone' },
    { name: 'transpose_up_octave', contexts: ['pattern'], handler: transposeOctaveUp, description: 'Transpose up 1 octave' },
    { name: 'transpose_down_octave', contexts: ['pattern'], handler: transposeOctaveDown, description: 'Transpose down 1 octave' },
    { name: 'transpose_custom', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Transpose: use Shift+F7/F8 for semitone, Ctrl+F7/F8 for octave', false, 2000);
      return true;
    }, description: 'Custom transpose dialog' },

    // === CHANNEL EXTENDED ===
    { name: 'unmute_all_channels', contexts: ['pattern', 'global'], handler: unmuteAll, description: 'Unmute all channels' },
    { name: 'reset_channel', contexts: ['pattern'], handler: () => {
      getToneEngine().releaseAll();
      useUIStore.getState().setStatusMessage('Channel reset', false, 800);
      return true;
    }, description: 'Reset channel' },
    // set_track_9 through set_track_16
    ...Array.from({ length: 8 }, (_, i) => ({
      name: `set_track_${i + 9}`,
      contexts: ['pattern'] as CommandContext[],
      handler: () => {
        useCursorStore.getState().moveCursorToChannel(i + 8);
        useUIStore.getState().setStatusMessage(`Channel ${i + 9}`, false, 1000);
        return true;
      },
      description: `Select track ${i + 9}`,
    })),
    { name: 'channel_record_select', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Record select: use multi-channel mode', false, 1500);
      return true;
    }, description: 'Channel record select' },
    { name: 'channel_split_record_select', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Split record select: use multi-channel mode', false, 1500);
      return true;
    }, description: 'Channel split record select' },
    { name: 'set_multi_channel_0', contexts: ['pattern'], handler: () => { useCursorStore.getState().moveCursorToChannel(0); return true; }, description: 'Multi-channel: select 0' },
    { name: 'set_multi_channel_1', contexts: ['pattern'], handler: () => { useCursorStore.getState().moveCursorToChannel(1); return true; }, description: 'Multi-channel: select 1' },
    { name: 'set_multi_channel_2', contexts: ['pattern'], handler: () => { useCursorStore.getState().moveCursorToChannel(2); return true; }, description: 'Multi-channel: select 2' },
    { name: 'set_multi_channel_3', contexts: ['pattern'], handler: () => { useCursorStore.getState().moveCursorToChannel(3); return true; }, description: 'Multi-channel: select 3' },

    // === OCTAVE ALIASES ===
    { name: 'select_octave_low', contexts: ['pattern'], handler: setOctave0, description: 'Select low octave' },
    { name: 'select_octave_high', contexts: ['pattern'], handler: setOctave4, description: 'Select high octave' },
    { name: 'select_octave_12', contexts: ['pattern'], handler: setOctave1, description: 'Select octave 1-2 range' },
    { name: 'select_octave_23', contexts: ['pattern'], handler: setOctave2, description: 'Select octave 2-3 range' },
    { name: 'select_octave_34', contexts: ['pattern'], handler: setOctave3, description: 'Select octave 3-4 range' },
    { name: 'select_octave_45', contexts: ['pattern'], handler: setOctave4, description: 'Select octave 4-5 range' },
    { name: 'select_octave_56', contexts: ['pattern'], handler: setOctave5, description: 'Select octave 5-6 range' },

    // === EDIT STEP ALIASES ===
    { name: 'increase_edit_step', contexts: ['pattern'], handler: increaseStep, description: 'Increase edit step' },
    { name: 'decrease_edit_step', contexts: ['pattern'], handler: decreaseStep, description: 'Decrease edit step' },

    // === BLOCK LENGTH ALIASES ===
    { name: 'block_length_double', contexts: ['pattern'], handler: doubleBlockLength, description: 'Double block length' },
    { name: 'block_length_halve', contexts: ['pattern'], handler: halveBlockLength, description: 'Halve block length' },

    // === SELECTION EXTENDED ===
    { name: 'mark_block_up', contexts: ['pattern'], handler: () => {
      const cs = useCursorStore.getState();
      if (!cs.selection) cs.startSelection();
      cs.moveCursor('up');
      const c = useCursorStore.getState().cursor;
      const sel = useCursorStore.getState().selection;
      if (sel) {
        useCursorStore.setState({ selection: { ...sel, endRow: c.rowIndex, endChannel: c.channelIndex, endColumn: c.columnType } });
      }
      return true;
    }, description: 'Extend selection up' },
    { name: 'mark_block_down', contexts: ['pattern'], handler: () => {
      const cs = useCursorStore.getState();
      if (!cs.selection) cs.startSelection();
      cs.moveCursor('down');
      const c = useCursorStore.getState().cursor;
      const sel = useCursorStore.getState().selection;
      if (sel) {
        useCursorStore.setState({ selection: { ...sel, endRow: c.rowIndex, endChannel: c.channelIndex, endColumn: c.columnType } });
      }
      return true;
    }, description: 'Extend selection down' },
    { name: 'mark_block_left', contexts: ['pattern'], handler: () => {
      const cs = useCursorStore.getState();
      if (!cs.selection) cs.startSelection();
      cs.moveCursor('left');
      const c = useCursorStore.getState().cursor;
      const sel = useCursorStore.getState().selection;
      if (sel) {
        useCursorStore.setState({ selection: { ...sel, endRow: c.rowIndex, endChannel: c.channelIndex, endColumn: c.columnType } });
      }
      return true;
    }, description: 'Extend selection left' },
    { name: 'mark_block_right', contexts: ['pattern'], handler: () => {
      const cs = useCursorStore.getState();
      if (!cs.selection) cs.startSelection();
      cs.moveCursor('right');
      const c = useCursorStore.getState().cursor;
      const sel = useCursorStore.getState().selection;
      if (sel) {
        useCursorStore.setState({ selection: { ...sel, endRow: c.rowIndex, endChannel: c.channelIndex, endColumn: c.columnType } });
      }
      return true;
    }, description: 'Extend selection right' },
    { name: 'cut_pattern', contexts: ['pattern'], handler: () => {
      selectAll();
      cutSelection();
      return true;
    }, description: 'Cut entire pattern' },
    { name: 'select_beat', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const beatStart = Math.floor(cursor.rowIndex / 4) * 4;
      useCursorStore.setState({
        selection: {
          startRow: beatStart, endRow: Math.min(beatStart + 3, 255),
          startChannel: cursor.channelIndex, endChannel: cursor.channelIndex,
          startColumn: 'note', endColumn: 'effParam2',
          columnTypes: ['note', 'instrument', 'volume', 'effTyp', 'effParam', 'effTyp2', 'effParam2'],
        }
      });
      return true;
    }, description: 'Select current beat' },
    { name: 'select_measure', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const measureStart = Math.floor(cursor.rowIndex / 16) * 16;
      useCursorStore.setState({
        selection: {
          startRow: measureStart, endRow: Math.min(measureStart + 15, 255),
          startChannel: cursor.channelIndex, endChannel: cursor.channelIndex,
          startColumn: 'note', endColumn: 'effParam2',
          columnTypes: ['note', 'instrument', 'volume', 'effTyp', 'effParam', 'effTyp2', 'effParam2'],
        }
      });
      return true;
    }, description: 'Select current measure' },
    { name: 'select_rows_quick', contexts: ['pattern'], handler: selectChannel, description: 'Quick select rows' },
    { name: 'copy_selection_lossy', contexts: ['pattern'], handler: copySelection, description: 'Copy selection (lossy)' },
    { name: 'mix_paste', contexts: ['pattern'], handler: pasteMix, description: 'Paste (mix)' },
    { name: 'copy_channel_commands', contexts: ['pattern'], handler: copyTrack, description: 'Copy channel commands' },
    { name: 'cut_channel_commands', contexts: ['pattern'], handler: cutTrack, description: 'Cut channel commands' },
    { name: 'paste_channel_commands', contexts: ['pattern'], handler: pasteTrack, description: 'Paste channel commands' },
    { name: 'continue_block', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Continue block: use next_pattern', false, 1000);
      return true;
    }, description: 'Continue block' },
    { name: 'copy_note_to_mask', contexts: ['pattern'], handler: () => {
      const { cursor } = useCursorStore.getState();
      const { patterns, currentPatternIndex } = useTrackerStore.getState();
      const cell = patterns[currentPatternIndex]?.channels[cursor.channelIndex]?.rows[cursor.rowIndex];
      if (cell) (window as any).__noteMask = { ...cell };
      useUIStore.getState().setStatusMessage('Note mask copied', false, 800);
      return true;
    }, description: 'Copy note to mask' },
    { name: 'toggle_mask_field', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Mask field toggled', false, 800);
      return true;
    }, description: 'Toggle mask field' },
    { name: 'selection_swap', contexts: ['pattern'], handler: swapSelection, description: 'Swap selection' },
    { name: 'selection_set_sample', contexts: ['pattern'], handler: applyCurrentInstrument, description: 'Set sample on selection' },
    { name: 'selection_set_volume', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Set volume: use volume column', false, 1000);
      return true;
    }, description: 'Set volume on selection' },
    { name: 'selection_slide_effect', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Slide effect: use effect column', false, 1000);
      return true;
    }, description: 'Slide effect on selection' },
    { name: 'selection_slide_volume', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Slide volume: use interpolate', false, 1000);
      return true;
    }, description: 'Slide volume on selection' },
    { name: 'selection_wipe_volume', contexts: ['pattern'], handler: () => {
      const { patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      if (!pattern) return false;
      const sel = useCursorStore.getState().selection;
      if (!sel) return true;
      const startRow = Math.min(sel.startRow, sel.endRow);
      const endRow = Math.max(sel.startRow, sel.endRow);
      const startCh = Math.min(sel.startChannel, sel.endChannel);
      const endCh = Math.max(sel.startChannel, sel.endChannel);
      for (let ch = startCh; ch <= endCh; ch++) {
        for (let r = startRow; r <= endRow; r++) {
          setCell(ch, r, { volume: 0 });
        }
      }
      useUIStore.getState().setStatusMessage('Volume wiped', false, 800);
      return true;
    }, description: 'Wipe volume from selection' },
    { name: 'cycle_next_clipboard', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Clipboard: single buffer', false, 1000);
      return true;
    }, description: 'Cycle to next clipboard' },
    { name: 'cycle_prev_clipboard', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Clipboard: single buffer', false, 1000);
      return true;
    }, description: 'Cycle to previous clipboard' },

    // === INSTRUMENT EXTENDED ===
    { name: 'set_instrument_0', contexts: ['pattern'], handler: () => {
      const { instruments, setCurrentInstrument } = useInstrumentStore.getState();
      if (instruments.length > 0) {
        setCurrentInstrument(instruments[0].id);
        useUIStore.getState().setStatusMessage(`Instrument 0: ${instruments[0].name || instruments[0].id}`, false, 1000);
      }
      return true;
    }, description: 'Select instrument 0' },
    { name: 'instrument_scroll_up', contexts: ['pattern', 'global'], handler: prevInstrument, description: 'Scroll instrument up' },
    { name: 'instrument_scroll_down', contexts: ['pattern', 'global'], handler: nextInstrument, description: 'Scroll instrument down' },
    { name: 'instrument_quick_scroll_up', contexts: ['pattern', 'global'], handler: prevInstrument, description: 'Quick scroll instrument up' },
    { name: 'instrument_quick_scroll_down', contexts: ['pattern', 'global'], handler: nextInstrument, description: 'Quick scroll instrument down' },
    { name: 'instrument_page_up', contexts: ['pattern', 'global'], handler: () => {
      const { currentInstrumentId, instruments, setCurrentInstrument } = useInstrumentStore.getState();
      if (instruments.length === 0) return true;
      const currentIndex = instruments.findIndex(i => i.id === currentInstrumentId);
      const newIndex = Math.max(0, currentIndex - 16);
      setCurrentInstrument(instruments[newIndex].id);
      useUIStore.getState().setStatusMessage(`Instrument: ${instruments[newIndex].name || instruments[newIndex].id}`, false, 1000);
      return true;
    }, description: 'Instrument page up (skip 16)' },
    { name: 'instrument_page_down', contexts: ['pattern', 'global'], handler: () => {
      const { currentInstrumentId, instruments, setCurrentInstrument } = useInstrumentStore.getState();
      if (instruments.length === 0) return true;
      const currentIndex = instruments.findIndex(i => i.id === currentInstrumentId);
      const newIndex = Math.min(instruments.length - 1, currentIndex + 16);
      setCurrentInstrument(instruments[newIndex].id);
      useUIStore.getState().setStatusMessage(`Instrument: ${instruments[newIndex].name || instruments[newIndex].id}`, false, 1000);
      return true;
    }, description: 'Instrument page down (skip 16)' },
    { name: 'instrument_16_forward', contexts: ['pattern', 'global'], handler: () => {
      const { currentInstrumentId, instruments, setCurrentInstrument } = useInstrumentStore.getState();
      if (instruments.length === 0) return true;
      const currentIndex = instruments.findIndex(i => i.id === currentInstrumentId);
      const newIndex = Math.min(instruments.length - 1, currentIndex + 16);
      setCurrentInstrument(instruments[newIndex].id);
      return true;
    }, description: 'Skip 16 instruments forward' },
    { name: 'instrument_16_backward', contexts: ['pattern', 'global'], handler: () => {
      const { currentInstrumentId, instruments, setCurrentInstrument } = useInstrumentStore.getState();
      if (instruments.length === 0) return true;
      const currentIndex = instruments.findIndex(i => i.id === currentInstrumentId);
      const newIndex = Math.max(0, currentIndex - 16);
      setCurrentInstrument(instruments[newIndex].id);
      return true;
    }, description: 'Skip 16 instruments backward' },
    { name: 'instrument_goto_top', contexts: ['pattern', 'global'], handler: () => {
      const { instruments, setCurrentInstrument } = useInstrumentStore.getState();
      if (instruments.length > 0) setCurrentInstrument(instruments[0].id);
      return true;
    }, description: 'Go to first instrument' },
    { name: 'instrument_goto_end', contexts: ['pattern', 'global'], handler: () => {
      const { instruments, setCurrentInstrument } = useInstrumentStore.getState();
      if (instruments.length > 0) setCurrentInstrument(instruments[instruments.length - 1].id);
      return true;
    }, description: 'Go to last instrument' },
    { name: 'next_auto_instrument_slot', contexts: ['pattern', 'global'], handler: nextInstrument, description: 'Next auto instrument slot' },
    { name: 'prev_auto_instrument_slot', contexts: ['pattern', 'global'], handler: prevInstrument, description: 'Previous auto instrument slot' },
    { name: 'swap_instrument_bank', contexts: ['pattern', 'global'], handler: () => {
      useUIStore.getState().setStatusMessage('Instrument bank: single bank', false, 1000);
      return true;
    }, description: 'Swap instrument bank' },
    { name: 'select_instrument_name', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Instrument name: edit in instrument panel', false, 1500);
      return true;
    }, description: 'Select instrument name' },
    { name: 'clear_instrument_name', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Clear name: edit in instrument panel', false, 1500);
      return true;
    }, description: 'Clear instrument name' },
    { name: 'select_instrument_repeat', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Instrument repeat: not applicable', false, 1000);
      return true;
    }, description: 'Select instrument repeat' },

    // === SAMPLE COMMANDS ===
    ...Array.from({ length: 10 }, (_, i) => ({
      name: `set_sample_${i}`,
      contexts: ['pattern'] as CommandContext[],
      handler: () => {
        const { instruments, setCurrentInstrument } = useInstrumentStore.getState();
        if (i < instruments.length) {
          setCurrentInstrument(instruments[i].id);
          useUIStore.getState().setStatusMessage(`Sample ${i}: ${instruments[i].name || instruments[i].id}`, false, 1000);
        }
        return true;
      },
      description: `Select sample ${i}`,
    })),
    { name: 'set_sample_bank_a', contexts: ['pattern'], handler: () => { useUIStore.getState().setStatusMessage('Sample bank A', false, 800); return true; }, description: 'Set sample bank A' },
    { name: 'set_sample_bank_b', contexts: ['pattern'], handler: () => { useUIStore.getState().setStatusMessage('Sample bank B', false, 800); return true; }, description: 'Set sample bank B' },
    { name: 'set_sample_bank_c', contexts: ['pattern'], handler: () => { useUIStore.getState().setStatusMessage('Sample bank C', false, 800); return true; }, description: 'Set sample bank C' },
    { name: 'sample_bank_modifier', contexts: ['pattern'], handler: () => { useUIStore.getState().setStatusMessage('Sample bank modifier', false, 800); return true; }, description: 'Sample bank modifier' },
    { name: 'delete_sample', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Delete sample: use instrument panel', false, 1500);
      return true;
    }, description: 'Delete sample' },
    { name: 'paste_sample', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Paste sample: use instrument panel', false, 1500);
      return true;
    }, description: 'Paste sample' },

    // === POSITION MARKERS (F6-F10 style) ===
    { name: 'set_position_f6', contexts: ['pattern'], handler: savePosition0, description: 'Set position marker F6' },
    { name: 'set_position_f7', contexts: ['pattern'], handler: savePosition1, description: 'Set position marker F7' },
    { name: 'set_position_f8', contexts: ['pattern'], handler: savePosition2, description: 'Set position marker F8' },
    { name: 'set_position_f9', contexts: ['pattern'], handler: savePosition3, description: 'Set position marker F9' },
    { name: 'set_position_f10', contexts: ['pattern'], handler: savePosition4, description: 'Set position marker F10' },
    { name: 'set_position_marker_1', contexts: ['pattern'], handler: savePosition0, description: 'Set position marker 1' },
    { name: 'set_position_marker_2', contexts: ['pattern'], handler: savePosition1, description: 'Set position marker 2' },
    { name: 'set_position_marker_3', contexts: ['pattern'], handler: savePosition2, description: 'Set position marker 3' },
    { name: 'set_position_marker_4', contexts: ['pattern'], handler: savePosition3, description: 'Set position marker 4' },
    { name: 'set_playback_mark', contexts: ['pattern'], handler: savePosition0, description: 'Set playback mark' },
    { name: 'goto_position_f6', contexts: ['pattern'], handler: gotoPosition0, description: 'Go to position F6' },
    { name: 'goto_position_f7', contexts: ['pattern'], handler: gotoPosition1, description: 'Go to position F7' },
    { name: 'goto_position_f8', contexts: ['pattern'], handler: gotoPosition2, description: 'Go to position F8' },
    { name: 'goto_position_f9', contexts: ['pattern'], handler: gotoPosition3, description: 'Go to position F9' },
    { name: 'goto_position_f10', contexts: ['pattern'], handler: gotoPosition4, description: 'Go to position F10' },
    { name: 'jump_to_position_f6', contexts: ['pattern'], handler: gotoPosition0, description: 'Jump to position F6' },
    { name: 'jump_to_position_f7', contexts: ['pattern'], handler: gotoPosition1, description: 'Jump to position F7' },
    { name: 'jump_to_position_f8', contexts: ['pattern'], handler: gotoPosition2, description: 'Jump to position F8' },
    { name: 'jump_to_position_f9', contexts: ['pattern'], handler: gotoPosition3, description: 'Jump to position F9' },
    { name: 'jump_to_position_f10', contexts: ['pattern'], handler: gotoPosition4, description: 'Jump to position F10' },
    { name: 'play_from_marker_1', contexts: ['pattern', 'global'], handler: () => { gotoPosition0(); playFromCursor(); return true; }, description: 'Play from marker 1' },
    { name: 'play_from_marker_2', contexts: ['pattern', 'global'], handler: () => { gotoPosition1(); playFromCursor(); return true; }, description: 'Play from marker 2' },
    { name: 'play_from_marker_3', contexts: ['pattern', 'global'], handler: () => { gotoPosition2(); playFromCursor(); return true; }, description: 'Play from marker 3' },
    { name: 'play_from_marker_4', contexts: ['pattern', 'global'], handler: () => { gotoPosition3(); playFromCursor(); return true; }, description: 'Play from marker 4' },
    { name: 'play_pattern_from_f6', contexts: ['pattern', 'global'], handler: () => { gotoPosition0(); playFromCursor(); return true; }, description: 'Play pattern from F6' },
    { name: 'play_pattern_from_f7', contexts: ['pattern', 'global'], handler: () => { gotoPosition1(); playFromCursor(); return true; }, description: 'Play pattern from F7' },
    { name: 'play_pattern_from_f8', contexts: ['pattern', 'global'], handler: () => { gotoPosition2(); playFromCursor(); return true; }, description: 'Play pattern from F8' },
    { name: 'play_pattern_from_f9', contexts: ['pattern', 'global'], handler: () => { gotoPosition3(); playFromCursor(); return true; }, description: 'Play pattern from F9' },
    { name: 'play_pattern_from_f10', contexts: ['pattern', 'global'], handler: () => { gotoPosition4(); playFromCursor(); return true; }, description: 'Play pattern from F10' },
    { name: 'record_pattern_from_f6', contexts: ['pattern', 'global'], handler: () => { gotoPosition0(); toggleEditMode(); playFromCursor(); return true; }, description: 'Record from F6' },
    { name: 'record_pattern_from_f7', contexts: ['pattern', 'global'], handler: () => { gotoPosition1(); toggleEditMode(); playFromCursor(); return true; }, description: 'Record from F7' },
    { name: 'record_pattern_from_f8', contexts: ['pattern', 'global'], handler: () => { gotoPosition2(); toggleEditMode(); playFromCursor(); return true; }, description: 'Record from F8' },
    { name: 'record_pattern_from_f9', contexts: ['pattern', 'global'], handler: () => { gotoPosition3(); toggleEditMode(); playFromCursor(); return true; }, description: 'Record from F9' },
    { name: 'record_pattern_from_f10', contexts: ['pattern', 'global'], handler: () => { gotoPosition4(); toggleEditMode(); playFromCursor(); return true; }, description: 'Record from F10' },

    // === SEQUENCE/ORDER LIST OPERATIONS ===
    { name: 'switch_to_order_list', contexts: ['global'], handler: showOrderList, description: 'Switch to order list' },
    { name: 'sequence_scroll_up', contexts: ['pattern', 'global'], handler: prevPattern, description: 'Sequence scroll up' },
    { name: 'sequence_scroll_down', contexts: ['pattern', 'global'], handler: nextPattern, description: 'Sequence scroll down' },
    { name: 'sequence_goto_top', contexts: ['pattern', 'global'], handler: () => {
      useTrackerStore.getState().setCurrentPattern(0);
      return true;
    }, description: 'Sequence go to top' },
    { name: 'sequence_goto_end', contexts: ['pattern', 'global'], handler: () => {
      const { patterns, setCurrentPattern } = useTrackerStore.getState();
      setCurrentPattern(patterns.length - 1);
      return true;
    }, description: 'Sequence go to end' },
    { name: 'sequence_increase_block', contexts: ['pattern', 'global'], handler: nextPattern, description: 'Increase sequence block number' },
    { name: 'sequence_decrease_block', contexts: ['pattern', 'global'], handler: prevPattern, description: 'Decrease sequence block number' },
    { name: 'sequence_insert_current', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Insert order: use order list panel', false, 1500);
      return true;
    }, description: 'Insert current pattern in sequence' },
    { name: 'sequence_insert_zero', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Insert order 0: use order list panel', false, 1500);
      return true;
    }, description: 'Insert pattern 0 in sequence' },
    { name: 'sequence_delete_block', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Delete from sequence: use order list panel', false, 1500);
      return true;
    }, description: 'Delete block from sequence' },

    // === VIEW/UI COMMANDS ===
    { name: 'help', contexts: ['global'], handler: showHelp, description: 'Show help' },
    { name: 'show_main_screen', contexts: ['global'], handler: viewGeneral, description: 'Show main screen' },
    { name: 'show_pattern_editor', contexts: ['global'], handler: openPatternEditor, description: 'Show pattern editor' },
    { name: 'show_config', contexts: ['global'], handler: openSettings, description: 'Show configuration' },
    { name: 'show_config_layout', contexts: ['global'], handler: openSettings, description: 'Show layout config' },
    { name: 'show_config_midi', contexts: ['global'], handler: viewMidiMapping, description: 'Show MIDI config' },
    { name: 'show_config_misc', contexts: ['global'], handler: openSettings, description: 'Show misc config' },
    { name: 'show_disk_op', contexts: ['global'], handler: toggleDiskBrowser, description: 'Show disk operations' },
    { name: 'show_instrument_editor_ext', contexts: ['global'], handler: openInstrumentEditor, description: 'Show instrument editor (extended)' },
    { name: 'show_sample_editor_ext', contexts: ['global'], handler: openSampleEditor, description: 'Show sample editor (extended)' },
    { name: 'show_transpose', contexts: ['global'], handler: showTransposePanel, description: 'Show transpose dialog' },
    { name: 'show_trim', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Trim: use cleanup unused', false, 1500);
      return true;
    }, description: 'Show trim dialog' },
    { name: 'show_advanced_edit', contexts: ['global'], handler: showEditPanel, description: 'Show advanced edit' },
    { name: 'show_pattern_properties', contexts: ['global'], handler: patternProperties, description: 'Show pattern properties' },
    { name: 'show_playback_time', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Playback time: shown in transport bar', false, 1500);
      return true;
    }, description: 'Show playback time' },
    { name: 'show_nibbles', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Nibbles: not available', false, 1000);
      return true;
    }, description: 'Show Nibbles game' },
    { name: 'show_undo_history', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Undo history: use Ctrl+Z/Y', false, 1500);
      return true;
    }, description: 'Show undo history' },
    { name: 'close_all_screens', contexts: ['global'], handler: () => {
      escapeCommand();
      return true;
    }, description: 'Close all screens' },
    { name: 'open_effect_visualizer', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Effect visualizer: not available', false, 1000);
      return true;
    }, description: 'Open effect visualizer' },
    { name: 'display_free_memory', contexts: ['global'], handler: () => {
      if (typeof performance !== 'undefined' && (performance as any).memory) {
        const mem = (performance as any).memory;
        const used = Math.round(mem.usedJSHeapSize / 1048576);
        const total = Math.round(mem.jsHeapSizeLimit / 1048576);
        useUIStore.getState().setStatusMessage(`Memory: ${used}MB / ${total}MB`, false, 2000);
      } else {
        useUIStore.getState().setStatusMessage('Memory info not available', false, 1000);
      }
      return true;
    }, description: 'Display free memory' },

    // === LAYOUT PRESETS (1-8) ===
    { name: 'layout_preset_1', contexts: ['global'], handler: loadLayout1, description: 'Layout preset 1' },
    { name: 'layout_preset_2', contexts: ['global'], handler: loadLayout2, description: 'Layout preset 2' },
    { name: 'layout_preset_3', contexts: ['global'], handler: loadLayout3, description: 'Layout preset 3' },
    { name: 'layout_preset_4', contexts: ['global'], handler: loadLayout4, description: 'Layout preset 4' },
    { name: 'layout_preset_5', contexts: ['global'], handler: loadLayout5, description: 'Layout preset 5' },
    { name: 'layout_preset_6', contexts: ['global'], handler: loadLayout6, description: 'Layout preset 6' },
    { name: 'layout_preset_7', contexts: ['global'], handler: loadLayout7, description: 'Layout preset 7' },
    { name: 'layout_preset_8', contexts: ['global'], handler: loadLayout8, description: 'Layout preset 8' },

    // === TOGGLE COMMANDS EXTENDED ===
    { name: 'toggle_auto_advance', contexts: ['global'], handler: () => {
      const { editStep, setEditStep } = useEditorStore.getState();
      if (editStep === 0) { setEditStep(1); useUIStore.getState().setStatusMessage('Auto-advance: ON (step 1)', false, 1000); }
      else { setEditStep(0); useUIStore.getState().setStatusMessage('Auto-advance: OFF (step 0)', false, 1000); }
      return true;
    }, description: 'Toggle auto-advance' },
    { name: 'toggle_auto_space', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Auto-space: use edit step', false, 1000);
      return true;
    }, description: 'Toggle auto-space' },
    { name: 'toggle_centralise_cursor', contexts: ['global'], handler: toggleContinuousScroll, description: 'Toggle centralise cursor' },
    { name: 'toggle_channel_divisions', contexts: ['global'], handler: toggleChannelNames, description: 'Toggle channel divisions' },
    { name: 'toggle_channel_plugin_editor', contexts: ['global'], handler: togglePluginEditor, description: 'Toggle channel plugin editor' },
    { name: 'toggle_clipboard_manager', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Clipboard manager: single buffer', false, 1000);
      return true;
    }, description: 'Toggle clipboard manager' },
    { name: 'toggle_default_volumes', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Default volumes: use instrument editor', false, 1000);
      return true;
    }, description: 'Toggle default volumes' },
    { name: 'toggle_extended_pattern', contexts: ['global'], handler: toggleColumnVisibility, description: 'Toggle extended pattern view' },
    { name: 'toggle_fast_volume', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Fast volume: not applicable', false, 1000);
      return true;
    }, description: 'Toggle fast volume' },
    { name: 'toggle_filter_model', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Filter model: in Settings', false, 1500);
      return true;
    }, description: 'Toggle filter model' },
    { name: 'toggle_key_repeat', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Key repeat: OS setting', false, 1000);
      return true;
    }, description: 'Toggle key repeat' },
    { name: 'toggle_low_pass_filter', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Low-pass filter: in Settings', false, 1500);
      return true;
    }, description: 'Toggle low-pass filter' },
    { name: 'toggle_midi_record', contexts: ['global'], handler: toggleMidiInput, description: 'Toggle MIDI record' },
    { name: 'toggle_multichannel', contexts: ['global'], handler: toggleMultiChannelRecord, description: 'Toggle multi-channel mode' },
    { name: 'toggle_panning_mode', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Panning mode: not applicable', false, 1000);
      return true;
    }, description: 'Toggle panning mode' },
    { name: 'toggle_timing_mode', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Timing mode: BPM/Speed in transport', false, 1000);
      return true;
    }, description: 'Toggle timing mode' },
    { name: 'toggle_vu_meter_mode', contexts: ['global'], handler: toggleTrackScopes, description: 'Toggle VU meter mode' },
    { name: 'highlight_current_line', contexts: ['pattern'], handler: toggleRowHighlight, description: 'Highlight current line' },

    // === VIEW SCHEME ===
    ...Array.from({ length: 7 }, (_, i) => ({
      name: `set_view_scheme_${i}`,
      contexts: ['global'] as CommandContext[],
      handler: () => {
        useUIStore.getState().setStatusMessage(`View scheme ${i}`, false, 800);
        return true;
      },
      description: `Set view scheme ${i}`,
    })),
    ...Array.from({ length: 7 }, (_, i) => ({
      name: `set_all_view_scheme_${i}`,
      contexts: ['global'] as CommandContext[],
      handler: () => {
        useUIStore.getState().setStatusMessage(`All view scheme ${i}`, false, 800);
        return true;
      },
      description: `Set all view scheme ${i}`,
    })),
    { name: 'cycle_track_view', contexts: ['global'], handler: cycleGlobalView, description: 'Cycle track view' },

    // === QUANTIZE ===
    ...Array.from({ length: 9 }, (_, i) => ({
      name: `set_quantize_${i + 1}`,
      contexts: ['pattern'] as CommandContext[],
      handler: () => {
        useEditorStore.getState().setEditStep(i + 1);
        useUIStore.getState().setStatusMessage(`Quantize: ${i + 1}`, false, 800);
        return true;
      },
      description: `Set quantize to ${i + 1}`,
    })),

    // === FILE EXTENDED ===
    { name: 'fast_save_update', contexts: ['global'], handler: quickSave, description: 'Fast save/update' },

    // === FOCUS ===
    { name: 'next_focus', contexts: ['global'], handler: focusNextPanel, description: 'Focus next panel' },
    { name: 'prev_focus', contexts: ['global'], handler: focusPrevPanel, description: 'Focus previous panel' },

    // === PATTERN OPERATIONS ===
    { name: 'insert_pattern', contexts: ['pattern'], handler: createPattern, description: 'Insert new pattern' },
    { name: 'delete_track', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Delete track: use pattern editor', false, 1500);
      return true;
    }, description: 'Delete track' },
    { name: 'insert_track', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Insert track: use pattern editor', false, 1500);
      return true;
    }, description: 'Insert track' },
    { name: 'add_column', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Add column: not applicable', false, 1000);
      return true;
    }, description: 'Add column' },
    { name: 'remove_column', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Remove column: not applicable', false, 1000);
      return true;
    }, description: 'Remove column' },
    { name: 'insert_column_row', contexts: ['pattern'], handler: insertRow, description: 'Insert column row' },
    { name: 'delete_column_and_pull', contexts: ['pattern'], handler: deleteAndPull, description: 'Delete column and pull' },

    // === FT2 MACROS ===
    ...Array.from({ length: 10 }, (_, i) => ({
      name: `macro_${i + 1}`,
      contexts: ['pattern', 'global'] as CommandContext[],
      handler: () => recallEffectMacro(i),
      description: `Execute macro ${i + 1}`,
    })),
    { name: 'save_macro_8', contexts: ['global'], handler: () => storeEffectMacro(7), description: 'Save macro 8' },
    { name: 'save_macro_9', contexts: ['global'], handler: () => storeEffectMacro(8), description: 'Save macro 9' },

    // === OCTAMED SPECIFIC ===
    ...Array.from({ length: 10 }, (_, i) => ({
      name: `pick_note_${i}`,
      contexts: ['pattern'] as CommandContext[],
      handler: () => {
        useUIStore.getState().setStatusMessage(`Pick note ${i}: OctaMED only`, false, 1000);
        return true;
      },
      description: `Pick note ${i} (OctaMED)`,
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      name: `enter_programmed_note_${i}`,
      contexts: ['pattern'] as CommandContext[],
      handler: () => {
        useUIStore.getState().setStatusMessage(`Programmed note ${i}: OctaMED only`, false, 1000);
        return true;
      },
      description: `Enter programmed note ${i} (OctaMED)`,
    })),
    { name: 'create_slide_12', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Create slide 1/2: OctaMED only', false, 1000);
      return true;
    }, description: 'Create slide 1/2 (OctaMED)' },
    { name: 'create_slide_transform', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Create slide transform: OctaMED only', false, 1000);
      return true;
    }, description: 'Create slide transform (OctaMED)' },
    { name: 'create_volume_slide', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Create volume slide: use effect column', false, 1000);
      return true;
    }, description: 'Create volume slide' },
    { name: 'insert_hold_symbol', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Hold symbol: OctaMED only', false, 1000);
      return true;
    }, description: 'Insert hold symbol' },
    { name: 'insert_hold_symbol_a', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Hold symbol: OctaMED only', false, 1000);
      return true;
    }, description: 'Insert hold symbol (alternate)' },
    { name: 'insert_hold_all_tracks', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Hold all tracks: OctaMED only', false, 1000);
      return true;
    }, description: 'Insert hold in all tracks' },

    // === IT-SPECIFIC / COMMAND LINE ===
    { name: 'insert_command_line', contexts: ['pattern'], handler: insertRow, description: 'Insert command line' },
    { name: 'delete_command_line', contexts: ['pattern'], handler: deleteAndPull, description: 'Delete command line' },
    { name: 'insert_param_control', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Param control: use effect column', false, 1000);
      return true;
    }, description: 'Insert parameter control' },
    { name: 'insert_smooth_param_control', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Smooth param control: use effect column', false, 1000);
      return true;
    }, description: 'Insert smooth parameter control' },

    // === MISC STUBS ===
    { name: 'pattern_to_sample', contexts: ['global'], handler: renderToSample, description: 'Render pattern to sample' },
    { name: 'pattern_to_sample_mono', contexts: ['global'], handler: renderToSample, description: 'Render pattern to sample (mono)' },
    { name: 'split_keyboard_dialog', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Split keyboard: coming soon', false, 1000);
      return true;
    }, description: 'Split keyboard dialog' },
    { name: 'volume_amplify', contexts: ['pattern'], handler: amplifySelection, description: 'Volume amplify' },
    { name: 'vary_channel_volume', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Vary channel volume: use humanize', false, 1500);
      return true;
    }, description: 'Vary channel volume' },
    { name: 'vary_current_effect', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Vary effect: use humanize', false, 1500);
      return true;
    }, description: 'Vary current effect' },
    { name: 'vary_panbrello', contexts: ['pattern'], handler: () => {
      useUIStore.getState().setStatusMessage('Panbrello: use effect column', false, 1000);
      return true;
    }, description: 'Vary panbrello' },
    { name: 'undo_revert_pattern', contexts: ['pattern'], handler: undo, description: 'Undo/revert pattern' },
    { name: 'reset_midi_effects', contexts: ['global'], handler: panic, description: 'Reset MIDI effects' },
    { name: 'cycle_midi_trigger', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('MIDI trigger: not applicable', false, 1000);
      return true;
    }, description: 'Cycle MIDI trigger mode' },
    { name: 'cycle_template_mode', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Template mode: not applicable', false, 1000);
      return true;
    }, description: 'Cycle template mode' },
    { name: 'template_mode_off', contexts: ['global'], handler: () => {
      useUIStore.getState().setStatusMessage('Template mode off', false, 800);
      return true;
    }, description: 'Template mode off' },
  ];

  commands.forEach(cmd => globalRegistry.register(cmd));
  registryInitialized = true;
}


/**
 * Determine the current command context based on focused element
 */
function getCurrentContext(): CommandContext {
  const active = document.activeElement;
  
  // Check for dialogs/modals
  if (active?.closest('[role="dialog"]') || active?.closest('.modal')) {
    return 'dialog';
  }
  
  // Check for sample editor (by class or data attribute)
  if (active?.closest('[data-context="sample"]') || active?.closest('.sample-editor')) {
    return 'sample';
  }
  
  // Check for pattern editor
  if (active?.closest('[data-context="pattern"]') || active?.closest('.pattern-editor')) {
    return 'pattern';
  }
  
  // Default to global
  return 'global';
}

interface UseGlobalKeyboardHandlerOptions {
  /** Disable all keyboard handling (e.g., when a modal is open) */
  disabled?: boolean;
}

export function useGlobalKeyboardHandler(options: UseGlobalKeyboardHandlerOptions = {}) {
  const { disabled = false } = options;
  const { activeScheme, platformOverride, customBindingsVersion } = useKeyboardStore();
  const schemeLoaderRef = useRef<SchemeLoader>(new SchemeLoader());
  const schemeLoadedRef = useRef<string | null>(null);
  /** Track held commands by combo → commandName for keyup release */
  const heldCommandsRef = useRef<Map<string, string>>(new Map());

  // Initialize command registry
  useEffect(() => {
    initializeRegistry();
  }, []);

  // Load scheme when it changes (or when custom bindings are updated)
  const customBindingsVersionRef = useRef(customBindingsVersion);
  useEffect(() => {
    if (disabled) return;
    const isCustomUpdate = activeScheme === 'custom' && customBindingsVersion !== customBindingsVersionRef.current;
    customBindingsVersionRef.current = customBindingsVersion;
    if (!isCustomUpdate && schemeLoadedRef.current === activeScheme) return;

    const loadScheme = async () => {
      try {
        if (activeScheme === 'custom') {
          // Load custom bindings from store, or init from fasttracker2 if none exist
          let bindings = useKeyboardStore.getState().customBindings;
          if (!bindings) {
            const tempLoader = new SchemeLoader();
            const ft2 = await tempLoader.loadScheme('fasttracker2');
            bindings = { pc: { ...ft2.platform.pc }, mac: { ...ft2.platform.mac } };
            useKeyboardStore.getState().initCustomFromScheme(bindings, 'fasttracker2');
          }
          schemeLoaderRef.current.loadCustomScheme(bindings);
        } else {
          await schemeLoaderRef.current.loadScheme(activeScheme);
        }
        schemeLoadedRef.current = activeScheme;
        // Update editor behavior profile to match the new scheme
        useEditorStore.getState().setActiveBehavior(
          activeScheme === 'custom' ? useKeyboardStore.getState().baseScheme : activeScheme
        );
        console.log(`[Keyboard] Loaded scheme: ${activeScheme}`);
      } catch (error) {
        console.error(`[Keyboard] Failed to load scheme '${activeScheme}':`, error);
        // Fall back to fasttracker2 if custom scheme fails
        if (activeScheme !== 'fasttracker2') {
          try {
            await schemeLoaderRef.current.loadScheme('fasttracker2');
            schemeLoadedRef.current = 'fasttracker2';
            useEditorStore.getState().setActiveBehavior('fasttracker2');
            console.log('[Keyboard] Fell back to fasttracker2 scheme');
          } catch {
            console.error('[Keyboard] Failed to load fallback scheme');
          }
        }
      }
    };

    loadScheme();
  }, [activeScheme, customBindingsVersion, disabled]);

  // Determine platform
  const getPlatform = useCallback((): PlatformType => {
    if (platformOverride !== 'auto') {
      return platformOverride;
    }
    return KeyboardNormalizer.isMac() ? 'mac' : 'pc';
  }, [platformOverride]);

  // Handle keydown events
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if a Pixi pure-text input is focused (no DOM element to check)
      if ((window as any).__pixiInputFocused) return;

      // Skip if a modal is open - let the modal handle keyboard events
      // Exception: Escape key is allowed through so modals can close
      const modalOpen = useUIStore.getState().modalOpen;
      if (modalOpen && e.key !== 'Escape') {
        return;
      }

      // Skip if focus is inside a text input, contenteditable, or CodeMirror editor.
      // CodeMirror 6 uses a root div (.cm-editor) with tabindex but the contenteditable
      // is on the inner .cm-content child — so isContentEditable alone misses the case
      // where e.target is the root div itself (e.g. after Tab-key focus).
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable ||
        !!target?.closest?.('.cm-editor')
      ) {
        return;
      }

      // In DJ/VJ view: block ALL tracker-specific shortcuts (undo, redo, play song,
      // Right Shift, delete, etc). The DJ/VJ views have their own controls.
      // DJ scratch commands (registered with 'dj' context) are still allowed through
      // because they are dispatched via the registry below, not here.
      const _activeView = useUIStore.getState().activeView;
      const _isDJVJ = _activeView === 'dj' || _activeView === 'vj';

      // Right Shift = play song from start, Right Alt/Option = play pattern from start.
      // Uses the same code path as the toolbar buttons — playSong/playPattern handle
      // both cold start and restart (including WASM engine stop+restart).
      // Skip in DJ/VJ view — these shortcuts would corrupt the active song.
      if (e.code === 'ShiftRight' || e.code === 'AltRight') {
        if (_isDJVJ) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'ShiftRight') playSong(); else playPattern();
        return;
      }

      // Global push-to-talk: hold T (any view except tracker)
      // or hold Space in DJ/VJ views (Space is play_stop_toggle in tracker but
      // irrelevant in DJ/VJ where deck buttons control playback).
      {
        const view = useUIStore.getState().activeView;
        const noMods = !e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey;
        const isPTTKey =
          (e.code === 'Space' && noMods && (view === 'dj' || view === 'vj')) ||
          (e.code === 'KeyT' && noMods && view !== 'tracker');
        if (isPTTKey && !e.repeat) {
          console.log('[GlobalPTT]', e.code, 'keydown in', view, '— activating PTT');
          e.preventDefault();
          e.stopPropagation();
          useVocoderStore.getState().setPTT(true);
          (e as any).__handled = true;
          return;
        }
      }

      // Normalize the event
      const normalized = KeyboardNormalizer.normalize(e);
      const platform = getPlatform();

      // Format to combo string - use Cmd on Mac for lookup
      const combo = KeyComboFormatter.format(normalized, platform === 'mac');

      // Look up command in current scheme
      const commandName = schemeLoaderRef.current.getCommand(combo, platform);

      if (!commandName) {
        // No mapping found - let browser handle it
        return;
      }

      // In DJ/VJ view: block tracker-destructive commands that have no meaning
      // in the DJ view and could corrupt the song (undo/redo) or collide with
      // DJ controls (play_song, delete, etc).
      if (_isDJVJ) {
        const TRACKER_ONLY_COMMANDS = new Set([
          'undo', 'redo', 'undo_revert_pattern',
          'play_song', 'play_song_from_order', 'play_song_alt', 'play_from_start',
          'play_pattern', 'play_from_cursor', 'play_row', 'play_line', 'play_block',
          'play_stop_toggle', 'stop', 'stop_and_reset', 'pause',
          'delete_note', 'delete_and_pull', 'delete_and_pull_up', 'delete_line',
          'insert_row', 'insert_line', 'clear_pattern', 'clear_channel',
          'cut_row', 'cut_note', 'clear_note', 'clear_row', 'delete_row_pull_up',
          'toggle_edit_mode', 'toggle_record', 'recording',
        ]);
        if (TRACKER_ONLY_COMMANDS.has(commandName)) {
          return;
        }
      }

      // Get current context
      const context = getCurrentContext();

      // Execute command
      const handled = globalRegistry.execute(commandName, context);

      if (handled) {
        // Track held commands that need keyup release
        if (globalRegistry.hasReleaseHandler(commandName)) {
          heldCommandsRef.current.set(combo, commandName);
        }
        // Command was executed - prevent default browser behavior
        e.preventDefault();
        e.stopPropagation();
        // Mark event as handled so React-level handlers (useTrackerInput,
        // useNavigationInput) don't double-execute the same action.
        // stopPropagation doesn't help because both are capture-phase on window.
        (e as any).__handled = true;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });

    // Handle keyup for hold-to-release commands (fader cut, crab, transformer, flare)
    const handleKeyUp = (e: KeyboardEvent) => {
      if ((window as any).__pixiInputFocused) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Release PTT when the PTT key is released
      if ((e.code === 'KeyT' || e.code === 'Space') && useVocoderStore.getState().pttActive) {
        e.preventDefault();
        useVocoderStore.getState().setPTT(false);
        return;
      }

      const normalized = KeyboardNormalizer.normalize(e);
      const platform = getPlatform();
      const combo = KeyComboFormatter.format(normalized, platform === 'mac');

      // Check if this combo has a held command
      const commandName = heldCommandsRef.current.get(combo);
      if (commandName) {
        const context = getCurrentContext();
        globalRegistry.release(commandName, context);
        heldCommandsRef.current.delete(combo);
        e.preventDefault();
      }
    };

    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      // Release any held commands on cleanup
      for (const [, cmdName] of heldCommandsRef.current) {
        globalRegistry.release(cmdName, 'global');
      }
      heldCommandsRef.current.clear();
    };
  }, [disabled, getPlatform]);
}
