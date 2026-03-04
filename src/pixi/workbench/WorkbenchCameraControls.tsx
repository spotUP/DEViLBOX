/**
 * WorkbenchCameraControls — On-screen drag-handle camera controls for the
 * studio workbench, inspired by the DJ 3D deck camera pads.
 *
 * Two drag pads (pan, zoom) plus FIT and 1:1 reset.
 * Each pad uses pointer capture so drags work even when the cursor
 * leaves the pad bounds.
 */

import React, { useCallback, useRef } from 'react';
import type { FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { FAD_ICONS } from '../fontaudioIcons';
import { usePixiTheme } from '../theme';

interface WorkbenchCameraControlsProps {
  onPan: (dx: number, dy: number) => void;
  onZoom: (delta: number) => void;
  onFitAll: () => void;
  onReset: () => void;
}

const PAD_SIZE = 32;
const BTN_W = 40;
const BTN_H = 24;
const GAP = 3;
const ICON_SIZE = 14;
const LABEL_SIZE = 9;

const PAN_SENSITIVITY = 1.0;
const ZOOM_SENSITIVITY = 0.004;

/**
 * A single draggable pad that reports dx/dy while held.
 */
const DragPad: React.FC<{
  icon: string;
  label: string;
  onDrag: (dx: number, dy: number) => void;
}> = ({ icon, label, onDrag }) => {
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = React.useState(false);
  const theme = usePixiTheme();

  const handleDown = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();
    lastPos.current = { x: e.globalX, y: e.globalY };
    const onMove = (me: PointerEvent) => {
      if (!lastPos.current) return;
      const dx = me.clientX - lastPos.current.x;
      const dy = me.clientY - lastPos.current.y;
      lastPos.current = { x: me.clientX, y: me.clientY };
      onDrag(dx, dy);
    };
    const onUp = () => {
      lastPos.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [onDrag]);

  const iconChar = FAD_ICONS[icon] ?? '?';
  const textColor = theme.textPrimary?.color ?? 0xcccccc;

  return (
    <layoutContainer
      eventMode="static"
      cursor="grab"
      onPointerDown={handleDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      layout={{
        width: PAD_SIZE,
        height: PAD_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        gap: 1,
        backgroundColor: hovered ? 0x333333 : 0x1a1a1a,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 0x555555,
      }}
    >
      <pixiBitmapText
        text={iconChar}
        style={{ fontFamily: PIXI_FONTS.ICONS, fontSize: ICON_SIZE }}
        tint={textColor}
        anchor={{ x: 0.5, y: 0.5 }}
        layout={{ alignSelf: 'center' }}
      />
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: LABEL_SIZE }}
        tint={textColor}
        anchor={{ x: 0.5, y: 0.5 }}
        alpha={0.7}
        layout={{ alignSelf: 'center' }}
      />
    </layoutContainer>
  );
};

/**
 * A small click button (FIT / 1:1).
 */
const SmallButton: React.FC<{
  label: string;
  onClick: () => void;
}> = ({ label, onClick }) => {
  const [hovered, setHovered] = React.useState(false);
  const theme = usePixiTheme();
  const textColor = theme.textPrimary?.color ?? 0xcccccc;

  return (
    <layoutContainer
      eventMode="static"
      cursor="pointer"
      onPointerDown={(e: FederatedPointerEvent) => { e.stopPropagation(); onClick(); }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      layout={{
        width: BTN_W,
        height: BTN_H,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: hovered ? 0x333333 : 0x1a1a1a,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 0x555555,
      }}
    >
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
        tint={textColor}
        anchor={{ x: 0.5, y: 0.5 }}
        layout={{ alignSelf: 'center' }}
      />
    </layoutContainer>
  );
};

export const WorkbenchCameraControls: React.FC<WorkbenchCameraControlsProps> = ({
  onPan,
  onZoom,
  onFitAll,
  onReset,
}) => {
  const handlePanDrag = useCallback((dx: number, dy: number) => {
    onPan(dx * PAN_SENSITIVITY, dy * PAN_SENSITIVITY);
  }, [onPan]);

  const handleZoomDrag = useCallback((_dx: number, dy: number) => {
    onZoom(-dy * ZOOM_SENSITIVITY);
  }, [onZoom]);

  return (
    <pixiContainer
      layout={{
        position: 'absolute',
        bottom: 8,
        right: 10,
        flexDirection: 'column',
        gap: GAP,
        alignItems: 'center',
      }}
      eventMode="static"
    >
      <DragPad icon="arrows-horz" label="PAN" onDrag={handlePanDrag} />
      <DragPad icon="zoomin" label="ZOOM" onDrag={handleZoomDrag} />
      <SmallButton label="FIT" onClick={onFitAll} />
      <SmallButton label="1:1" onClick={onReset} />
    </pixiContainer>
  );
};
