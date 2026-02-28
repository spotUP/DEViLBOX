/**
 * GlobalDragDropHandler - Handles drag and drop for all supported file formats
 * Supports:
 * - .dbx files (DEViLBOX projects)
 * - .xml files (DB303 patterns/presets)
 * - .sqs/.seq files (Behringer TD-3 patterns)
 * - Tracker modules (.mod, .xm, .it, .s3m, .fur, .mptm, etc.)
 * - MIDI files (.mid, .midi)
 * - Audio samples (.wav, .mp3, .ogg, .flac)
 */

import React, { useState, useEffect, useRef } from 'react';
import { Upload } from 'lucide-react';
import { getSupportedExtensions } from '@lib/import/ModuleLoader';

interface GlobalDragDropHandlerProps {
  onFileLoaded: (file: File) => Promise<void>;
  children: React.ReactNode;
}

// All supported file extensions — module formats from ModuleLoader + app-specific
const SUPPORTED_EXTENSIONS = new Set([
  // DEViLBOX projects
  '.dbx',
  // DEViLBOX instruments
  '.dbi',
  // SunVox patches and projects
  '.sunsynth', '.sunvox',
  // DB303 patterns/presets
  '.xml',
  // Behringer TD-3 patterns
  '.sqs', '.seq',
  // MIDI
  '.mid', '.midi',
  // Audio samples
  '.wav', '.mp3', '.ogg', '.flac', '.aiff', '.aif',
  // All tracker/module formats (MOD, XM, IT, S3M, Furnace, HVL, UADE exotic, etc.)
  ...getSupportedExtensions(),
]);

function isSupportedFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return SUPPORTED_EXTENSIONS.has(ext);
}

export const GlobalDragDropHandler: React.FC<GlobalDragDropHandlerProps> = ({
  onFileLoaded,
  children,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  // Keep a ref to onFileLoaded so the window event handler always calls the latest version
  // without needing to re-register listeners on every render.
  const onFileLoadedRef = useRef(onFileLoaded);
  useEffect(() => { onFileLoadedRef.current = onFileLoaded; }, [onFileLoaded]);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer || e.dataTransfer.items.length === 0) return;
      const hasFiles = Array.from(e.dataTransfer.items).some(item => item.kind === 'file');
      if (hasFiles) setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      // relatedTarget is null only when the drag leaves the browser window entirely.
      // Moving between elements on the page keeps relatedTarget non-null, so we
      // ignore those transitions and avoid flickering the overlay off.
      if (e.relatedTarget === null) setIsDragging(false);
    };

    const handleDragOver = (e: DragEvent) => { e.preventDefault(); };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      // If a child component (e.g. SampleEditor, DJ deck) has its own drop handler and
      // already processed this file, skip the app-level handler to avoid double-handling.
      const target = e.target as HTMLElement;
      if (target.closest('[data-sample-drop-zone]') || target.closest('[data-dj-deck-drop]')) return;

      const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
      if (files.length === 0) return;

      const file = files.find(f => isSupportedFile(f.name));
      if (!file) {
        console.warn('[DragDrop] No supported files found');
        return;
      }

      try {
        await onFileLoadedRef.current(file);
      } catch (error) {
        console.error('[DragDrop] Failed to load file:', error);
      }
    };

    // Use window-level listeners so drops work everywhere — including on PixiDOMOverlay
    // divs that are appended to document.body outside the React tree of this component.
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []); // Empty — event handlers use refs, no deps needed

  return (
    <div className="relative w-full h-full">
      {children}
      
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center pointer-events-none animate-fade-in">
          <div className="bg-dark-bgPrimary border-2 border-accent-primary border-dashed rounded-xl p-12 flex flex-col items-center gap-4 shadow-2xl">
            <Upload size={64} className="text-accent-primary animate-bounce" />
            <div className="text-center">
              <p className="text-2xl font-bold text-white mb-2">
                Drop your file here
              </p>
              <p className="text-text-muted text-sm">
                Supports .dbx, .dbi, .xml, .mod, .xm, .it, .s3m, .fur, .mid, and more
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
