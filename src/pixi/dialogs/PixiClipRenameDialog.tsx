/**
 * PixiClipRenameDialog — GL-native rename overlay for arrangement clips.
 * Triggered by F2 when a single clip is selected.
 */

import { useState, useEffect, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton } from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { useArrangementStore } from '@stores/useArrangementStore';
import { useTrackerStore } from '@stores';

function resolveClipName(clipId: string): string {
  const arr = useArrangementStore.getState();
  const clip = arr.clips.find(c => c.id === clipId);
  if (!clip) return '';
  if (clip.name) return clip.name;
  const ts = useTrackerStore.getState();
  const pat = ts.patterns.find(p => p.id === clip.patternId);
  return pat?.name || '';
}

export const PixiClipRenameDialog: React.FC = () => {
  const renamingClipId = useArrangementStore(s => s.renamingClipId);
  const setRenamingClipId = useArrangementStore(s => s.setRenamingClipId);
  const setClipName = useArrangementStore(s => s.setClipName);

  const [name, setName] = useState('');

  useEffect(() => {
    if (renamingClipId) {
      setName(resolveClipName(renamingClipId));
    }
  }, [renamingClipId]);

  const cancel = useCallback(() => setRenamingClipId(null), [setRenamingClipId]);

  const commit = useCallback(() => {
    if (renamingClipId) {
      setClipName(renamingClipId, name.trim());
    }
    setRenamingClipId(null);
  }, [renamingClipId, name, setClipName, setRenamingClipId]);

  return (
    <PixiModal isOpen={!!renamingClipId} onClose={cancel} width={300} height={160}>
      <PixiModalHeader title="Rename Clip" onClose={cancel} />
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
