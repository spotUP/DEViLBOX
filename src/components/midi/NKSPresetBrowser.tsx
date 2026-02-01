/**
 * NKS Preset Browser Component
 * 
 * Browse and load NKS presets with metadata search
 */

import React, { useState, useMemo } from 'react';
import { useNKSStore } from '@/midi/nks/NKSManager';
import { parseNKSF } from '@/midi/nks/NKSFileFormat';
import type { NKSPreset } from '@/midi/nks/types';

interface PresetBrowserProps {
  onClose?: () => void;
}

export const NKSPresetBrowser: React.FC<PresetBrowserProps> = ({ onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'author' | 'date'>('name');
  
  const { presets, loadPreset } = useNKSStore();
  
  // Filter and sort presets
  const filteredPresets = useMemo(() => {
    let filtered = [...presets];
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(preset => 
        preset.metadata.name.toLowerCase().includes(query) ||
        preset.metadata.author?.toLowerCase().includes(query) ||
        preset.metadata.comment?.toLowerCase().includes(query) ||
        preset.metadata.bankChain.some((bank: string) => bank.toLowerCase().includes(query))
      );
    }
    
    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(preset => 
        preset.metadata.bankChain.includes(selectedCategory)
      );
    }
    
    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.metadata.name.localeCompare(b.metadata.name);
        case 'author':
          return (a.metadata.author || '').localeCompare(b.metadata.author || '');
        case 'date':
          // Timestamp not available in metadata, sort by name instead
          return a.metadata.name.localeCompare(b.metadata.name);
        default:
          return 0;
      }
    });
    
    return filtered;
  }, [presets, searchQuery, selectedCategory, sortBy]);
  
  // Extract unique categories from bank chains
  const categories = useMemo(() => {
    const cats = new Set<string>();
    presets.forEach((preset: NKSPreset) => {
      preset.metadata.bankChain.forEach((bank: string) => cats.add(bank));
    });
    return Array.from(cats).sort();
  }, [presets]);
  
  const handleLoadPreset = (preset: NKSPreset) => {
    loadPreset(preset);
    onClose?.();
  };
  
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      const buffer = await file.arrayBuffer();
      const preset = await parseNKSF(buffer);
      
      if (preset) {
        const state = useNKSStore.getState();
        state.addPreset(preset);
        loadPreset(preset);
      }
    } catch (error) {
      console.error('[NKS] Failed to import preset:', error);
      alert('Failed to import preset file');
    }
  };
  
  return (
    <div className="nks-preset-browser fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">NKS Preset Browser</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Search and Filters */}
        <div className="p-4 border-b border-gray-700 space-y-3">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search presets..."
              className="w-full px-4 py-2 pl-10 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 outline-none"
            />
            <svg
              className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          {/* Filters */}
          <div className="flex gap-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 outline-none"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 outline-none"
            >
              <option value="name">Sort by Name</option>
              <option value="author">Sort by Author</option>
              <option value="date">Sort by Date</option>
            </select>
            
            <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer transition-colors">
              Import .nksf
              <input
                type="file"
                accept=".nksf"
                onChange={handleImportFile}
                className="hidden"
              />
            </label>
          </div>
        </div>
        
        {/* Preset List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredPresets.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <p>No presets found</p>
              {presets.length === 0 && (
                <p className="text-sm mt-2">Import .nksf files to get started</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredPresets.map((preset, index) => (
                <button
                  key={`${preset.metadata.uuid}-${index}`}
                  onClick={() => handleLoadPreset(preset)}
                  className="text-left p-4 bg-gray-700 hover:bg-gray-600 rounded transition-colors group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate group-hover:text-blue-400 transition-colors">
                        {preset.metadata.name}
                      </div>
                      {preset.metadata.author && (
                        <div className="text-xs text-gray-400 mt-1">
                          by {preset.metadata.author}
                        </div>
                      )}
                      {preset.metadata.bankChain.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1 truncate">
                          {preset.metadata.bankChain.join(' › ')}
                        </div>
                      )}
                      {preset.metadata.comment && (
                        <div className="text-xs text-gray-500 mt-2 line-clamp-2">
                          {preset.metadata.comment}
                        </div>
                      )}
                    </div>
                    <svg
                      className="w-5 h-5 text-gray-500 group-hover:text-blue-400 transition-colors ml-2 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  
                  {/* Parameter count badge */}
                  <div className="mt-2 text-xs text-gray-500">
                    {Object.keys(preset.parameters).length} parameters
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-700 text-xs text-gray-500">
          Showing {filteredPresets.length} of {presets.length} presets
        </div>
      </div>
    </div>
  );
};
