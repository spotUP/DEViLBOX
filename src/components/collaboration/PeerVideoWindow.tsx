/**
 * PeerVideoWindow — Floating, draggable video chat window.
 * Shows remote peer's video feed with local video PiP.
 * Can be dragged anywhere on screen, minimized, or toggled camera on/off.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { Video, VideoOff, Mic, MicOff, Minimize2, Maximize2, X, UserRound } from 'lucide-react';

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 240;
const MIN_SIZE = 160;
const HEADER_HEIGHT = 28;
const PIP_WIDTH = 96;
const PIP_HEIGHT = 72;

export const PeerVideoWindow: React.FC = () => {
  const status = useCollaborationStore(s => s.status);
  const remoteVideoStream = useCollaborationStore(s => s.remoteVideoStream);
  const localVideoStream = useCollaborationStore(s => s.localVideoStream);
  const micMuted = useCollaborationStore(s => s.micMuted);
  const cameraMuted = useCollaborationStore(s => s.cameraMuted);
  const toggleMic = useCollaborationStore(s => s.toggleMic);
  const toggleCamera = useCollaborationStore(s => s.toggleCamera);

  const [minimized, setMinimized] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showSelf, setShowSelf] = useState(false);
  const [pos, setPos] = useState({ x: window.innerWidth - DEFAULT_WIDTH - 16, y: 48 });
  const [size] = useState({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });

  const containerRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  // Attach remote video stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteVideoStream) {
      remoteVideoRef.current.srcObject = remoteVideoStream;
    }
  }, [remoteVideoStream]);

  // Attach local video stream
  useEffect(() => {
    if (localVideoRef.current && localVideoStream) {
      localVideoRef.current.srcObject = localVideoStream;
    }
  }, [localVideoStream]);

  // Dragging
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 100, dragRef.current.startPosX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 40, dragRef.current.startPosY + dy)),
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Don't render if not connected or explicitly hidden
  if (status !== 'connected') return null;
  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        style={{
          position: 'fixed',
          bottom: 36,
          right: 16,
          zIndex: 50000,
          padding: '6px 10px',
          borderRadius: 6,
          background: '#1e1e2e',
          border: '1px solid #444',
          color: '#a855f7',
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Video size={12} /> Video
      </button>
    );
  }

  const hasRemoteVideo = !!remoteVideoStream;
  const hasLocalVideo = !!localVideoStream;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: minimized ? MIN_SIZE : size.w,
        zIndex: 50000,
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(168,85,247,0.3)',
        background: '#0d0d14',
        userSelect: 'none',
      }}
    >
      {/* Title bar — draggable */}
      <div
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        style={{
          height: HEADER_HEIGHT,
          background: 'linear-gradient(180deg, #1e1e2e 0%, #16161e 100%)',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          padding: '0 6px',
          gap: 4,
          cursor: 'grab',
        }}
      >
        <span style={{ fontSize: 10, color: '#a855f7', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, flex: 1 }}>
          VIDEO CHAT
        </span>

        {/* Self-view toggle */}
        {hasLocalVideo && (
          <button onClick={() => setShowSelf(!showSelf)} style={iconBtnStyle} title={showSelf ? 'Hide self-view' : 'Show self-view'}>
            <UserRound size={11} color={showSelf ? '#a855f7' : '#a3a3a3'} />
          </button>
        )}

        {/* Mic toggle */}
        <button onClick={toggleMic} style={iconBtnStyle} title={micMuted ? 'Unmute mic' : 'Mute mic'}>
          {micMuted ? <MicOff size={11} color="#f87171" /> : <Mic size={11} color="#a3a3a3" />}
        </button>

        {/* Camera toggle */}
        <button onClick={toggleCamera} style={iconBtnStyle} title={cameraMuted ? 'Enable camera' : 'Disable camera'}>
          {cameraMuted ? <VideoOff size={11} color="#f87171" /> : <Video size={11} color="#a3a3a3" />}
        </button>

        {/* Minimize */}
        <button onClick={() => setMinimized(!minimized)} style={iconBtnStyle} title={minimized ? 'Expand' : 'Minimize'}>
          {minimized ? <Maximize2 size={11} color="#a3a3a3" /> : <Minimize2 size={11} color="#a3a3a3" />}
        </button>

        {/* Hide */}
        <button onClick={() => setHidden(true)} style={iconBtnStyle} title="Hide video window">
          <X size={11} color="#a3a3a3" />
        </button>
      </div>

      {/* Video area */}
      {!minimized && (
        <div style={{ position: 'relative', width: '100%', height: size.h, background: '#0a0a12' }}>
          {/* Remote video (main) */}
          {hasRemoteVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 4,
            }}>
              <VideoOff size={24} color="#555" />
              <span style={{ fontSize: 10, color: '#555', fontFamily: 'JetBrains Mono, monospace' }}>
                Waiting for peer video...
              </span>
            </div>
          )}

          {/* Local self-view PiP */}
          {showSelf && hasLocalVideo && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                position: 'absolute', bottom: 6, right: 6,
                width: PIP_WIDTH, height: PIP_HEIGHT,
                objectFit: 'cover', borderRadius: 4,
                border: '1px solid rgba(168,85,247,0.4)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              }}
            />
          )}

          {/* Mic muted indicator overlay */}
          {micMuted && (
            <div style={{
              position: 'absolute', bottom: 6, left: 6,
              padding: '2px 6px', borderRadius: 4,
              background: 'rgba(248,113,113,0.2)', border: '1px solid rgba(248,113,113,0.4)',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <MicOff size={10} color="#f87171" />
              <span style={{ fontSize: 9, color: '#f87171', fontFamily: 'JetBrains Mono, monospace' }}>MUTED</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 3,
  borderRadius: 3,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
