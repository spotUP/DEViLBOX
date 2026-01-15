/**
 * ImportModuleDialog - Dialog for importing MOD/XM/IT/S3M tracker files
 * Uses chiptune3/libopenmpt for parsing and playback preview
 */

import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, Play, Square, Music, FileAudio, AlertCircle } from 'lucide-react';
import {
  loadModuleFile,
  previewModule,
  stopPreview,
  getSupportedExtensions,
  isSupportedModule,
  type ModuleInfo,
} from '@lib/import/ModuleLoader';

interface ImportModuleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (info: ModuleInfo) => void;
}

export const ImportModuleDialog: React.FC<ImportModuleDialogProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [moduleInfo, setModuleInfo] = useState<ModuleInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!isSupportedModule(file.name)) {
      setError(`Unsupported file format. Supported: ${getSupportedExtensions().slice(0, 5).join(', ')}...`);
      return;
    }

    setIsLoading(true);
    setError(null);
    setModuleInfo(null);

    try {
      const info = await loadModuleFile(file);
      setModuleInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load module');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handlePreview = useCallback(() => {
    if (!moduleInfo) return;

    if (isPlaying) {
      stopPreview(moduleInfo);
      setIsPlaying(false);
    } else {
      previewModule(moduleInfo);
      setIsPlaying(true);
    }
  }, [moduleInfo, isPlaying]);

  const handleImport = useCallback(() => {
    if (!moduleInfo) return;

    if (isPlaying) {
      stopPreview(moduleInfo);
      setIsPlaying(false);
    }

    onImport(moduleInfo);
    onClose();
  }, [moduleInfo, isPlaying, onImport, onClose]);

  const handleClose = useCallback(() => {
    if (moduleInfo && isPlaying) {
      stopPreview(moduleInfo);
    }
    setModuleInfo(null);
    setError(null);
    setIsPlaying(false);
    onClose();
  }, [moduleInfo, isPlaying, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-[480px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <div className="flex items-center gap-2">
            <FileAudio size={18} className="text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Import Tracker Module</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-bgHover rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isLoading ? 'border-accent-primary/50 bg-accent-primary/5' : 'border-dark-border hover:border-accent-primary/50 hover:bg-dark-bgHover'}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={getSupportedExtensions().join(',')}
              onChange={handleInputChange}
              className="hidden"
            />

            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-text-muted">Loading module...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload size={32} className="text-text-muted" />
                <p className="text-sm text-text-primary">
                  Drop a tracker file here or click to browse
                </p>
                <p className="text-xs text-text-muted">
                  Supports MOD, XM, IT, S3M and 20+ other formats
                </p>
              </div>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-accent-error/10 border border-accent-error/30 rounded text-sm text-accent-error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Module info */}
          {moduleInfo && (
            <div className="bg-dark-bg rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Music size={16} className="text-accent-primary" />
                  <span className="font-medium text-text-primary">
                    {moduleInfo.metadata.title}
                  </span>
                </div>
                <span className="text-xs px-2 py-0.5 bg-accent-primary/20 text-accent-primary rounded">
                  {moduleInfo.metadata.type}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between text-text-muted">
                  <span>Channels:</span>
                  <span className="text-text-primary font-mono">{moduleInfo.metadata.channels}</span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Patterns:</span>
                  <span className="text-text-primary font-mono">{moduleInfo.metadata.patterns}</span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Instruments:</span>
                  <span className="text-text-primary font-mono">{moduleInfo.metadata.instruments}</span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Samples:</span>
                  <span className="text-text-primary font-mono">{moduleInfo.metadata.samples}</span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Orders:</span>
                  <span className="text-text-primary font-mono">{moduleInfo.metadata.orders}</span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Duration:</span>
                  <span className="text-text-primary font-mono">
                    {Math.floor(moduleInfo.metadata.duration / 60)}:{String(Math.floor(moduleInfo.metadata.duration % 60)).padStart(2, '0')}
                  </span>
                </div>
              </div>

              {moduleInfo.metadata.message && (
                <div className="text-xs text-text-muted bg-dark-bgSecondary p-2 rounded max-h-20 overflow-y-auto font-mono whitespace-pre-wrap">
                  {moduleInfo.metadata.message}
                </div>
              )}

              {/* Preview button */}
              <button
                onClick={handlePreview}
                className={`
                  w-full flex items-center justify-center gap-2 px-4 py-2 rounded transition-colors
                  ${isPlaying
                    ? 'bg-accent-error/20 text-accent-error hover:bg-accent-error/30'
                    : 'bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30'
                  }
                `}
              >
                {isPlaying ? (
                  <>
                    <Square size={14} />
                    Stop Preview
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    Preview
                  </>
                )}
              </button>
            </div>
          )}

          {/* Import note */}
          {moduleInfo && (
            <p className="text-xs text-text-muted">
              Note: Importing will create patterns and sampler instruments from this module.
              Complex effects may not translate perfectly.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-dark-border">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-dark-bgHover rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!moduleInfo}
            className="px-4 py-2 text-sm bg-accent-primary text-white rounded hover:bg-accent-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Import Module
          </button>
        </div>
      </div>
    </div>
  );
};
