/**
 * SamplePackBrowser - Modal for browsing and loading samples from sample packs
 */

import React, { useState, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import { useInstrumentStore, useSamplePackStore, useAllSamplePacks } from '@stores';
import { SAMPLE_CATEGORY_LABELS } from '@typedefs/samplePack';
import type { SamplePack, SampleInfo, SampleCategory } from '@typedefs/samplePack';
import { Package, Search, Play, Check, Music, Disc3, Sparkles, X, Square, Upload, Folder, Trash2, Zap } from 'lucide-react';
import { normalizeUrl } from '@utils/urlUtils';
import { getToneEngine } from '@engine/ToneEngine';

interface SamplePackBrowserProps {
  onClose: () => void;
}

export const SamplePackBrowser: React.FC<SamplePackBrowserProps> = ({ onClose }) => {
  const { currentInstrumentId, updateInstrument, setPreviewInstrument } = useInstrumentStore();
  const { uploadZip, uploadDirectory, removeUserPack } = useSamplePackStore();
  const allPacks = useAllSamplePacks();
  
  const [selectedPack, setSelectedPack] = useState<SamplePack | null>(allPacks[0] || null);
  const [activeCategory, setActiveCategory] = useState<SampleCategory>('kicks');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSamples, setSelectedSamples] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [_isPlaying, setIsPlaying] = useState(false);
  const [playingSample, setPlayingSample] = useState<string | null>(null);
  const playerRef = useRef<Tone.Player | null>(null);
  const previewVersionRef = useRef(0); // Track preview version to prevent stale callbacks
  const isMountedRef = useRef(true); // Track mount state to prevent state updates after unmount
  const zipInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  // Get primary selected sample for preview instrument
  const primarySample = React.useMemo(() => {
    if (selectedSamples.size === 0 || !selectedPack) return null;
    const firstUrl = Array.from(selectedSamples)[selectedSamples.size - 1]; // Use last selected
    // Find sample info in any category
    for (const cat of selectedPack.categories) {
      const found = selectedPack.samples[cat].find(s => s.url === firstUrl);
      if (found) return found;
    }
    return null;
  }, [selectedSamples, selectedPack]);

  // Sync preview instrument with primary selected sample
  const previewConfig = React.useMemo(() => {
    if (!primarySample) return null;
    return {
      id: 999,
      name: `Preview: ${primarySample.name}`,
      type: 'sample',
      synthType: 'Sampler',
      sample: {
        url: primarySample.url,
        baseNote: 'C4',
        detune: 0,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        reverse: false,
        playbackRate: 1,
      },
      effects: [],
      volume: -6,
      pan: 0,
    } as any;
  }, [primarySample]);

  useEffect(() => {
    if (previewConfig) {
      setPreviewInstrument(previewConfig);
      // Force engine to reload the new sample for the preview ID
      try {
        getToneEngine().invalidateInstrument(999);
      } catch (e) {
        // Ignored
      }
    } else {
      setPreviewInstrument(null);
    }

    return () => {
      setPreviewInstrument(null);
    };
  }, [previewConfig, setPreviewInstrument]);

  // Keyboard support for previewing (2 Octaves, Standard Tracker Layout)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in search
      if (document.activeElement?.tagName === 'INPUT') return;
      
      // Standard Tracker Layout:
      // Bottom Row: Z=C-4, S=C#4, X=D-4, D=D#4, C=E-4, V=F-4, G=F#4, B=G-4, H=G#4, N=A-4, J=A#4, M=B-4, ,=C-5
      // Top Row: Q=C-5, 2=C#5, W=D-5, 3=D#5, E=E-5, R=F-5, 5=F#5, T=G-5, 6=G#5, Y=A-5, 7=A#5, U=B-5, I=C-6
      const keyMap: Record<string, string> = {
        // Lower Octave
        'z': 'C4', 's': 'C#4', 'x': 'D4', 'd': 'D#4', 'c': 'E4', 'v': 'F4', 
        'g': 'F#4', 'b': 'G4', 'h': 'G#4', 'n': 'A4', 'j': 'A#4', 'm': 'B4',
        ',': 'C5',
        // Upper Octave
        'q': 'C5', '2': 'C#5', 'w': 'D5', '3': 'D#5', 'e': 'E5', 'r': 'F5',
        '5': 'F#5', 't': 'G5', '6': 'G#5', 'y': 'A5', '7': 'A#5', 'u': 'B5',
        'i': 'C6'
      };

      const note = keyMap[e.key.toLowerCase()];
      if (note && primarySample && previewConfig) {
        const engine = getToneEngine();
        engine.triggerPolyNoteAttack(999, note, 1, previewConfig);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      
      const keyMap: Record<string, string> = {
        // Lower Octave
        'z': 'C4', 's': 'C#4', 'x': 'D4', 'd': 'D#4', 'c': 'E4', 'v': 'F4', 
        'g': 'F#4', 'b': 'G4', 'h': 'G#4', 'n': 'A4', 'j': 'A#4', 'm': 'B4',
        ',': 'C5',
        // Upper Octave
        'q': 'C5', '2': 'C#5', 'w': 'D5', '3': 'D#5', 'e': 'E5', 'r': 'F5',
        '5': 'F#5', 't': 'G5', '6': 'G#5', 'y': 'A5', '7': 'A#5', 'u': 'B5',
        'i': 'C6'
      };

      const note = keyMap[e.key.toLowerCase()];
      if (note && primarySample && previewConfig) {
        const engine = getToneEngine();
        engine.triggerPolyNoteRelease(999, note, previewConfig);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [primarySample, previewConfig]);

  // Cleanup player on unmount and track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (playerRef.current) {
        playerRef.current.stop();
        playerRef.current.dispose();
      }
    };
  }, []);

  // Update selected pack if it was deleted or if first pack changes
  useEffect(() => {
    // If current selected pack is gone, fall back
    if (selectedPack && !allPacks.find((p: SamplePack) => p.id === selectedPack.id)) {
      setSelectedPack(allPacks[0] || null);
      setSelectedSamples(new Set());
    } 
    // If no pack is selected but we have packs, select the first one
    else if (!selectedPack && allPacks.length > 0) {
      setSelectedPack(allPacks[0]);
    }
  }, [allPacks, selectedPack]);

  // Get filtered samples
  const getFilteredSamples = (): SampleInfo[] => {
    if (!selectedPack) return [];
    const samples = selectedPack.samples[activeCategory] || [];
    if (!searchQuery.trim()) return samples;
    const query = searchQuery.toLowerCase();
    return samples.filter(
      (sample) =>
        sample.name.toLowerCase().includes(query) ||
        sample.filename.toLowerCase().includes(query)
    );
  };

  const filteredSamples = getFilteredSamples();

  // Selection handler
  const handleSampleClick = (sample: SampleInfo, index: number, event: React.MouseEvent) => {
    const newSelection = new Set(selectedSamples);

    if (event.shiftKey && lastSelectedIndex !== null) {
      // Range selection
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      for (let i = start; i <= end; i++) {
        newSelection.add(filteredSamples[i].url);
      }
    } else if (event.ctrlKey || event.metaKey) {
      // Toggle individual
      if (newSelection.has(sample.url)) {
        newSelection.delete(sample.url);
      } else {
        newSelection.add(sample.url);
      }
    } else {
      // Single selection
      newSelection.clear();
      newSelection.add(sample.url);
      // Auto-preview on click
      previewSample(sample);
    }

    setSelectedSamples(newSelection);
    setLastSelectedIndex(index);
  };

  // Preview a sample
  const previewSample = async (sample: SampleInfo) => {
    // Increment version to invalidate any pending callbacks
    const currentVersion = ++previewVersionRef.current;

    try {
      // Stop any currently playing sample
      if (playerRef.current) {
        playerRef.current.stop();
        playerRef.current.dispose();
        playerRef.current = null;
      }

      // Start audio context if needed
      await Tone.start();

      setPlayingSample(sample.url);
      setIsPlaying(true);

      // Create and play the sample
      const player = new Tone.Player({
        url: normalizeUrl(sample.url),
        onload: () => {
          // Only start if this is still the current preview
          if (previewVersionRef.current === currentVersion) {
            player.start();
          }
        },
        onstop: () => {
          // Only update state if this is still the current preview
          if (previewVersionRef.current === currentVersion) {
            setIsPlaying(false);
            setPlayingSample(null);
          }
        },
      }).toDestination();

      playerRef.current = player;
    } catch (error) {
      console.error('Error previewing sample:', error);
      // Only update state if this is still the current preview
      if (previewVersionRef.current === currentVersion) {
        setIsPlaying(false);
        setPlayingSample(null);
      }
    }
  };

  // Stop preview
  const stopPreview = () => {
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current.dispose();
      playerRef.current = null;
    }
    setIsPlaying(false);
    setPlayingSample(null);
  };

  // Load selected samples into current instrument(s)
  const handleLoadSamples = () => {
    if (currentInstrumentId === null || selectedSamples.size === 0 || !selectedPack) return;

    const urls = Array.from(selectedSamples);
    
    // Find all sample objects for selected URLs
    const samplesToLoad: SampleInfo[] = [];
    for (const url of urls) {
      for (const cat of selectedPack.categories) {
        const found = selectedPack.samples[cat].find(s => s.url === url);
        if (found) {
          samplesToLoad.push(found);
          break;
        }
      }
    }

    // Load first sample into CURRENT instrument
    const first = samplesToLoad[0];
    updateInstrument(currentInstrumentId, {
      type: 'sample',
      name: first.name,
      synthType: 'Sampler',
      sample: {
        url: first.url,
        baseNote: 'C4',
        detune: 0,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        reverse: false,
        playbackRate: 1,
      },
      effects: [],
      volume: -6,
      pan: 0,
    });

    // If multiple samples, create NEW instruments for the rest
    if (samplesToLoad.length > 1) {
      const { createInstrument } = useInstrumentStore.getState();
      for (let i = 1; i < samplesToLoad.length; i++) {
        const s = samplesToLoad[i];
        createInstrument({
          type: 'sample',
          name: s.name,
          synthType: 'Sampler',
          sample: {
            url: s.url,
            baseNote: 'C4',
            detune: 0,
            loop: false,
            loopStart: 0,
            loopEnd: 0,
            reverse: false,
            playbackRate: 1,
          },
          effects: [],
          volume: -6,
          pan: 0,
        });
      }
    }

    onClose();
  };

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const pack = await uploadZip(file);
      // Only update state if still mounted
      if (isMountedRef.current) {
        setSelectedPack(pack);
        if (pack.categories.length > 0) {
          setActiveCategory(pack.categories[0]);
        }
      }
    } catch (error) {
      if (isMountedRef.current) {
        alert('Failed to load ZIP pack. Ensure it contains audio files.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsUploading(false);
      }
    }

    // Reset input
    if (zipInputRef.current) zipInputRef.current.value = '';
  };

  const handleDirUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const pack = await uploadDirectory(files);
      // Only update state if still mounted
      if (isMountedRef.current) {
        setSelectedPack(pack);
        if (pack.categories.length > 0) {
          setActiveCategory(pack.categories[0]);
        }
      }
    } catch (error) {
      if (isMountedRef.current) {
        alert('Failed to load directory. Ensure it contains audio files.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsUploading(false);
      }
    }

    // Reset input
    if (dirInputRef.current) dirInputRef.current.value = '';
  };

  const handleDeletePack = (e: React.MouseEvent, packId: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to remove this sample pack?')) {
      removeUserPack(packId);
    }
  };

  // Get category icon
  const getCategoryIcon = (category: SampleCategory) => {
    switch (category) {
      case 'kicks':
        return <Disc3 size={14} />;
      case 'snares':
        return <Disc3 size={14} />;
      case 'hihats':
        return <Music size={14} />;
      case 'percussion':
        return <Music size={14} />;
      case 'fx':
        return <Sparkles size={14} />;
      default:
        return <Music size={14} />;
    }
  };

  // Get category color
  const getCategoryColor = (category: SampleCategory) => {
    const colors: Partial<Record<SampleCategory, string>> = {
      kicks: 'text-red-400',
      snares: 'text-orange-400',
      hihats: 'text-yellow-400',
      claps: 'text-pink-400',
      percussion: 'text-purple-400',
      fx: 'text-green-400',
    };
    return colors[category] || 'text-ft2-highlight';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 pt-16">
      <div className="w-full h-full bg-ft2-bg flex flex-col overflow-hidden border-t-2 border-ft2-border relative">
        {/* Loading Overlay */}
        {isUploading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="p-6 bg-ft2-header border-2 border-ft2-highlight rounded-xl shadow-2xl flex flex-col items-center gap-4">
              <Package size={48} className="text-ft2-highlight animate-bounce" />
              <div className="text-center">
                <h3 className="text-ft2-highlight font-black text-xl tracking-tighter">PACKING...</h3>
                <p className="text-ft2-textDim text-xs font-bold uppercase">Processing audio files</p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-ft2-header border-b-2 border-ft2-border">
          <div className="flex items-center gap-3">
            <Package size={20} className="text-ft2-highlight" />
            <div>
              <h2 className="text-ft2-highlight font-bold text-sm">SAMPLE PACKS</h2>
              <p className="text-ft2-textDim text-xs">Browse and load samples</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => zipInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight text-ft2-text rounded transition-colors text-xs font-bold"
              title="Upload ZIP pack"
            >
              <Upload size={14} />
              ZIP
            </button>
            <button
              onClick={() => dirInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 bg-ft2-bg border border-ft2-border hover:border-ft2-highlight text-ft2-text rounded transition-colors text-xs font-bold"
              title="Upload Folder"
            >
              <Folder size={14} />
              FOLDER
            </button>
            <button
              onClick={onClose}
              className="p-2 text-ft2-textDim hover:text-ft2-text hover:bg-ft2-border rounded transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          
          {/* Hidden inputs */}
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleZipUpload}
          />
          <input
            ref={dirInputRef}
            type="file"
            {...({ webkitdirectory: '', directory: '' } as any)}
            className="hidden"
            onChange={handleDirUpload}
          />
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Pack List */}
          <div className="w-64 bg-ft2-header border-r border-ft2-border flex flex-col">
            <div className="p-3 border-b border-ft2-border">
              <h3 className="text-ft2-text font-bold text-xs mb-2">AVAILABLE PACKS</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 scrollbar-ft2">
              {allPacks.map((pack: SamplePack) => (
                <button
                  key={pack.id}
                  onClick={() => {
                    setSelectedPack(pack);
                    // Reset to first available category
                    if (pack.categories.length > 0) {
                      setActiveCategory(pack.categories[0]);
                    }
                  }}
                  className={`w-full p-3 rounded mb-2 text-left transition-all group ${
                    selectedPack?.id === pack.id
                      ? 'bg-ft2-cursor text-ft2-bg'
                      : 'bg-ft2-bg border border-ft2-border hover:border-ft2-highlight'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {pack.coverImage ? (
                      <img
                        src={normalizeUrl(pack.coverImage)}
                        alt={pack.name}
                        className="w-12 h-12 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className={`w-12 h-12 rounded shrink-0 flex items-center justify-center border ${
                        selectedPack?.id === pack.id 
                          ? 'bg-ft2-bg/20 border-ft2-bg/30 text-ft2-bg' 
                          : 'bg-ft2-bg border-ft2-border text-ft2-highlight'
                      }`}>
                        <Package size={20} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <div
                          className={`font-bold text-sm truncate ${
                            selectedPack?.id === pack.id ? 'text-ft2-bg' : 'text-ft2-text'
                          }`}
                        >
                          {pack.name}
                        </div>
                        {pack.isUserUploaded && (
                          <button
                            onClick={(e) => handleDeletePack(e, pack.id)}
                            className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                              selectedPack?.id === pack.id ? 'hover:bg-ft2-bg/20 text-ft2-bg' : 'hover:bg-ft2-border text-red-400'
                            }`}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <div
                        className={`text-xs truncate ${
                          selectedPack?.id === pack.id ? 'text-ft2-bg/70' : 'text-ft2-textDim'
                        }`}
                      >
                        by {pack.author}
                      </div>
                      <div
                        className={`text-xs mt-1 ${
                          selectedPack?.id === pack.id ? 'text-ft2-bg/70' : 'text-ft2-textDim'
                        }`}
                      >
                        {pack.sampleCount} samples
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedPack ? (
              <>
                {/* Pack Header */}
                <div className="px-4 py-3 bg-ft2-header border-b border-ft2-border shrink-0">
                  <div className="flex items-center gap-4">
                    {selectedPack.coverImage ? (
                      <img
                        src={normalizeUrl(selectedPack.coverImage)}
                        alt={selectedPack.name}
                        className="w-16 h-16 rounded object-cover border border-ft2-border"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded bg-ft2-bg border border-ft2-border flex items-center justify-center text-ft2-highlight">
                        <Package size={32} />
                      </div>
                    )}
                    <div>
                      <h3 className="text-ft2-text font-bold text-lg">{selectedPack.name}</h3>
                      <p className="text-ft2-textDim text-xs mt-1 max-w-2xl">{selectedPack.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] px-1.5 py-0.5 bg-ft2-bg border border-ft2-border text-ft2-textDim rounded">
                          {selectedPack.author}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-ft2-bg border border-ft2-border text-ft2-textDim rounded">
                          {selectedPack.sampleCount} SAMPLES
                        </span>
                        {selectedPack.isUserUploaded && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-accent-primary/20 text-accent-primary rounded font-bold">
                            USER UPLOAD
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="px-4 py-3 bg-ft2-header border-b border-ft2-border shrink-0">
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-ft2-textDim"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setSelectedSamples(new Set());
                        setLastSelectedIndex(null);
                      }}
                      placeholder="Search samples..."
                      className="w-full pl-10 pr-4 py-2 bg-ft2-bg border border-ft2-border text-ft2-text rounded focus:border-ft2-highlight focus:outline-none"
                    />
                  </div>
                </div>

                {/* Category Tabs */}
                <div className="flex gap-1 px-4 py-2 bg-ft2-header border-b border-ft2-border overflow-x-auto shrink-0">
                  {selectedPack.categories.map((category) => {
                    const isActive = activeCategory === category;
                    const sampleCount = selectedPack.samples[category]?.length || 0;
                    if (sampleCount === 0) return null;

                    return (
                      <button
                        key={category}
                        onClick={() => {
                          setActiveCategory(category);
                          setSelectedSamples(new Set());
                          setLastSelectedIndex(null);
                        }}
                        className={`
                          flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-colors whitespace-nowrap
                          ${
                            isActive
                              ? 'bg-ft2-cursor text-ft2-bg'
                              : `bg-ft2-bg border border-ft2-border hover:border-ft2-highlight ${getCategoryColor(category)}`
                          }
                        `}
                      >
                        {getCategoryIcon(category)}
                        {SAMPLE_CATEGORY_LABELS[category].toUpperCase()}
                        <span
                          className={`text-[10px] ${isActive ? 'text-ft2-bg/70' : 'text-ft2-textDim'}`}
                        >
                          ({sampleCount})
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Sample Grid */}
                <div className="flex-1 overflow-y-auto p-4 scrollbar-ft2">
                  {filteredSamples.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-ft2-textDim">
                      {searchQuery ? `No samples found matching "${searchQuery}"` : 'No samples in this category'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                      {filteredSamples.map((sample, index) => {
                        const isSelected = selectedSamples.has(sample.url);
                        const isCurrentlyPlaying = playingSample === sample.url;

                        return (
                          <div
                            key={sample.url}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => handleSampleClick(sample, index, e)}
                            onDoubleClick={() => handleLoadSamples()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleLoadSamples();
                              }
                            }}
                            className={`
                              p-2 rounded border text-left transition-all group cursor-pointer
                              ${
                                isSelected
                                  ? 'bg-ft2-cursor text-ft2-bg border-ft2-cursor'
                                  : 'bg-ft2-header border-ft2-border hover:border-ft2-highlight'
                              }
                            `}
                          >
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isCurrentlyPlaying) {
                                    stopPreview();
                                  } else {
                                    previewSample(sample);
                                  }
                                }}
                                className={`
                                  w-7 h-7 rounded flex items-center justify-center transition-colors shrink-0
                                  ${
                                    isSelected
                                      ? 'bg-ft2-bg/20 hover:bg-ft2-bg/30'
                                      : 'bg-ft2-border hover:bg-ft2-highlight/20'
                                  }
                                `}
                              >
                                {isCurrentlyPlaying ? (
                                  <Square
                                    size={12}
                                    className={isSelected ? 'text-ft2-bg' : 'text-ft2-highlight'}
                                  />
                                ) : (
                                  <Play
                                    size={12}
                                    className={isSelected ? 'text-ft2-bg' : 'text-ft2-text'}
                                  />
                                )}
                              </button>
                              <span
                                className={`font-medium text-xs truncate ${
                                  isSelected ? 'text-ft2-bg' : 'text-ft2-text'
                                }`}
                              >
                                {sample.name}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-ft2-textDim">
                Select a sample pack to browse
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 bg-ft2-header border-t-2 border-ft2-border">
          <div className="flex items-center gap-4">
            <div className="text-ft2-textDim text-xs">
              {selectedPack && (
                <>
                  {filteredSamples.length} sample{filteredSamples.length !== 1 ? 's' : ''} in{' '}
                  {SAMPLE_CATEGORY_LABELS[activeCategory]}
                  {selectedSamples.size > 0 && (
                    <span className="ml-2 text-ft2-text">
                      • {selectedSamples.size} selected. Double-click or click Load to use.
                    </span>
                  )}
                </>
              )}
            </div>
            
            {/* Jam Indicator */}
            {primarySample && (
              <div className="flex items-center gap-2 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded animate-pulse-glow">
                <Zap size={12} className="text-amber-400 fill-amber-400" />
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">JAM ACTIVE</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-ft2-bg border border-ft2-border text-ft2-text hover:border-ft2-highlight rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleLoadSamples}
              disabled={selectedSamples.size === 0}
              className="flex items-center gap-2 px-4 py-2 bg-ft2-cursor text-ft2-bg font-bold hover:bg-ft2-highlight rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={16} />
              Load {selectedSamples.size > 1 ? `${selectedSamples.size} Samples` : 'Sample'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

