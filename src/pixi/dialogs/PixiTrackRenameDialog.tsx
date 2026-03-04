/**
 * PixiTrackRenameDialog — GL-native rename overlay for arrangement track headers.
 * Triggered by double-clicking a track header name.
 */

import { useState, useEffect, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton } from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { useArrangementStore } from '@stores/useArrangementStore';

function resolveTrackName(trackId: string): string {
  const track = useArrangementStore.getState().tracks.find(t => t.id === trackId);
  return track?.name || '';
}

export const PixiTrackRenameDialog: React.FC = () => {
  const renamingTrackId = useArrangementStore(s => s.renamingTrackId);
  const setRenamingTrackId = useArrangementStore(s => s.setRenamingTrackId);

  const [name, setName] = useState('');

  useEffect(() => {
    if (renamingTrackId) {
      setName(resolveTrackName(renamingTrackId));
    }
  }, [renamingTrackId]);

  const cancel = useCallback(() => setRenamingTrackId(null), [setRenamingTrackId]);

  const commit = useCallback(() => {
    if (renamingTrackId) {
      const trimmed = name.trim();
      if (trimmed) {
        useArrangementStore.getState().updateTrack(renamingTrackId, { name: trimmed });
      }
    }
    setRenamingTrackId(null);
  }, [renamingTrackId, name, setRenamingTrackId]);

  if (!renamingTrackId) return null;

  return (
    <PixiModal isOpen={!!renamingTrackId} onClose={cancel} width={300} height={160}>
      <PixiModalHeader title="Rename Track" onClose={cancel} />
      <layoutContainer layout={{ flex: 1, padding: 16 }}>
        <PixiPureTextInput value={name} onChange={setName} onSubmit={commit} onCancel={cancel} width={268} height={28} />
      </layoutContainer>
      <PixiModalFooter>
        <PixiButton label="Cancel" variant="ghost" onClick={cancel} />
        <PixiButton label="Rename" variant="primary" onClick={commit} />
      </PixiModalFooter>
    </PixiModal>
  );
};
