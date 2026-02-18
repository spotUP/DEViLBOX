/**
 * AmigaPalModal - 1:1 port of AmigaPal UI
 *
 * Multi-sample batch processor with per-sample controls:
 * - Waveform display with trim range
 * - Lo Cut / Hi Cut filters (40-20000 Hz)
 * - Limiter (Threshold -60-0 dB, Gain 0-100)
 * - ProTracker note (C-1 to B-3)
 *
 * Reference: /Users/spot/Code/DEViLBOX/Reference Code/AmigaPal-master/src/index.html
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, FolderOpen, Folder, Trash2, Random, Copy } from 'lucide-react';
import type { ProcessedResult } from '@utils/audio/SampleProcessing';

// ProTracker notes (C-1 to B-3, 36 notes total)
const PT_NOTES = [
  { note: 'C-1', rate: 4143 },
  { note: 'C#1', rate: 4389 },
  { note: 'D-1', rate: 4649 },
  { note: 'D#1', rate: 4926 },
  { note: 'E-1', rate: 5219 },
  { note: 'F-1', rate: 5529 },
  { note: 'F#1', rate: 5858 },
  { note: 'G-1', rate: 6207 },
  { note: 'G#1', rate: 6577 },
  { note: 'A-1', rate: 6969 },
  { note: 'A#1', rate: 7384 },
  { note: 'B-1', rate: 7822 },
  { note: 'C-2', rate: 8286 },
  { note: 'C#2', rate: 8777 },
  { note: 'D-2', rate: 9298 },
  { note: 'D#2', rate: 9852 },
  { note: 'E-2', rate: 10439 },
  { note: 'F-2', rate: 11058 },
  { note: 'F#2', rate: 11716 },
  { note: 'G-2', rate: 12415 },
  { note: 'G#2', rate: 13154 },
  { note: 'A-2', rate: 13938 },
  { note: 'A#2', rate: 14768 },
  { note: 'B-2', rate: 15645 },
  { note: 'C-3', rate: 16572 },
  { note: 'C#3', rate: 17555 },
  { note: 'D-3', rate: 18597 },
  { note: 'D#3', rate: 19704 },
  { note: 'E-3', rate: 20879 },
  { note: 'F-3', rate: 22116 },
  { note: 'F#3', rate: 23433 },
  { note: 'G-3', rate: 24831 },
  { note: 'G#3', rate: 26308 },
  { note: 'A-3', rate: 27928 }, // Default
  { note: 'A#3', rate: 29536 },
  { note: 'B-3', rate: 31388 },
];

interface SampleItem {
  id: string;
  buffer: AudioBuffer;
  filename: string;
  targetFilename: string;
  size: number;
  length: number;
  trimStart: number;
  trimEnd: number;
  loCutHz: number;
  hiCutHz: number;
  limiterEnabled: boolean;
  limiterThresh: number;
  limiterMakeup: number;
  ptNote: string;
  ptSampleRate: number;
}

interface AmigaPalModalProps {
  isOpen: boolean;
  onClose: () => void;
  buffer: AudioBuffer | null;
  onApply: (result: ProcessedResult) => void;
}

export const AmigaPalModal: React.FC<AmigaPalModalProps> = ({
  isOpen,
  onClose,
  buffer,
  onApply,
}) => {
  const [samples, setSamples] = useState<SampleItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [outputPath, setOutputPath] = useState('D:\\TESTSAMPLES\\OUT');
  const [outputDirSameAsSource, setOutputDirSameAsSource] = useState(false);
  const [globalSampleRate, setGlobalSampleRate] = useState(27920);
  const [globalPTNote, setGlobalPTNote] = useState('A-3');
  const [playbackVolume, setPlaybackVolume] = useState(50);
  const [previewOutput, setPreviewOutput] = useState(false);
  const [truncateFilenames, setTruncateFilenames] = useState(false);
  const [saveWav, setSaveWav] = useState(false);
  const [saveMod, setSaveMod] = useState(false);
  const [use128kb, setUse128kb] = useState(false);
  const [modTitle, setModTitle] = useState('AMIGAPAL_MOD');
  const [statusMsg, setStatusMsg] = useState('All is well');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Initialize with current buffer if provided
  useEffect(() => {
    if (isOpen && buffer && samples.length === 0) {
      const sampleItem: SampleItem = {
        id: Math.random().toString(36),
        buffer,
        filename: 'current_sample',
        targetFilename: 'current_sample.8svx',
        size: buffer.length * 2,
        length: buffer.duration,
        trimStart: 0,
        trimEnd: buffer.duration,
        loCutHz: 90,
        hiCutHz: 2663,
        limiterEnabled: false,
        limiterThresh: 0,
        limiterMakeup: 0,
        ptNote: 'A-3',
        ptSampleRate: 27920,
      };
      setSamples([sampleItem]);
      setSelectedIndex(0);
    }
  }, [isOpen, buffer]);

  // Draw waveform for each sample
  useEffect(() => {
    samples.forEach((sample) => {
      const canvas = canvasRefs.current.get(sample.id);
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = 420;
      const height = 60;
      canvas.width = width;
      canvas.height = height;

      ctx.clearRect(0, 0, width, height);

      // Draw pink/purple gradient waveform
      const channelData = sample.buffer.getChannelData(0);
      const step = Math.ceil(channelData.length / width);
      const amp = height / 2;

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#ff99cc'); // Pink
      gradient.addColorStop(1, '#9966cc'); // Purple

      ctx.fillStyle = gradient;
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1;

      ctx.beginPath();
      for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
          const datum = channelData[i * step + j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        const yMin = (1 + min) * amp;
        const yMax = (1 + max) * amp;
        ctx.fillRect(i, yMin, 1, Math.max(1, yMax - yMin));
      }
    });
  }, [samples]);

  const handleLoadFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // TODO: Load multiple audio files
  };

  const handleClearAll = () => {
    setSamples([]);
    setSelectedIndex(null);
  };

  const handleRemoveFile = (index: number) => {
    setSamples((prev) => prev.filter((_, i) => i !== index));
    if (selectedIndex === index) {
      setSelectedIndex(null);
    } else if (selectedIndex !== null && selectedIndex > index) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleConvertAll = async () => {
    if (samples.length === 0) return;

    // For now, just process the first sample and apply it
    const sample = samples[0];

    // TODO: Implement full processing pipeline matching renderer.js lines 750-900
    const result: ProcessedResult = {
      buffer: sample.buffer,
      dataUrl: '', // Will be generated during processing
    };

    onApply(result);
  };

  const handleSetAll = () => {
    setSamples((prev) =>
      prev.map((s) => ({
        ...s,
        ptSampleRate: globalSampleRate,
        ptNote: globalPTNote,
      }))
    );
  };

  const handleCopyLimiterToAll = (index: number) => {
    const source = samples[index];
    if (!source) return;
    setSamples((prev) =>
      prev.map((s) => ({
        ...s,
        limiterEnabled: source.limiterEnabled,
        limiterThresh: source.limiterThresh,
        limiterMakeup: source.limiterMakeup,
      }))
    );
  };

  const handleCopyLoCutToAll = (index: number) => {
    const source = samples[index];
    if (!source) return;
    setSamples((prev) => prev.map((s) => ({ ...s, loCutHz: source.loCutHz })));
  };

  const handleCopyHiCutToAll = (index: number) => {
    const source = samples[index];
    if (!source) return;
    setSamples((prev) => prev.map((s) => ({ ...s, hiCutHz: source.hiCutHz })));
  };

  const handleCopyPTNoteToAll = (index: number) => {
    const source = samples[index];
    if (!source) return;
    setSamples((prev) =>
      prev.map((s) => ({
        ...s,
        ptNote: source.ptNote,
        ptSampleRate: source.ptSampleRate,
      }))
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div
        className="w-full max-w-[600px] h-full bg-[#292c34] flex flex-col overflow-hidden text-white"
        style={{ fontFamily: 'monospace', fontSize: '13px' }}
      >
        {/* Title Bar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-black">
          <div className="text-sm">AmigaPal</div>
          <button onClick={onClose} className="hover:bg-white/10 p-1 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Global Options */}
        <div className="px-5 pt-11 pb-2.5 space-y-1">
          <div className="flex gap-2">
            {/* Left Column */}
            <div className="flex-1 space-y-1">
              {/* Output Path */}
              <div className="flex gap-1">
                <span className="bg-[#595c64] px-2 py-1 border border-[#232323] text-xs font-bold">
                  Out path
                </span>
                <input
                  type="text"
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  disabled={outputDirSameAsSource}
                  className="flex-1 bg-[#595c64] px-2 py-1 border border-[#232323] text-xs font-bold text-white outline-none disabled:bg-[#393c44]"
                />
                <button
                  className="bg-[#595c64] px-2 py-1 border border-[#232323] hover:bg-[#696c74]"
                  disabled={outputDirSameAsSource}
                >
                  <FolderOpen size={12} />
                </button>
                <button
                  className="bg-[#595c64] px-2 py-1 border border-[#232323] hover:bg-[#696c74]"
                  disabled={outputDirSameAsSource}
                >
                  <Folder size={12} />
                </button>
              </div>

              {/* Output dir same as source */}
              <button
                onClick={() => setOutputDirSameAsSource(!outputDirSameAsSource)}
                className={`w-full flex items-center gap-2 px-2 py-1 border border-[#232323] text-xs font-bold ${
                  outputDirSameAsSource ? 'bg-[#595c64]' : 'bg-[#393c44] text-gray-400'
                }`}
              >
                <span className="bg-[#595c64] px-1.5 border border-[#232323]">
                  {outputDirSameAsSource ? '✓' : '✕'}
                </span>
                Output dir same as source
              </button>

              {/* Sample rate */}
              <div className="flex gap-1 pt-2">
                <input
                  type="number"
                  value={globalSampleRate}
                  onChange={(e) => setGlobalSampleRate(Number(e.target.value))}
                  className="flex-1 bg-[#595c64] px-2 py-1 border border-[#232323] text-xs font-bold text-white outline-none"
                />
                <span className="bg-[#595c64] px-2 py-1 border border-[#232323] text-xs font-bold">
                  Sample rate (Hz)
                </span>
              </div>

              {/* ProTracker note + Set all */}
              <div className="flex gap-1">
                <select
                  value={globalPTNote}
                  onChange={(e) => setGlobalPTNote(e.target.value)}
                  className="flex-1 bg-[#595c64] px-2 py-1 border border-[#232323] text-xs font-bold text-white outline-none"
                >
                  {PT_NOTES.map((n) => (
                    <option key={n.note} value={n.note}>
                      {n.note}
                    </option>
                  ))}
                </select>
                <span className="bg-[#595c64] px-2 py-1 border border-[#232323] text-xs font-bold whitespace-nowrap">
                  Protracker note
                </span>
                <button
                  onClick={handleSetAll}
                  className="bg-[#595c64] px-2 py-1 border border-[#232323] text-xs font-bold hover:bg-[#696c74] whitespace-nowrap"
                >
                  Set all
                </button>
              </div>

              {/* Playback volume */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs">Playback volume</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={playbackVolume}
                  onChange={(e) => setPlaybackVolume(Number(e.target.value))}
                  className="flex-1"
                />
              </div>

              {/* Status */}
              <div className="pt-1 text-xs">
                <strong>
                  STATUS: <span style={{ color: '#ff99cc' }}>{statusMsg}</span>
                </strong>
              </div>
            </div>

            {/* Right Column */}
            <div className="w-[200px] space-y-1">
              {/* Preview output */}
              <button
                onClick={() => setPreviewOutput(!previewOutput)}
                className={`w-full flex items-center gap-2 px-2 py-1 border border-[#232323] text-xs font-bold ${
                  previewOutput ? 'bg-[#595c64]' : 'bg-[#393c44] text-gray-400'
                }`}
                title="When enabled, note playback renders the output so you can hear it exactly as it'll be saved to file"
              >
                <span className="bg-[#595c64] px-1.5 border border-[#232323]">
                  {previewOutput ? '✓' : '✕'}
                </span>
                Preview samplerate
              </button>

              {/* Truncate + WAV */}
              <div className="flex gap-1">
                <button
                  onClick={() => setTruncateFilenames(!truncateFilenames)}
                  className={`flex-1 flex items-center gap-1 px-2 py-1 border border-[#232323] text-xs font-bold ${
                    truncateFilenames ? 'bg-[#595c64]' : 'bg-[#393c44] text-gray-400'
                  }`}
                  title="Truncate output filename for better compatibility with old operating systems"
                >
                  <span className="bg-[#595c64] px-1 border border-[#232323]">
                    {truncateFilenames ? '✓' : '✕'}
                  </span>
                  Truncate
                </button>
                <button
                  onClick={() => setSaveWav(!saveWav)}
                  className={`flex-1 flex items-center gap-1 px-2 py-1 border border-[#232323] text-xs font-bold ${
                    saveWav ? 'bg-[#595c64]' : 'bg-[#393c44] text-gray-400'
                  }`}
                  title="Enable to export WAV rather than the default 8SVX"
                >
                  <span className="bg-[#595c64] px-1 border border-[#232323]">
                    {saveWav ? '✓' : '✕'}
                  </span>
                  WAV
                </button>
              </div>

              {/* Save MOD + 128kb */}
              <div className="flex gap-1">
                <button
                  onClick={() => setSaveMod(!saveMod)}
                  className={`flex-1 flex items-center gap-1 px-2 py-1 border border-[#232323] text-xs font-bold ${
                    saveMod ? 'bg-[#595c64]' : 'bg-[#393c44] text-gray-400'
                  }`}
                  title="Enable to create and save a blank Protracker module containing up to 31 of the currently loaded samples"
                >
                  <span className="bg-[#595c64] px-1 border border-[#232323]">
                    {saveMod ? '✓' : '✕'}
                  </span>
                  Save mod
                </button>
                <button
                  onClick={() => setUse128kb(!use128kb)}
                  disabled={!saveMod}
                  className={`flex-1 flex items-center gap-1 px-2 py-1 border border-[#232323] text-xs font-bold ${
                    use128kb ? 'bg-[#595c64]' : 'bg-[#393c44] text-gray-400'
                  } disabled:opacity-50`}
                  title="If creating and saving a Protracker mod, choose whether it should support 128kb sample size limit rather than 64kb"
                >
                  <span className="bg-[#595c64] px-1 border border-[#232323]">
                    {use128kb ? '✓' : '✕'}
                  </span>
                  12Ekb
                </button>
              </div>

              {/* Title */}
              <div className="flex gap-1">
                <span className="bg-[#595c64] px-2 py-1 border border-[#232323] text-xs font-bold">
                  Title
                </span>
                <input
                  type="text"
                  value={modTitle}
                  onChange={(e) => setModTitle(e.target.value)}
                  disabled={!saveMod}
                  maxLength={22}
                  placeholder="AMIGAPAL_MOD"
                  className="flex-1 bg-[#595c64] px-2 py-1 border border-[#232323] text-xs font-bold text-white outline-none disabled:bg-[#393c44]"
                  title="The title of the generated Protracker module, if 'Save mod' is enabled"
                />
              </div>

              {/* Load + Clear */}
              <div className="flex gap-1">
                <button
                  onClick={handleLoadFiles}
                  className="flex-1 bg-[#595c64] px-2 py-1 border border-[#232323] text-xs font-bold hover:bg-[#696c74] flex items-center justify-center gap-1"
                >
                  <FolderOpen size={12} /> Load
                </button>
                <button
                  onClick={handleClearAll}
                  className="flex-1 bg-[#595c64] px-2 py-1 border border-[#232323] text-xs font-bold hover:bg-[#696c74] flex items-center justify-center gap-1"
                >
                  <Trash2 size={12} /> Clear
                </button>
              </div>

              {/* Convert */}
              <button
                onClick={handleConvertAll}
                disabled={samples.length === 0}
                className="w-full bg-[#595c64] px-2 py-1 border border-[#232323] text-xs font-bold hover:bg-[#696c74] disabled:opacity-50 flex items-center justify-center gap-1 mt-1"
              >
                <Random size={12} /> Convert {samples.length}
              </button>
            </div>
          </div>
        </div>

        {/* Sample List or Drop Zone */}
        {samples.length === 0 ? (
          <div className="flex-1 mx-5 mb-5 border-8 border-dashed border-[#999] rounded flex items-center justify-center">
            <div className="text-center pb-24">
              <div className="text-base font-bold mb-4">DROP FILES OR FOLDERS HERE</div>
              <div className="text-4xl">⬇</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 pb-5" style={{ height: '603px' }}>
            {samples.map((sample, index) => {
              const isSelected = selectedIndex === index;

              return (
                <div
                  key={sample.id}
                  className={`py-1.5 ${index % 2 === 1 ? 'bg-[#393c44]' : ''} ${
                    isSelected ? 'shadow-[inset_0_0_0_1px_orange]' : ''
                  }`}
                  onClick={() => setSelectedIndex(index)}
                >
                  {/* Upper Section */}
                  <div className="flex gap-2">
                    {/* Left: File Info */}
                    <div className="w-[150px] text-xs space-y-0.5">
                      <div>
                        Target filename: <br />
                        <span className="font-light">{sample.targetFilename}</span>
                      </div>
                      <div>
                        size: <span className="font-light">{sample.size.toLocaleString()} b</span>
                      </div>
                      <div>
                        length: <span className="font-light">{sample.length.toFixed(2)} s</span>
                      </div>
                      <div className="flex gap-0.5 pt-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyLimiterToAll(index);
                          }}
                          className="bg-[#595c64] border border-[#232323] w-5 h-5 text-[10px] hover:bg-[#696c74]"
                          title="Copy Limiter settings to all other files"
                        >
                          <Copy size={10} className="mx-auto" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyLoCutToAll(index);
                          }}
                          className="bg-[#595c64] border border-[#232323] w-5 h-5 text-[10px] hover:bg-[#696c74]"
                          title="Copy Lo Cut settings to all other files"
                        >
                          <Copy size={10} className="mx-auto" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyHiCutToAll(index);
                          }}
                          className="bg-[#595c64] border border-[#232323] w-5 h-5 text-[10px] hover:bg-[#696c74]"
                          title="Copy Hi Cut settings to all other files"
                        >
                          <Copy size={10} className="mx-auto" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyPTNoteToAll(index);
                          }}
                          className="bg-[#595c64] border border-[#232323] w-5 h-5 text-[10px] hover:bg-[#696c74]"
                          title="Copy PT note to all other files"
                        >
                          <Copy size={10} className="mx-auto" />
                        </button>
                      </div>
                    </div>

                    {/* Right: Waveform */}
                    <div className="flex-1">
                      <div className="relative" style={{ width: '420px', height: '60px' }}>
                        <canvas
                          ref={(el) => {
                            if (el) canvasRefs.current.set(sample.id, el);
                          }}
                          className="absolute top-0 left-0"
                        />
                      </div>

                      {/* Filter Sliders */}
                      <div className="flex gap-4 mt-2" style={{ width: '420px' }}>
                        <div className="flex-1">
                          <input
                            type="range"
                            min="40"
                            max="20000"
                            value={sample.loCutHz}
                            onChange={(e) => {
                              const newVal = Number(e.target.value);
                              setSamples((prev) =>
                                prev.map((s, i) => (i === index ? { ...s, loCutHz: newVal } : s))
                              );
                            }}
                            className="w-full"
                            style={{ accentColor: '#fff' }}
                          />
                        </div>
                        <div className="flex-1">
                          <input
                            type="range"
                            min="40"
                            max="20000"
                            value={sample.hiCutHz}
                            onChange={(e) => {
                              const newVal = Number(e.target.value);
                              setSamples((prev) =>
                                prev.map((s, i) => (i === index ? { ...s, hiCutHz: newVal } : s))
                              );
                            }}
                            className="w-full"
                            style={{ accentColor: '#fff' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Lower Section */}
                  <div className="flex gap-2 mt-6">
                    {/* Limiter Button */}
                    <div className="w-[150px]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSamples((prev) =>
                            prev.map((s, i) =>
                              i === index ? { ...s, limiterEnabled: !s.limiterEnabled } : s
                            )
                          );
                        }}
                        className={`w-full px-2 py-1 border border-[#232323] text-xs font-bold ${
                          sample.limiterEnabled ? 'bg-[#595c64]' : 'bg-[#393c44] text-gray-400'
                        }`}
                      >
                        🔨 Limiter
                      </button>
                    </div>

                    {/* Filter Controls + Limiter Controls */}
                    <div className="flex-1 space-y-1">
                      {/* Lo Cut / Hi Cut Inputs */}
                      <div className="flex gap-4">
                        <div className="flex items-center gap-1 text-xs">
                          <span>Lo Cut:</span>
                          <input
                            type="number"
                            value={sample.loCutHz}
                            onChange={(e) => {
                              const newVal = Number(e.target.value);
                              setSamples((prev) =>
                                prev.map((s, i) => (i === index ? { ...s, loCutHz: newVal } : s))
                              );
                            }}
                            className="w-14 bg-[#595c64] border-0 rounded px-1 py-0.5 text-white text-[10px] outline-none"
                          />
                          <span>hz</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <span>Hi Cut:</span>
                          <input
                            type="number"
                            value={sample.hiCutHz}
                            onChange={(e) => {
                              const newVal = Number(e.target.value);
                              setSamples((prev) =>
                                prev.map((s, i) => (i === index ? { ...s, hiCutHz: newVal } : s))
                              );
                            }}
                            className="w-14 bg-[#595c64] border-0 rounded px-1 py-0.5 text-white text-[10px] outline-none"
                          />
                          <span>hz</span>
                        </div>
                      </div>

                      {/* Limiter Threshold + Gain */}
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2 text-xs flex-1">
                          <span className="whitespace-nowrap">Thrsh: {sample.limiterThresh}</span>
                          <input
                            type="range"
                            min="-60"
                            max="0"
                            value={sample.limiterThresh}
                            onChange={(e) => {
                              const newVal = Number(e.target.value);
                              setSamples((prev) =>
                                prev.map((s, i) =>
                                  i === index ? { ...s, limiterThresh: newVal } : s
                                )
                              );
                            }}
                            className="flex-1"
                          />
                        </div>
                        <div className="flex items-center gap-2 text-xs flex-1">
                          <span className="whitespace-nowrap">
                            Gn: {Math.round(sample.limiterMakeup / 4)}
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="400"
                            value={sample.limiterMakeup}
                            onChange={(e) => {
                              const newVal = Number(e.target.value);
                              setSamples((prev) =>
                                prev.map((s, i) =>
                                  i === index ? { ...s, limiterMakeup: newVal } : s
                                )
                              );
                            }}
                            className="flex-1"
                          />
                        </div>
                      </div>
                    </div>

                    {/* PT Note + Delete/Process */}
                    <div className="w-[120px] space-y-1">
                      <select
                        value={sample.ptNote}
                        onChange={(e) => {
                          const newNote = e.target.value;
                          const ptData = PT_NOTES.find((n) => n.note === newNote);
                          setSamples((prev) =>
                            prev.map((s, i) =>
                              i === index
                                ? { ...s, ptNote: newNote, ptSampleRate: ptData?.rate || 27920 }
                                : s
                            )
                          );
                        }}
                        className="w-full bg-[#595c64] px-2 py-1 border border-[#232323] text-xs font-bold text-white outline-none"
                      >
                        {PT_NOTES.map((n) => (
                          <option key={n.note} value={n.note}>
                            {n.note}
                          </option>
                        ))}
                      </select>

                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFile(index);
                          }}
                          className="flex-1 bg-[#595c64] px-2 py-1 border border-[#232323] hover:bg-[#696c74]"
                        >
                          <Trash2 size={12} className="mx-auto" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Process single item
                          }}
                          className="flex-1 bg-[#595c64] px-2 py-1 border border-[#232323] hover:bg-[#696c74]"
                        >
                          <Random size={12} className="mx-auto" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="audio/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
};
