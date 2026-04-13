/**
 * PixiCollaborationModal — GL-native version of CollaborationModal.
 * Create or join a real-time collaboration room.
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiButton, PixiLabel } from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme } from '../theme';
import { useCollaborationStore } from '@stores/useCollaborationStore';

interface PixiCollaborationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODAL_W = 420;
const MODAL_H = 320;

export const PixiCollaborationModal: React.FC<PixiCollaborationModalProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();
  const status = useCollaborationStore(s => s.status);
  const roomCode = useCollaborationStore(s => s.roomCode);
  const errorMessage = useCollaborationStore(s => s.errorMessage);
  const createRoom = useCollaborationStore(s => s.createRoom);
  const joinRoom = useCollaborationStore(s => s.joinRoom);

  const [mode, setMode] = useState<'pick' | 'create' | 'join'>('pick');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

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
    const link = `${window.location.origin}${window.location.pathname}?collab=${roomCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [roomCode]);

  const handleJoinCodeChange = useCallback((v: string) => {
    setJoinCode(v.toUpperCase().slice(0, 6));
  }, []);

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column' }}>
      {/* Header */}
      <layoutContainer layout={{ width: MODAL_W - 32, flexDirection: 'column', marginBottom: 8 }}>
        <PixiLabel text="Live Collaboration" size="lg" weight="bold" font="sans" />
        <PixiLabel text="Jam together in real-time" size="sm" color="textMuted" font="sans" layout={{ marginTop: 2 }} />
      </layoutContainer>

      {/* Error message */}
      {errorMessage && (
        <layoutContainer
          layout={{
            width: MODAL_W - 32,
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 8,
            paddingBottom: 8,
            marginBottom: 8,
            backgroundColor: (((theme.error.color >> 16 & 0xff) * 0.15 | 0) << 16) | (((theme.error.color >> 8 & 0xff) * 0.15 | 0) << 8) | ((theme.error.color & 0xff) * 0.15 | 0),
            borderRadius: 4,
            borderWidth: 1,
            borderColor: theme.error.color,
          }}
        >
          <PixiLabel text={errorMessage} size="sm" color="error" font="sans" />
        </layoutContainer>
      )}

      {/* Pick mode */}
      {mode === 'pick' && (
        <layoutContainer layout={{ width: MODAL_W - 32, flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <PixiButton label="Create Room" variant="primary" width={MODAL_W - 32} height={36} onClick={handleCreate} />
          <PixiButton label="Join Room" variant="default" width={MODAL_W - 32} height={36} onClick={() => setMode('join')} />
        </layoutContainer>
      )}

      {/* Create mode */}
      {mode === 'create' && (
        <layoutContainer layout={{ width: MODAL_W - 32, flexDirection: 'column', alignItems: 'center', marginTop: 12 }}>
          {status === 'creating' && (
            <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <PixiLabel text="⟳" size="md" color="textMuted" font="sans" />
              <PixiLabel text="Connecting to server..." size="md" color="textMuted" font="sans" />
            </layoutContainer>
          )}

          {(status === 'waiting' || status === 'error') && roomCode && (
            <layoutContainer layout={{ flexDirection: 'column', alignItems: 'center', width: MODAL_W - 32 }}>
              <PixiLabel text="Share this link with your friend:" size="sm" color="textSecondary" font="sans" />

              {/* Copy invite link button */}
              <layoutContainer
                eventMode="static"
                cursor="pointer"
                onPointerUp={handleCopy}
                layout={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 10,
                  paddingLeft: 24,
                  paddingRight: 24,
                  paddingTop: 14,
                  paddingBottom: 14,
                  backgroundColor: theme.bg.color,
                  borderWidth: 2,
                  borderColor: theme.accent.color,
                  borderRadius: 8,
                }}
              >
                <PixiLabel
                  text={copied ? '✓  Link copied!' : '⎘  Copy invite link'}
                  size="md"
                  weight="bold"
                  color={copied ? 'success' : 'accent'}
                  font="sans"
                />
              </layoutContainer>

              {/* Waiting indicator */}
              <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
                <PixiLabel text="⟳" size="sm" color="textMuted" font="sans" />
                <PixiLabel text="Waiting for friend..." size="sm" color="textMuted" font="sans" />
              </layoutContainer>
            </layoutContainer>
          )}
        </layoutContainer>
      )}

      {/* Join mode */}
      {mode === 'join' && (
        <layoutContainer layout={{ width: MODAL_W - 32, flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <PixiLabel text="Room Code" size="sm" color="textSecondary" font="sans" />
          <PixiPureTextInput
            value={joinCode}
            onChange={handleJoinCodeChange}
            onSubmit={handleJoin}
            placeholder="e.g. ABC123"
            width={MODAL_W - 32}
            height={36}
            fontSize={18}
            font="mono"
          />
          <PixiButton
            label={status === 'joining' ? 'Connecting...' : 'Join Room'}
            variant="primary"
            width={MODAL_W - 32}
            height={36}
            onClick={handleJoin}
            disabled={joinCode.trim().length < 6 || status === 'joining'}
            loading={status === 'joining'}
          />
          <layoutContainer
            eventMode="static"
            cursor="pointer"
            onPointerUp={() => setMode('pick')}
            layout={{ alignItems: 'center', marginTop: 2 }}
          >
            <PixiLabel text="← Back" size="sm" color="textMuted" font="sans" />
          </layoutContainer>
        </layoutContainer>
      )}
      </layoutContainer>
    </PixiModal>
  );
};
