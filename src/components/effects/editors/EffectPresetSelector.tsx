import React, { useState, useRef, useEffect } from 'react';
import { EffectRegistry } from '@engine/registry/EffectRegistry';
import { getUserPresets, saveUserPreset, deleteUserPreset } from '@lib/effectPresetStorage';
import type { EffectPreset, EffectConfig } from '@typedefs/instrument';
import { Save, Trash2, X } from 'lucide-react';

interface Props {
  effect: EffectConfig;
  onApply: (params: Record<string, number | string>) => void;
  color?: string;
}

export const EffectPresetSelector: React.FC<Props> = ({ effect, onApply, color = '#6366f1' }) => {
  const [open, setOpen] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [userPresets, setUserPresets] = useState<EffectPreset[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const effectType = effect.type ?? '';

  const factoryPresets = EffectRegistry.getPresets(effectType);

  // Refresh user presets when opening
  useEffect(() => {
    if (open) setUserPresets(getUserPresets(effectType));
  }, [open, effectType]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowSave(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const hasPresets = factoryPresets.length > 0 || userPresets.length > 0;

  const handleSave = () => {
    if (!saveName.trim()) return;
    saveUserPreset(effectType, { name: saveName.trim(), params: { ...effect.parameters } });
    setUserPresets(getUserPresets(effectType));
    setSaveName('');
    setShowSave(false);
  };

  const handleDelete = (name: string) => {
    deleteUserPreset(effectType, name);
    setUserPresets(getUserPresets(effectType));
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="px-2 py-0.5 text-[9px] uppercase font-bold rounded-full border transition-colors"
        style={{ color, borderColor: `${color}60`, background: open ? `${color}15` : 'transparent' }}
      >
        Presets ▾
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl z-50 overflow-hidden max-h-[60vh] overflow-y-auto">
          {/* Factory Presets */}
          {factoryPresets.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[8px] text-text-muted font-bold uppercase tracking-wider bg-dark-bgTertiary">
                Factory
              </div>
              {factoryPresets.map(p => (
                <button key={p.name} onClick={() => { onApply(p.params); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-text-primary hover:bg-dark-bgHover transition-colors">
                  {p.name}
                </button>
              ))}
            </>
          )}
          {/* User Presets */}
          {userPresets.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[8px] text-text-muted font-bold uppercase tracking-wider bg-dark-bgTertiary border-t border-dark-border">
                User
              </div>
              {userPresets.map(p => (
                <div key={p.name} className="flex items-center hover:bg-dark-bgHover group">
                  <button onClick={() => { onApply(p.params); setOpen(false); }}
                    className="flex-1 text-left px-3 py-1.5 text-[11px] text-text-primary">
                    {p.name}
                  </button>
                  <button onClick={() => handleDelete(p.name)}
                    className="px-2 text-text-muted hover:text-accent-error opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </>
          )}
          {/* Save Current */}
          <div className="border-t border-dark-border">
            {showSave ? (
              <div className="p-2 flex gap-1">
                <input value={saveName} onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="Preset name" autoFocus
                  className="flex-1 bg-dark-bg border border-dark-border rounded px-2 py-1 text-[10px] text-text-primary" />
                <button onClick={handleSave} className="px-2 py-1 bg-accent-primary/20 text-accent-primary rounded text-[10px]">
                  <Save size={10} />
                </button>
                <button onClick={() => setShowSave(false)} className="px-1 text-text-muted">
                  <X size={10} />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowSave(true)}
                className="w-full text-left px-3 py-1.5 text-[10px] text-accent-primary hover:bg-dark-bgHover transition-colors flex items-center gap-1">
                <Save size={10} /> Save Current
              </button>
            )}
          </div>
          {/* No presets message */}
          {!hasPresets && !showSave && (
            <div className="px-3 py-3 text-[10px] text-text-muted text-center">
              No presets yet — save your first!
            </div>
          )}
        </div>
      )}
    </div>
  );
};
