/**
 * TFMXControls.tsx — TFMX (Jochen Hippel) instrument viewer
 *
 * TFMX instruments use raw binary SndModSeq/VolModSeq data that is
 * sent directly to the WASM engine. This component displays a read-only
 * summary and hex preview of the instrument data.
 */

import React, { useState } from 'react';
import type { TFMXConfig } from '@/types/instrument';
import { useThemeStore } from '@stores';

interface TFMXControlsProps {
  config: TFMXConfig;
}

function hexPreview(data: Uint8Array, maxBytes = 64): string {
  const bytes = data.slice(0, maxBytes);
  const rows: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const hex = Array.from(chunk).map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const asc = Array.from(chunk).map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
    rows.push(`${i.toString(16).padStart(4, '0')}  ${hex.padEnd(47)}  ${asc}`);
  }
  return rows.join('\n');
}

export const TFMXControls: React.FC<TFMXControlsProps> = ({ config }) => {
  const [showVolHex, setShowVolHex] = useState(false);
  const [showSndHex, setShowSndHex] = useState(false);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#ff6644';
  const dim     = isCyan ? '#004444' : '#331100';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#1a0800] border-red-900/30';

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}>
      {label}
    </div>
  );

  const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] text-gray-500 w-36">{label}</span>
      <span className="text-[10px] font-mono" style={{ color: accent }}>{value}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* Summary */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="TFMX Instrument Data" />
        <Row label="SndModSeq count"   value={config.sndSeqsCount.toString()} />
        <Row label="SndModSeq bytes"   value={`${config.sndModSeqData.byteLength} B`} />
        <Row label="VolModSeq bytes"   value={`${config.volModSeqData.byteLength} B`} />
        <Row label="Sample slots"      value={config.sampleCount.toString()} />
        <Row label="Sample headers"    value={`${config.sampleHeaders.byteLength} B`} />
        <Row label="Sample PCM bank"   value={`${config.sampleData.byteLength} B`} />
        <div className="mt-2 text-[9px] text-gray-600">
          TFMX instruments are defined by SndMod/VolMod macro sequences and a PCM sample bank.
          Parameters are not user-editable; they are extracted from the original .mdat/.smpl files.
        </div>
      </div>

      {/* VolModSeq hex preview */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel label="VolModSeq (this instrument)" />
          <button
            onClick={() => setShowVolHex((v) => !v)}
            className="text-[9px] px-2 py-0.5 rounded border"
            style={{ borderColor: dim, color: accent, background: 'transparent' }}>
            {showVolHex ? 'Hide' : 'Show'} Hex
          </button>
        </div>
        {showVolHex && (
          <pre className="text-[9px] font-mono overflow-x-auto p-2 rounded"
            style={{ background: '#080400', color: '#888', borderColor: dim, border: `1px solid ${dim}` }}>
            {hexPreview(config.volModSeqData)}
          </pre>
        )}
      </div>

      {/* SndModSeq hex preview */}
      {config.sndModSeqData.byteLength > 0 && (
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel label="SndModSeqs (all, first 64 B)" />
            <button
              onClick={() => setShowSndHex((v) => !v)}
              className="text-[9px] px-2 py-0.5 rounded border"
              style={{ borderColor: dim, color: accent, background: 'transparent' }}>
              {showSndHex ? 'Hide' : 'Show'} Hex
            </button>
          </div>
          {showSndHex && (
            <pre className="text-[9px] font-mono overflow-x-auto p-2 rounded"
              style={{ background: '#080400', color: '#888', borderColor: dim, border: `1px solid ${dim}` }}>
              {hexPreview(config.sndModSeqData)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
