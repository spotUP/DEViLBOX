/**
 * GrooveSettingsModal - Comprehensive groove and swing settings
 */

import React from 'react';
import { X, Info } from 'lucide-react';
import { useTransportStore } from '@stores/useTransportStore';
import { GROOVE_TEMPLATES } from '@typedefs/audio';

interface GrooveSettingsModalProps {
  onClose: () => void;
}

export const GrooveSettingsModal: React.FC<GrooveSettingsModalProps> = ({ onClose }) => {
  const {
    swing,
    setSwing,
    grooveSteps,
    setGrooveSteps,
    jitter,
    setJitter,
    useMpcScale,
    setUseMpcScale,
    grooveTemplateId,
    setGrooveTemplate,
  } = useTransportStore();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm">
      <div className="bg-ft2-bg border-2 border-ft2-border w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-ft2-header border-b-2 border-ft2-border">
          <div className="flex items-center gap-2">
            <h2 className="text-ft2-highlight font-bold text-sm tracking-widest uppercase">Groove & Swing Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-ft2-border transition-colors text-ft2-text hover:text-ft2-highlight focus:outline-none"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-0 flex flex-col md:flex-row min-h-0">
          {/* Left Column: Presets */}
          <div className="w-full md:w-72 flex flex-col bg-dark-bgSecondary border-r border-ft2-border min-h-0">
            <section className="flex flex-col flex-1 min-h-0 p-6">
              <h3 className="flex-shrink-0 text-ft2-highlight text-xs font-bold mb-4 tracking-wider uppercase flex items-center gap-2">
                Groove Templates
              </h3>
              
              <div className="flex-1 overflow-y-auto pr-2 scrollbar-ft2 space-y-4">
                {['straight', 'shuffle', 'swing', 'funk', 'hip-hop', 'custom'].map(category => {
                  const grooves = GROOVE_TEMPLATES.filter(g => g.category === category);
                  if (grooves.length === 0) return null;
                  
                  return (
                    <div key={category} className="space-y-1">
                      <div className="text-[10px] font-bold text-text-muted uppercase px-1 pb-1 border-b border-dark-border">
                        {category}
                      </div>
                      <div className="grid grid-cols-1 gap-1 pt-1">
                        {grooves.map(groove => (
                          <button
                            key={groove.id}
                            onClick={() => setGrooveTemplate(groove.id)}
                            className={`w-full text-left px-3 py-2 text-xs font-mono transition-all rounded ${
                              groove.id === grooveTemplateId
                                ? 'bg-accent-primary text-white font-bold shadow-glow-sm'
                                : 'text-text-secondary hover:bg-dark-bgHover hover:text-text-primary bg-dark-bgSecondary border border-transparent hover:border-ft2-border'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span>{groove.name}</span>
                              {groove.id === grooveTemplateId && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                            </div>
                            {groove.description && (
                              <div className={`text-[10px] mt-0.5 leading-tight ${groove.id === grooveTemplateId ? 'text-white' : 'opacity-60'}`}>
                                {groove.description}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Right Column: Intensity & Humanization */}
          <div className="flex-1 overflow-y-auto scrollbar-ft2 p-6 space-y-8 min-h-0">
            {/* Global Intensity */}
            <section className="bg-dark-bgSecondary p-4 border border-ft2-border rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-ft2-highlight text-xs font-bold tracking-wider uppercase">Global Intensity</h3>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer group bg-dark-bgTertiary px-2 py-1 rounded border border-ft2-border hover:border-accent-primary transition-colors" title="Use authentic MPC 50-75% scale">
                    <input 
                      type="checkbox" 
                      checked={useMpcScale} 
                      onChange={(e) => setUseMpcScale(e.target.checked)}
                      className="w-3 h-3 accent-accent-primary"
                    />
                    <span className="text-[10px] text-text-muted group-hover:text-text-secondary font-bold uppercase">MPC SCALE</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] text-text-secondary font-mono uppercase">Groove Amount</span>
                  <span className="text-xl font-mono text-accent-primary font-bold leading-none">
                    {useMpcScale ? swing : `${swing}%`}
                  </span>
                </div>
                <input 
                  type="range" 
                  min={useMpcScale ? 50 : 0} 
                  max={useMpcScale ? 75 : 200} 
                  value={swing} 
                  onChange={(e) => setSwing(parseInt(e.target.value))}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSwing(useMpcScale ? 50 : 100);
                  }}
                  className="w-full h-2 accent-accent-primary cursor-pointer bg-dark-bgTertiary rounded-lg appearance-none"
                />
                <div className="flex justify-between text-[9px] text-text-muted font-mono uppercase px-1">
                  <span>{useMpcScale ? '50%' : 'Fixed'}</span>
                  <span>{useMpcScale ? '66%' : '100%'}</span>
                  <span>{useMpcScale ? '75%' : '200%'}</span>
                </div>
                <p className="text-[10px] text-text-muted italic leading-relaxed pt-2">
                  {useMpcScale 
                    ? "Authentic MPC timing. 66% is the perfect triplet ratio. Right-click to reset." 
                    : "Scales template intensity. 100% is standard. Right-click to reset."}
                </p>
              </div>
            </section>

            {/* Resolution */}
            <section className="bg-dark-bgSecondary p-4 border border-ft2-border rounded-lg space-y-4">
              <h3 className="text-ft2-highlight text-xs font-bold tracking-wider uppercase">Swing Resolution</h3>
              <div className="grid grid-cols-3 gap-2">
                {[2, 4, 8, 16, 32, 64].map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      setGrooveSteps(s);
                    }}
                    className={`px-2 py-2 text-[10px] font-mono border rounded transition-all ${
                      grooveSteps === s
                        ? 'bg-accent-primary border-accent-primary text-white font-bold'
                        : 'bg-dark-bgTertiary border-ft2-border text-text-secondary hover:border-text-muted'
                    }`}
                  >
                    {s === 2 ? '16th' : s === 4 ? '8th' : s === 8 ? '4th' : `${s/16}b`}
                    <div className="text-[8px] opacity-60">({s} stp)</div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-text-muted italic leading-relaxed">
                Determines which notes in the pattern cycle are swung. 16th is standard for electronic music.
              </p>
            </section>

            {/* Humanization */}
            <section className="bg-dark-bgSecondary p-4 border border-ft2-border rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-cyan-400 text-xs font-bold tracking-wider uppercase">Humanization (Jitter)</h3>
                <span className="text-lg font-mono text-cyan-400 font-bold leading-none">{jitter}%</span>
              </div>
              
              <div className="space-y-2">
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={jitter} 
                  onChange={(e) => setJitter(parseInt(e.target.value))}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setJitter(0);
                  }}
                  className="w-full h-2 accent-cyan-500 cursor-pointer bg-dark-bgTertiary rounded-lg appearance-none"
                />
                <div className="flex justify-between text-[9px] text-text-muted font-mono uppercase px-1">
                  <span>Robotic</span>
                  <span>Loose</span>
                  <span>Drunken</span>
                </div>
                <p className="text-[10px] text-text-muted italic leading-relaxed pt-2">
                  Adds random micro-timing offsets (0-10ms) to every note. Simulates unstable vintage clocks or human performance.
                </p>
              </div>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-ft2-header border-t-2 border-ft2-border flex justify-between items-center">
          <div className="flex items-center gap-2 text-[10px] text-text-muted">
            <Info size={12} className="text-ft2-highlight" />
            <span>Groove affects all patterns globally</span>
          </div>
          <button
            onClick={onClose}
            className="px-6 py-1.5 bg-accent-primary border border-accent-primary text-white text-xs font-bold hover:bg-accent-secondary hover:border-accent-secondary transition-all rounded shadow-glow-sm focus:outline-none uppercase tracking-widest"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};
