/**
 * PixiArrangementContextMenu — GL-native right-click context menu for arrangement clips.
 * Self-managed: reads position/clipId from useArrangementStore.clipContextMenu.
 * When clipContextMenu is null, renders nothing.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { useApplication } from '@pixi/react';
import { PixiLabel } from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme, cssColorToPixi } from '../theme';
import { useArrangementStore } from '@stores/useArrangementStore';
import { useTrackerStore } from '@stores';
import { usePianoRollStore } from '@/stores/usePianoRollStore';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';

const CLIP_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#ec4899', '#f43f5e', '#78716c', '#ffffff',
];

const MENU_W = 200;
const ROW_H = 24;
const SEP_H = 9;
const SWATCH_SIZE = 22;
const SWATCH_GAP = 4;
const SWATCH_COLS = 4;

export const PixiArrangementContextMenu: React.FC = () => {
  const menu = useArrangementStore(s => s.clipContextMenu);
  const setMenu = useArrangementStore(s => s.setClipContextMenu);
  const theme = usePixiTheme();
  const { app } = useApplication();

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showClipLengthInput, setShowClipLengthInput] = useState(false);
  const [clipLengthValue, setClipLengthValue] = useState('');
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  // Reset sub-panels when menu reopens
  useEffect(() => {
    if (!menu) return;
    setShowColorPicker(false);
    setShowClipLengthInput(false);
    setClipLengthValue('');
    setHoveredItem(null);
  }, [menu]);

  // Escape key handler
  useEffect(() => {
    if (!menu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [menu, setMenu]);

  const close = useCallback(() => setMenu(null), [setMenu]);

  // --- Handlers (same logic as DOM version) ---

  const handleOpenInPianoRoll = useCallback(() => {
    const m = useArrangementStore.getState().clipContextMenu;
    if (!m) return;
    const clip = useArrangementStore.getState().clips.find(c => c.id === m.clipId);
    if (!clip) return;
    close();
    const ts = useTrackerStore.getState();
    const patternIndex = ts.patterns.findIndex(p => p.id === clip.patternId);
    if (patternIndex >= 0) ts.setCurrentPattern(patternIndex);
    const pr = usePianoRollStore.getState();
    pr.setChannelIndex(clip.sourceChannelIndex ?? 0);
    pr.setScroll(clip.offsetRows || 0, pr.view.scrollY);
    useWorkbenchStore.getState().showWindow('pianoroll');
  }, [close]);

  const handleRename = useCallback(() => {
    const m = useArrangementStore.getState().clipContextMenu;
    if (!m) return;
    close();
    useArrangementStore.getState().setRenamingClipId(m.clipId);
  }, [close]);

  const handleMute = useCallback(() => {
    const m = useArrangementStore.getState().clipContextMenu;
    if (!m) return;
    close();
    useArrangementStore.getState().toggleClipMute(m.clipId);
  }, [close]);

  const handleDuplicate = useCallback(() => {
    const m = useArrangementStore.getState().clipContextMenu;
    if (!m) return;
    close();
    const arr = useArrangementStore.getState();
    arr.pushUndo();
    const newIds = arr.duplicateClips([m.clipId]);
    arr.clearSelection();
    arr.selectClips(newIds);
  }, [close]);

  const handleDelete = useCallback(() => {
    const m = useArrangementStore.getState().clipContextMenu;
    if (!m) return;
    close();
    const arr = useArrangementStore.getState();
    arr.pushUndo();
    arr.removeClip(m.clipId);
  }, [close]);

  const handleSetColor = useCallback((color: string) => {
    const m = useArrangementStore.getState().clipContextMenu;
    if (!m) return;
    close();
    const arr = useArrangementStore.getState();
    arr.pushUndo();
    arr.setClipColor(m.clipId, color);
  }, [close]);

  const handleResetColor = useCallback(() => {
    const m = useArrangementStore.getState().clipContextMenu;
    if (!m) return;
    close();
    useArrangementStore.getState().setClipColor(m.clipId, null);
  }, [close]);

  const handleAddVolumeAutomation = useCallback(() => {
    const m = useArrangementStore.getState().clipContextMenu;
    if (!m) return;
    const clip = useArrangementStore.getState().clips.find(c => c.id === m.clipId);
    if (!clip) return;
    close();
    useArrangementStore.getState().addAutomationLane(clip.trackId, 'volume');
  }, [close]);

  const handleSetClipLength = useCallback((input: string) => {
    const m = useArrangementStore.getState().clipContextMenu;
    if (!m) return;
    close();
    const rows = parseInt(input, 10);
    if (isNaN(rows) || rows < 1) {
      useArrangementStore.getState().setClipLength(m.clipId, undefined);
    } else {
      useArrangementStore.getState().setClipLength(m.clipId, rows);
    }
  }, [close]);

  const handleToggleLoop = useCallback(() => {
    const m = useArrangementStore.getState().clipContextMenu;
    if (!m) return;
    const clip = useArrangementStore.getState().clips.find(c => c.id === m.clipId);
    if (!clip) return;
    close();
    useArrangementStore.getState().setClipLoop(m.clipId, !clip.loopClip);
  }, [close]);

  // --- Derived data ---

  const clip = useMemo(() => {
    if (!menu) return null;
    return useArrangementStore.getState().clips.find(c => c.id === menu.clipId) ?? null;
  }, [menu]);

  const track = useMemo(() => {
    if (!clip) return null;
    return useArrangementStore.getState().tracks.find(t => t.id === clip.trackId) ?? null;
  }, [clip]);

  const currentClipColor = clip?.color ?? null;
  const trackColor = track?.color ?? null;
  const swatchDisplayColor = currentClipColor ?? trackColor ?? '#666';
  const swatchDisplayNum = useMemo(() => cssColorToPixi(swatchDisplayColor).color, [swatchDisplayColor]);

  // --- Rendering ---

  // Always return a persistent pixiContainer — never null.
  // When not visible, return an empty invisible container so pixi-react
  // always has a display object in the scene graph (avoids null→tree insertion bug).
  if (!menu || !clip) {
    return <pixiContainer visible={false} layout={{ position: 'absolute', width: '100%', height: '100%' }} />;
  }

  const screenW = app?.screen?.width ?? 1920;
  const screenH = app?.screen?.height ?? 1080;

  // Clamp position to stay on screen
  const left = Math.min(menu.screenX, screenW - MENU_W - 8);
  const top = Math.min(menu.screenY, screenH - 320);

  const drawBackdrop = (g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, screenW, screenH);
    g.fill({ color: 0x000000, alpha: 0.15 });
  };

  const handleBackdropClick = (_e: FederatedPointerEvent) => {
    setMenu(null);
  };

  const handlePanelClick = (e: FederatedPointerEvent) => {
    e.stopPropagation();
  };

  // Color swatch grid dimensions
  const swatchRows = Math.ceil((CLIP_COLORS.length + 1) / SWATCH_COLS); // +1 for reset
  const colorPickerH = swatchRows * (SWATCH_SIZE + SWATCH_GAP) + SWATCH_GAP + 8;

  // Menu items definition
  type MenuEntry = { type: 'item'; id: string; label: string; danger?: boolean; onClick: () => void }
    | { type: 'separator' }
    | { type: 'color' }
    | { type: 'colorPicker' }
    | { type: 'clipLength' };

  const entries: MenuEntry[] = [
    { type: 'item', id: 'piano', label: 'Open in Piano Roll', onClick: handleOpenInPianoRoll },
    { type: 'separator' },
    { type: 'item', id: 'rename', label: 'Rename', onClick: handleRename },
    { type: 'item', id: 'mute', label: clip.muted ? 'Unmute' : 'Mute', onClick: handleMute },
    { type: 'item', id: 'dup', label: 'Duplicate', onClick: handleDuplicate },
    { type: 'separator' },
    { type: 'color' },
    ...(showColorPicker ? [{ type: 'colorPicker' as const }] : []),
    { type: 'separator' },
    { type: 'item', id: 'vol', label: 'Add volume automation', onClick: handleAddVolumeAutomation },
    { type: 'separator' },
    { type: 'clipLength' },
    { type: 'item', id: 'loop', label: clip.loopClip ? 'Disable loop' : 'Toggle loop', onClick: handleToggleLoop },
    { type: 'separator' },
    { type: 'item', id: 'delete', label: 'Delete', onClick: handleDelete, danger: true },
  ];

  // Compute menu height
  let menuH = 8; // top padding
  for (const e of entries) {
    if (e.type === 'separator') menuH += SEP_H;
    else if (e.type === 'colorPicker') menuH += colorPickerH;
    else if (e.type === 'clipLength' && showClipLengthInput) menuH += ROW_H + 32;
    else menuH += ROW_H;
  }
  menuH += 4; // bottom padding

  const hoverBg = theme.bgHover.color;
  const dangerColor = theme.error.color;

  // Build entries as positioned rows
  let yOffset = 4;
  const rows: React.ReactNode[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const y = yOffset;

    if (entry.type === 'separator') {
      rows.push(
        <layoutContainer
          key={`sep-${i}`}
          layout={{
            position: 'absolute',
            top: y + 4,
            left: 8,
            width: MENU_W - 16,
            height: 1,
            backgroundColor: theme.border.color,
          }}
        />
      );
      yOffset += SEP_H;
    } else if (entry.type === 'item') {
      const { id, label, danger, onClick } = entry;
      const isHovered = hoveredItem === id;
      rows.push(
        <layoutContainer
          key={id}
          eventMode="static"
          cursor="pointer"
          onPointerEnter={() => setHoveredItem(id)}
          onPointerLeave={() => setHoveredItem(null)}
          onPointerUp={onClick}
          onClick={onClick}
          layout={{
            position: 'absolute',
            top: y,
            left: 0,
            width: MENU_W,
            height: ROW_H,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 12,
            ...(isHovered ? { backgroundColor: hoverBg } : {}),
          }}
        >
          <PixiLabel
            text={label}
            size="xs"
            font="mono"
            color={danger ? 'custom' : isHovered ? 'text' : 'textSecondary'}
            customColor={danger ? dangerColor : undefined}
          />
        </layoutContainer>
      );
      yOffset += ROW_H;
    } else if (entry.type === 'color') {
      const id = 'setcolor';
      const isHovered = hoveredItem === id;
      rows.push(
        <layoutContainer
          key={id}
          eventMode="static"
          cursor="pointer"
          onPointerEnter={() => setHoveredItem(id)}
          onPointerLeave={() => setHoveredItem(null)}
          onPointerUp={() => setShowColorPicker(v => !v)}
          onClick={() => setShowColorPicker(v => !v)}
          layout={{
            position: 'absolute',
            top: y,
            left: 0,
            width: MENU_W,
            height: ROW_H,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 12,
            ...(isHovered ? { backgroundColor: hoverBg } : {}),
          }}
        >
          {/* Color swatch indicator */}
          <layoutContainer
            layout={{
              width: 12,
              height: 12,
              borderRadius: 2,
              backgroundColor: swatchDisplayNum,
              marginRight: 6,
            }}
          />
          <PixiLabel
            text="Set color"
            size="xs"
            font="mono"
            color={isHovered ? 'text' : 'textSecondary'}
            layout={{ flex: 1 }}
          />
          <PixiLabel
            text={showColorPicker ? '▲' : '▼'}
            size="xs"
            font="mono"
            color="textMuted"
            layout={{ marginRight: 12 }}
          />
        </layoutContainer>
      );
      yOffset += ROW_H;
    } else if (entry.type === 'colorPicker') {
      rows.push(
        <ColorPickerGrid
          key="cpicker"
          y={y}
          menuW={MENU_W}
          borderColor={theme.border.color}
          onSetColor={handleSetColor}
          onResetColor={handleResetColor}
        />
      );
      yOffset += colorPickerH;
    } else if (entry.type === 'clipLength') {
      if (showClipLengthInput) {
        // Show text input inline
        rows.push(
          <layoutContainer
            key="cliplength-input"
            layout={{
              position: 'absolute',
              top: y,
              left: 0,
              width: MENU_W,
              height: ROW_H + 32,
              flexDirection: 'column',
              paddingLeft: 12,
              paddingRight: 12,
              paddingTop: 4,
            }}
          >
            <PixiLabel text="Clip length (rows):" size="xs" font="mono" color="textMuted" layout={{ marginBottom: 4 }} />
            <PixiPureTextInput
              value={clipLengthValue}
              onChange={setClipLengthValue}
              numeric
              min={1}
              placeholder={String(clip.clipLength ?? '')}
              width={MENU_W - 24}
              height={22}
              fontSize={11}
              onSubmit={(v) => handleSetClipLength(v)}
              onCancel={() => { setShowClipLengthInput(false); setClipLengthValue(''); }}
            />
          </layoutContainer>
        );
        yOffset += ROW_H + 32;
      } else {
        const id = 'cliplength';
        const isHovered = hoveredItem === id;
        rows.push(
          <layoutContainer
            key={id}
            eventMode="static"
            cursor="pointer"
            onPointerEnter={() => setHoveredItem(id)}
            onPointerLeave={() => setHoveredItem(null)}
            onPointerUp={() => {
              setClipLengthValue(String(clip.clipLength ?? ''));
              setShowClipLengthInput(true);
            }}
            onClick={() => {
              setClipLengthValue(String(clip.clipLength ?? ''));
              setShowClipLengthInput(true);
            }}
            layout={{
              position: 'absolute',
              top: y,
              left: 0,
              width: MENU_W,
              height: ROW_H,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 12,
              ...(isHovered ? { backgroundColor: hoverBg } : {}),
            }}
          >
            <PixiLabel
              text="Set clip length..."
              size="xs"
              font="mono"
              color={isHovered ? 'text' : 'textSecondary'}
            />
          </layoutContainer>
        );
        yOffset += ROW_H;
      }
    }
  }

  return (
    <pixiContainer layout={{ position: 'absolute', width: '100%', height: '100%' }}>
      {/* Semi-transparent backdrop */}
      <pixiGraphics
        draw={drawBackdrop}
        eventMode="static"
        onPointerUp={handleBackdropClick}
        layout={{ position: 'absolute', width: screenW, height: screenH }}
      />

      {/* Menu panel */}
      <layoutContainer
        eventMode="static"
        onPointerDown={handlePanelClick}
        layout={{
          position: 'absolute',
          left,
          top,
          width: MENU_W,
          height: menuH,
          flexDirection: 'column',
          backgroundColor: theme.bgSecondary.color,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {rows}
      </layoutContainer>
    </pixiContainer>
  );
};

// --- Color Picker Grid Sub-component ---

const ColorPickerGrid: React.FC<{
  y: number;
  menuW: number;
  borderColor: number;
  onSetColor: (color: string) => void;
  onResetColor: () => void;
}> = ({ y, menuW, borderColor, onSetColor, onResetColor }) => {
  const [hoveredSwatch, setHoveredSwatch] = useState<number | null>(null);

  const swatches: React.ReactNode[] = [];
  const allItems = [...CLIP_COLORS, '__reset__'];

  for (let idx = 0; idx < allItems.length; idx++) {
    const col = idx % SWATCH_COLS;
    const row = Math.floor(idx / SWATCH_COLS);
    const sx = 8 + col * (SWATCH_SIZE + SWATCH_GAP);
    const sy = 4 + row * (SWATCH_SIZE + SWATCH_GAP);
    const item = allItems[idx];
    const isReset = item === '__reset__';
    const isHovered = hoveredSwatch === idx;
    const scale = isHovered ? 1.15 : 1.0;
    const bgColor = isReset ? 0x333333 : cssColorToPixi(item).color;

    swatches.push(
      <layoutContainer
        key={idx}
        eventMode="static"
        cursor="pointer"
        onPointerEnter={() => setHoveredSwatch(idx)}
        onPointerLeave={() => setHoveredSwatch(null)}
        onPointerUp={() => isReset ? onResetColor() : onSetColor(item)}
        onClick={() => isReset ? onResetColor() : onSetColor(item)}
        scale={scale}
        layout={{
          position: 'absolute',
          left: sx,
          top: sy,
          width: SWATCH_SIZE,
          height: SWATCH_SIZE,
          borderRadius: 3,
          backgroundColor: bgColor,
          borderWidth: 1,
          borderColor: isReset ? 0x888888 : 0x555555,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {isReset && (
          <PixiLabel text="×" size="sm" font="mono" color="textMuted" />
        )}
      </layoutContainer>
    );
  }

  const totalRows = Math.ceil(allItems.length / SWATCH_COLS);
  const gridH = totalRows * (SWATCH_SIZE + SWATCH_GAP) + SWATCH_GAP + 8;

  return (
    <layoutContainer
      key="color-grid"
      layout={{
        position: 'absolute',
        top: y,
        left: 0,
        width: menuW,
        height: gridH,
        borderTopWidth: 1,
        borderColor,
      }}
    >
      {swatches}
    </layoutContainer>
  );
};
