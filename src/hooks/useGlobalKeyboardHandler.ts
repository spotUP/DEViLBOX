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
import { SchemeLoader } from '@engine/keyboard/SchemeLoader';
import { CommandRegistry } from '@engine/keyboard/CommandRegistry';
import { KeyboardNormalizer } from '@engine/keyboard/KeyboardNormalizer';
import { KeyComboFormatter } from '@engine/keyboard/KeyComboFormatter';
import type { PlatformType, CommandContext, Command } from '@engine/keyboard/types';

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
  setOctave0, setOctave1, setOctave2, setOctave3, setOctave4, setOctave5, setOctave6, setOctave7,
  setStep0, setStep1, setStep2, setStep3, setStep4, setStep5, setStep6, setStep7, setStep8, setStep9
} from '@engine/keyboard/commands/edit';
import { nextPattern, prevPattern } from '@engine/keyboard/commands/pattern';
import {
  muteChannel, soloChannel, unmuteAll,
  setTrack1, setTrack2, setTrack3, setTrack4, setTrack5, setTrack6, setTrack7, setTrack8
} from '@engine/keyboard/commands/channel';
import {
  copySelection, cutSelection, pasteSelection, selectAll, selectChannel, selectColumn,
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
  joinBlocks, setPatternLength, setBpm, setSpeed, setTempo, appendBlock, insertBlock,
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
  quickSave, revertToSaved, toggleCompactMode, resetView, increasePatternSize, decreasePatternSize,
  toggleHexMode, toggleRowHighlight, toggleChannelNames, zoomIn, zoomOut, resetZoom, fitToWindow,
  clonePattern as clonePatternCmd, createPattern, deletePattern, importMidi, exportMidi, importSample, exportSample,
  patternProperties, songProperties, cleanupUnused, toggleRecording, previewInstrument, previewSample, stopPreview,
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
import { useUIStore } from '@stores/useUIStore';
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
  const { cursor, setCell } = useTrackerStore.getState();
  setCell(cursor.channelIndex, cursor.rowIndex, { volume });
  return true;
}

function adjustVolumeInCell(delta: number): () => boolean {
  return () => {
    const { cursor, patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
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
    { name: 'toggle_compact_mode', contexts: ['global'], handler: toggleCompactMode, description: 'Toggle compact mode' },
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
      const { cursor, patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];
      for (let r = cursor.rowIndex; r < pattern.length; r++) {
        setCell(cursor.channelIndex, r, { note: 97, instrument: 0 });
      }
      useUIStore.getState().setStatusMessage('Killed to end', false, 800);
      return true;
    }, description: 'Kill notes to end of pattern' },
    { name: 'kill_to_start', contexts: ['pattern'], handler: () => {
      const { cursor, setCell } = useTrackerStore.getState();
      for (let r = 0; r <= cursor.rowIndex; r++) {
        setCell(cursor.channelIndex, r, { note: 97, instrument: 0 });
      }
      useUIStore.getState().setStatusMessage('Killed to start', false, 800);
      return true;
    }, description: 'Kill notes to start of pattern' },

    // === MULTI-CHANNEL MODE ===
    { name: 'toggle_multichannel_mode', contexts: ['global'], handler: () => {
      const { multiChannelRecord, toggleMultiChannelRecord } = useTrackerStore.getState();
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
  const { activeScheme, platformOverride } = useKeyboardStore();
  const schemeLoaderRef = useRef<SchemeLoader>(new SchemeLoader());
  const schemeLoadedRef = useRef<string | null>(null);
  /** Track held commands by combo → commandName for keyup release */
  const heldCommandsRef = useRef<Map<string, string>>(new Map());

  // Initialize command registry
  useEffect(() => {
    initializeRegistry();
  }, []);

  // Load scheme when it changes
  useEffect(() => {
    if (disabled) return;
    if (schemeLoadedRef.current === activeScheme) return;

    const loadScheme = async () => {
      try {
        await schemeLoaderRef.current.loadScheme(activeScheme);
        schemeLoadedRef.current = activeScheme;
        console.log(`[Keyboard] Loaded scheme: ${activeScheme}`);
      } catch (error) {
        console.error(`[Keyboard] Failed to load scheme '${activeScheme}':`, error);
        // Fall back to fasttracker2 if custom scheme fails
        if (activeScheme !== 'fasttracker2') {
          try {
            await schemeLoaderRef.current.loadScheme('fasttracker2');
            schemeLoadedRef.current = 'fasttracker2';
            console.log('[Keyboard] Fell back to fasttracker2 scheme');
          } catch {
            console.error('[Keyboard] Failed to load fallback scheme');
          }
        }
      }
    };

    loadScheme();
  }, [activeScheme, disabled]);

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
      // Skip if typing in input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
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
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });

    // Handle keyup for hold-to-release commands (fader cut, crab, transformer, flare)
    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
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
