/**
 * PixiFileBrowser — GL-native version of the DOM FileBrowser dialog.
 *
 * GL port of src/components/dialogs/FileBrowser.tsx.
 * Uses useFileNavigation hook for all file I/O, directory nav, and cloud operations.
 * Renders file list via PixiList with virtual scrolling.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { usePixiTheme } from '../theme';
import { useModalClose } from '@hooks/useDialogKeyboard';
import { Div, Txt, GlModal } from '../layout';
import { PIXI_FONTS } from '../fonts';
import { PixiButton } from '../components/PixiButton';
import { PixiList } from '../components/PixiList';
import { PixiIcon } from '../components/PixiIcon';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { useFileNavigation, isTrackerModule, type FileSource, getLastFileSource, setLastFileSource } from '@/components/dialogs/useFileNavigation';
import { hasElectronFS } from '@utils/electron';
import { PixiModlandPanel, PixiHVSCPanel } from './PixiRemoteBrowserPanels';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const MODAL_W = 780;
const MODAL_H = 560;
const HEADER_H = 44;
const TABS_H = 36;
const BREADCRUMB_H = 32;
const FOOTER_H = 48;
const LIST_PAD = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PixiFileBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'load' | 'save';
  onLoad?: (data: any, filename: string) => void;
  onLoadTrackerModule?: (buffer: ArrayBuffer, filename: string) => void;
}

// Adapt PixiList item interface locally
interface ListItem {
  id: string;
  label: string;
  sublabel?: string;
  dotColor?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOT_FOLDER = 0x4a9eff;  // blue
const DOT_TRACKER = 0x22c55e; // green
const DOT_JSON = 0xeab308;    // yellow
const DOT_FILE = 0x888888;    // gray

function fileIcon(name: string, isDir: boolean): number | undefined {
  if (isDir) return DOT_FOLDER;
  if (isTrackerModule(name)) return DOT_TRACKER;
  if (name.endsWith('.json') || name.endsWith('.dbx') || name.endsWith('.dbox')) return DOT_JSON;
  return DOT_FILE;
}

function formatSize(size?: number): string {
  if (size == null) return '';
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PixiFileBrowser: React.FC<PixiFileBrowserProps> = ({
  isOpen,
  onClose,
  mode,
  onLoad,
  onLoadTrackerModule,
}) => {
  const theme = usePixiTheme();
  const [fileSource, _setFileSource] = useState<FileSource>(getLastFileSource);
  const setFileSource = (s: FileSource) => { setLastFileSource(s); _setFileSource(s); };

  useModalClose({ isOpen, onClose });

  const nav = useFileNavigation({
    isOpen,
    fileSource,
    onLoad: onLoad ?? (() => {}),
    onLoadTrackerModule: onLoadTrackerModule
      ? async (buf: ArrayBuffer, fn: string) => { onLoadTrackerModule(buf, fn); }
      : undefined,
    onClose,
    mode,
    suggestedFilename: 'untitled.dbx',
  });

  // Build list items from nav.files — prepend "..(back)" row when in subdir
  const listItems: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];

    if (nav.currentPath !== '' && fileSource === 'demo') {
      items.push({ id: '__back__', label: '.. (back)', dotColor: DOT_FOLDER });
    }

    for (const f of nav.files) {
      items.push({
        id: f.id,
        label: f.name,
        sublabel: f.isDirectory ? 'DIR' : formatSize(f.size),
        dotColor: fileIcon(f.name, f.isDirectory),
      });
    }

    return items;
  }, [nav.files, nav.currentPath, fileSource]);

  // Handle item selection
  const handleSelect = useCallback((id: string) => {
    if (id === '__back__') return; // select only — double-click navigates
    const file = nav.files.find(f => f.id === id);
    if (file && !file.isDirectory) {
      nav.setSelectedFile(file);
    } else if (file?.isDirectory) {
      nav.setSelectedFile(null);
    }
  }, [nav]);

  // Handle double-click — navigate into directory or load file
  const handleDoubleClick = useCallback((id: string) => {
    if (id === '__back__') {
      // Navigate up
      if (hasElectronFS() && nav.currentPath) {
        const parent = nav.currentPath.split('/').slice(0, -1).join('/') || '/';
        nav.setCurrentPath(parent);
        nav.setElectronDirectory(parent);
      } else if (nav.currentPath) {
        const parent = nav.currentPath.split('/').slice(0, -1).join('/') || '';
        nav.setCurrentPath(parent);
      }
      nav.setSelectedFile(null);
      return;
    }

    const file = nav.files.find(f => f.id === id);
    if (!file) return;

    if (file.isDirectory) {
      if (hasElectronFS()) {
        nav.setCurrentPath(file.path);
        nav.setElectronDirectory(file.path);
      } else {
        nav.setCurrentPath(file.path);
      }
      nav.setSelectedFile(null);
    } else {
      nav.setSelectedFile(file);
      if (mode === 'load') nav.handleLoad();
    }
  }, [nav, mode]);

  // Tab switch
  const handleSourceChange = useCallback((source: FileSource) => {
    setFileSource(source);
    nav.setSelectedFile(null);
    if (source === 'cloud') nav.setCurrentPath('');
  }, [nav]);

  if (!isOpen) return null;

  const showBreadcrumb = nav.currentPath && fileSource === 'demo';
  const listH = MODAL_H - HEADER_H - TABS_H - FOOTER_H - (showBreadcrumb ? BREADCRUMB_H : 0) - LIST_PAD * 2;
  const listW = MODAL_W - LIST_PAD * 2;

  const isLoadDisabled = mode === 'load' && (!nav.selectedFile || nav.selectedFile.isDirectory);
  const isModlandOrHvsc = fileSource === 'modland' || fileSource === 'hvsc';

  return (
    <GlModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      {/* Header */}
      <Div
        className="flex-row items-center justify-between px-4"
        layout={{
          width: MODAL_W,
          height: HEADER_H,
          backgroundColor: theme.bgSecondary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <Txt className="text-lg font-bold text-text-primary">
          {mode === 'load' ? 'Load Module' : 'Save Module'}
        </Txt>
        <Div eventMode="static" cursor="pointer" onPointerUp={onClose} layout={{ padding: 4 }}>
          <PixiIcon name="close" size={14} color={theme.textMuted.color} layout={{}} />
        </Div>
      </Div>

      {/* Source tabs */}
      <Div
        className="flex-row items-center"
        layout={{
          width: MODAL_W,
          height: TABS_H,
          backgroundColor: theme.bgTertiary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
          gap: 0,
          paddingLeft: 0,
        }}
      >
        <SourceTab
          label="Demo Files"
          active={fileSource === 'demo'}
          onSelect={() => handleSourceChange('demo')}
        />
        {nav.user && nav.isServerAvailable && (
          <SourceTab
            label="My Files"
            active={fileSource === 'cloud'}
            onSelect={() => handleSourceChange('cloud')}
          />
        )}
        {mode === 'load' && onLoadTrackerModule && (
          <SourceTab
            label="Modland"
            active={fileSource === 'modland'}
            onSelect={() => handleSourceChange('modland')}
          />
        )}
        {mode === 'load' && onLoadTrackerModule && (
          <SourceTab
            label="HVSC"
            active={fileSource === 'hvsc'}
            onSelect={() => handleSourceChange('hvsc')}
          />
        )}

        {/* Spacer */}
        <Div layout={{ flex: 1 }} />

        {/* Browse files button */}
        {mode === 'load' && (
          <PixiButton
            label="Browse..."
            variant="ghost"
            size="sm"
            onClick={nav.handleBrowseFiles}
            layout={{ marginRight: 16 }}
          />
        )}
      </Div>

      {/* Breadcrumb */}
      {showBreadcrumb && (
        <Div
          className="flex-row items-center px-4"
          layout={{
            width: MODAL_W,
            height: BREADCRUMB_H,
            backgroundColor: theme.bgTertiary.color,
            borderBottomWidth: 1,
            borderColor: theme.border.color,
          }}
        >
          <Txt className="text-xs font-mono text-text-muted">{nav.currentPath}</Txt>
        </Div>
      )}

      {/* Content area */}
      {fileSource === 'modland' && onLoadTrackerModule ? (
        <PixiModlandPanel
          isOpen={isOpen}
          width={MODAL_W}
          height={MODAL_H - HEADER_H - TABS_H - FOOTER_H}
          onLoadTrackerModule={async (buf, fn) => { onLoadTrackerModule(buf, fn); }}
          onClose={onClose}
        />
      ) : fileSource === 'hvsc' && onLoadTrackerModule ? (
        <PixiHVSCPanel
          isOpen={isOpen}
          width={MODAL_W}
          height={MODAL_H - HEADER_H - TABS_H - FOOTER_H}
          onLoadTrackerModule={async (buf, fn) => { onLoadTrackerModule(buf, fn); }}
          onClose={onClose}
        />
      ) : (
        <Div layout={{ flex: 1, padding: LIST_PAD, minHeight: 0 }}>
          {nav.error && (
            <Div
              layout={{
                width: listW,
                padding: 8,
                marginBottom: 8,
                backgroundColor: 0x2a0808,
                borderWidth: 1,
                borderColor: theme.error.color,
                borderRadius: 4,
              }}
            >
              <Txt className="text-xs text-accent-error">{nav.error}</Txt>
            </Div>
          )}

          {nav.isLoading ? (
            <Div className="flex-1 items-center justify-center">
              <Txt className="text-sm text-text-muted">Loading...</Txt>
            </Div>
          ) : nav.files.length === 0 ? (
            <Div className="flex-1 items-center justify-center">
              <Txt className="text-sm text-text-muted">No files found</Txt>
            </Div>
          ) : (
            <PixiList
              items={listItems}
              width={listW}
              height={listH}
              itemHeight={30}
              selectedId={nav.selectedFile?.id ?? null}
              onSelect={handleSelect}
              onDoubleClick={handleDoubleClick}
            />
          )}
        </Div>
      )}

      {/* Footer */}
      <Div
        className="flex-row items-center px-4"
        layout={{
          width: MODAL_W,
          height: FOOTER_H,
          backgroundColor: theme.bgTertiary.color,
          borderTopWidth: 1,
          borderColor: theme.border.color,
          gap: 16,
        }}
      >
        {mode === 'save' && !isModlandOrHvsc && (
          <PixiPureTextInput
            value={nav.saveFilename}
            onChange={nav.setSaveFilename}
            onSubmit={() => nav.handleSave()}
            placeholder="Filename"
            width={300}
            height={28}
            fontSize={12}
          />
        )}

        {/* Spacer */}
        <Div layout={{ flex: 1 }} />

        <PixiButton
          label={isModlandOrHvsc ? 'Close' : 'Cancel'}
          variant="ghost"
          size="sm"
          onClick={onClose}
        />

        {!isModlandOrHvsc && (
          <PixiButton
            label={mode === 'load' ? 'Load' : 'Save'}
            variant="primary"
            size="sm"
            disabled={mode === 'load' ? isLoadDisabled : false}
            onClick={mode === 'load' ? nav.handleLoad : nav.handleSave}
          />
        )}
      </Div>
    </GlModal>
  );
};

// ---------------------------------------------------------------------------
// SourceTab — individual tab button in the source bar
// ---------------------------------------------------------------------------

interface SourceTabProps {
  label: string;
  active: boolean;
  onSelect: () => void;
}

const SourceTab: React.FC<SourceTabProps> = ({ label, active, onSelect }) => {
  const theme = usePixiTheme();

  return (
    <Div
      eventMode="static"
      cursor="pointer"
      onPointerUp={onSelect}
      layout={{
        height: TABS_H,
        paddingLeft: 16,
        paddingRight: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderBottomWidth: active ? 2 : 0,
        borderColor: theme.accent.color,
      }}
    >
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 16, fill: 0xffffff }}
        tint={active ? theme.accent.color : theme.textMuted.color}
        layout={{}}
      />
    </Div>
  );
};

export default PixiFileBrowser;
