/**
 * ImportTD3Dialog — Import dialog for Behringer TD-3 / Roland TB-303 pattern files
 * (.sqs / .seq).
 *
 * Parses the file locally to preview the pattern list before committing to import.
 * Offers an option to append patterns or replace the current project.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { X, AlertCircle, Music2 } from 'lucide-react';
import { Button } from '@components/ui/Button';

interface TD3Preview {
  name: string;
  version: string;
  patternNames: string[];
}

interface ImportTD3DialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialFile?: File | null;
  /** Called when the user confirms import. Receives the File and whether to replace existing patterns. */
  onImport: (file: File, replacePatterns: boolean) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export const ImportTD3Dialog: React.FC<ImportTD3DialogProps> = ({
  isOpen,
  onClose,
  initialFile,
  onImport,
}) => {
  const [preview, setPreview]         = useState<TD3Preview | null>(null);
  const [td3File, setTD3File]         = useState<File | null>(null);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [replacePatterns, setReplacePatterns] = useState(false);

  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    setPreview(null);
    setTD3File(null);

    try {
      const buf = await file.arrayBuffer();
      const { parseTD3File } = await import('@lib/import/TD3PatternLoader');
      const parsed = await parseTD3File(buf);

      setPreview({
        name: parsed.name || file.name.replace(/\.[^/.]+$/, ''),
        version: parsed.version || 'Unknown',
        patternNames: parsed.patterns.map((p, i) => p.name || `Pattern ${i + 1}`),
      });
      setTD3File(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse TD-3 file');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialFile && isOpen) {
      handleFileSelect(initialFile);
    }
  }, [initialFile, isOpen, handleFileSelect]);

  const handleImport = useCallback(() => {
    if (!td3File) return;
    onImport(td3File, replacePatterns);
    onClose();
  }, [td3File, replacePatterns, onImport, onClose]);

  const handleClose = useCallback(() => {
    setPreview(null);
    setTD3File(null);
    setError(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-[420px] max-h-[75vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Music2 size={18} className="text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Import TD-3 / TB-303 Patterns</h2>
          </div>
          <Button variant="icon" size="icon" onClick={handleClose} aria-label="Close dialog">
            <X size={16} />
          </Button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">

          {isLoading && (
            <div className="flex items-center justify-center p-6">
              <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-accent-error/10 border border-accent-error/30 rounded text-sm text-accent-error">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {preview && (
            <>
              {/* File info */}
              <div className="bg-dark-bg rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-text-primary">{preview.name}</p>
                  <span className="text-xs px-2 py-0.5 bg-accent-primary/20 text-accent-primary rounded">
                    v{preview.version}
                  </span>
                </div>
                <p className="text-xs text-text-muted">{preview.patternNames.length} pattern{preview.patternNames.length !== 1 ? 's' : ''}</p>
              </div>

              {/* Pattern list */}
              {preview.patternNames.length > 0 && (
                <div className="bg-dark-bg rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
                  {preview.patternNames.map((name, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-text-muted w-6 text-right font-mono">{i + 1}</span>
                      <span className="text-text-primary">{name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Replace vs Append */}
              <div className="bg-dark-bg rounded-lg p-4 space-y-2">
                <p className="text-xs font-medium text-text-primary">Import Mode</p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    checked={!replacePatterns}
                    onChange={() => setReplacePatterns(false)}
                    className="mt-0.5 accent-accent-primary"
                  />
                  <div>
                    <p className="text-sm text-text-primary">Append to project</p>
                    <p className="text-xs text-text-muted">Add patterns alongside existing patterns</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    checked={replacePatterns}
                    onChange={() => setReplacePatterns(true)}
                    className="mt-0.5 accent-accent-primary"
                  />
                  <div>
                    <p className="text-sm text-text-primary">Replace project</p>
                    <p className="text-xs text-text-muted">Clear all existing patterns first</p>
                  </div>
                </label>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-dark-border flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleImport} disabled={!td3File}>
            Import Patterns
          </Button>
        </div>
      </div>
    </div>
  );
};
