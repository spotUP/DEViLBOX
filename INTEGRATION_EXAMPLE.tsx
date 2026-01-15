/**
 * Integration Example - How to use the new Scribbleton features
 *
 * This file demonstrates how to integrate all four new features into your app.
 * Copy the relevant sections into your actual components.
 */

import React, { useState, useEffect } from 'react';
import { PatternManagement } from '@components/pattern';
import { VirtualizedTrackerView } from '@components/tracker';
import { ExportDialog } from '@lib/export';
import { HelpModal } from '@components/help';

/**
 * Example 1: Complete App Layout with all features
 */
export const CompleteTrackerApp: React.FC = () => {
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // F1 shortcut for help
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setShowHelpModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-ft2-bg">
      {/* Top Menu Bar */}
      <div className="bg-ft2-header border-b-2 border-ft2-border px-4 py-2 flex items-center justify-between">
        <h1 className="font-mono text-ft2-text font-bold">SCRIBBLETON TRACKER</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowExportDialog(true)}
            className="px-3 py-1 bg-ft2-cursor text-ft2-bg font-mono text-xs hover:bg-ft2-highlight"
          >
            EXPORT/IMPORT
          </button>
          <button
            onClick={() => setShowHelpModal(true)}
            className="px-3 py-1 bg-ft2-bg border border-ft2-border text-ft2-text font-mono text-xs hover:border-ft2-highlight"
          >
            HELP (F1)
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Pattern Editor with Virtualization */}
        <div className="flex-1 flex flex-col">
          <VirtualizedTrackerView />
        </div>

        {/* Right: Pattern Management Sidebar */}
        <div className="w-80 border-l-2 border-ft2-border">
          <PatternManagement />
        </div>
      </div>

      {/* Modals */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
      />
      <HelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />
    </div>
  );
};

/**
 * Example 2: Just add Pattern Management to existing layout
 */
export const AddPatternManagement: React.FC = () => {
  return (
    <div className="flex h-screen">
      {/* Your existing tracker view */}
      <div className="flex-1">
        {/* <YourTrackerView /> */}
      </div>

      {/* Add pattern manager on the right */}
      <div className="w-80">
        <PatternManagement />
      </div>
    </div>
  );
};

/**
 * Example 3: Replace standard PatternEditor with VirtualizedTrackerView
 */
export const UpgradeToVirtualized: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col">
      {/* Pattern Info Bar */}
      <div className="bg-ft2-panel border-b border-ft2-border px-4 py-2">
        <span className="text-ft2-text text-sm font-mono">Pattern Info</span>
      </div>

      {/* Replace PatternEditor with VirtualizedTrackerView */}
      <VirtualizedTrackerView />

      {/* Help Text */}
      <div className="px-4 py-2 bg-ft2-panel border-t border-ft2-border text-xs text-ft2-textDim font-mono">
        <span>F1: Help | Space: Play/Pause | Del: Clear Cell</span>
      </div>
    </div>
  );
};

/**
 * Example 4: Export/Import Integration
 */
export const ExportImportIntegration: React.FC = () => {
  const [showExport, setShowExport] = useState(false);

  return (
    <>
      {/* Trigger button in your menu */}
      <button
        onClick={() => setShowExport(true)}
        className="btn font-mono text-xs"
      >
        EXPORT/IMPORT
      </button>

      {/* Export Dialog */}
      <ExportDialog
        isOpen={showExport}
        onClose={() => setShowExport(false)}
      />
    </>
  );
};

/**
 * Example 5: Help Modal with Keyboard Shortcut
 */
export const HelpIntegration: React.FC = () => {
  const [showHelp, setShowHelp] = useState(false);

  // Global F1 handler
  useEffect(() => {
    const handleF1 = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setShowHelp(true);
      }
    };
    window.addEventListener('keydown', handleF1);
    return () => window.removeEventListener('keydown', handleF1);
  }, []);

  return (
    <>
      {/* Your app content */}
      <div className="app">
        {/* Help button in UI */}
        <button onClick={() => setShowHelp(true)}>
          Help (F1)
        </button>
      </div>

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
      />
    </>
  );
};

/**
 * Example 6: Minimal Integration (just help + export)
 */
export const MinimalIntegration: React.FC = () => {
  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // F1 for help
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setShowHelp(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      {/* Your existing app */}
      <div className="your-app">
        <button onClick={() => setShowExport(true)}>Export</button>
        <button onClick={() => setShowHelp(true)}>Help</button>
      </div>

      {/* Add dialogs */}
      <ExportDialog isOpen={showExport} onClose={() => setShowExport(false)} />
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </>
  );
};

/**
 * Example 7: Programmatic Export (without dialog)
 */
import {
  exportSong,
  exportSFX,
  exportInstrument,
} from '@lib/export/exporters';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore } from '@stores';

export const ProgrammaticExport: React.FC = () => {
  const { patterns } = useTrackerStore();
  const { instruments } = useInstrumentStore();
  const { metadata } = useProjectStore();
  const { bpm } = useTransportStore();

  const handleQuickExportSong = () => {
    const sequence = patterns.map(p => p.id);
    exportSong(
      metadata,
      bpm,
      instruments,
      patterns,
      sequence,
      undefined, // automation
      { prettify: true }
    );
  };

  const handleQuickExportInstrument = (instrumentId: number) => {
    const instrument = instruments.find(i => i.id === instrumentId);
    if (instrument) {
      exportInstrument(instrument, { prettify: true });
    }
  };

  return (
    <div>
      <button onClick={handleQuickExportSong}>
        Quick Export Song
      </button>
      <button onClick={() => handleQuickExportInstrument(0)}>
        Quick Export Instrument
      </button>
    </div>
  );
};

/**
 * Example 8: Custom Pattern Management Panel
 */
export const CustomPatternPanel: React.FC = () => {
  return (
    <div className="flex flex-col h-full">
      {/* Top: Instrument Editor */}
      <div className="flex-1 border-b border-ft2-border">
        {/* <InstrumentEditor /> */}
      </div>

      {/* Bottom: Pattern Management */}
      <div className="h-96">
        <PatternManagement />
      </div>
    </div>
  );
};

/**
 * Example 9: Responsive Layout (mobile-friendly)
 */
export const ResponsiveLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col">
      {/* Mobile menu button */}
      <div className="lg:hidden bg-ft2-header px-4 py-2">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="btn"
        >
          {sidebarOpen ? 'Hide' : 'Show'} Patterns
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main tracker */}
        <div className="flex-1">
          <VirtualizedTrackerView />
        </div>

        {/* Pattern sidebar (hidden on mobile unless open) */}
        <div
          className={`
            w-80 border-l border-ft2-border
            ${sidebarOpen ? 'block' : 'hidden lg:block'}
          `}
        >
          <PatternManagement />
        </div>
      </div>
    </div>
  );
};

/**
 * Tips for Integration:
 *
 * 1. PatternManagement can be placed anywhere (sidebar, drawer, modal)
 * 2. VirtualizedTrackerView is a drop-in replacement for PatternEditor
 * 3. ExportDialog is a modal - trigger with any button/menu item
 * 4. HelpModal should have F1 shortcut at app level
 * 5. All components use FT2 theme classes
 * 6. All components integrate with existing Zustand stores
 * 7. No additional setup needed - just import and use!
 */
