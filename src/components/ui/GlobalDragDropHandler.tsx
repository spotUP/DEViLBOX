/**
 * GlobalDragDropHandler - Handles drag and drop for all supported file formats
 * Supports:
 * - .dbx files (DEViLBOX projects)
 * - .xml files (DB303 patterns/presets)
 * - Tracker modules (.mod, .xm, .it, .s3m, .fur, .mptm, etc.)
 * - MIDI files (.mid, .midi)
 * - Audio samples (.wav, .mp3, .ogg, .flac)
 */

import React, { useState, useCallback } from 'react';
import { Upload } from 'lucide-react';

interface GlobalDragDropHandlerProps {
  onFileLoaded: (file: File) => Promise<void>;
  children: React.ReactNode;
}

// All supported file extensions
const SUPPORTED_EXTENSIONS = [
  // DEViLBOX projects
  '.dbx',
  // DEViLBOX instruments
  '.dbi',
  // DB303 patterns/presets
  '.xml',
  // Tracker modules
  '.mod', '.xm', '.it', '.s3m', '.fur', '.mptm', '.669', '.amf', '.ams', 
  '.dbm', '.dmf', '.dsm', '.far', '.ftm', '.gdm', '.imf', '.mdl', '.med', 
  '.mt2', '.mtm', '.okt', '.psm', '.ptm', '.sfx', '.stm', '.ult', '.umx',
  // MIDI
  '.mid', '.midi',
  // Audio samples
  '.wav', '.mp3', '.ogg', '.flac', '.aiff', '.aif',
];

function isSupportedFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return SUPPORTED_EXTENSIONS.includes(ext);
}

export const GlobalDragDropHandler: React.FC<GlobalDragDropHandlerProps> = ({
  onFileLoaded,
  children,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragCount, setDragCount] = useState(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDragCount(prev => prev + 1);
    
    // Check if dragged items contain files
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const hasFiles = Array.from(e.dataTransfer.items).some(
        item => item.kind === 'file'
      );
      if (hasFiles) {
        setIsDragging(true);
      }
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDragCount(prev => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(false);
    setDragCount(0);

    const files = Array.from(e.dataTransfer.files);
    
    if (files.length === 0) return;

    // Get first supported file
    const file = files.find(f => isSupportedFile(f.name));
    
    if (!file) {
      console.warn('[DragDrop] No supported files found');
      return;
    }

    try {
      await onFileLoaded(file);
    } catch (error) {
      console.error('[DragDrop] Failed to load file:', error);
    }
  }, [onFileLoaded]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative w-full h-full"
    >
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
