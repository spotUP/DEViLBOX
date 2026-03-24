/**
 * PatternMatchButton.tsx
 * 
 * Floating button that appears when a file with pattern hash is loaded.
 * Clicking it opens the PatternMatchModal to show remixes/covers.
 */

import React from 'react';
import { Music } from 'lucide-react';
import { useModlandResultStore } from '@stores/useModlandResultStore';
import { usePatternMatchModal } from '@stores/usePatternMatchModal';

export const PatternMatchButton: React.FC = () => {
  const lastResult = useModlandResultStore((s) => s.lastResult);
  const showModal = usePatternMatchModal((s) => s.showModal);

  // Only show button if we have a pattern hash from a found file
  if (!lastResult?.found || !lastResult.patternHash || !lastResult.file) {
    return null;
  }

  const handleClick = () => {
    showModal(lastResult.patternHash!, lastResult.file!);
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-6 right-6 z-[99990] flex items-center gap-2 px-4 py-3 bg-ft2-highlight text-ft2-bg font-mono text-xs font-bold border-2 border-ft2-text shadow-lg hover:bg-ft2-text hover:text-ft2-highlight transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ft2-highlight focus:ring-offset-2 focus:ring-offset-ft2-bg"
      title="Find remixes and covers with the same melody"
    >
      <Music className="w-4 h-4" />
      FIND SIMILAR TUNES
    </button>
  );
};
