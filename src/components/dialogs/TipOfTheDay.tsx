import React, { useState, useEffect } from 'react';
import { Lightbulb, ChevronLeft, ChevronRight, X, Info, Sparkles, History } from 'lucide-react';
import { DEVILBOX_TIPS } from '../../constants/tips';
import { CHANGELOG, CURRENT_VERSION, BUILD_NUMBER, type ChangelogEntry } from '@generated/changelog';
import { useThemeStore } from '@stores';

const SEEN_VERSION_KEY = 'devilbox-seen-version';

interface TipOfTheDayProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'tips' | 'changelog';
}

const ChangeTypeLabel: React.FC<{ type: 'feature' | 'fix' | 'improvement' }> = ({ type }) => {
  const labels = {
    feature: 'New',
    fix: 'Fix',
    improvement: 'Improved',
  };
  const colors = {
    feature: 'bg-green-500/20 text-green-400',
    fix: 'bg-amber-500/20 text-amber-400',
    improvement: 'bg-blue-500/20 text-blue-400',
  };
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${colors[type]}`}>
      {labels[type]}
    </span>
  );
};

const VersionEntry: React.FC<{ entry: ChangelogEntry; isLatest: boolean }> = ({ entry, isLatest }) => {
  return (
    <div className={`px-5 py-4 border-b border-white/5 last:border-b-0 ${isLatest ? 'bg-accent-primary/5' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`font-bold ${isLatest ? 'text-accent-primary' : 'text-text-primary'}`}>
          v{entry.version}
        </span>
        <span className="text-xs text-text-muted">{entry.date}</span>
        {isLatest && (
          <span className="px-2 py-0.5 text-[10px] font-bold bg-accent-primary text-dark-bg rounded-full">
            LATEST
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {entry.changes.map((change, idx) => (
          <li key={idx} className="flex items-start gap-2 text-sm">
            <ChangeTypeLabel type={change.type} />
            <span className="text-text-secondary">{change.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const TipOfTheDay: React.FC<TipOfTheDayProps> = ({ isOpen, onClose, initialTab = 'tips' }) => {
  const [activeTab, setActiveTab] = useState<'tips' | 'changelog'>(initialTab);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [showAtStartup, setShowAtStartup] = useState(() => {
    const saved = localStorage.getItem('show-tips-at-startup');
    return saved === null ? true : saved === 'true';
  });

  const { currentThemeId } = useThemeStore();
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Sync activeTab with initialTab when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      // Mark version as seen when opened
      localStorage.setItem(SEEN_VERSION_KEY, BUILD_NUMBER);
    }
  }, [isOpen, initialTab]);

  // Pick a random tip when opened if not already set
  useEffect(() => {
    if (isOpen) {
      setCurrentTipIndex(Math.floor(Math.random() * DEVILBOX_TIPS.length));
    }
  }, [isOpen]);

  const handleNext = () => {
    setCurrentTipIndex((prev) => (prev + 1) % DEVILBOX_TIPS.length);
  };

  const handlePrev = () => {
    setCurrentTipIndex((prev) => (prev - 1 + DEVILBOX_TIPS.length) % DEVILBOX_TIPS.length);
  };

  const toggleStartup = (checked: boolean) => {
    setShowAtStartup(checked);
    localStorage.setItem('show-tips-at-startup', checked.toString());
  };

  if (!isOpen) return null;

  const tip = DEVILBOX_TIPS[currentTipIndex];
  const accentColor = isCyanTheme ? '#00ffff' : '#ef4444';

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
      <div 
        className={`max-w-xl w-full rounded-xl border-2 shadow-2xl overflow-hidden transition-all animate-in zoom-in-95 duration-200
          ${isCyanTheme ? 'bg-[#051515] border-cyan-500/50' : 'bg-[#1a1a1a] border-ft2-border'}
        `}
      >
        {/* Header */}
        <div className={`px-6 py-4 flex items-center justify-between
          ${isCyanTheme ? 'bg-cyan-900/20' : 'bg-dark-bgSecondary'}
        `}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isCyanTheme ? 'bg-cyan-500/20 text-cyan-400' : 'bg-red-500/20 text-red-500'}`}>
              {activeTab === 'tips' ? <Lightbulb size={20} /> : <Sparkles size={20} />}
            </div>
            <div>
              <h2 className="font-bold text-lg tracking-tight text-text-primary uppercase">
                {activeTab === 'tips' ? 'Tip of the Day' : "What's New"}
              </h2>
              <p className="text-[10px] text-text-muted uppercase tracking-widest">DEViLBOX v{CURRENT_VERSION}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 bg-black/20">
          <button
            onClick={() => setActiveTab('tips')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2
              ${activeTab === 'tips' 
                ? `bg-white/5 border-b-2` 
                : 'text-text-muted hover:text-text-secondary'
              }
            `}
            style={activeTab === 'tips' ? { color: accentColor, borderColor: accentColor } : undefined}
          >
            <Lightbulb size={14} />
            Tips
          </button>
          <button
            onClick={() => setActiveTab('changelog')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2
              ${activeTab === 'changelog' 
                ? `bg-white/5 border-b-2` 
                : 'text-text-muted hover:text-text-secondary'
              }
            `}
            style={activeTab === 'changelog' ? { color: accentColor, borderColor: accentColor } : undefined}
          >
            <History size={14} />
            Changelog
          </button>
        </div>

        {/* Content */}
        <div className="min-h-[300px] max-h-[50vh] overflow-y-auto scrollbar-modern bg-black/10">
          {activeTab === 'tips' ? (
            <div className="p-8 flex flex-col items-center text-center space-y-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center bg-opacity-10 mb-2
                ${isCyanTheme ? 'bg-cyan-500 text-cyan-400' : 'bg-red-500 text-red-500'}
              `}>
                <Info size={32} />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-text-primary" style={{ color: accentColor }}>
                  {tip.title}
                </h3>
                <p className="text-text-secondary leading-relaxed text-sm">
                  {tip.content}
                </p>
              </div>

              <div className={`text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full
                ${isCyanTheme ? 'bg-cyan-500/10 text-cyan-500' : 'bg-white/5 text-text-muted'}
              `}>
                Category: {tip.category}
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {CHANGELOG.slice(0, 5).map((entry, idx) => (
                <VersionEntry key={entry.version} entry={entry} isLatest={idx === 0} />
              ))}
            </div>
          )}
        </div>

        {/* Navigation / Startup Toggle */}
        <div className="px-6 py-4 flex items-center justify-between border-t border-white/5 bg-black/20">
          {activeTab === 'tips' ? (
            <div className="flex gap-2">
              <button 
                onClick={handlePrev}
                className="p-2 rounded-lg bg-dark-bgTertiary hover:bg-dark-bgHover text-text-primary transition-colors"
                title="Previous Tip"
              >
                <ChevronLeft size={20} />
              </button>
              <button 
                onClick={handleNext}
                className="p-2 rounded-lg bg-dark-bgTertiary hover:bg-dark-bgHover text-text-primary transition-colors"
                title="Next Tip"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-text-muted italic text-xs">
              Showing recent updates
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={showAtStartup}
              onChange={(e) => toggleStartup(e.target.checked)}
              className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer
                ${isCyanTheme ? 'border-cyan-500 checked:bg-cyan-500' : 'border-red-500 checked:bg-red-500'}
              `}
            />
            <span className="text-xs text-text-muted group-hover:text-text-secondary transition-colors uppercase font-bold tracking-tighter">
              Show at startup
            </span>
          </label>
        </div>

        {/* Footer Action */}
        <div className="p-4 bg-black/40 flex justify-center">
          <button 
            onClick={onClose}
            className={`w-full py-3 rounded-lg font-bold text-sm transition-all uppercase tracking-widest
              ${isCyanTheme 
                ? 'bg-cyan-500 text-black hover:bg-cyan-400 shadow-[0_0_15px_rgba(0,255,255,0.3)]' 
                : 'bg-ft2-cursor text-ft2-bg hover:bg-ft2-highlight'}
            `}
          >
            Start Jamming!
          </button>
        </div>
      </div>
    </div>
  );
};

