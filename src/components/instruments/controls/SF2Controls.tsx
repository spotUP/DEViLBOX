/**
 * SF2Controls — SID Factory II instrument editor (DOM).
 *
 * Displays the raw instrument byte table from the SF2 driver.
 * Since SF2 instruments are driver-defined (byte layout varies by driver version),
 * we show a hex byte editor with column indices. The store's tableDefs describe
 * the layout for the active driver.
 */

import React, { useCallback } from 'react';
import type { SF2Config } from '@/types/instrument/exotic';
import { useSF2Store } from '@/stores/useSF2Store';

interface Props {
  config: SF2Config;
  onChange: (updates: Partial<SF2Config>) => void;
  instrumentId: number;
}

export const SF2Controls: React.FC<Props> = ({ config, onChange }) => {
  const descriptor = useSF2Store((s) => s.descriptor);
  const instruments = useSF2Store((s) => s.instruments);
  const tableDefs = useSF2Store((s) => s.tableDefs);

  // Find the instrument table definition
  const instrTableDef = tableDefs.find(t => t.type === 0x80);

  // Get the instrument data from the store (source of truth for edits)
  const storeInst = instruments[config.instIndex];
  const rawBytes = storeInst?.rawBytes ?? config.rawBytes;
  const colCount = instrTableDef?.columnCount ?? config.columnCount;

  const handleByteChange = useCallback((byteOffset: number, value: number) => {
    // Update in the store (affects export/rebuild)
    useSF2Store.getState().setInstrumentByte(config.instIndex, byteOffset, value);
    // Also update the instrument config
    const newBytes = new Uint8Array(rawBytes);
    newBytes[byteOffset] = value;
    onChange({ rawBytes: newBytes });
  }, [config.instIndex, rawBytes, onChange]);

  const handleNameChange = useCallback((name: string) => {
    onChange({ name });
  }, [onChange]);

  const driverVersion = descriptor
    ? `${descriptor.driverName} v${descriptor.versionMajor}.${String(descriptor.versionMinor).padStart(2, '0')}`
    : 'Unknown Driver';

  return (
    <div className="flex flex-col gap-3 p-3 text-xs font-mono">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-accent-primary font-bold text-sm">SF2 Instrument</span>
        <span className="text-text-muted">{driverVersion}</span>
        <span className="text-text-secondary">#{config.instIndex + 1}</span>
      </div>

      {/* Name */}
      <div className="flex items-center gap-2">
        <label className="text-text-muted w-12">Name:</label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="flex-1 px-2 py-1 bg-dark-bgSecondary border border-dark-border rounded text-text-primary text-xs font-mono"
          maxLength={31}
        />
      </div>

      {/* Byte Table */}
      {colCount > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-text-muted text-[10px] mb-1">
            {instrTableDef ? `Table: ${instrTableDef.name} (${colCount} bytes)` : `${colCount} bytes`}
          </div>

          {/* Column headers */}
          <div className="flex gap-1">
            {Array.from({ length: colCount }, (_, i) => (
              <div key={i} className="w-8 text-center text-text-muted text-[10px]">
                {i.toString(16).toUpperCase().padStart(2, '0')}
              </div>
            ))}
          </div>

          {/* Byte values */}
          <div className="flex gap-1">
            {Array.from({ length: colCount }, (_, i) => {
              const val = i < rawBytes.length ? rawBytes[i] : 0;
              return (
                <input
                  key={i}
                  type="text"
                  value={val.toString(16).toUpperCase().padStart(2, '0')}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 16);
                    if (!isNaN(parsed) && parsed >= 0 && parsed <= 0xFF) {
                      handleByteChange(i, parsed);
                    }
                  }}
                  className="w-8 px-1 py-0.5 text-center bg-dark-bgSecondary border border-dark-border rounded text-accent-primary text-[11px] font-mono focus:border-accent-primary focus:outline-none"
                  maxLength={2}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* All driver tables summary */}
      {tableDefs.length > 0 && (
        <div className="mt-2 pt-2 border-t border-dark-border">
          <div className="text-text-muted text-[10px] mb-1">Driver Tables:</div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {tableDefs.map((td, i) => (
              <span key={i} className="text-[10px] text-text-secondary">
                {td.name} ({td.rowCount}×{td.columnCount})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
