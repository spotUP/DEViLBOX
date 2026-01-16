/**
 * SavePresetDialog - Modal dialog for saving user presets
 */

import React, { useState } from 'react';
import { usePresetStore, type PresetCategory } from '@stores/usePresetStore';
import type { InstrumentConfig } from '@typedefs/instrument';
import { X, Save, Tag } from 'lucide-react';

interface SavePresetDialogProps {
  instrument: InstrumentConfig;
  onClose: () => void;
}

const CATEGORIES: PresetCategory[] = ['Bass', 'Lead', 'Pad', 'Drum', 'FX', 'User'];

const SUGGESTED_TAGS = [
  'acid', 'deep', 'aggressive', 'soft', 'bright', 'dark',
  'punchy', 'smooth', 'distorted', 'clean', 'wet', 'dry',
];

export const SavePresetDialog: React.FC<SavePresetDialogProps> = ({
  instrument,
  onClose,
}) => {
  const { savePreset } = usePresetStore();

  const [name, setName] = useState(instrument.name);
  const [category, setCategory] = useState<PresetCategory>('User');
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;

    savePreset(instrument, name.trim(), category, tags);
    onClose();
  };

  const handleAddTag = (tag: string) => {
    if (tag && !tags.includes(tag) && tags.length < 5) {
      setTags([...tags, tag]);
    }
    setCustomTag('');
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-dark-bgTertiary border border-dark-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-bgSecondary">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            <Save size={18} className="text-accent-primary" />
            Save Preset
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-dark-bgHover text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              Preset Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="My Awesome Sound"
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
              autoFocus
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`
                    px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                    ${category === cat
                      ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary'
                      : 'bg-dark-bg border border-dark-border text-text-secondary hover:text-text-primary hover:border-text-muted'
                    }
                  `}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              Tags (optional)
            </label>

            {/* Current tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-1 bg-accent-primary/20 text-accent-primary rounded text-xs"
                  >
                    <Tag size={10} />
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-accent-error ml-1"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Tag suggestions */}
            <div className="flex flex-wrap gap-1 mb-2">
              {SUGGESTED_TAGS
                .filter((t) => !tags.includes(t))
                .slice(0, 8)
                .map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleAddTag(tag)}
                    className="px-2 py-1 bg-dark-bg border border-dark-border rounded text-xs text-text-muted hover:text-text-primary hover:border-text-muted transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
            </div>

            {/* Custom tag input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value.toLowerCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag(customTag);
                  }
                }}
                placeholder="Add custom tag..."
                className="flex-1 px-3 py-1.5 bg-dark-bg border border-dark-border rounded-lg text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent-primary/50"
              />
              <button
                onClick={() => handleAddTag(customTag)}
                disabled={!customTag || tags.includes(customTag)}
                className="px-3 py-1.5 bg-dark-bg border border-dark-border rounded-lg text-sm text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>

          {/* Synth Info */}
          <div className="text-xs text-text-muted bg-dark-bg/50 rounded-lg p-3">
            <p>
              <span className="font-medium">Synth Type:</span> {instrument.synthType}
            </p>
            <p>
              <span className="font-medium">Effects:</span> {instrument.effects?.length || 0} effect{(instrument.effects?.length || 0) !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-dark-border bg-dark-bgSecondary">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-dark-bgHover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-primary text-text-inverse hover:bg-accent-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Preset
          </button>
        </div>
      </div>
    </div>
  );
};
