/**
 * HivelyImportDialog — Pick instruments from a .hvl or .ahx song and import
 * them into the current song. Opened from the Hively editor header.
 */
import React, { useState } from 'react';
import { ListPlus } from 'lucide-react';
import type { HivelyConfig } from '@typedefs/instrument';
import { extractInstrumentsFromHvl } from '@lib/import/formats/HivelyParser';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { Toggle } from '@components/controls/Toggle';
import { PatchLoadButton } from './controls/PatchLoadButton';

interface HivelyImportEntry {
  name: string;
  config: HivelyConfig;
  selected: boolean;
}

export interface HivelyImportDialogProps {
  onClose: () => void;
  /** Called with the selected instruments in order; caller inserts them. */
  onImport: (instruments: Array<{ name: string; config: HivelyConfig }>) => void;
}

export const HivelyImportDialog: React.FC<HivelyImportDialogProps> = ({ onClose, onImport }) => {
  const [entries, setEntries] = useState<HivelyImportEntry[]>([]);
  const [filename, setFilename] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleFile = (buffer: ArrayBuffer, fileName: string) => {
    setFilename(fileName);
    try {
      const found = extractInstrumentsFromHvl(buffer);
      setEntries(found.map(i => ({ ...i, selected: false })));
      setError(null);
    } catch (err) {
      setEntries([]);
      setError(`Could not read file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const toggleAll = (selected: boolean) => {
    setEntries(prev => prev.map(e => ({ ...e, selected })));
  };

  const selectedCount = entries.filter(e => e.selected).length;

  const handleConfirm = () => {
    const selected = entries.filter(e => e.selected).map(({ name, config }) => ({ name, config }));
    if (selected.length > 0) onImport(selected);
    onClose();
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      onConfirm={handleConfirm}
      confirmDisabled={selectedCount === 0}
      size="sm"
      backdropOpacity="dark"
    >
      <ModalHeader
        title="Import Instruments"
        subtitle="From a HivelyTracker or AHX song"
        icon={<ListPlus size={18} />}
        onClose={onClose}
      />

      <div className="p-4 space-y-2">
        <PatchLoadButton synthType="HivelySynth" onLoad={handleFile} label="Choose Song" />

        {filename && !error && (
          <p className="text-[10px] font-mono text-text-muted">{filename}</p>
        )}

        {error && (
          <p className="text-[10px] font-mono text-accent-error">{error}</p>
        )}

        {entries.length > 0 && (
          <>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => toggleAll(true)}>Select All</Button>
              <Button variant="ghost" size="sm" onClick={() => toggleAll(false)}>Select None</Button>
            </div>
            <div className="max-h-52 overflow-y-auto border border-dark-border rounded divide-y divide-dark-border">
              {entries.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-2 px-2 py-1 hover:bg-dark-bgHover">
                  <Toggle
                    label={entry.name || 'Unnamed'}
                    hideLabel
                    size="sm"
                    value={entry.selected}
                    onChange={selected =>
                      setEntries(prev => prev.map((x, i) => (i === idx ? { ...x, selected } : x)))
                    }
                  />
                  <span className="text-[10px] font-mono text-text-muted w-5 shrink-0">
                    {(idx + 1).toString().padStart(2, '0')}
                  </span>
                  <span className="text-[10px] font-mono text-text-primary truncate">
                    {entry.name || '(unnamed)'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ModalFooter align="right">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleConfirm} disabled={selectedCount === 0}>
          Import{selectedCount > 0 ? ` (${selectedCount})` : ''}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

/** Hively editor header button: opens the dialog and adds each picked instrument to the song. */
export const HivelySongImportButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const handleImport = (instruments: Array<{ name: string; config: HivelyConfig }>) => {
    const { createInstrument } = useInstrumentStore.getState();
    for (const { name, config: hively } of instruments) {
      createInstrument({ name, synthType: 'HivelySynth', hively });
    }
  };
  return (
    <>
      <Button variant="default" size="sm" icon={<ListPlus size={14} />} onClick={() => setOpen(true)}>
        Import from Song
      </Button>
      {open && <HivelyImportDialog onClose={() => setOpen(false)} onImport={handleImport} />}
    </>
  );
};
