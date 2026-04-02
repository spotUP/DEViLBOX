/**
 * PixiClearProjectDialog — GL-native clear project dialog matching DOM FT2Toolbar's
 * 5-option modal: Clear Instruments, Clear Song Data, Clear Both, Reset to Defaults, Cancel.
 */

import { useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiButton } from '../components';
import { useTransportStore, useTrackerStore, useInstrumentStore, useAutomationStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';
import { clearSavedProject } from '@hooks/useProjectPersistence';
import { notify } from '@stores/useNotificationStore';

interface PixiClearProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PixiClearProjectDialog: React.FC<PixiClearProjectDialogProps> = ({ isOpen, onClose }) => {
  const isPlaying = useTransportStore(s => s.isPlaying);
  const stop = useTransportStore(s => s.stop);

  const stopPlayback = useCallback(() => {
    if (isPlaying) {
      stop();
    }
    getToneEngine().releaseAll();
  }, [isPlaying, stop]);

  const handleClearInstruments = useCallback(() => {
    stopPlayback();
    useInstrumentStore.getState().reset();
    onClose();
    notify.success('Instruments cleared');
  }, [stopPlayback, onClose]);

  const handleClearSongData = useCallback(() => {
    stopPlayback();
    useTrackerStore.getState().reset();
    onClose();
    notify.success('Song data cleared');
  }, [stopPlayback, onClose]);

  const handleClearBoth = useCallback(() => {
    stopPlayback();
    useInstrumentStore.getState().reset();
    useTrackerStore.getState().reset();
    onClose();
    notify.success('Project cleared');
  }, [stopPlayback, onClose]);

  const handleResetDefaults = useCallback(() => {
    stopPlayback();
    useInstrumentStore.getState().reset();
    useTrackerStore.getState().reset();
    useTransportStore.getState().reset();
    useAutomationStore.getState().reset();
    void clearSavedProject();
    onClose();
    notify.success('Reset to defaults');
  }, [stopPlayback, onClose]);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={300} height={290}>
      <PixiModalHeader title="Clear Project" onClose={onClose} />

      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 8 }}>
        <PixiButton label="Clear Instruments" variant="default" size="sm" onClick={handleClearInstruments}
          layout={{ width: '100%' }} />
        <PixiButton label="Clear Song Data" variant="default" size="sm" onClick={handleClearSongData}
          layout={{ width: '100%' }} />
        <PixiButton label="Clear Both" variant="default" size="sm" onClick={handleClearBoth}
          layout={{ width: '100%' }} />
        <PixiButton label="Reset to Defaults" variant="danger" size="sm" onClick={handleResetDefaults}
          layout={{ width: '100%' }} />
        <PixiButton label="Cancel" variant="ghost" size="sm" onClick={onClose}
          layout={{ width: '100%' }} />
      </layoutContainer>
    </PixiModal>
  );
};
