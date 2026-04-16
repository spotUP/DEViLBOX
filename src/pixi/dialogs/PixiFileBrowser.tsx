/**
 * PixiFileBrowser — GL-native version of the DOM FileBrowser dialog.
 *
 * GL port of src/components/dialogs/FileBrowser.tsx.
 * Uses useFileNavigation hook for all file I/O, directory nav, and cloud operations.
 * Renders file list via PixiList with virtual scrolling.
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import type { FederatedWheelEvent, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { useModalClose } from '@hooks/useDialogKeyboard';
import { Div, Txt, GlModal } from '../layout';
import { PIXI_FONTS } from '../fonts';
import { PixiButton } from '../components/PixiButton';
import { PixiIcon } from '../components/PixiIcon';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { useFileNavigation, isTrackerModule, type FileSource, type FileItem, getLastFileSource, setLastFileSource } from '@/components/dialogs/useFileNavigation';
import { hasElectronFS } from '@utils/electron';
import { PixiOnlinePanel } from './PixiRemoteBrowserPanels';
import { tintBg } from '../colors';

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
  onLoadTrackerModule?: (buffer: ArrayBuffer, filename: string, companionFiles?: Map<string, ArrayBuffer>) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FILE_ROW_H = 36;

/** Returns the FontAudio icon name for a file entry */
function fileIconName(name: string, isDir: boolean): string {
  if (isDir) return 'open';
  if (isTrackerModule(name)) return 'diskio';
  return 'preset-a';
}

/** Returns icon tint color based on file type */
function fileIconColor(name: string, isDir: boolean, theme: ReturnType<typeof usePixiTheme>): number {
  if (isDir) return theme.accent.color;           // blue for folders
  if (isTrackerModule(name)) return theme.success.color; // green for tracker modules
  return theme.textMuted.color;                    // gray for other files
}

function formatSize(size?: number): string {
  if (size == null) return '';
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

interface DisplayRow { id: string; file: FileItem | null; isBack: boolean; }

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
      ? async (buf: ArrayBuffer, fn: string, companions?: Map<string, ArrayBuffer>) => { onLoadTrackerModule(buf, fn, companions); }
      : undefined,
    onClose,
    mode,
    suggestedFilename: 'untitled.dbx',
  });

  // Build display list — prepend "..(back)" row when in subdir
  const displayRows: DisplayRow[] = useMemo(() => {
    const rows: DisplayRow[] = [];

    if (nav.currentPath !== '' && fileSource === 'demo') {
      rows.push({ id: '__back__', file: null, isBack: true });
    }

    for (const f of nav.files) {
      rows.push({ id: f.id, file: f, isBack: false });
    }

    return rows;
  }, [nav.files, nav.currentPath, fileSource]);

  // Virtual scroll state
  const [scrollY, setScrollY] = useState(0);
  const lastClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  // Handle item click (select + double-click detection)
  const handleItemClick = useCallback((row: DisplayRow) => {
    const now = Date.now();
    const id = row.id;

    if (lastClickRef.current.id === id && now - lastClickRef.current.time < 300) {
      // Double-click
      lastClickRef.current = { id: '', time: 0 };

      if (row.isBack) {
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

      const file = row.file;
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
    } else {
      // Single click — select file or open directory
      lastClickRef.current = { id, time: now };

      if (row.isBack) {
        // Navigate up on single click (matches DOM)
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

      const file = row.file;
      if (!file) return;

      if (file.isDirectory) {
        // Open directory on single click (matches DOM)
        if (hasElectronFS()) {
          nav.setCurrentPath(file.path);
          nav.setElectronDirectory(file.path);
        } else {
          nav.setCurrentPath(file.path);
        }
        nav.setSelectedFile(null);
      } else {
        nav.setSelectedFile(file);
      }
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
  const isModlandOrHvsc = fileSource === 'online';

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
          icon="open"
          active={fileSource === 'demo'}
          onSelect={() => handleSourceChange('demo')}
        />
        {nav.user && nav.isServerAvailable && (
          <SourceTab
            label="My Files"
            icon="cloud"
            active={fileSource === 'cloud'}
            onSelect={() => handleSourceChange('cloud')}
          />
        )}
        {mode === 'load' && onLoadTrackerModule && (
          <SourceTab
            label="Online"
            icon="globe"
            active={fileSource === 'online'}
            onSelect={() => handleSourceChange('online')}
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
            gap: 6,
          }}
        >
          <PixiIcon name="open" size={12} color={theme.textMuted.color} layout={{}} />
          <Txt className="text-xs font-mono text-text-muted">{nav.currentPath}</Txt>
        </Div>
      )}

      {/* Content area */}
      {fileSource === 'online' && onLoadTrackerModule ? (
        <PixiOnlinePanel
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
                backgroundColor: tintBg(theme.error.color),
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
            <FileList
              rows={displayRows}
              width={listW}
              height={listH}
              selectedId={nav.selectedFile?.id ?? null}
              fileSource={fileSource}
              onItemClick={handleItemClick}
              onDelete={fileSource === 'cloud' ? nav.handleDelete : undefined}
              scrollY={scrollY}
              onScrollY={setScrollY}
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
  icon?: string;
  active: boolean;
  onSelect: () => void;
}

const SourceTab: React.FC<SourceTabProps> = ({ label, icon, active, onSelect }) => {
  const theme = usePixiTheme();
  const tint = active ? theme.accent.color : theme.textMuted.color;

  return (
    <Div
      eventMode="static"
      cursor="pointer"
      onPointerUp={onSelect}
      layout={{
        height: TABS_H,
        paddingLeft: 16,
        paddingRight: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        borderBottomWidth: active ? 2 : 0,
        borderColor: theme.accent.color,
      }}
    >
      {icon && <PixiIcon name={icon} size={12} color={tint} layout={{}} />}
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 13, fill: 0xffffff }}
        tint={tint}
        layout={{}}
      />
    </Div>
  );
};

// ---------------------------------------------------------------------------
// FileList — custom file list with icons, virtual scrolling, left-aligned rows
// ---------------------------------------------------------------------------

interface FileListProps {
  rows: DisplayRow[];
  width: number;
  height: number;
  selectedId: string | null;
  fileSource: FileSource;
  onItemClick: (row: DisplayRow) => void;
  onDelete?: (file: FileItem) => void;
  scrollY: number;
  onScrollY: (y: number) => void;
}

const FileList: React.FC<FileListProps> = ({
  rows,
  width,
  height,
  selectedId,
  fileSource,
  onItemClick,
  onDelete,
  scrollY,
  onScrollY,
}) => {
  const theme = usePixiTheme();

  const totalHeight = rows.length * FILE_ROW_H;
  const maxScroll = Math.max(0, totalHeight - height);
  const buffer = 3;

  const startIdx = Math.max(0, Math.floor(scrollY / FILE_ROW_H) - buffer);
  const endIdx = Math.min(rows.length, Math.ceil((scrollY + height) / FILE_ROW_H) + buffer);
  const visibleRows = useMemo(
    () => rows.slice(startIdx, endIdx),
    [rows, startIdx, endIdx],
  );

  const handleWheel = useCallback((e: FederatedWheelEvent) => {
    e.stopPropagation();
    onScrollY(Math.max(0, Math.min(maxScroll, scrollY + e.deltaY)));
  }, [maxScroll, scrollY, onScrollY]);

  // Scrollbar geometry
  const trackHeight = height - 4;
  const thumbHeight = maxScroll > 0 ? Math.max(20, (height / totalHeight) * trackHeight) : 0;
  const thumbY = maxScroll > 0 ? 2 + (scrollY / maxScroll) * (trackHeight - thumbHeight) : 2;

  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef(0);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!isDraggingRef.current || maxScroll <= 0) return;
    const newThumbY = e.globalY - dragOffsetRef.current;
    const ratio = Math.max(0, Math.min(1, (newThumbY - 2) / (trackHeight - thumbHeight)));
    onScrollY(ratio * maxScroll);
  }, [maxScroll, trackHeight, thumbHeight, onScrollY]);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleScrollbarDown = useCallback((e: FederatedPointerEvent) => {
    if (maxScroll <= 0) return;
    e.stopPropagation();
    isDraggingRef.current = true;
    dragOffsetRef.current = e.globalY - thumbY;
  }, [maxScroll, thumbY]);

  return (
    <pixiContainer
      eventMode="static"
      onWheel={handleWheel}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerUpOutside={handlePointerUp}
      layout={{ width, height, overflow: 'hidden', backgroundColor: theme.bg.color }}
    >
      {visibleRows.map((row, i) => {
        const actualIdx = startIdx + i;
        const y = actualIdx * FILE_ROW_H - scrollY;
        const isSelected = row.id === selectedId;
        const isEven = actualIdx % 2 === 0;
        const file = row.file;

        const iconName = row.isBack ? 'open' : file ? fileIconName(file.name, file.isDirectory) : 'open';
        const iconColor = row.isBack ? theme.accent.color : file ? fileIconColor(file.name, file.isDirectory, theme) : theme.accent.color;
        const label = row.isBack ? '.. (back)' : file?.name ?? '';
        const sublabel = row.isBack ? '' : file ? (file.isDirectory ? 'DIR' : formatSize(file.size)) : '';

        return (
          <pixiContainer
            key={row.id}
            eventMode="static"
            cursor="pointer"
            onPointerUp={() => onItemClick(row)}
            layout={{
              position: 'absolute',
              left: 0,
              top: y,
              width: width - 10,
              height: FILE_ROW_H,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 12,
              paddingRight: 8,
              gap: 8,
            }}
          >
            {/* Row background — eventMode none so clicks pass to container */}
            <pixiGraphics
              eventMode="none"
              draw={(g) => {
                g.clear();
                g.rect(0, 0, width - 10, FILE_ROW_H);
                if (isSelected) {
                  g.fill({ color: theme.accent.color, alpha: 0.15 });
                } else {
                  g.fill({ color: theme.bg.color, alpha: isEven ? 1 : 0.85 });
                }
              }}
              layout={{ position: 'absolute', width: width - 10, height: FILE_ROW_H }}
            />

            {/* File type icon */}
            <PixiIcon
              name={iconName}
              size={14}
              color={iconColor}
              layout={{ flexShrink: 0, width: 18 }}
            />

            {/* Filename + sublabel column */}
            <Div eventMode="none" layout={{ flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 1 }}>
              <pixiBitmapText
                eventMode="none"
                text={label}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
                tint={isSelected ? theme.accent.color : theme.text.color}
                layout={{}}
              />
              {sublabel !== '' && (
                <pixiBitmapText
                  eventMode="none"
                  text={sublabel}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
                  tint={theme.textMuted.color}
                  layout={{}}
                />
              )}
            </Div>

            {/* Delete button for cloud files */}
            {fileSource === 'cloud' && file && !file.isDirectory && onDelete && (
              <Div
                eventMode="static"
                cursor="pointer"
                onPointerUp={(e: FederatedPointerEvent) => {
                  e.stopPropagation();
                  onDelete(file);
                }}
                layout={{ flexShrink: 0, padding: 4 }}
              >
                <PixiIcon name="close" size={10} color={theme.textMuted.color} layout={{}} />
              </Div>
            )}
          </pixiContainer>
        );
      })}

      {/* Scrollbar */}
      {maxScroll > 0 && (
        <pixiContainer layout={{ position: 'absolute', left: width - 8, top: 0, width: 6, height }}>
          <pixiGraphics
            draw={(g) => {
              g.clear();
              g.roundRect(0, 2, 6, trackHeight, 3);
              g.fill({ color: theme.bgActive.color, alpha: 0.3 });
            }}
            layout={{ position: 'absolute', width: 6, height }}
          />
          <pixiGraphics
            draw={(g) => {
              g.clear();
              g.roundRect(0, 0, 6, thumbHeight, 3);
              g.fill({ color: theme.textMuted.color, alpha: 0.4 });
            }}
            eventMode="static"
            cursor="pointer"
            onPointerDown={handleScrollbarDown}
            layout={{ position: 'absolute', top: thumbY, width: 6, height: thumbHeight }}
          />
        </pixiContainer>
      )}
    </pixiContainer>
  );
};

export default PixiFileBrowser;
