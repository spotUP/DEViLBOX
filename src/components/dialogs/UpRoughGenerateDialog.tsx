/**
 * UpRoughGenerateDialog - generate an Up Rough song on the server (the Up Rough
 * host's own generator) and load it into the tracker.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { useTrackerStore } from '@stores';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { useDialogKeyboard } from '@hooks/useDialogKeyboard';
import { fetchStyles, generateSong } from '@/lib/uprough/generateClient';

export interface UpRoughGenerateDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const KEY_PATTERN = /^[A-G][#b]?m?$/;

export const UpRoughGenerateDialog: React.FC<UpRoughGenerateDialogProps> = ({ isOpen, onClose }) => {
  const [styles, setStyles] = useState<string[]>([]);
  const [style, setStyle] = useState('');
  const [seed, setSeed] = useState(1);
  const [key, setKey] = useState('Am');
  // Empty = the whole song; the generator scales its arrangement to a count.
  const [bars, setBars] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const ac = new AbortController();
    setError(null);
    fetchStyles(ac.signal)
      .then((list) => {
        setStyles(list);
        setStyle((current) => (current && list.includes(current) ? current : (list[0] ?? '')));
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => ac.abort();
  }, [isOpen]);

  const seedValid = Number.isInteger(seed) && seed >= 0 && seed <= 9999;
  const keyValid = KEY_PATTERN.test(key);
  const barsCount = bars.trim() === '' ? undefined : Number(bars);
  const barsValid = barsCount === undefined || (Number.isInteger(barsCount) && barsCount >= 1 && barsCount <= 999);
  const canGenerate = !busy && !!style && seedValid && keyValid && barsValid;

  const handleCancel = () => {
    abortRef.current?.abort();
    onClose();
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    try {
      const text = await generateSong({ style, seed, key, ...(barsCount !== undefined && { bars: barsCount }) }, ac.signal);
      await useTrackerStore.getState().importUpRoughSong(text);
      setBusy(false);
      onClose();
    } catch (e) {
      setBusy(false);
      if (!ac.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    }
  };

  const { shortcuts } = useDialogKeyboard({
    isOpen,
    onConfirm: handleGenerate,
    onCancel: handleCancel,
    confirmDisabled: !canGenerate,
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      size="sm"
      theme="modern"
      backdropOpacity="medium"
      closeOnBackdropClick={!busy}
      closeOnEscape={true}
    >
      <ModalHeader
        title="Generate Up Rough Song"
        icon={<Wand2 size={18} />}
        onClose={handleCancel}
        theme="modern"
      />

      <div className="p-4 space-y-4">
        <p className="text-xs text-text-muted">
          Generate a song with the Up Rough generator. It plays the same on the device as it does here.
        </p>

        <div>
          <label htmlFor="uprough-style" className="block text-xs text-text-muted mb-1">Style</label>
          <select
            id="uprough-style"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            disabled={busy}
            className="w-full bg-dark-bg text-text-secondary rounded p-2 text-xs"
          >
            {styles.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="uprough-seed" className="block text-xs text-text-muted mb-1">Seed (0 to 9999)</label>
          <input
            id="uprough-seed"
            type="number"
            min={0}
            max={9999}
            step={1}
            value={seed}
            onChange={(e) => setSeed(e.target.valueAsNumber)}
            disabled={busy}
            className="w-full bg-dark-bg text-text-secondary rounded p-2 text-xs"
          />
          {!seedValid && <p className="text-xs text-accent-warning mt-1">Seed must be a whole number from 0 to 9999.</p>}
        </div>

        <div>
          <label htmlFor="uprough-key" className="block text-xs text-text-muted mb-1">Key</label>
          <input
            id="uprough-key"
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={busy}
            className="w-full bg-dark-bg text-text-secondary rounded p-2 text-xs"
          />
          {!keyValid && <p className="text-xs text-accent-warning mt-1">Key looks like Am, C or F#m.</p>}
        </div>

        <div>
          <label htmlFor="uprough-bars" className="block text-xs text-text-muted mb-1">Bars (empty for the whole song)</label>
          <input
            id="uprough-bars"
            type="number"
            min={1}
            max={999}
            step={1}
            value={bars}
            onChange={(e) => setBars(e.target.value)}
            disabled={busy}
            className="w-full bg-dark-bg text-text-secondary rounded p-2 text-xs"
          />
          {!barsValid && <p className="text-xs text-accent-warning mt-1">Bars must be a whole number from 1 to 999.</p>}
        </div>

        {error && <p role="alert" className="text-xs text-accent-warning">{error}</p>}
      </div>

      <ModalFooter theme="modern" align="right">
        <Button variant="ghost" onClick={handleCancel}>
          Cancel {shortcuts.cancel && <span className="text-xs opacity-70 ml-2">{shortcuts.cancel}</span>}
        </Button>
        <Button variant="primary" onClick={handleGenerate} disabled={!canGenerate}>
          {busy ? 'Generating...' : 'Generate'}
        </Button>
      </ModalFooter>
    </Modal>
  );
};
