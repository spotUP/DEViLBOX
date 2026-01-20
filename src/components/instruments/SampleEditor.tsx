/**
 * SampleEditor - Professional multi-sample editor with waveform visualization
 * Supports managing a bank of samples for a single instrument
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  Trash2, ArrowLeftRight, Pencil, Plus, 
  ChevronUp, ChevronDown, List, FileAudio, RefreshCw
} from 'lucide-react';
import { useInstrumentStore } from '../../stores';
import type { InstrumentConfig } from '../../types/instrument';
import * as Tone from 'tone';
import { 
  resampleBuffer, normalizeBuffer, applyFade, 
  trimSilence, bufferToWaveDataUrl, crossfadeLoop
} from '../../utils/audioProcessing';

interface SampleEditorProps {
  instrument: InstrumentConfig;
  onChange?: (updates: Partial<InstrumentConfig>) => void;
}

export const SampleEditor: React.FC<SampleEditorProps> = ({ instrument, onChange }) => {
  const { updateInstrument: storeUpdateInstrument } = useInstrumentStore();

  const updateInstrument = useCallback((id: number, updates: Partial<InstrumentConfig>) => {
    if (onChange) onChange(updates);
    else storeUpdateInstrument(id, updates);
  }, [onChange, storeUpdateInstrument]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Tone.Player | null>(null);
  const animationRef = useRef<number | null>(null);

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [tool, setTool] = useState<'pointer' | 'pencil'>('pointer');
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [verticalZoom, setVerticalZoom] = useState(1);

  // Safely get sample bank
  const samples = instrument.samples || [];
  const selectedSample = samples[selectedIndex] || null;

  // Load audio buffer for selected sample
  useEffect(() => {
    if (!selectedSample?.url) { setAudioBuffer(null); return; }
    const loadBuffer = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(selectedSample.url);
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = await audioContext.decodeAudioData(arrayBuffer);
        setAudioBuffer(buffer);
        if (playerRef.current) playerRef.current.dispose();
        playerRef.current = new Tone.Player(selectedSample.url).toDestination();
      } catch (err) {
        console.error(err);
      } finally { setIsLoading(false); }
    };
    loadBuffer();
    return () => { playerRef.current?.dispose(); if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [selectedSample?.url]);

  // Waveform Drawing logic
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const midY = height / 2;

    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, width, height);

    const data = audioBuffer.getChannelData(0);
    const samplesCount = data.length;
    const samplesPerPixel = samplesCount / width;
    
    ctx.strokeStyle = 'var(--color-accent)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x < width; x++) {
      const sampleIndex = Math.floor(x * samplesPerPixel);
      const nextSampleIndex = Math.floor((x + 1) * samplesPerPixel);

      let min = 1;
      let max = -1;
      for (let i = sampleIndex; i < nextSampleIndex && i < samplesCount; i++) {
        const val = data[i];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      const minY = midY - min * midY * 0.85 * verticalZoom;
      const maxY = midY - max * midY * 0.85 * verticalZoom;

      if (x === 0) ctx.moveTo(x, minY);
      ctx.lineTo(x, minY);
      ctx.lineTo(x, maxY);
    }
    ctx.stroke();

    // Draw Markers if sample is selected
    if (selectedSample) {
      const drawMarker = (pct: number, color: string, label: string) => {
        const x = pct * width;
        ctx.strokeStyle = color;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = 'bold 9px monospace';
        ctx.fillText(label, x + 2, 10);
      };

      if (selectedSample.loopEnabled) {
        drawMarker(selectedSample.loopStart, '#3b82f6', 'L-START');
        drawMarker(selectedSample.loopEnd, '#3b82f6', 'L-END');
      }
    }

    // Playback position
    if (isPlaying && playbackPosition > 0) {
      const posX = playbackPosition * width;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(posX, 0);
      ctx.lineTo(posX, height);
      ctx.stroke();
    }
  }, [audioBuffer, verticalZoom, isPlaying, playbackPosition, selectedSample]);

  useEffect(() => { drawWaveform(); }, [drawWaveform]);

  // Handle updates to specific sample in bank
  const updateSelectedSample = useCallback((updates: any) => {
    const newSamples = [...samples];
    if (newSamples[selectedIndex]) {
      newSamples[selectedIndex] = { ...newSamples[selectedIndex], ...updates };
      updateInstrument(instrument.id, { samples: newSamples });
    }
  }, [samples, selectedIndex, instrument.id, updateInstrument]);

  // Destructive Processors
  const processSample = async (processor: (buf: AudioBuffer) => AudioBuffer) => {
    if (!audioBuffer) return;
    const newBuffer = processor(audioBuffer);
    const dataUrl = await bufferToWaveDataUrl(newBuffer);
    setAudioBuffer(newBuffer);
    updateSelectedSample({ url: dataUrl });
  };

  // Canvas Interactions (Pencil Tool)
  const handleMouseDown = (_e: React.MouseEvent) => {
    if (tool === 'pencil' && audioBuffer) setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !audioBuffer || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - ((e.clientY - rect.top) / rect.height) * 2; // -1 to 1
    
    const data = audioBuffer.getChannelData(0);
    const idx = Math.floor(x * data.length);
    if (idx >= 0 && idx < data.length) {
      data[idx] = y / verticalZoom;
      drawWaveform();
    }
  };

  const handleMouseUp = async () => {
    if (isDrawing && audioBuffer) {
      setIsDrawing(false);
      const dataUrl = await bufferToWaveDataUrl(audioBuffer);
      updateSelectedSample({ url: dataUrl });
    }
  };

  // Handle file upload (supports multiple)
  const handleFilesSelect = useCallback(async (files: FileList) => {
    setIsLoading(true);
    const newSamples = [...samples];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('audio/') && !file.name.match(/\.(wav|mp3|ogg|flac|webm)$/i)) continue;
      
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newSamples.push({
          url: dataUrl,
          name: file.name,
          loopEnabled: false,
          loopStart: 0,
          loopEnd: 1,
          loopMode: 'forward',
          baseNote: 'C4',
          fineTune: 0,
          volume: 64,
          pan: 128
        });
      } catch (err) { console.error(err); }
    }

    updateInstrument(instrument.id, { samples: newSamples });
    setIsLoading(false);
  }, [instrument.id, samples, updateInstrument]);

  const removeSample = (idx: number) => {
    const newSamples = samples.filter((_, i) => i !== idx);
    updateInstrument(instrument.id, { samples: newSamples });
    if (selectedIndex >= newSamples.length) setSelectedIndex(Math.max(0, newSamples.length - 1));
  };

  const handlePlay = async () => {
    if (!playerRef.current || !audioBuffer) return;
    await Tone.start();

    if (isPlaying) {
      playerRef.current.stop();
      setIsPlaying(false);
      setPlaybackPosition(0);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    playerRef.current.start();
    setIsPlaying(true);

    const startToneTime = Tone.now();
    const animate = () => {
      const elapsed = Tone.now() - startToneTime;
      const progress = (elapsed / audioBuffer.duration);
      if (progress >= 1) { setIsPlaying(false); setPlaybackPosition(0); return; }
      setPlaybackPosition(progress);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
  };

  return (
    <div className="flex flex-col gap-4 font-mono h-[320px]">
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sample List Sidebar */}
        <div className="w-48 bg-dark-bgSecondary border border-dark-border rounded-md flex flex-col overflow-hidden">
          <div className="p-2 border-b border-dark-border bg-dark-bgTertiary flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-text-muted flex items-center gap-1">
              <List size={12} /> Bank ({samples.length})
            </span>
            <button 
              onClick={() => document.getElementById('bulk-sample-input')?.click()}
              className="p-1 hover:bg-white/10 rounded transition-colors text-accent-primary"
            >
              <Plus size={14} />
            </button>
            <input 
              id="bulk-sample-input" type="file" multiple accept="audio/*" className="hidden" 
              onChange={(e) => e.target.files && handleFilesSelect(e.target.files)} 
            />
          </div>
          
          <div className="flex-1 overflow-y-auto scrollbar-modern">
            {samples.length === 0 ? (
              <div className="p-4 text-center space-y-2 opacity-30">
                <FileAudio size={24} className="mx-auto" />
                <p className="text-[8px] uppercase">No samples</p>
              </div>
            ) : (
              samples.map((s, i) => (
                <div 
                  key={i}
                  onClick={() => setSelectedIndex(i)}
                  className={`group flex items-center gap-2 px-2 py-1.5 cursor-pointer border-b border-dark-border/50 transition-colors ${selectedIndex === i ? 'bg-accent-primary/20 text-accent-primary' : 'hover:bg-white/5 text-text-secondary'}`}
                >
                  <span className="text-[9px] font-bold opacity-50 w-4">{i + 1}</span>
                  <span className="text-[10px] truncate flex-1">{s.name}</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeSample(i); }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-accent-error transition-all"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {/* Waveform Toolbar */}
          <div className="flex items-center gap-1 bg-dark-bgTertiary p-1 border border-dark-border rounded-t-md">
            <button onClick={() => processSample(normalizeBuffer)} className="px-2 py-1 hover:bg-white/10 rounded text-[10px] uppercase font-bold text-text-primary transition-colors">Norm</button>
            <button onClick={() => processSample(trimSilence)} className="px-2 py-1 hover:bg-white/10 rounded text-[10px] uppercase font-bold text-text-primary transition-colors">Trim</button>
            <button onClick={() => processSample(b => applyFade(b, 'in', 0))} className="px-2 py-1 hover:bg-white/10 rounded text-[10px] uppercase font-bold text-text-primary transition-colors">FadeIn</button>
            <button onClick={() => processSample(b => applyFade(b, 'out', 0.9))} className="px-2 py-1 hover:bg-white/10 rounded text-[10px] uppercase font-bold text-text-primary transition-colors">FadeOut</button>
            <button 
              onClick={() => selectedSample && processSample(b => crossfadeLoop(b, selectedSample.loopStart, 50))} 
              className="px-2 py-1 hover:bg-white/10 rounded text-[10px] uppercase font-bold text-text-primary transition-colors flex items-center gap-1"
              title="Smooth loop with 50ms crossfade"
            >
              <RefreshCw size={10} /> X-Fade
            </button>
            <div className="w-px h-4 bg-dark-border mx-1" />
            <button onClick={() => setTool('pointer')} className={`p-1.5 rounded transition-colors ${tool === 'pointer' ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-muted hover:bg-white/10'}`}><ArrowLeftRight size={14} /></button>
            <button onClick={() => setTool('pencil')} className={`p-1.5 rounded transition-colors ${tool === 'pencil' ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-muted hover:bg-white/10'}`}><Pencil size={14} /></button>
            <div className="flex-1" />
            <button onClick={() => setVerticalZoom(v => v * 1.5)} className="p-1.5 text-text-muted hover:bg-white/10 rounded transition-colors"><ChevronUp size={14} /></button>
            <button onClick={() => setVerticalZoom(v => v / 1.5)} className="p-1.5 text-text-muted hover:bg-white/10 rounded transition-colors"><ChevronDown size={14} /></button>
            <button onClick={() => setVerticalZoom(1)} className="px-2 py-1 text-text-muted hover:bg-white/10 rounded text-[10px] font-bold transition-colors">1x</button>
          </div>

          {/* Waveform Display */}
          <div 
            className={`relative border-2 border-dark-border bg-dark-bg flex-1 overflow-hidden transition-colors ${isDragging ? 'border-dashed border-accent-primary' : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) handleFilesSelect(e.dataTransfer.files); }}
          >
            <canvas ref={canvasRef} width={1120} height={360} className={`w-full h-full ${tool === 'pencil' ? 'cursor-crosshair' : 'cursor-default'}`} style={{ imageRendering: 'pixelated' }} />
            {isLoading && (
              <div className="absolute inset-0 bg-dark-bg/60 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full" />
              </div>
            )}
            {!selectedSample && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                <div className="text-center">
                  <FileAudio size={48} className="mx-auto mb-2" />
                  <p className="text-xs uppercase font-bold tracking-widest">Drop audio files here</p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Controls */}
          {selectedSample && (
            <div className="grid grid-cols-3 gap-2 bg-dark-bgSecondary p-2 border border-dark-border rounded-md">
              <div className="space-y-1">
                <label className="text-[9px] text-text-muted uppercase block font-bold">Loop Mode</label>
                <div className="flex gap-1">
                  {['off', 'forward', 'ping-pong'].map(m => (
                    <button 
                      key={m}
                      onClick={() => {
                        if (m === 'off') updateSelectedSample({ loopEnabled: false });
                        else updateSelectedSample({ loopEnabled: true, loopMode: m });
                      }}
                      className={`flex-1 text-[8px] py-1 border border-dark-border rounded uppercase transition-colors ${
                        (m === 'off' ? !selectedSample.loopEnabled : (selectedSample.loopEnabled && selectedSample.loopMode === m)) ? 'bg-accent-primary text-text-inverse' : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-bgHover'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] text-text-muted uppercase block font-bold">Quick Process</label>
                <div className="flex gap-1">
                  <button onClick={() => processSample(b => resampleBuffer(b, 0.5))} className="flex-1 bg-dark-bgTertiary border border-dark-border rounded text-[8px] py-1 uppercase text-text-secondary hover:bg-dark-bgHover transition-colors">1/2 SR</button>
                  <button onClick={() => processSample(b => resampleBuffer(b, 2.0))} className="flex-1 bg-dark-bgTertiary border border-dark-border rounded text-[8px] py-1 uppercase text-text-secondary hover:bg-dark-bgHover transition-colors">2x SR</button>
                </div>
              </div>

              <div className="space-y-1 text-right">
                <label className="text-[9px] text-text-muted uppercase block font-bold">Preview</label>
                <div className="flex gap-1">
                  <button onClick={handlePlay} className={`flex-1 text-[8px] py-1 border border-dark-border rounded uppercase transition-colors ${isPlaying ? 'bg-accent-error/20 text-accent-error border-accent-error/30' : 'bg-accent-success/20 text-accent-success border-accent-success/30'}`}>
                    {isPlaying ? 'Stop' : 'Play'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};