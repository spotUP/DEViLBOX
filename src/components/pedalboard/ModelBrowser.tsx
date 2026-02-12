/**
 * ModelBrowser - Neural model selector organized by category
 * Displays all 37 GuitarML models grouped by type with search
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { Search, Zap, Volume2 } from 'lucide-react';
import {
  GUITARML_MODEL_REGISTRY,
  getModelsByCategory,
} from '@constants/guitarMLRegistry';
import type { NeuralModelInfo } from '@typedefs/pedalboard';
import { useThemeStore } from '@stores';

interface ModelBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (modelInfo: NeuralModelInfo) => void;
  currentModelIndex?: number;
}

// Categories used in GuitarML models
type ModelCategory = 'overdrive' | 'distortion' | 'amplifier';

const CATEGORY_LABELS: Record<ModelCategory, string> = {
  overdrive: 'Overdrive',
  distortion: 'Distortion',
  amplifier: 'Amplifier',
};

export const ModelBrowser: React.FC<ModelBrowserProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentModelIndex,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ModelCategory | 'all'>('all');
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      requestAnimationFrame(() => {
        setSearchQuery('');
        setSelectedCategory('all');
      });
    }
  }, [isOpen]);

  // Filter models by search and category
  const filteredModels = useMemo(() => {
    let models = GUITARML_MODEL_REGISTRY;

    // Filter by category
    if (selectedCategory !== 'all') {
      models = getModelsByCategory(selectedCategory);
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      models = models.filter(
        (model) =>
          model.name.toLowerCase().includes(query) ||
          model.category.toLowerCase().includes(query)
      );
    }

    return models;
  }, [searchQuery, selectedCategory]);

  // Group filtered models by category for display
  const groupedModels = useMemo(() => {
    const groups: Record<ModelCategory, NeuralModelInfo[]> = {
      overdrive: [],
      distortion: [],
      amplifier: [],
    };

    filteredModels.forEach((model) => {
      const category = model.category as ModelCategory;
      if (groups[category]) {
        groups[category].push(model);
      }
    });

    return groups;
  }, [filteredModels]);

  const handleSelect = (model: NeuralModelInfo) => {
    onSelect(model);
    onClose();
  };

  const accentColor = isCyanTheme ? '#00ffff' : '#ffcc00';
  const bgColor = isCyanTheme ? '#030808' : '#1e1e1e';
  const panelBg = isCyanTheme ? '#051515' : '#1a1a1a';
  const borderColor = isCyanTheme ? '#0a3030' : '#333';

  // Category icon rendering function
  const getCategoryIcon = (category: ModelCategory) => {
    switch (category) {
      case 'overdrive':
      case 'distortion':
        return <Zap size={16} />;
      case 'amplifier':
        return <Volume2 size={16} />;
      default:
        return null;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalHeader
        title="Neural Model Browser"
        subtitle={`${GUITARML_MODEL_REGISTRY.length} models available`}
        icon={<Zap size={20} style={{ color: accentColor }} />}
        onClose={onClose}
      />

      <div className="flex-1 overflow-hidden flex flex-col" style={{ backgroundColor: bgColor }}>
        {/* Search and Filters */}
        <div className="p-4 border-b" style={{ borderColor }}>
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded border focus:outline-none focus:ring-2"
              style={{
                backgroundColor: panelBg,
                borderColor,
                color: isCyanTheme ? '#00ffff' : '#fff',
              }}
              aria-label="Search neural models"
            />
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter by category">
            <button
              onClick={() => setSelectedCategory('all')}
              className="px-3 py-1 rounded text-xs font-medium transition-colors"
              style={{
                backgroundColor: selectedCategory === 'all' ? accentColor : panelBg,
                color: selectedCategory === 'all' ? '#000' : '#999',
                borderWidth: 1,
                borderColor: selectedCategory === 'all' ? accentColor : borderColor,
              }}
              aria-pressed={selectedCategory === 'all'}
              aria-label="Show all categories"
            >
              All
            </button>
            {(Object.keys(CATEGORY_LABELS) as ModelCategory[]).map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className="px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
                style={{
                  backgroundColor: selectedCategory === category ? accentColor : panelBg,
                  color: selectedCategory === category ? '#000' : '#999',
                  borderWidth: 1,
                  borderColor: selectedCategory === category ? accentColor : borderColor,
                }}
                aria-pressed={selectedCategory === category}
                aria-label={`Filter ${CATEGORY_LABELS[category]}`}
              >
                {getCategoryIcon(category)}
                {CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>
        </div>

        {/* Model Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredModels.length === 0 ? (
            <div className="text-center py-8 text-gray-500" role="status">
              No models found matching "{searchQuery}"
            </div>
          ) : (
            <div className="space-y-6">
              {(Object.keys(groupedModels) as ModelCategory[]).map((category) => {
                const categoryModels = groupedModels[category];
                if (categoryModels.length === 0) return null;

                return (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-3">
                      {getCategoryIcon(category)}
                      <h3
                        className="text-sm font-bold uppercase tracking-wide"
                        style={{ color: accentColor }}
                      >
                        {CATEGORY_LABELS[category]}
                      </h3>
                      <span className="text-xs text-gray-500">({categoryModels.length})</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2" role="list" aria-label={`${CATEGORY_LABELS[category]} models`}>
                      {categoryModels.map((model) => {
                        const isSelected = model.index === currentModelIndex;
                        return (
                          <button
                            key={model.index}
                            onClick={() => handleSelect(model)}
                            className="p-3 rounded border-2 transition-all text-left hover:scale-105"
                            style={{
                              backgroundColor: isSelected ? `${accentColor}20` : panelBg,
                              borderColor: isSelected ? accentColor : borderColor,
                              color: isSelected ? accentColor : '#999',
                            }}
                            aria-label={`Select ${model.name} model`}
                            aria-pressed={isSelected}
                            role="listitem"
                          >
                            <div className="font-medium text-sm">{model.name}</div>
                            <div className="text-xs mt-1 opacity-70">Index: {model.index}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
};
