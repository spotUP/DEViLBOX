/**
 * CollaborationModal — Create or join a collab room.
 *
 * Shows when user clicks "Collab" while not connected.
 * Two flows: Create Room (generates code, waits) or Join Room (enter code).
 */

import React, { useState, useCallback } from 'react';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { Button } from '@components/ui/Button';
import { Users, Copy, Check, Loader2, X } from 'lucide-react';

interface CollaborationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CollaborationModal: React.FC<CollaborationModalProps> = ({ isOpen, onClose }) => {
  const { status, roomCode, errorMessage, createRoom, joinRoom } = useCollaborationStore();
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'pick' | 'create' | 'join'>('pick');

  const handleCreate = useCallback(async () => {
    setMode('create');
    await createRoom();
  }, [createRoom]);

  const handleJoin = useCallback(async () => {
    if (joinCode.trim().length < 6) return;
    await joinRoom(joinCode);
  }, [joinRoom, joinCode]);

  const handleCopy = useCallback(() => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [roomCode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-dark-bgPrimary border-2 border-accent-primary rounded-xl p-6 max-w-md w-full mx-4 animate-slide-in-up shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-primary/20 text-accent-primary">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary">Live Collaboration</h2>
              <p className="text-sm text-text-muted">Jam together in real-time</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors p-1 rounded"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error */}
        {errorMessage && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-accent-error/10 border border-accent-error/30 text-accent-error text-sm">
            {errorMessage}
          </div>
        )}

        {/* Pick mode */}
        {mode === 'pick' && (
          <div className="flex flex-col gap-3">
            <Button variant="primary" fullWidth onClick={handleCreate}>
              Create Room
            </Button>
            <Button variant="default" fullWidth onClick={() => setMode('join')}>
              Join Room
            </Button>
          </div>
        )}

        {/* Create — waiting for peer or already creating */}
        {mode === 'create' && (
          <div className="text-center">
            {status === 'creating' && (
              <div className="flex items-center justify-center gap-3 text-text-muted py-4">
                <Loader2 size={20} className="animate-spin" />
                <span>Connecting to server...</span>
              </div>
            )}
            {(status === 'waiting' || status === 'error') && roomCode && (
              <div className="py-2">
                <p className="text-text-secondary text-sm mb-3">Share this code with your friend:</p>
                <div
                  className="flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-dark-bgSecondary border-2 border-accent-primary/50 cursor-pointer hover:border-accent-primary transition-colors group"
                  onClick={handleCopy}
                  title="Click to copy"
                >
                  <span className="font-mono text-3xl font-bold text-accent-primary tracking-widest">
                    {roomCode}
                  </span>
                  {copied
                    ? <Check size={20} className="text-accent-success" />
                    : <Copy size={20} className="text-text-muted group-hover:text-accent-primary transition-colors" />
                  }
                </div>
                <div className="flex items-center justify-center gap-2 mt-4 text-text-muted text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Waiting for friend...</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Join mode */}
        {mode === 'join' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-2">Room Code</label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                placeholder="XXXXXX"
                maxLength={6}
                className="w-full px-4 py-3 rounded-lg bg-dark-bgSecondary border border-dark-border text-text-primary font-mono text-xl text-center tracking-widest focus:outline-none focus:border-accent-primary transition-colors"
                autoFocus
              />
            </div>
            <Button
              variant="primary"
              fullWidth
              onClick={handleJoin}
              disabled={joinCode.trim().length < 6 || status === 'joining'}
              loading={status === 'joining'}
            >
              {status === 'joining' ? 'Connecting...' : 'Join Room'}
            </Button>
            <button
              onClick={() => setMode('pick')}
              className="text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
