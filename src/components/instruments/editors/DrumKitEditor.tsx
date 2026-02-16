/**
 * DrumKitEditor - Visual editor for DrumKit instruments
 * Piano-roll style interface for mapping samples to MIDI notes
 *
 * Features:
 * - Visual piano keyboard (C0-C8, 96 notes)
 * - Drag-and-drop samples from instrument list
 * - Per-key parameter editing (pitch, volume, pan, fine tune)
 * - Multi-select for batch editing
 * - Color-coded mappings
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { InstrumentConfig, DrumKitConfig, DrumKitKeyMapping } from '@typedefs/instrument';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useShallow } from 'zustand/react/shallow';
import { Trash2, Volume2, Sliders, Music } from 'lucide-react';
import { getToneEngine } from '@engine/ToneEngine';
import * as Tone from 'tone';

interface DrumKitEditorProps {
  instrument: InstrumentConfig;
  onUpdate: (updates: Partial<InstrumentConfig>) => void;
}

// Piano key info (note names and black key positions)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_KEYS = [1, 3, 6, 8, 10]; // Indices of black keys in an octave

// Map MIDI note to note name
function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTE_NAMES[midi % 12];
  return `${note}${octave}`;
}

// Check if a note is a black key
function isBlackKey(midi: number): boolean {
  return BLACK_KEYS.includes(midi % 12);
}

// Generate color for a mapping (based on sample ID)
function getMappingColor(sampleId: string): string {
  const colors = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e',
  ];
  // Use sample ID hash to pick color
  let hash = 0;
  for (let i = 0; i < sampleId.length; i++) {
    hash = ((hash << 5) - hash) + sampleId.charCodeAt(i);
    hash = hash & hash;
  }
  return colors[Math.abs(hash) % colors.length];
}

export const DrumKitEditor: React.FC<DrumKitEditorProps> = ({ instrument, onUpdate }) => {
  const { instruments } = useInstrumentStore(useShallow(s => ({ instruments: s.instruments })));
  
  const drumKit = instrument.drumKit || { keymap: [], polyphony: 'poly', maxVoices: 8, noteCut: false };
  const [editingMapping, setEditingMapping] = useState<DrumKitKeyMapping | null>(null);
  const [showAddMapping, setShowAddMapping] = useState(false);
  const [newMappingNote, setNewMappingNote] = useState<number>(36); // C2
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sample instruments (for dropdown)
  const sampleInstruments = useMemo(() => {
    return instruments.filter(inst => inst.type === 'sample' && inst.sample?.url);
  }, [instruments]);

  // Find mapping for a given note
  const findMappingForNote = useCallback((note: number): DrumKitKeyMapping | undefined => {
    return drumKit.keymap.find(m => note >= m.noteStart && note <= m.noteEnd);
  }, [drumKit.keymap]);

  // Add new mapping
  const handleAddMapping = useCallback((sampleId: string, noteStart: number, noteEnd: number) => {
    const sampleInst = instruments.find(i => i.id.toString() === sampleId);
    if (!sampleInst || !sampleInst.sample) return;

    const newMapping: DrumKitKeyMapping = {
      id: `mapping-${Date.now()}-${Math.random()}`,
      noteStart,
      noteEnd,
      sampleId,
      sampleUrl: sampleInst.sample.url,
      sampleName: sampleInst.name,
      pitchOffset: 0,
      fineTune: 0,
      volumeOffset: 0,
      panOffset: 0,
    };

    const updatedKeymap = [...drumKit.keymap, newMapping];
    onUpdate({
      drumKit: {
        ...drumKit,
        keymap: updatedKeymap,
      },
    });

    setShowAddMapping(false);
    setEditingMapping(newMapping);
  }, [instruments, drumKit, onUpdate]);

  // Remove mapping
  const handleRemoveMapping = useCallback((mappingId: string) => {
    const updatedKeymap = drumKit.keymap.filter(m => m.id !== mappingId);
    onUpdate({
      drumKit: {
        ...drumKit,
        keymap: updatedKeymap,
      },
    });
    if (editingMapping?.id === mappingId) {
      setEditingMapping(null);
    }
  }, [drumKit, onUpdate, editingMapping]);

  // Update mapping parameters
  const handleUpdateMapping = useCallback((mappingId: string, updates: Partial<DrumKitKeyMapping>) => {
    const updatedKeymap = drumKit.keymap.map(m => 
      m.id === mappingId ? { ...m, ...updates } : m
    );
    onUpdate({
      drumKit: {
        ...drumKit,
        keymap: updatedKeymap,
      },
    });
    // Update editing mapping if it's the one being edited
    if (editingMapping?.id === mappingId) {
      setEditingMapping({ ...editingMapping, ...updates });
    }
  }, [drumKit, onUpdate, editingMapping]);

  // Preview note
  const handlePreviewNote = useCallback(async (note: number) => {
    try {
      await Tone.start();
      const engine = getToneEngine();
      // Ensure synth is ready (for WASM synths like FurnaceDispatch)
      await engine.ensureInstrumentReady(instrument);
      const noteName = midiToNoteName(note);
      const now = Tone.now();
      engine.triggerNoteAttack(instrument.id, noteName, now, 0.8, instrument);
      setTimeout(() => {
        engine.triggerNoteRelease(instrument.id, noteName, Tone.now(), instrument);
      }, 200);
    } catch (error) {
      console.warn('[DrumKitEditor] Preview failed:', error);
    }
  }, [instrument]);

  // Handle key click
  const handleKeyClick = useCallback((note: number) => {
    const mapping = findMappingForNote(note);
    if (mapping) {
      setEditingMapping(mapping);
      handlePreviewNote(note);
    } else {
      // No mapping - show add dialog
      setNewMappingNote(note);
      setShowAddMapping(true);
    }
  }, [findMappingForNote, handlePreviewNote]);

  // Update global drumkit settings
  const handleUpdateSettings = useCallback((updates: Partial<DrumKitConfig>) => {
    onUpdate({
      drumKit: {
        ...drumKit,
        ...updates,
      },
    });
  }, [drumKit, onUpdate]);

  // Scroll to middle C on mount
  useEffect(() => {
    if (scrollRef.current) {
      const middleC = 60; // C4
      const keyHeight = 32;
      scrollRef.current.scrollTop = (96 - middleC) * keyHeight - 200;
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-dark-bgSecondary">
      {/* Header */}
      <div className="flex-shrink-0 bg-dark-bgTertiary border-b border-dark-border p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Music size={18} className="text-accent-primary" />
            <h3 className="text-sm font-medium text-text-primary">DrumKit Editor</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span>{drumKit.keymap.length} mappings</span>
          </div>
        </div>

        {/* Global Settings */}
        <div className="flex items-center gap-4 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-text-muted">Polyphony:</span>
            <select
              value={drumKit.polyphony}
              onChange={(e) => handleUpdateSettings({ polyphony: e.target.value as 'poly' | 'mono' })}
              className="bg-dark-bgActive border border-dark-border rounded px-2 py-1 text-text-primary"
            >
              <option value="poly">Polyphonic</option>
              <option value="mono">Monophonic</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-text-muted">Max Voices:</span>
            <input
              type="number"
              min="1"
              max="16"
              value={drumKit.maxVoices}
              onChange={(e) => handleUpdateSettings({ maxVoices: parseInt(e.target.value) || 8 })}
              className="bg-dark-bgActive border border-dark-border rounded px-2 py-1 w-16 text-text-primary"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={drumKit.noteCut}
              onChange={(e) => handleUpdateSettings({ noteCut: e.target.checked })}
              className="rounded"
            />
            <span className="text-text-muted">Note Cut</span>
          </label>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Piano Roll */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-dark-bg">
          <div className="relative">
            {/* Render keys from C8 down to C0 (96 notes) */}
            {Array.from({ length: 96 }, (_, i) => 95 - i).map((note) => {
              const mapping = findMappingForNote(note);
              const isBlack = isBlackKey(note);
              const noteName = midiToNoteName(note);
              const octave = Math.floor(note / 12) - 1;
              const noteInOctave = note % 12;
              const isC = noteInOctave === 0;
              const mappingColor = mapping ? getMappingColor(mapping.sampleId) : undefined;

              return (
                <div
                  key={note}
                  onClick={() => handleKeyClick(note)}
                  className={`
                    relative flex items-center border-b border-dark-border cursor-pointer
                    transition-colors hover:bg-dark-bgHover
                    ${mapping ? 'bg-dark-bgTertiary' : 'bg-dark-bg'}
                    ${editingMapping?.id === mapping?.id ? 'ring-2 ring-accent-primary' : ''}
                    ${isC ? 'border-t-2 border-t-accent-primary/30' : ''}
                  `}
                  style={{
                    height: '32px',
                    backgroundColor: mapping && mappingColor ? `${mappingColor}22` : undefined,
                    borderLeft: mapping && mappingColor ? `4px solid ${mappingColor}` : undefined,
                  }}
                  title={mapping ? `${noteName}: ${mapping.sampleName}` : `${noteName}: No mapping`}
                >
                  {/* Note label */}
                  <div className="flex-shrink-0 w-16 px-2 flex items-center justify-between">
                    <span className={`text-xs font-mono ${isBlack ? 'text-text-muted' : 'text-text-secondary'}`}>
                      {noteName}
                    </span>
                    {isC && (
                      <span className="text-[9px] text-accent-primary/50 font-bold">C{octave}</span>
                    )}
                  </div>

                  {/* Mapping info */}
                  {mapping && (
                    <div className="flex-1 flex items-center gap-2 px-2 overflow-hidden">
                      <Volume2 size={12} className="flex-shrink-0 text-text-muted" />
                      <span className="text-xs text-text-primary truncate">{mapping.sampleName}</span>
                      {mapping.pitchOffset !== 0 && (
                        <span className="text-[10px] text-accent-primary">
                          {mapping.pitchOffset > 0 ? '+' : ''}{mapping.pitchOffset}st
                        </span>
                      )}
                      {mapping.volumeOffset !== 0 && (
                        <span className="text-[10px] text-blue-400">
                          {mapping.volumeOffset > 0 ? '+' : ''}{mapping.volumeOffset}dB
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Parameter Panel */}
        <div className="flex-shrink-0 w-80 bg-dark-bgTertiary border-l border-dark-border overflow-y-auto">
          {editingMapping ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-medium text-text-primary">Mapping Parameters</h4>
                <button
                  onClick={() => handleRemoveMapping(editingMapping.id)}
                  className="p-1 text-text-muted hover:text-accent-error transition-colors"
                  title="Remove mapping"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Sample info */}
              <div className="bg-dark-bg rounded p-3 space-y-2">
                <div className="text-xs text-text-muted">Sample</div>
                <div className="text-sm text-text-primary font-medium">{editingMapping.sampleName}</div>
                <div className="text-xs text-text-muted">
                  {midiToNoteName(editingMapping.noteStart)}
                  {editingMapping.noteEnd > editingMapping.noteStart && ` - ${midiToNoteName(editingMapping.noteEnd)}`}
                </div>
              </div>

              {/* Pitch Offset */}
              <div>
                <label className="text-xs text-text-muted mb-1 block">Pitch Offset (semitones)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="-48"
                    max="48"
                    value={editingMapping.pitchOffset}
                    onChange={(e) => handleUpdateMapping(editingMapping.id, { pitchOffset: parseInt(e.target.value) })}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min="-48"
                    max="48"
                    value={editingMapping.pitchOffset}
                    onChange={(e) => handleUpdateMapping(editingMapping.id, { pitchOffset: parseInt(e.target.value) || 0 })}
                    className="w-16 bg-dark-bgActive border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
                  />
                </div>
              </div>

              {/* Fine Tune */}
              <div>
                <label className="text-xs text-text-muted mb-1 block">Fine Tune (cents)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={editingMapping.fineTune}
                    onChange={(e) => handleUpdateMapping(editingMapping.id, { fineTune: parseInt(e.target.value) })}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min="-100"
                    max="100"
                    value={editingMapping.fineTune}
                    onChange={(e) => handleUpdateMapping(editingMapping.id, { fineTune: parseInt(e.target.value) || 0 })}
                    className="w-16 bg-dark-bgActive border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
                  />
                </div>
              </div>

              {/* Volume Offset */}
              <div>
                <label className="text-xs text-text-muted mb-1 block">Volume Offset (dB)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="0.5"
                    value={editingMapping.volumeOffset}
                    onChange={(e) => handleUpdateMapping(editingMapping.id, { volumeOffset: parseFloat(e.target.value) })}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min="-12"
                    max="12"
                    step="0.5"
                    value={editingMapping.volumeOffset}
                    onChange={(e) => handleUpdateMapping(editingMapping.id, { volumeOffset: parseFloat(e.target.value) || 0 })}
                    className="w-16 bg-dark-bgActive border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
                  />
                </div>
              </div>

              {/* Pan Offset */}
              <div>
                <label className="text-xs text-text-muted mb-1 block">Pan Offset</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={editingMapping.panOffset}
                    onChange={(e) => handleUpdateMapping(editingMapping.id, { panOffset: parseInt(e.target.value) })}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min="-100"
                    max="100"
                    value={editingMapping.panOffset}
                    onChange={(e) => handleUpdateMapping(editingMapping.id, { panOffset: parseInt(e.target.value) || 0 })}
                    className="w-16 bg-dark-bgActive border border-dark-border rounded px-2 py-1 text-xs text-text-primary"
                  />
                </div>
                <div className="text-[10px] text-text-muted mt-1">
                  L {' ←'} C {'→ '} R
                </div>
              </div>

              {/* Test button */}
              <button
                onClick={() => handlePreviewNote(editingMapping.noteStart)}
                className="w-full px-3 py-2 bg-accent-primary hover:bg-accent-primary/80 text-white rounded transition-colors text-sm"
              >
                Test Sample
              </button>
            </div>
          ) : showAddMapping ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-medium text-text-primary">Add Mapping</h4>
                <button
                  onClick={() => setShowAddMapping(false)}
                  className="text-xs text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="text-xs text-text-muted mb-2 block">Note: {midiToNoteName(newMappingNote)}</label>
              </div>

              <div>
                <label className="text-xs text-text-muted mb-2 block">Select Sample</label>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {sampleInstruments.map((inst) => (
                    <button
                      key={inst.id}
                      onClick={() => handleAddMapping(inst.id.toString(), newMappingNote, newMappingNote)}
                      className="w-full text-left px-3 py-2 bg-dark-bg hover:bg-dark-bgHover border border-dark-border rounded transition-colors"
                    >
                      <div className="text-xs text-text-primary">{inst.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 flex flex-col items-center justify-center h-full text-center">
              <Sliders size={48} className="text-text-muted mb-4" />
              <p className="text-sm text-text-muted">
                Click a key to edit its mapping
              </p>
              <p className="text-xs text-text-muted mt-2">
                or add a new sample mapping
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
