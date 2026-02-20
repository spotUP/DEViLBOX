/**
 * CollaborationToolbar — Room code, mic mute, listen mode, disconnect.
 * Displayed at the top of CollaborationSplitView.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { Minimize2, Copy, Check, Mic, MicOff, Volume2, ChevronDown, X } from 'lucide-react';
import type { ListenMode } from '@stores/useCollaborationStore';

export const CollaborationToolbar: React.FC = () => {
  const { roomCode, micMuted, listenMode, setViewMode, setListenMode, toggleMic, disconnect } = useCollaborationStore();
  const [copied, setCopied] = useState(false);
  const [showListenMenu, setShowListenMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCopyCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowListenMenu(false);
      }
    };
    if (showListenMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showListenMenu]);

  const listenModeLabel: Record<ListenMode, string> = {
    mine: 'Mine only',
    both: 'Both',
    theirs: 'Friend only',
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-bgSecondary border-b border-dark-border shrink-0">
      {/* Fullscreen toggle */}
      <button
        onClick={() => setViewMode('fullscreen')}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-text-primary transition-colors rounded hover:bg-dark-bgTertiary"
        title="Back to fullscreen"
      >
        <Minimize2 size={13} />
        <span>Fullscreen</span>
      </button>

      <div className="w-px h-4 bg-dark-border" />

      {/* Room code */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-text-muted">Room:</span>
        <button
          onClick={handleCopyCode}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-dark-bgTertiary border border-dark-border hover:border-accent-primary/50 transition-colors group"
          title="Click to copy room code"
        >
          <span className="font-mono text-xs font-bold text-accent-primary tracking-wider">{roomCode}</span>
          {copied
            ? <Check size={11} className="text-accent-success" />
            : <Copy size={11} className="text-text-muted group-hover:text-accent-primary transition-colors" />
          }
        </button>
      </div>

      <div className="w-px h-4 bg-dark-border" />

      {/* Mic mute */}
      <button
        onClick={toggleMic}
        className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
          micMuted
            ? 'text-accent-error bg-accent-error/10 hover:bg-accent-error/20'
            : 'text-text-muted hover:text-text-primary hover:bg-dark-bgTertiary'
        }`}
        title={micMuted ? 'Unmute mic' : 'Mute mic'}
      >
        {micMuted ? <MicOff size={13} /> : <Mic size={13} />}
        <span>{micMuted ? 'Muted' : 'Mic'}</span>
      </button>

      <div className="w-px h-4 bg-dark-border" />

      {/* Listen mode dropdown */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowListenMenu(!showListenMenu)}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-text-primary transition-colors rounded hover:bg-dark-bgTertiary"
          title="Audio routing"
        >
          <Volume2 size={13} />
          <span>{listenModeLabel[listenMode]}</span>
          <ChevronDown size={11} className={`transition-transform ${showListenMenu ? 'rotate-180' : ''}`} />
        </button>

        {showListenMenu && (
          <div className="absolute top-full left-0 mt-1 py-1 min-w-[130px] bg-dark-bgPrimary border border-dark-border rounded-lg shadow-lg z-50">
            {(['mine', 'both', 'theirs'] as ListenMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setListenMode(m); setShowListenMenu(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-dark-bgSecondary ${
                  listenMode === m ? 'text-accent-primary' : 'text-text-secondary'
                }`}
              >
                {listenModeLabel[m]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Collab indicator */}
      <div className="flex items-center gap-1.5 text-xs text-accent-success">
        <div className="w-1.5 h-1.5 rounded-full bg-accent-success animate-pulse" />
        <span>Connected</span>
      </div>

      <div className="w-px h-4 bg-dark-border" />

      {/* Disconnect */}
      <button
        onClick={disconnect}
        className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-accent-error transition-colors rounded hover:bg-accent-error/10"
        title="Disconnect"
      >
        <X size={13} />
        <span>Disconnect</span>
      </button>
    </div>
  );
};
