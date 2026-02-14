/**
 * ModuleShelf - Module palette for adding modules
 *
 * Dropdown menu grouped by category to add new modules to the patch.
 */

import React, { useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import type { ModuleCategory, ModuleDescriptor } from '../../../../../types/modular';
import { ModuleRegistry } from '../../../../../engine/modular/ModuleRegistry';

interface ModuleShelfProps {
  onAddModule: (descriptorId: string) => void;
}

const CATEGORY_NAMES: Record<ModuleCategory, string> = {
  source: 'Sources',
  filter: 'Filters',
  amplifier: 'Amplifiers',
  modulator: 'Modulators',
  envelope: 'Envelopes',
  utility: 'Utility',
  io: 'I/O',
};

export const ModuleShelf: React.FC<ModuleShelfProps> = ({ onAddModule }) => {
  const [isOpen, setIsOpen] = useState(false);

  const allModules = ModuleRegistry.getAll();

  // Group modules by category
  const categories = Object.keys(CATEGORY_NAMES) as ModuleCategory[];
  const modulesByCategory = categories.reduce(
    (acc, cat) => {
      acc[cat] = allModules.filter((m) => m.category === cat);
      return acc;
    },
    {} as Record<ModuleCategory, ModuleDescriptor[]>
  );

  const handleAddModule = (descriptorId: string) => {
    onAddModule(descriptorId);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-accent-primary hover:bg-accent-primary-hover rounded text-sm font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Module
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-surface-secondary border border-border rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          {categories.map((category) => {
            const modules = modulesByCategory[category];
            if (modules.length === 0) return null;

            return (
              <div key={category} className="border-b border-border last:border-b-0">
                {/* Category header */}
                <div className="px-3 py-2 bg-surface-tertiary text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  {CATEGORY_NAMES[category]}
                </div>

                {/* Module list */}
                <div className="py-1">
                  {modules.map((module) => (
                    <button
                      key={module.id}
                      onClick={() => handleAddModule(module.id)}
                      className="w-full px-4 py-2 text-left hover:bg-surface-tertiary transition-colors text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {/* Color indicator */}
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: module.color || '#6b7280' }}
                        />
                        <span className="text-text-primary">{module.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};
