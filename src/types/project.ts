import { APP_VERSION } from '@constants/version';

/**
 * Project Types - Project Metadata & UI State
 */

export interface ProjectMetadata {
  id: string;
  name: string;
  author: string;
  description: string;
  createdAt: string;
  modifiedAt: string;
  version: string;
}

export interface ProjectState {
  metadata: ProjectMetadata;
  isDirty: boolean; // Unsaved changes
  lastSavedAt: string | null;
}

export const DEFAULT_PROJECT_METADATA: ProjectMetadata = {
  id: '',
  name: 'Untitled',
  author: 'Unknown',
  description: '',
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  version: APP_VERSION,
};

export type ThemeType = 'ft2-blue' | 'dark' | 'custom';

export type PanelType =
  | 'tracker'
  | 'instrument-editor'
  | 'automation'
  | 'oscilloscope'
  | 'pattern-list'
  | 'sequence'
  | 'help';

export interface UIState {
  theme: ThemeType;
  visiblePanels: PanelType[];
  trackerZoom: number; // 80-200%
  activePanel: PanelType;
  modalOpen: string | null;
  sidebarCollapsed: boolean;
}

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  description: string;
  action: string;
}

export const FT2_KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { key: 'Space', description: 'Play/Stop', action: 'playback.toggle' },
  { key: 'ArrowUp', description: 'Move cursor up', action: 'cursor.up' },
  { key: 'ArrowDown', description: 'Move cursor down', action: 'cursor.down' },
  { key: 'ArrowLeft', description: 'Move cursor left', action: 'cursor.left' },
  { key: 'ArrowRight', description: 'Move cursor right', action: 'cursor.right' },
  { key: 'Tab', description: 'Next channel', action: 'cursor.nextChannel' },
  { key: 'Tab', shift: true, description: 'Previous channel', action: 'cursor.prevChannel' },
  { key: 'Home', description: 'Jump to row 0', action: 'cursor.home' },
  { key: 'End', description: 'Jump to last row', action: 'cursor.end' },
  { key: 'PageUp', description: 'Jump up 16 rows', action: 'cursor.pageUp' },
  { key: 'PageDown', description: 'Jump down 16 rows', action: 'cursor.pageDown' },
  { key: 'Delete', description: 'Clear cell', action: 'cell.clear' },
  { key: 'Backspace', description: 'Clear and move up', action: 'cell.clearMoveUp' },
  { key: 'CapsLock', description: 'Toggle record mode', action: 'mode.toggleRecord' },
  { key: 'b', alt: true, description: 'Mark block start', action: 'block.markStart' },
  { key: 'e', alt: true, description: 'Mark block end', action: 'block.markEnd' },
  { key: 'c', alt: true, description: 'Copy block', action: 'block.copy' },
  { key: 'p', alt: true, description: 'Paste block', action: 'block.paste' },
  { key: 'x', alt: true, description: 'Cut block', action: 'block.cut' },
  { key: 'z', ctrl: true, description: 'Undo', action: 'history.undo' },
  { key: 'y', ctrl: true, description: 'Redo', action: 'history.redo' },
  { key: 's', ctrl: true, description: 'Save project', action: 'project.save' },
  { key: 'o', ctrl: true, description: 'Open project', action: 'project.open' },
  { key: 'F1', description: 'Show help', action: 'ui.showHelp' },
];