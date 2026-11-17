/** Song wavetable list: Add, Duplicate, Delete, Move Up, Move Down. References follow the move (see furnaceWaveList). */
import React, { useState } from 'react';
import { Plus, Copy, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { useFormatStore } from '@stores/useFormatStore';
import { furnaceWaveList } from '@stores/furnaceWaveList';

export const FurnaceWaveList: React.FC = () => {
  const waves = useFormatStore((s) => s.furnaceWavetables);
  const [sel, setSel] = useState(0);
  if (!waves) return null;
  const at = Math.min(sel, Math.max(0, waves.length - 1));
  return (
    <div className="bg-dark-bgSecondary p-3 rounded-lg border border-dark-border">
      <div className="flex flex-wrap items-center gap-1 mb-2">
        <span className="text-[10px] font-mono text-text-muted mr-2">Song wavetables ({waves.length})</span>
        <Button variant="ghost" onClick={() => { furnaceWaveList.add(); setSel(waves.length); }}><Plus size={12} /> Add</Button>
        <Button variant="ghost" disabled={!waves.length} onClick={() => { furnaceWaveList.duplicate(at); setSel(waves.length); }}><Copy size={12} /> Duplicate</Button>
        <Button variant="danger" disabled={!waves.length} onClick={() => furnaceWaveList.remove(at)}><Trash2 size={12} /> Delete</Button>
        <Button variant="ghost" disabled={at <= 0} onClick={() => { furnaceWaveList.move(at, 'up'); setSel(at - 1); }}><ChevronUp size={12} /> Move Up</Button>
        <Button variant="ghost" disabled={at >= waves.length - 1} onClick={() => { furnaceWaveList.move(at, 'down'); setSel(at + 1); }}><ChevronDown size={12} /> Move Down</Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {waves.map((_, i) => (
          <button key={i} onClick={() => setSel(i)}
            className={`px-2 text-[10px] font-mono rounded border ${i === at ? 'border-accent-primary text-accent-primary' : 'border-dark-borderLight text-text-secondary'}`}>
            {i.toString(16).toUpperCase().padStart(2, '0')}
          </button>
        ))}
      </div>
    </div>
  );
};
