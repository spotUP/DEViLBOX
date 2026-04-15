/**
 * PresetSearch — Search input and sort dropdown
 */

import React from 'react';

interface PresetSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: 'name' | 'category' | 'synth';
  onSortChange: (sortBy: 'name' | 'category' | 'synth') => void;
}

export const PresetSearch: React.FC<PresetSearchProps> = ({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange
}) => {
  return (
    <div className="flex gap-2">
      {/* Search Input */}
      <div className="flex-1 relative">
        <input
          type="text"
          placeholder="Search presets..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full px-2 py-1.5 pl-7 bg-dark-bgTertiary border border-dark-borderLight 
                     text-text-primary text-xs font-mono rounded
                     focus:outline-none focus:ring-1 focus:ring-accent-primary"
        />
        <svg
          className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Sort Dropdown */}
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value as 'name' | 'category' | 'synth')}
        className="px-2 py-1.5 bg-dark-bgTertiary border border-dark-borderLight text-text-primary 
                   text-xs font-mono rounded cursor-pointer
                   focus:outline-none focus:ring-1 focus:ring-accent-primary"
      >
        <option value="name">Name</option>
        <option value="category">Category</option>
        <option value="synth">Synth Type</option>
      </select>
    </div>
  );
};
