import React, { useState, useMemo } from 'react';
import { NanoExporter } from '@/lib/export/NanoExporter';
import { useTrackerStore, useInstrumentStore, useTransportStore } from '@/stores';
import { X, Copy, Zap, Save, Check } from 'lucide-react';

interface NanoExportDialogProps {
  onClose: () => void;
}

export const NanoExportDialog: React.FC<NanoExportDialogProps> = ({ onClose }) => {
  const [copied, setCopied] = useState(false);
  const { instruments } = useInstrumentStore();
  const { patterns, patternOrder } = useTrackerStore();
  const { bpm, speed } = useTransportStore();

  const binaryData = useMemo(() => {
    return NanoExporter.export(instruments, patterns, patternOrder, bpm, speed);
  }, [instruments, patterns, patternOrder, bpm, speed]);

  const base64Data = useMemo(() => {
    // Convert Uint8Array to Base64
    let binary = '';
    const bytes = new Uint8Array(binaryData);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }, [binaryData]);

  const stats = useMemo(() => {
    return {
      bytes: binaryData.length,
      kb: (binaryData.length / 1024).toFixed(2),
      instr: instruments.length
    };
  }, [binaryData, instruments]);

  const handleCopy = () => {
    navigator.clipboard.writeText(base64Data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([new Uint8Array(binaryData)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'song.nano';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-[#1a1a1a] border-2 border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.2)] rounded-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-900/40 to-transparent border-b border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 rounded-lg">
              <Zap size={20} className="text-black" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-amber-400 tracking-tight">NANO EXPORTER</h2>
              <p className="text-[10px] text-amber-500/60 uppercase font-black tracking-[0.2em]">4k Intro Binary Packing</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-dark-bgHover rounded-full transition-colors text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Info Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-black/40 border border-border p-3 rounded-lg text-center">
              <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Total Size</div>
              <div className="text-lg font-mono text-white">{stats.bytes} <span className="text-xs text-gray-500">bytes</span></div>
            </div>
            <div className="bg-black/40 border border-border p-3 rounded-lg text-center">
              <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Kilobytes</div>
              <div className="text-lg font-mono text-white">{stats.kb} <span className="text-xs text-gray-500">KB</span></div>
            </div>
            <div className="bg-black/40 border border-border p-3 rounded-lg text-center">
              <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Target</div>
              <div className="text-lg font-mono text-green-500">4K OK</div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Binary Data (Base64)</label>
            <div className="relative group">
              <textarea
                readOnly
                value={base64Data}
                className="w-full h-32 bg-black/60 border border-border rounded-lg p-4 font-mono text-[10px] text-amber-400/80 resize-none focus:outline-none focus:border-amber-500/50"
              />
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-2 bg-amber-500 text-black rounded-md hover:bg-amber-400 transition-colors shadow-lg flex items-center gap-2"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span className="text-[10px] font-bold uppercase">{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-lg">
            <h4 className="text-xs font-bold text-amber-400 uppercase mb-2">How to use in 4k Intro:</h4>
            <ul className="text-[11px] text-gray-400 space-y-1 list-disc pl-4">
              <li>Copy the Base64 string into your source code.</li>
              <li>Decode it into a Uint8Array at startup.</li>
              <li>Parse the fixed-length header (8 bytes).</li>
              <li>Precalc (Bake) instruments into RAM using the packed parameters.</li>
              <li>Use a lightweight replay routine to process the 4-byte packed patterns.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-black/20 border-t border-border flex gap-3">
          <button
            onClick={handleDownload}
            className="flex-1 py-3 bg-dark-bgActive hover:bg-dark-bgHover border border-border rounded-lg font-bold text-xs text-white transition-all flex items-center justify-center gap-2"
          >
            <Save size={16} />
            DOWNLOAD .NANO
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-lg font-bold text-xs transition-all"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
};
