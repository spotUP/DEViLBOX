/**
 * PixiCollaborationToolbar — GL-native collaboration status bar.
 * Mirrors the DOM CollaborationToolbar, shown when a session is connected.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PixiButton, PixiLabel } from '../../components';
import { PixiSelect, type SelectOption } from '../../components/PixiSelect';
import { usePixiTheme } from '../../theme';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import type { ListenMode } from '@stores/useCollaborationStore';

const LISTEN_OPTIONS: SelectOption[] = [
  { value: 'shared', label: 'Shared' },
  { value: 'mine', label: 'Mine Only' },
  { value: 'both', label: 'Both' },
  { value: 'theirs', label: 'Friend Only' },
];

const DOT_SIZE = 8;
const DOT_COLOR = 0x44ff44;

const drawDot = (g: GraphicsType) => {
  g.clear();
  g.circle(DOT_SIZE / 2, DOT_SIZE / 2, DOT_SIZE / 2);
  g.fill({ color: DOT_COLOR });
};

export const PixiCollaborationToolbar: React.FC = () => {
  const theme = usePixiTheme();
  const status = useCollaborationStore(s => s.status);
  const roomCode = useCollaborationStore(s => s.roomCode);
  const micMuted = useCollaborationStore(s => s.micMuted);
  const cameraMuted = useCollaborationStore(s => s.cameraMuted);
  const listenMode = useCollaborationStore(s => s.listenMode);
  const viewMode = useCollaborationStore(s => s.viewMode);
  const toggleMic = useCollaborationStore(s => s.toggleMic);
  const toggleCamera = useCollaborationStore(s => s.toggleCamera);
  const setListenMode = useCollaborationStore(s => s.setListenMode);
  const setViewMode = useCollaborationStore(s => s.setViewMode);
  const disconnect = useCollaborationStore(s => s.disconnect);

  const visible = status === 'connected';
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [pulseAlpha, setPulseAlpha] = useState(1);

  useEffect(() => {
    if (status !== 'connected') return;
    let frame: number;
    const pulse = () => {
      setPulseAlpha(0.5 + 0.5 * Math.sin(Date.now() / 500));
      frame = requestAnimationFrame(pulse);
    };
    frame = requestAnimationFrame(pulse);
    return () => cancelAnimationFrame(frame);
  }, [status]);

  const handleCopyRoom = useCallback(() => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }, [roomCode]);

  const handleListenChange = useCallback((value: string) => {
    setListenMode(value as ListenMode);
  }, [setListenMode]);

  const handleFullscreenToggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  const handleViewModeCycle = useCallback(() => {
    setViewMode(viewMode === 'fullscreen' ? 'split' : 'fullscreen');
  }, [viewMode, setViewMode]);

  const drawDivider = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 4, 1, 20).fill({ color: theme.border.color });
  }, [theme.border.color]);

  return (
    <pixiContainer visible={visible}>
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingTop: 4,
          paddingBottom: 4,
          paddingLeft: 8,
          paddingRight: 8,
          height: 32,
          width: '100%' as unknown as number,
          backgroundColor: theme.bgTertiary.color,
        }}
        eventMode={visible ? 'static' : 'none'}
      >
        {/* Fullscreen toggle */}
        <PixiButton
          label={document.fullscreenElement ? 'Exit FS' : 'Fullscreen'}
          size="sm"
          variant="ghost"
          onClick={handleFullscreenToggle}
        />

        {/* Divider */}
        <pixiGraphics draw={drawDivider} layout={{ width: 1, height: 28 }} />

        {/* Room code + copy */}
        <PixiLabel text="Room:" size="xs" color="textMuted" layout={{ alignSelf: 'center' }} />
        <PixiLabel
          text={roomCode ?? ''}
          size="xs"
          font="mono"
          color="textSecondary"
          layout={{ alignSelf: 'center' }}
        />
        <PixiButton
          icon="copy"
          label={copyFeedback ? 'Copied!' : 'Copy'}
          size="sm"
          variant="ghost"
          onClick={handleCopyRoom}
        />

        {/* Divider */}
        <pixiGraphics draw={drawDivider} layout={{ width: 1, height: 28 }} />

        {/* Mic toggle */}
        <PixiButton
          label={micMuted ? 'Muted' : 'Mic'}
          icon={micMuted ? 'close' : undefined}
          variant={micMuted ? 'danger' : 'ghost'}
          size="sm"
          onClick={toggleMic}
        />

        {/* Camera toggle */}
        <PixiButton
          label={cameraMuted ? 'Cam Off' : 'Cam'}
          icon={cameraMuted ? 'close' : undefined}
          variant={cameraMuted ? 'danger' : 'ghost'}
          size="sm"
          onClick={toggleCamera}
        />

        {/* Divider */}
        <pixiGraphics draw={drawDivider} layout={{ width: 1, height: 28 }} />

        {/* Listen mode */}
        <PixiSelect
          options={LISTEN_OPTIONS}
          value={listenMode}
          onChange={handleListenChange}
          width={110}
          height={22}
        />

        {/* View mode cycle */}
        <PixiButton
          label={viewMode === 'fullscreen' ? 'Split' : 'Fullscreen'}
          size="sm"
          variant="ghost"
          onClick={handleViewModeCycle}
        />

        {/* Spacer */}
        <layoutContainer layout={{ flexGrow: 1 }} />

        {/* Green dot + Connected label */}
        <pixiGraphics
          draw={drawDot}
          alpha={pulseAlpha}
          layout={{ width: DOT_SIZE, height: DOT_SIZE, alignSelf: 'center' }}
        />
        <PixiLabel text="Connected" size="xs" color="success" layout={{ alignSelf: 'center' }} />

        {/* Divider */}
        <pixiGraphics draw={drawDivider} layout={{ width: 1, height: 28 }} />

        {/* Disconnect */}
        <PixiButton label="Disconnect" variant="danger" size="sm" onClick={disconnect} />
      </layoutContainer>
    </pixiContainer>
  );
};
