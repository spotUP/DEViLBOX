/**
 * DJRemoteControlButton — Shows QR code for iPhone controller pairing.
 *
 * Creates a WebRTC room via the signaling server, gets the local IP,
 * and generates a QR code URL that the iPhone can scan to auto-connect.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DJRemoteMicReceiver } from '@/engine/dj/DJRemoteMicReceiver';
import { QRCode } from './QRCode';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const DJRemoteControlButton: React.FC = () => {
  const [showPanel, setShowPanel] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [localIP, setLocalIP] = useState<string>('');
  const [micStatus, setMicStatus] = useState<string>('');
  const receiverRef = useRef<DJRemoteMicReceiver | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });

  const handleToggle = useCallback(async () => {
    if (showPanel) {
      // Close — disconnect receiver
      receiverRef.current?.disconnect();
      receiverRef.current = null;
      setShowPanel(false);
      setRoomCode(null);
      setMicStatus('');
      return;
    }

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPanelPos({
        top: rect.bottom + 4,
        right: Math.max(0, window.innerWidth - rect.right),
      });
    }

    setShowPanel(true);

    try {
      // Get local IP from server
      const ipResp = await fetch(`${API_BASE}/network/local-ip`);
      const { ip } = await ipResp.json();
      setLocalIP(ip);

      // Create WebRTC room for mic audio
      const receiver = new DJRemoteMicReceiver();
      receiver.onStatusChange = (s) => setMicStatus(s);
      receiverRef.current = receiver;

      const code = await receiver.createRoom();
      setRoomCode(code);
    } catch (err) {
      console.error('[RemoteControl] Setup failed:', err);
      setMicStatus('error');
    }
  }, [showPanel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { receiverRef.current?.disconnect(); };
  }, []);

  // Close panel on click outside (exclude the toggle button and the portaled panel)
  useEffect(() => {
    if (!showPanel) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      handleToggle();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showPanel, handleToggle]);

  const controllerURL = localIP && roomCode
    ? `http://${localIP}:5173/controller.html?host=${localIP}&room=${roomCode}`
    : '';

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold border transition-all
          ${showPanel
            ? 'border-blue-500 bg-blue-600 text-white'
            : 'border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
          }`}
        title="Connect iPhone controller"
      >
        REMOTE
      </button>

      {showPanel && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: panelPos.top, right: panelPos.right }}
          className="z-[99991] w-72 bg-dark-bgSecondary border border-dark-borderLight rounded-lg p-4 shadow-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-text-primary">iPhone Controller</span>
            <button
              onClick={handleToggle}
              className="text-text-tertiary hover:text-text-primary transition-colors text-sm leading-none"
              title="Close"
            >
              X
            </button>
          </div>

          {roomCode ? (
            <>
              {/* QR Code — scan with iPhone camera to auto-connect */}
              <div className="flex flex-col items-center mb-3">
                <QRCode url={controllerURL} size={200} />
                <div className="text-[10px] text-text-muted mt-1">
                  Scan with iPhone camera
                </div>
              </div>

              {/* Room code for manual entry */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-text-muted">Room:</span>
                <span className="text-sm font-mono font-bold text-blue-400 tracking-wider">{roomCode}</span>
              </div>

              {/* Copy URL button */}
              <button
                onClick={() => navigator.clipboard?.writeText(controllerURL)}
                className="w-full px-3 py-1.5 rounded-md border border-dark-borderLight bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover text-[10px] transition-all mb-2"
              >
                Copy URL
              </button>

              {/* Mic status */}
              <div className="text-[10px] text-text-muted">
                Mic: <span className={micStatus === 'connected' ? 'text-green-400' : micStatus === 'waiting' ? 'text-yellow-400' : 'text-text-muted'}>
                  {micStatus || 'initializing...'}
                </span>
              </div>
            </>
          ) : (
            <div className="text-[10px] text-text-muted">Setting up...</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};
