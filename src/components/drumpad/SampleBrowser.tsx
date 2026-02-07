/**
 * SampleBrowser - Browse and load samples into drum pads
 */

import React, { useState, useCallback, useRef } from 'react';
import { Folder, Upload, Search, X } from 'lucide-react';
import type { SampleData } from '../../types/drumpad';
import { getAudioContext } from '../../audio/AudioContextSingleton';

interface SampleBrowserProps {
  onSelectSample: (sample: SampleData) => void;
  onClose: () => void;
}

interface SampleCategory {
  name: string;
  samples: SampleData[];
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

export const SampleBrowser: React.FC<SampleBrowserProps> = ({
  onSelectSample,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // TODO: Replace with actual sample library integration
  const [categories] = useState<SampleCategory[]>([
    {
      name: '808 Kit',
      samples: [],
    },
    {
      name: '909 Kit',
      samples: [],
    },
    {
      name: 'User Samples',
      samples: [],
    },
  ]);

  /**
   * Load audio file and create SampleData
   */
  const loadAudioFile = useCallback(async (file: File): Promise<SampleData> => {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    const arrayBuffer = await file.arrayBuffer();
    const audioContext = getAudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    return {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      audioBuffer,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
    };
  }, []);

  /**
   * Handle file upload
   */
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const file = files[0];
      const sample = await loadAudioFile(file);
      onSelectSample(sample);
      onClose();
    } catch (err) {
      console.error('[SampleBrowser] Failed to load audio file:', err);
      setError(err instanceof Error ? err.message : 'Failed to load audio file. Please ensure it\'s a valid audio format.');
    } finally {
      setIsLoading(false);
    }
  }, [loadAudioFile, onSelectSample, onClose]);

  /**
   * Handle drag and drop
   */
  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer.files;
    if (files.length === 0) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const file = files[0];
      const sample = await loadAudioFile(file);
      onSelectSample(sample);
      onClose();
    } catch (err) {
      console.error('[SampleBrowser] Failed to load dropped file:', err);
      setError(err instanceof Error ? err.message : 'Failed to load audio file. Please ensure it\'s a valid audio format.');
    } finally {
      setIsLoading(false);
    }
  }, [loadAudioFile, onSelectSample, onClose]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  /**
   * Filter samples based on search query
   */
  const filteredCategories = categories.map(category => ({
    ...category,
    samples: category.samples.filter(sample =>
      sample.name.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  }));

  const totalSamples = filteredCategories.reduce(
    (sum, cat) => sum + cat.samples.length,
    0
  );

  return (
    <div className="fixed inset-0 z-50 bg-dark-bg/95 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-dark-surface border border-dark-border rounded-lg shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <div>
            <h2 className="text-xl font-bold text-white">Sample Browser</h2>
            <p className="text-sm text-text-muted">
              {totalSamples} samples available
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-dark-border rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Search and Upload */}
        <div className="px-6 py-4 border-b border-dark-border space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search samples..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
            />
          </div>

          {/* Upload Button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.ogg,.flac"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="w-full px-4 py-2 bg-accent-primary hover:bg-accent-primary/80 disabled:bg-dark-border disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {isLoading ? 'Loading...' : 'Upload Audio File'}
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-red-400 text-sm">⚠️</span>
                <div className="flex-1">
                  <div className="text-sm text-red-400">{error}</div>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="flex-1 overflow-auto"
        >
          {totalSamples === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-dark-border flex items-center justify-center mb-4">
                <Upload className="w-8 h-8 text-text-muted" />
              </div>
              <div className="text-lg font-bold text-white mb-2">
                No Samples Found
              </div>
              <div className="text-sm text-text-muted mb-4 max-w-md">
                Drop audio files here or click the upload button to load samples.
                Supported formats: WAV, MP3, OGG, FLAC
              </div>
              <div className="text-xs text-text-muted/60 font-mono">
                Drag & drop audio files anywhere in this window
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {filteredCategories.map(category => (
                <div key={category.name}>
                  <div className="flex items-center gap-2 mb-3">
                    <Folder className="w-4 h-4 text-accent-primary" />
                    <h3 className="text-sm font-bold text-white">
                      {category.name}
                    </h3>
                    <span className="text-xs text-text-muted">
                      ({category.samples.length})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {category.samples.map(sample => (
                      <button
                        key={sample.id}
                        onClick={() => {
                          onSelectSample(sample);
                          onClose();
                        }}
                        className="p-3 bg-dark-bg border border-dark-border hover:border-accent-primary rounded-lg transition-colors text-left group"
                      >
                        <div className="text-sm text-white font-medium truncate group-hover:text-accent-primary transition-colors">
                          {sample.name}
                        </div>
                        <div className="text-xs text-text-muted mt-1">
                          {sample.duration.toFixed(2)}s • {(sample.sampleRate / 1000).toFixed(1)}kHz
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-dark-border bg-dark-bg">
          <div className="text-xs text-text-muted text-center">
            💡 Tip: You can drag and drop audio files directly onto this window
          </div>
        </div>
      </div>
    </div>
  );
};
