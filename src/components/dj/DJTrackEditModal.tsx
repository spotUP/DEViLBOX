import React, { useState, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';

interface DJTrackEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlistId: string;
  trackIndex: number;
  track: PlaylistTrack;
}

export const DJTrackEditModal: React.FC<DJTrackEditModalProps> = ({
  isOpen,
  onClose,
  playlistId,
  trackIndex,
  track,
}) => {
  const updateTrackMeta = useDJPlaylistStore((s) => s.updateTrackMeta);

  const [trackName, setTrackName] = useState(track.trackName);
  const [bpm, setBpm] = useState(track.bpm.toString());
  const [musicalKey, setMusicalKey] = useState(track.musicalKey || '');
  const [energy, setEnergy] = useState(Math.round((track.energy ?? 0) * 100).toString());

  const handleSave = useCallback(() => {
    updateTrackMeta(playlistId, trackIndex, {
      trackName,
      bpm: parseFloat(bpm) || 0,
      musicalKey: musicalKey || undefined,
      energy: (parseInt(energy, 10) || 0) / 100,
    });
    onClose();
  }, [playlistId, trackIndex, trackName, bpm, musicalKey, energy, updateTrackMeta, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} onConfirm={handleSave} size="sm">
      <div className="flex flex-col gap-3 p-4">
        <h3 className="text-sm font-mono font-bold text-text-primary">Edit Track Info</h3>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-mono text-text-muted">Track Name</span>
          <input
            value={trackName}
            onChange={(e) => setTrackName(e.target.value)}
            className="px-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight rounded text-text-primary"
            autoFocus
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[10px] font-mono text-text-muted">BPM</span>
            <input
              type="number"
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              min={0}
              max={999}
              step={0.1}
              className="px-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight rounded text-text-primary"
            />
          </label>

          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[10px] font-mono text-text-muted">Key (Camelot)</span>
            <input
              value={musicalKey}
              onChange={(e) => setMusicalKey(e.target.value)}
              placeholder="e.g. 8B"
              className="px-2 py-1.5 text-xs font-mono bg-dark-bg border border-dark-borderLight rounded text-text-primary placeholder:text-text-muted/30"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-mono text-text-muted">Energy (0-100)</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={energy}
              onChange={(e) => setEnergy(e.target.value)}
              className="flex-1 accent-accent-primary"
            />
            <span className="text-xs font-mono text-text-secondary w-8 text-right">{energy}</span>
          </div>
        </label>

        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text-primary bg-dark-bgTertiary border border-dark-borderLight rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs font-mono text-dark-bg bg-accent-primary hover:bg-accent-primaryHover rounded font-bold transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
};
