/**
 * ROMUploadPrompt — shown when a MAME chip synth ROM is not available.
 *
 * Lets the user upload a .zip (MAME standard) or raw .bin ROM file.
 * On successful upload the ROM is saved to IndexedDB via MAMEROMStore
 * and onROMLoaded is called with the raw combined Uint8Array.
 */

import React, { useRef, useState, useCallback } from 'react';
import { saveROM } from '@engine/mame/MAMEROMStore';

export interface ROMUploadPromptProps {
  /** Chip identifier (e.g. "TR707", "D50") — used as the IDB key */
  chipName: string;
  /** Human-readable description of what ROM file is expected */
  romDescription: string;
  /** Called after the ROM is parsed and saved to IDB */
  onROMLoaded: (data: Uint8Array) => void;
}

/**
 * Parse an uploaded file into a flat Uint8Array.
 * Accepts .zip (extracts all entries in offset order) or any raw binary.
 */
async function parseUploadedFile(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Check ZIP magic bytes PK\x03\x04
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);

    // Concatenate all file entries in sorted name order
    const entries = Object.values(zip.files).filter(f => !f.dir);
    entries.sort((a, b) => a.name.localeCompare(b.name));

    const chunks: Uint8Array[] = await Promise.all(
      entries.map(entry => entry.async('uint8array'))
    );

    const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined;
  }

  // Plain binary — return as-is
  return bytes;
}

export const ROMUploadPrompt: React.FC<ROMUploadPromptProps> = ({
  chipName,
  romDescription,
  onROMLoaded,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('loading');
    setErrorMsg('');

    try {
      const data = await parseUploadedFile(file);

      if (data.length === 0) {
        throw new Error('Uploaded file is empty.');
      }

      await saveROM(chipName, data);
      setStatus('idle');
      onROMLoaded(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setStatus('error');
    }

    // Reset the input so the same file can be re-uploaded if needed
    if (inputRef.current) inputRef.current.value = '';
  }, [chipName, onROMLoaded]);

  const handleButtonClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '32px 24px',
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 6,
        color: '#ccc',
        fontFamily: 'monospace',
        fontSize: 13,
        textAlign: 'center',
        minWidth: 280,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, color: '#e0e0e0' }}>
        ROM Required: {chipName}
      </div>

      <div style={{ color: '#888', lineHeight: 1.5, maxWidth: 360 }}>
        {romDescription}
      </div>

      <div style={{ color: '#666', fontSize: 11 }}>
        Upload a .zip (MAME format) or raw .bin file.
        <br />
        The ROM will be saved locally for future sessions.
      </div>

      {status === 'error' && (
        <div
          style={{
            color: '#e05050',
            background: '#2a1010',
            border: '1px solid #5a2020',
            borderRadius: 4,
            padding: '8px 12px',
            fontSize: 12,
            maxWidth: 340,
            wordBreak: 'break-word',
          }}
        >
          {errorMsg}
        </div>
      )}

      <button
        onClick={handleButtonClick}
        disabled={status === 'loading'}
        style={{
          padding: '8px 20px',
          background: status === 'loading' ? '#2a2a2a' : '#2d4a2d',
          border: '1px solid ' + (status === 'loading' ? '#444' : '#4a7a4a'),
          borderRadius: 4,
          color: status === 'loading' ? '#666' : '#90c890',
          cursor: status === 'loading' ? 'not-allowed' : 'pointer',
          fontFamily: 'monospace',
          fontSize: 13,
          letterSpacing: '0.05em',
        }}
      >
        {status === 'loading' ? 'Loading...' : 'Upload ROM File'}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".zip,.bin,.rom"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
};
