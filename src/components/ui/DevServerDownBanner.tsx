import React from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Shown in dev mode when the Vite dev server becomes unreachable.
 */
export const DevServerDownBanner: React.FC = () => (
  <div className="fixed top-0 left-0 right-0 z-[200] bg-red-700/95 border-b border-red-500 backdrop-blur-sm">
    <div className="flex items-center justify-center gap-2 px-4 py-2">
      <WifiOff size={16} className="text-white flex-shrink-0" />
      <p className="text-sm font-semibold text-white">
        Dev server is down —{' '}
        <code className="font-mono bg-red-900/60 px-1 rounded text-xs">npm run dev</code>
        {' '}to restart
      </p>
    </div>
  </div>
);
