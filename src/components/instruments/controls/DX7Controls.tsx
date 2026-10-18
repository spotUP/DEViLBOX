/**
 * DX7Controls - the Library tab of the DX7 editor: the voice that sounds (name editor), the searchable curated library,
 * the built-in presets, the factory patch banks and the SysEx file loader.
 *
 * Voice loads go through the instrument's `dx7` config (the store loads the bank into the firmware: libraryBank,
 * bank/program, vcedPreset) or straight into the synth for a SysEx file. A load clears `dx7.vced`, the knob edits made
 * on the previous voice. Only the keys a load sets are sent; the rest of the DX7 config stays as the store holds it.
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { CustomSelect } from '@components/common/CustomSelect';
import { Button } from '@components/ui/Button';
import { SectionLabel } from '@components/instruments/shared/SectionLabel';
import { DX7Synth, type DX7PatchManifest } from '../../../engine/dx7/DX7Synth';
import { getToneEngine } from '../../../engine/ToneEngine';
import { inspectDX7Sysex } from '../../../engine/dx7/dx7sysex';
import { fetchDX7LibraryManifest, type DX7LibraryManifest } from '../../../engine/dx7/dx7Library';
import { Dx7LibraryBrowser } from './Dx7LibraryBrowser';
import { Dx7VoiceNameField } from './Dx7VoiceNameField';

interface DX7ControlsProps {
  instrument: {
    id: number;
    synthType: string;
    dx7?: {
      bank?: number;
      program?: number;
      vcedPreset?: string;
      libraryBank?: string;
    };
  };
  onChange: (updates: Record<string, unknown>) => void;
  /** The name of the voice the firmware plays; empty until the engine answers. */
  voiceName?: string;
  onRename?: (name: string) => void;
}

const PANEL = 'border border-dark-border rounded p-2 flex flex-col gap-2';
const CELL_ON = 'bg-accent-primary/20 text-accent-primary border border-accent-primary/40';
const CELL_OFF = 'bg-dark-bgTertiary text-text-secondary border border-transparent hover:bg-dark-bgHover hover:text-text-primary';

export const DX7Controls: React.FC<DX7ControlsProps> = ({ instrument, onChange, voiceName = '', onRename }) => {
  const [manifest, setManifest] = useState<DX7PatchManifest | null>(null);
  const [selectedBank, setSelectedBank] = useState(instrument.dx7?.bank ?? 0);
  const [selectedVoice, setSelectedVoice] = useState(instrument.dx7?.program ?? 0);
  const [library, setLibrary] = useState<DX7LibraryManifest | null>(null);
  const [importStatus, setImportStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const synthRef = useRef<DX7Synth | null>(null);

  useEffect(() => {
    const cached = DX7Synth.getPatchManifest();
    if (cached) setManifest(cached);
    else DX7Synth.fetchPatchManifest().then(m => { if (m) setManifest(m); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchDX7LibraryManifest().then(m => { if (!cancelled && m) setLibrary(m); });
    return () => { cancelled = true; };
  }, []);

  // Create the synth when the editor opens (the first note would otherwise create it) and cache the reference.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const engine = getToneEngine();
        await engine.ensureInstrumentReady(instrument as never);
        if (cancelled) return;
        const synth = engine.instruments.get(engine.getInstrumentKey(instrument.id, -1));
        if (synth && 'loadSysex' in synth) synthRef.current = synth as unknown as DX7Synth;
      } catch (err) {
        console.warn('[DX7Controls] Failed to ensure synth ready:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [instrument.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const getSynth = useCallback((): DX7Synth | null => {
    if (synthRef.current) return synthRef.current;
    try {
      const engine = getToneEngine();
      for (const [k, v] of engine.instruments) {
        if ((k >>> 16) === instrument.id && v && 'loadSysex' in v) {
          synthRef.current = v as unknown as DX7Synth;
          return synthRef.current;
        }
      }
    } catch { /* engine not ready */ }
    return null;
  }, [instrument.id]);

  const bankOptions = useMemo(() => (manifest?.banks ?? []).map((b, i) => ({
    value: String(i),
    label: `${b.file.replace('.syx', '').toUpperCase()} - ${b.voices[0] || 'Unknown'}...`,
  })), [manifest]);
  const currentBank = manifest?.banks[selectedBank];

  // Factory patch bank + voice. The store loads it into the synth from the config change.
  const pickPatch = useCallback((bankIndex: number, voiceIndex: number) => {
    setLoading(true);
    setSelectedBank(bankIndex);
    setSelectedVoice(voiceIndex);
    onChange({ dx7: { bank: bankIndex, program: voiceIndex, vcedPreset: undefined, libraryBank: undefined, vced: undefined } });
    setLoading(false);
  }, [onChange]);

  const pickPreset = useCallback((name: string) => {
    onChange({ dx7: { vcedPreset: name, bank: undefined, program: undefined, libraryBank: undefined, vced: undefined } });
  }, [onChange]);

  const pickLibraryVoice = useCallback((file: string, index: number) => {
    setSelectedVoice(index);
    onChange({ dx7: { libraryBank: file, program: index, bank: undefined, vcedPreset: undefined, vced: undefined } });
  }, [onChange]);

  // File loading: one parser (inspectDX7Sysex) for bulk banks and single voices.
  const handleFile = useCallback(async (file: File) => {
    const data = new Uint8Array(await file.arrayBuffer());
    const found = inspectDX7Sysex(data);
    if (found.kind === 'unknown') {
      setImportStatus(`${file.name}: not a DX7 voice or 32-voice bank (${data.length} bytes)`);
      return;
    }
    // Every instance of this instrument (shared plus one per tracker channel) gets the file.
    const synths = getSynth() ? (getToneEngine().instancesOf(instrument.id).filter((v) => v && 'loadSysex' in v) as unknown as DX7Synth[]) : [];
    if (synths.length === 0) { setImportStatus('Synth not ready yet, try again in a moment'); return; }
    if (found.kind === 'bulk32' && found.bulkSysex) {
      for (const synth of synths) synth.loadSysex(found.bulkSysex.slice().buffer);
      const notes = [!found.checksumOk && 'checksum was wrong', found.repairs > 0 && `${found.repairs} out-of-range values clamped`].filter(Boolean);
      setImportStatus(notes.length ? `Loaded ${file.name} (${notes.join(', ')})` : `Loaded ${file.name} (32 voices)`);
    } else if (found.vced) {
      for (const synth of synths) synth._loadVcedData(new Uint8Array(found.vced));
      setImportStatus(`Loaded ${file.name} (single voice)`);
    }
    onChange({ dx7: { libraryBank: undefined, bank: undefined, vcedPreset: undefined, vced: undefined } });
  }, [getSynth, onChange, instrument.id]);

  const [presetNames, setPresetNames] = useState<string[]>([]);
  useEffect(() => {
    import('../../../engine/dx7/dx7presets').then(({ DX7_VCED_PRESETS }) => setPresetNames(DX7_VCED_PRESETS.map(p => p.name)));
  }, []);

  const libraryCurrent = instrument.dx7?.libraryBank ? { file: instrument.dx7.libraryBank, index: instrument.dx7.program ?? 0 } : null;
  const fromBank = !instrument.dx7?.vcedPreset && !instrument.dx7?.libraryBank;

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className={PANEL}>
        <SectionLabel label="Current Voice" color="var(--color-accent-primary)" />
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-accent-primary text-lg font-bold font-mono tracking-wide min-w-[10ch]">{voiceName || '...'}</div>
          {onRename && <Dx7VoiceNameField name={voiceName} onCommit={onRename} />}
          {loading && <span className="text-text-muted animate-pulse text-[10px]">Loading...</span>}
        </div>
        <div className="text-text-muted text-[10px] font-mono">
          {libraryCurrent ? `Library voice ${libraryCurrent.index + 1} of 32` : instrument.dx7?.vcedPreset ? 'Built-in preset' : currentBank ? `Patch bank ${currentBank.file.replace('.syx', '').toUpperCase()}, voice ${selectedVoice + 1} of 32` : 'Voice from the instrument'}
        </div>
      </div>

      {library && (
        <div className={PANEL}>
          <SectionLabel label={`Library (${library.banks.length} banks, ${library.banks.reduce((n, b) => n + b.voices.length, 0)} voices)`} color="var(--color-accent-primary)" />
          <Dx7LibraryBrowser library={library} current={libraryCurrent} onPick={pickLibraryVoice} />
        </div>
      )}

      {presetNames.length > 0 && (
        <div className={PANEL}>
          <SectionLabel label="Built-in Presets" color="var(--color-accent-primary)" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-1">
            {presetNames.map(name => (
              <button
                key={name}
                type="button"
                onClick={() => pickPreset(name)}
                title={name}
                className={`px-2 py-1 text-[10px] font-mono rounded truncate transition-colors ${instrument.dx7?.vcedPreset === name ? CELL_ON : CELL_OFF}`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {manifest && (
        <div className={PANEL}>
          <SectionLabel label={`Factory Patch Banks (${manifest.banks.length} banks, ${manifest.banks.length * 32} voices)`} color="var(--color-accent-primary)" />
          <CustomSelect
            value={String(selectedBank)}
            onChange={(v) => pickPatch(Number(v), 0)}
            options={bankOptions}
            className="w-full bg-dark-bgTertiary text-text-primary border border-dark-borderLight rounded px-2 py-1 text-[10px] font-mono"
          />
          {currentBank && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-1">
              {currentBank.voices.map((name, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickPatch(selectedBank, i)}
                  title={`${i + 1}. ${name}`}
                  className={`px-1.5 py-1 text-[10px] font-mono rounded truncate text-left transition-colors ${selectedVoice === i && fromBank ? CELL_ON : CELL_OFF}`}
                >
                  <span className="text-text-muted mr-1">{i + 1}.</span>{name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className={`${PANEL} border-dashed`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void handleFile(file); }}
      >
        <SectionLabel label="SysEx File" color="var(--color-accent-primary)" />
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>Load SysEx File</Button>
          <span className="text-text-muted text-[10px] font-mono">{importStatus || 'A 32-voice bulk dump or a single-voice dump; drop a file here too'}</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".syx,.SYX"
          data-testid="dx7-sysex-input"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleFile(file); e.target.value = ''; }}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
};

export default DX7Controls;
