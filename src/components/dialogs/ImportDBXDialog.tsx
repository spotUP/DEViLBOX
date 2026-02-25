/**
 * ImportDBXDialog — Project preview dialog for .dbx (DEViLBOX project) files.
 *
 * Parses the JSON locally to show song name, author, BPM, pattern count,
 * and instrument count before replacing the current project.
 */

import React, { useState, useEffect } from 'react';
import { FolderOpen, Music, Layers, Cpu, User, Clock } from 'lucide-react';
import { Button } from '@components/ui/Button';

interface DBXPreview {
  name: string;
  author: string;
  description: string;
  bpm: number;
  patternCount: number;
  instrumentCount: number;
}

interface ImportDBXDialogProps {
  isOpen: boolean;
  file: File | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ImportDBXDialog: React.FC<ImportDBXDialogProps> = ({
  isOpen,
  file,
  onConfirm,
  onCancel,
}) => {
  const [preview, setPreview] = useState<DBXPreview | null>(null);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); setError(null); return; }

    setPreview(null);
    setError(null);

    file.text().then(text => {
      try {
        const data = JSON.parse(text);
        setPreview({
          name:            data.metadata?.name        || file.name.replace(/\.dbx$/i, ''),
          author:          data.metadata?.author      || '',
          description:     data.metadata?.description || '',
          bpm:             typeof data.bpm === 'number' ? data.bpm : 120,
          patternCount:    Array.isArray(data.patterns)    ? data.patterns.length    : 0,
          instrumentCount: Array.isArray(data.instruments) ? data.instruments.length : 0,
        });
      } catch {
        setError('Could not parse project file.');
      }
    }).catch(() => setError('Could not read file.'));
  }, [file]);

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-dark-bgPrimary border-2 border-accent-primary rounded-xl p-6 max-w-md w-full mx-4 animate-slide-in-up shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <FolderOpen className="w-5 h-5 text-accent-primary flex-shrink-0" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-white leading-tight">Load Project?</h2>
            <p className="text-text-muted text-xs font-mono truncate">{file.name}</p>
          </div>
        </div>

        {error ? (
          <p className="text-red-400 text-sm mb-5">{error}</p>
        ) : preview ? (
          <>
            {/* Song name */}
            <div className="mb-4">
              <p className="text-accent-primary text-xl font-bold truncate">{preview.name}</p>
              {preview.author && (
                <p className="text-text-secondary text-sm flex items-center gap-1 mt-0.5">
                  <User className="w-3 h-3" />{preview.author}
                </p>
              )}
              {preview.description && (
                <p className="text-text-muted text-xs mt-1 line-clamp-2">{preview.description}</p>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="bg-dark-bgSecondary rounded-lg p-2.5 text-center">
                <Clock className="w-4 h-4 text-accent-primary mx-auto mb-1" />
                <p className="text-white text-sm font-bold">{preview.bpm}</p>
                <p className="text-text-muted text-xs">BPM</p>
              </div>
              <div className="bg-dark-bgSecondary rounded-lg p-2.5 text-center">
                <Layers className="w-4 h-4 text-accent-primary mx-auto mb-1" />
                <p className="text-white text-sm font-bold">{preview.patternCount}</p>
                <p className="text-text-muted text-xs">Patterns</p>
              </div>
              <div className="bg-dark-bgSecondary rounded-lg p-2.5 text-center">
                <Cpu className="w-4 h-4 text-accent-primary mx-auto mb-1" />
                <p className="text-white text-sm font-bold">{preview.instrumentCount}</p>
                <p className="text-text-muted text-xs">Instruments</p>
              </div>
            </div>

            <p className="text-text-muted text-xs mb-5">
              Loading this project will replace your current work. Save first if needed.
            </p>
          </>
        ) : (
          <div className="flex items-center gap-2 text-text-muted text-sm mb-5">
            <Music className="w-4 h-4 animate-pulse" />
            Reading project…
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} disabled={!preview && !error}>
            Load Project
          </Button>
        </div>
      </div>
    </div>
  );
};
