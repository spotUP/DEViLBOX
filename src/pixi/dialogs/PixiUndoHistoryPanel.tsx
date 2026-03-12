/**
 * PixiUndoHistoryPanel — GL-native right-side panel showing undo/redo history.
 * Reference: src/components/tracker/UndoHistoryPanel.tsx
 */

import { useCallback, useMemo } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PixiButton, PixiLabel } from '../components';
import { usePixiTheme } from '../theme';
import { useModalClose } from '@hooks/useDialogKeyboard';
import { PIXI_FONTS } from '../fonts';
import {
  useHistoryStore,
  getActionTypeName,
  getActionTypeColor,
} from '@stores/useHistoryStore';

interface PixiUndoHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLOR_MAP: Record<string, number> = {
  'text-blue-400': 0x60A5FA,
  'text-green-400': 0x4ADE80,
  'text-yellow-400': 0xFACC15,
  'text-red-400': 0xF87171,
  'text-purple-400': 0xC084FC,
  'text-orange-400': 0xFB923C,
  'text-accent-highlight': 0x22D3EE,
  'text-neutral-400': 0xA3A3A3,
};

const PANEL_W = 256;

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const getDotColor = (type: string): number =>
  COLOR_MAP[getActionTypeColor(type as Parameters<typeof getActionTypeColor>[0])] ?? 0xA3A3A3;

/** Small colored dot drawn via Graphics */
const Dot: React.FC<{ color: number; alpha?: number }> = ({ color, alpha = 1 }) => {
  const draw = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.circle(3, 3, 3);
      g.fill({ color, alpha });
    },
    [color, alpha],
  );
  return <pixiGraphics draw={draw} layout={{ width: 6, height: 6, marginTop: 3 }} />;
};

export const PixiUndoHistoryPanel: React.FC<PixiUndoHistoryPanelProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();
  const undoStack = useHistoryStore((s) => s.undoStack);
  const redoStack = useHistoryStore((s) => s.redoStack);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  useModalClose({ isOpen, onClose });

  const drawPanelBg = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 0, PANEL_W, 4096);
      g.fill({ color: theme.bg.color });
      // left border
      g.rect(0, 0, 1, 4096);
      g.fill({ color: theme.border.color });
    },
    [theme],
  );

  const drawHeaderBorder = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 27, PANEL_W, 1);
      g.fill({ color: theme.border.color });
    },
    [theme],
  );

  const drawCurrentMarker = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 0, PANEL_W, 20);
      g.fill({ color: 0x1E3A5F, alpha: 0.5 });
      // top & bottom subtle borders
      g.rect(0, 0, PANEL_W, 1);
      g.fill({ color: 0x1D4ED8, alpha: 0.3 });
      g.rect(0, 19, PANEL_W, 1);
      g.fill({ color: 0x1D4ED8, alpha: 0.3 });
    },
    [],
  );

  const drawFooterBorder = useCallback(
    (g: GraphicsType) => {
      g.clear();
      g.rect(0, 0, PANEL_W, 1);
      g.fill({ color: theme.border.color });
    },
    [theme],
  );

  // Reversed stacks for display (most recent first)
  const redoReversed = useMemo(() => [...redoStack].reverse(), [redoStack]);
  const undoReversed = useMemo(() => [...undoStack].reverse(), [undoStack]);

  if (!isOpen) return null;

  return (
    <layoutContainer
      layout={{
        position: 'absolute',
        right: 0,
        top: 0,
        width: PANEL_W,
        height: '100%',
        flexDirection: 'column',
      }}
    >
      {/* Panel background */}
      <pixiGraphics draw={drawPanelBg} layout={{ position: 'absolute', width: PANEL_W, height: '100%' }} />

      {/* Header */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 28,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        <pixiGraphics draw={drawHeaderBorder} layout={{ position: 'absolute', width: PANEL_W, height: 28 }} />
        <PixiLabel text="History" size="xs" weight="semibold" font="sans" layout={{ flex: 1 }} />
        <PixiButton
          label="↶"
          variant="ghost"
          size="sm"
          disabled={undoStack.length === 0}
          onClick={undo as () => void}
          width={24}
          height={22}
        />
        <PixiButton
          label="↷"
          variant="ghost"
          size="sm"
          disabled={redoStack.length === 0}
          onClick={redo as () => void}
          width={24}
          height={22}
        />
        <PixiButton
          label="x"
          variant="ghost"
          size="sm"
          onClick={onClose}
          width={24}
          height={22}
        />
      </layoutContainer>

      {/* Scrollable list */}
      <layoutContainer layout={{ flex: 1, flexDirection: 'column', overflow: 'scroll', padding: 16 }}>
        {/* Redo section */}
        {redoReversed.length > 0 && (
          <layoutContainer layout={{ flexDirection: 'column' }} alpha={0.4}>
            {/* Section header */}
            <layoutContainer layout={{ paddingLeft: 8, paddingTop: 4, paddingBottom: 2 }}>
              <pixiBitmapText
                text={`REDO (${redoReversed.length})`}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
            </layoutContainer>
            {/* Redo items */}
            {redoReversed.map((action, i) => (
              <layoutContainer
                key={`redo-${action.id}-${i}`}
                layout={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingLeft: 8,
                  paddingRight: 8,
                  paddingTop: 3,
                  paddingBottom: 3,
                }}
                eventMode="static"
                cursor="pointer"
                onPointerUp={redo as () => void}
                onClick={redo as () => void}
              >
                <Dot color={getDotColor(action.type)} />
                <pixiBitmapText
                  text={getActionTypeName(action.type)}
                  style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                  tint={theme.textSecondary.color}
                  layout={{ flex: 1 }}
                />
                <pixiBitmapText
                  text={formatTime(action.timestamp)}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                  tint={theme.textMuted.color}
                  layout={{}}
                />
              </layoutContainer>
            ))}
          </layoutContainer>
        )}

        {/* Current state marker */}
        <layoutContainer layout={{ height: 20, justifyContent: 'center', paddingLeft: 8 }}>
          <pixiGraphics draw={drawCurrentMarker} layout={{ position: 'absolute', width: PANEL_W, height: 20 }} />
          <pixiBitmapText
            text="Current State"
            style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 12, fill: 0xffffff }}
            tint={0x60A5FA}
            layout={{}}
          />
        </layoutContainer>

        {/* Undo section */}
        {undoReversed.length > 0 ? (
          <layoutContainer layout={{ flexDirection: 'column' }}>
            <layoutContainer layout={{ paddingLeft: 8, paddingTop: 4, paddingBottom: 2 }}>
              <pixiBitmapText
                text={`UNDO (${undoReversed.length})`}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
            </layoutContainer>
            {undoReversed.map((action, i) => (
              <layoutContainer
                key={`undo-${action.id}-${i}`}
                layout={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingLeft: 8,
                  paddingRight: 8,
                  paddingTop: 3,
                  paddingBottom: 3,
                }}
                eventMode="static"
                cursor="pointer"
                onPointerUp={undo as () => void}
                onClick={undo as () => void}
              >
                <Dot color={getDotColor(action.type)} />
                <pixiBitmapText
                  text={getActionTypeName(action.type)}
                  style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                  tint={theme.text.color}
                  layout={{ flex: 1 }}
                />
                <pixiBitmapText
                  text={formatTime(action.timestamp)}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                  tint={theme.textMuted.color}
                  layout={{}}
                />
              </layoutContainer>
            ))}
          </layoutContainer>
        ) : (
          <layoutContainer layout={{ alignItems: 'center', paddingTop: 32 }}>
            <PixiLabel text="No history yet" size="xs" color="textMuted" />
          </layoutContainer>
        )}
      </layoutContainer>

      {/* Footer */}
      <layoutContainer layout={{ height: 24, justifyContent: 'center', alignItems: 'center' }}>
        <pixiGraphics draw={drawFooterBorder} layout={{ position: 'absolute', width: PANEL_W, height: 1 }} />
        <pixiBitmapText
          text="Ctrl+Z undo | Ctrl+Y redo"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
      </layoutContainer>
    </layoutContainer>
  );
};
