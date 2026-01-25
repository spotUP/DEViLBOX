/**
 * SamplePackBrowser - Modal for browsing and loading samples from sample packs
 */

import React, { useState, useRef, useEffect } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { SAMPLE_PACKS } from '@constants/samplePacks';
import { SAMPLE_CATEGORY_LABELS } from '@typedefs/samplePack';
import type { SamplePack, SampleInfo, SampleCategory } from '@typedefs/samplePack';
import {
  X,
  Search,
  Check,
  Play,
  Square,
  Package,
  Disc3,
  Music,
  Sparkles,
} from 'lucide-react';
import * as Tone from 'tone';

interface SamplePackBrowserProps {
  onClose: () => void;
}

export const SamplePackBrowser: React.FC<SamplePackBrowserProps> = ({ onClose }) => {
  const { currentInstrumentId, updateInstrument } = useInstrumentStore();
  const [selectedPack, setSelectedPack] = useState<SamplePack | null>(SAMPLE_PACKS[0] || null);
  const [activeCategory, setActiveCategory] = useState<SampleCategory>('kicks');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSample, setSelectedSample] = useState<SampleInfo | null>(null);
  const [playingSample, setPlayingSample] = useState<string | null>(null);
  const playerRef = useRef<Tone.Player | null>(null);

  // Cleanup player on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.stop();
        playerRef.current.dispose();
      }
    };
  }, []);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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

  // Preview a sample
  const previewSample = async (sample: SampleInfo) => {
    try {
      // Stop any currently playing sample
      if (playerRef.current) {
        playerRef.current.stop();
        playerRef.current.dispose();
      }

      // Start audio context if needed
      await Tone.start();

      setPlayingSample(sample.url);

      // Create and play the sample
      const player = new Tone.Player({
        url: sample.url,
        onload: () => {
          player.start();
        },
        onstop: () => {
          setPlayingSample(null);
        },
      }).toDestination();

      playerRef.current = player;
    } catch (error) {
      console.error('Error previewing sample:', error);
      setPlayingSample(null);
    }
  };

  // Stop preview
  const stopPreview = () => {
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current.dispose();
      playerRef.current = null;
    }
    setPlayingSample(null);
  };

  // Load selected sample into current instrument
  const handleLoadSample = (sample: SampleInfo) => {
    if (currentInstrumentId === null) return;

    updateInstrument(currentInstrumentId, {
      type: 'synth',
      name: sample.name,
      synthType: 'Sampler',
      sample: {
        url: sample.url,
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

    onClose();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="w-full h-full bg-ft2-bg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-ft2-header border-b-2 border-ft2-border">
          <div className="flex items-center gap-3">
            <Package size={20} className="text-ft2-highlight" />
            <div>
              <h2 className="text-ft2-highlight font-bold text-sm">SAMPLE PACKS</h2>
              <p className="text-ft2-textDim text-xs">Browse and load samples</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ft2-textDim hover:text-ft2-text hover:bg-ft2-border rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Pack List */}
          <div className="w-64 bg-ft2-header border-r border-ft2-border flex flex-col">
            <div className="p-3 border-b border-ft2-border">
              <h3 className="text-ft2-text font-bold text-xs mb-2">AVAILABLE PACKS</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 scrollbar-ft2">
              {SAMPLE_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  onClick={() => {
                    setSelectedPack(pack);
                    // Reset to first available category
                    if (pack.categories.length > 0) {
                      setActiveCategory(pack.categories[0]);
                    }
                  }}
                  className={`w-full p-3 rounded mb-2 text-left transition-all ${
                    selectedPack?.id === pack.id
                      ? 'bg-ft2-cursor text-ft2-bg'
                      : 'bg-ft2-bg border border-ft2-border hover:border-ft2-highlight'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {pack.coverImage ? (
                      <img
                        src={pack.coverImage}
                        alt={pack.name}
                        className="w-12 h-12 rounded object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-ft2-border flex items-center justify-center">
                        <Package size={20} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div
                        className={`font-bold text-sm truncate ${
                          selectedPack?.id === pack.id ? 'text-ft2-bg' : 'text-ft2-text'
                        }`}
                      >
                        {pack.name}
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
                <div className="px-4 py-3 bg-ft2-header border-b border-ft2-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-ft2-text font-bold">{selectedPack.name}</h3>
                      <p className="text-ft2-textDim text-xs mt-1">{selectedPack.description}</p>
                    </div>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="px-4 py-3 bg-ft2-header border-b border-ft2-border">
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-ft2-textDim"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search samples..."
                      className="w-full pl-10 pr-4 py-2 bg-ft2-bg border border-ft2-border text-ft2-text rounded focus:border-ft2-highlight focus:outline-none"
                    />
                  </div>
                </div>

                {/* Category Tabs */}
                <div className="flex gap-1 px-4 py-2 bg-ft2-header border-b border-ft2-border overflow-x-auto">
                  {selectedPack.categories.map((category) => {
                    const isActive = activeCategory === category;
                    const sampleCount = selectedPack.samples[category]?.length || 0;
                    if (sampleCount === 0) return null;

                    return (
                      <button
                        key={category}
                        onClick={() => setActiveCategory(category)}
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
                      {filteredSamples.map((sample) => {
                        const isSelected = selectedSample?.url === sample.url;
                        const isCurrentlyPlaying = playingSample === sample.url;

                        return (
                          <div
                            key={sample.url}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedSample(sample)}
                            onDoubleClick={() => handleLoadSample(sample)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleLoadSample(sample);
                              if (e.key === ' ') setSelectedSample(sample);
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
          <div className="text-ft2-textDim text-xs">
            {selectedPack && (
              <>
                {filteredSamples.length} sample{filteredSamples.length !== 1 ? 's' : ''} in{' '}
                {SAMPLE_CATEGORY_LABELS[activeCategory]}
                {selectedSample && (
                  <span className="ml-2 text-ft2-text">
                    • Double-click or click Load to use "{selectedSample.name}"
                  </span>
                )}
              </>
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
              onClick={() => {
                if (selectedSample) handleLoadSample(selectedSample);
              }}
              disabled={!selectedSample}
              className="flex items-center gap-2 px-4 py-2 bg-ft2-cursor text-ft2-bg font-bold hover:bg-ft2-highlight rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={16} />
              Load Sample
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
