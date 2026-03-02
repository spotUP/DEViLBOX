// Modland Browser Component
// Browse 727K+ tracker files from the Modland archive

import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Download, Play, Filter } from 'lucide-react';
import { modlandService } from '../../lib/modland/ModlandService';
import { getModlandDownloadUrl } from '../../lib/modland/ModlandMetadata';
import type { ModlandSearchResult } from '../../types/modland';
import { useVirtualizer } from '@tanstack/react-virtual';

interface ModlandBrowserProps {
  onClose: () => void;
}

export const ModlandBrowser: React.FC<ModlandBrowserProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const [results, setResults] = useState<ModlandSearchResult[]>([]);
  const [formatStats, setFormatStats] = useState<Record<string, number>>({});

  // Initialize database and load random files
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await modlandService.init();
        const [random, stats] = await Promise.all([
          modlandService.getRandomFiles(50),
          modlandService.getFormatStats()
        ]);
        setResults(random);
        setFormatStats(stats);
      } catch (error) {
        console.error('Failed to initialize Modland:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Search handler with debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      // Load random files when search is cleared
      modlandService.getRandomFiles(50).then(setResults);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const searchResults = await modlandService.searchFiles(searchQuery, 100);
        setResults(searchResults);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Format filter handler
  const handleFormatFilter = async (format: string) => {
    setSelectedFormat(format);
    if (format === 'all') {
      const random = await modlandService.getRandomFiles(50);
      setResults(random);
    } else {
      setSearching(true);
      const filtered = await modlandService.getFilesByFormat(format, 100);
      setResults(filtered);
      setSearching(false);
    }
  };

  // Download file from Modland CDN
  const handleDownload = (result: ModlandSearchResult) => {
    const url = getModlandDownloadUrl(result.file);
    window.open(url, '_blank');
  };

  // Virtual scrolling for performance
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 10,
  });

  const formats = [
    { ext: 'all', label: 'All', count: 727138 },
    { ext: 'mod', label: 'MOD', count: formatStats['.mod'] || 0 },
    { ext: 'xm', label: 'XM', count: formatStats['.xm'] || 0 },
    { ext: 'it', label: 'IT', count: formatStats['.it'] || 0 },
    { ext: 's3m', label: 'S3M', count: formatStats['.s3m'] || 0 },
    { ext: 'fur', label: 'Furnace', count: formatStats['.fur'] || 0 },
    { ext: 'ftm', label: 'FamiTracker', count: formatStats['.ftm'] || 0 },
    { ext: 'sid', label: 'SID', count: formatStats['.sid'] || 0 },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-dark-bg border border-dark-border rounded-lg w-full max-w-6xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <div>
            <h2 className="text-xl font-bold text-white">Modland Archive Browser</h2>
            <p className="text-sm text-gray-400">
              {loading ? 'Loading database...' : '727,138 tracker modules from Modland'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-dark-hover rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-dark-border">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by filename, artist, or title..."
                className="w-full pl-10 pr-4 py-2 bg-dark-panel border border-dark-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={loading}
              />
            </div>
          </div>

          {/* Format Filters */}
          <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
            {formats.map((format) => (
              <button
                key={format.ext}
                onClick={() => handleFormatFilter(format.ext)}
                className={`px-3 py-1 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  selectedFormat === format.ext
                    ? 'bg-primary text-white'
                    : 'bg-dark-panel hover:bg-dark-hover text-gray-300'
                }`}
                disabled={loading}
              >
                {format.label} {format.count > 0 && `(${format.count.toLocaleString()})`}
              </button>
            ))}
          </div>
        </div>

        {/* Results List */}
        <div ref={parentRef} className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400">Loading Modland database (865MB)...</div>
            </div>
          ) : searching ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400">Searching...</div>
            </div>
          ) : results.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400">No results found</div>
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const result = results[virtualItem.index];
                const { file, metadata } = result;

                return (
                  <div
                    key={virtualItem.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    className="px-4 py-3 hover:bg-dark-hover border-b border-dark-border/50"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium truncate">
                          {metadata.title}
                        </div>
                        <div className="text-sm text-gray-400 flex items-center gap-2">
                          <span>{metadata.artist}</span>
                          <span className="text-gray-600">•</span>
                          <span className="text-primary">{metadata.format}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(result)}
                        className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm flex items-center gap-1.5 transition-colors"
                        title="Download from Modland CDN"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-dark-border text-sm text-gray-400 text-center">
          Data from <a href="https://www.modland.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Modland.com</a> • 
          Click Download to fetch from Modland CDN
        </div>
      </div>
    </div>
  );
};
