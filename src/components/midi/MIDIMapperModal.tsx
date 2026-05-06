/**
 * MIDIMapperModal — visual MIDI controller mapping editor
 *
 * Shows a visual representation of the connected controller with all controls
 * color-coded by their current assignment. Click any control to change its
 * mapping. Supports MIDI learn mode.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ModalHeader } from '@/components/ui/ModalHeader';
import { ModalFooter } from '@/components/ui/ModalFooter';
import { Button } from '@/components/ui/Button';
import { Sliders, Zap, RotateCcw, Download, Upload } from 'lucide-react';
import { ControllerLayoutView } from './ControllerLayoutView';
import { MIDIAssignPopover } from './MIDIAssignPopover';
import { getControllerLayout } from '@/midi/controllerLayouts';
import type { ControllerLayout, ControlDescriptor } from '@/midi/controllerLayouts';
import { useMIDIPresetStore } from '@/stores/useMIDIPresetStore';
import type { ControlAssignment } from '@/stores/useMIDIPresetStore';
import { DJ_CONTROLLER_PRESETS } from '@/midi/djControllerPresets';
import type { DJControllerPreset } from '@/midi/djControllerPresets';
import { getMIDIManager } from '@/midi/MIDIManager';
import type { MIDIMessage } from '@/midi/types';
import { notify } from '@/stores/useNotificationStore';

// ============================================================================
// FACTORY ASSIGNMENTS — derived from current preset
// ============================================================================

function buildFactoryAssignments(layout: ControllerLayout): Record<string, ControlAssignment> {
  const assignments: Record<string, ControlAssignment> = {};

  const preset: DJControllerPreset | undefined = DJ_CONTROLLER_PRESETS.find(
    (p) => p.id === layout.id,
  );
  if (!preset) return assignments;

  for (const control of layout.controls) {
    const { midi } = control;

    // Check CC mappings
    if (midi.type === 'cc') {
      const ccMapping = preset.ccMappings?.find(
        (m) => m.channel === midi.channel && m.cc === midi.number,
      );
      if (ccMapping) {
        const kind = ccMapping.param.startsWith('dub.') ? 'dub' : 'param';
        assignments[control.id] = { kind, target: ccMapping.param, invert: ccMapping.invert };
      }
    }

    // Check note mappings (button actions/params)
    if (midi.type === 'note' || midi.pushNote !== undefined) {
      const noteNum = midi.type === 'note' ? midi.number : midi.pushNote!;
      const noteCh = midi.type === 'note' ? midi.channel : (midi.pushChannel ?? midi.channel);
      const noteMapping = preset.noteMappings?.find(
        (m) => m.channel === noteCh && m.note === noteNum,
      );
      if (noteMapping) {
        if ('action' in noteMapping) {
          assignments[control.id] = { kind: 'action', target: noteMapping.action };
        } else if ('param' in noteMapping) {
          const kind = noteMapping.param.startsWith('dub.') ? 'dub' : 'param';
          assignments[control.id] = {
            kind,
            target: noteMapping.param,
            onValue: noteMapping.onValue,
            offValue: noteMapping.offValue,
          };
        }
      }
    }
  }

  return assignments;
}

// ============================================================================
// COMPONENT
// ============================================================================

interface MIDIMapperModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Override which layout to show (otherwise auto-detects from connected controller) */
  layoutId?: string;
}

export const MIDIMapperModal: React.FC<MIDIMapperModalProps> = ({
  isOpen,
  onClose,
  layoutId: layoutIdProp,
}) => {
  // Resolve layout
  const resolvedLayoutId = layoutIdProp ?? 'behringer-xtouch-compact';
  const layout = useMemo(() => getControllerLayout(resolvedLayoutId), [resolvedLayoutId]);

  // Factory + user assignments
  const factoryAssignments = useMemo(
    () => (layout ? buildFactoryAssignments(layout) : {}),
    [layout],
  );
  const userOverrides = useMIDIPresetStore(
    useCallback((s: { overrides: Record<string, Record<string, ControlAssignment>> }) => s.overrides[resolvedLayoutId], [resolvedLayoutId]),
  );
  const { setAssignment, clearAssignment, resetController, importOverrides } = useMIDIPresetStore.getState();

  // Merged assignments (user overrides take precedence)
  const mergedAssignments = useMemo(
    () => (userOverrides ? { ...factoryAssignments, ...userOverrides } : factoryAssignments),
    [factoryAssignments, userOverrides],
  );

  // Selected control + popover
  const [selectedControl, setSelectedControl] = useState<ControlDescriptor | null>(null);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });

  // MIDI learn
  const [isLearnMode, setIsLearnMode] = useState(false);
  const [learnHighlight, setLearnHighlight] = useState<string | null>(null);
  const learnTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleSelectControl = useCallback((control: ControlDescriptor) => {
    setSelectedControl(control);
    // Position popover near the control (approximate)
    const CELL = 32;
    const PAD = 16;
    setPopoverPos({
      x: PAD + control.x * CELL + CELL + 20,
      y: PAD + control.y * CELL,
    });
  }, []);

  const handleAssign = useCallback((assignment: ControlAssignment) => {
    if (!selectedControl) return;
    setAssignment(resolvedLayoutId, selectedControl.id, assignment);
    setSelectedControl(null);
  }, [selectedControl, resolvedLayoutId, setAssignment]);

  const handleClear = useCallback(() => {
    if (!selectedControl) return;
    clearAssignment(resolvedLayoutId, selectedControl.id);
    setSelectedControl(null);
  }, [selectedControl, resolvedLayoutId, clearAssignment]);

  const handleReset = useCallback(() => {
    resetController(resolvedLayoutId);
    notify.success('Reset to factory mappings');
  }, [resolvedLayoutId, resetController]);

  // Export/Import
  const handleExport = useCallback(() => {
    const data = useMIDIPresetStore.getState().exportOverrides(resolvedLayoutId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resolvedLayoutId}-mappings.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [resolvedLayoutId]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        importOverrides(resolvedLayoutId, data);
        notify.success('Mappings imported');
      } catch {
        notify.error('Invalid mapping file');
      }
    };
    input.click();
  }, [resolvedLayoutId, importOverrides]);

  // MIDI Learn — listen for any incoming MIDI and highlight the matching control
  useEffect(() => {
    if (!isOpen || !isLearnMode || !layout) return;

    const manager = getMIDIManager();
    const handleMIDI = (msg: MIDIMessage) => {
      let matchedControl: ControlDescriptor | undefined;

      if (msg.type === 'cc' && msg.cc !== undefined) {
        matchedControl = layout.controls.find(
          (c) => c.midi.type === 'cc' && c.midi.channel === msg.channel && c.midi.number === msg.cc,
        );
      } else if (msg.type === 'noteOn' && msg.note !== undefined) {
        matchedControl = layout.controls.find(
          (c) => (c.midi.type === 'note' && c.midi.channel === msg.channel && c.midi.number === msg.note) ||
                 (c.midi.pushNote === msg.note && (c.midi.pushChannel ?? c.midi.channel) === msg.channel),
        );
      }

      if (matchedControl) {
        setLearnHighlight(matchedControl.id);
        setSelectedControl(matchedControl);
        const CELL = 32;
        const PAD = 16;
        setPopoverPos({
          x: PAD + matchedControl.x * CELL + CELL + 20,
          y: PAD + matchedControl.y * CELL,
        });

        // Clear highlight after 1s
        if (learnTimeoutRef.current) clearTimeout(learnTimeoutRef.current);
        learnTimeoutRef.current = setTimeout(() => setLearnHighlight(null), 1000);
      }
    };

    manager.addMessageHandler(handleMIDI);
    return () => {
      manager.removeMessageHandler(handleMIDI);
      if (learnTimeoutRef.current) clearTimeout(learnTimeoutRef.current);
    };
  }, [isOpen, isLearnMode, layout]);

  if (!layout) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="md">
        <ModalHeader title="MIDI Mapper" onClose={onClose} />
        <div className="p-8 text-center text-text-muted font-mono text-sm">
          No controller layout found for "{resolvedLayoutId}"
        </div>
      </Modal>
    );
  }

  const overrideCount = Object.keys(userOverrides).length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader
        title="MIDI Controller Mapper"
        subtitle={`${layout.manufacturer} ${layout.name} · ${overrideCount} custom mapping${overrideCount !== 1 ? 's' : ''}`}
        icon={<Sliders size={18} />}
        onClose={onClose}
      />

      <div className="flex-1 overflow-auto p-4 relative">
        {/* Learn mode indicator */}
        {isLearnMode && (
          <div className="absolute top-2 right-2 px-3 py-1.5 bg-accent-error/20 border border-accent-error rounded text-accent-error text-[10px] font-mono animate-pulse z-10">
            MIDI Learn — press a control on the mixer
          </div>
        )}

        {/* Layout view */}
        <div className="flex justify-center">
          <div className="relative">
            <ControllerLayoutView
              layout={layout}
              assignments={mergedAssignments}
              selectedControlId={selectedControl?.id}
              learnHighlightId={learnHighlight}
              onSelectControl={handleSelectControl}
            />

            {/* Assignment popover */}
            {selectedControl && (
              <MIDIAssignPopover
                control={selectedControl}
                currentAssignment={mergedAssignments[selectedControl.id]}
                position={popoverPos}
                onAssign={handleAssign}
                onClear={handleClear}
                onClose={() => setSelectedControl(null)}
              />
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-3 text-[10px] font-mono">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#333] border border-[#555]" /> Unassigned
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#1a3a5c] border border-[#3b82f6]" /> Parameter
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#1a4a2e] border border-[#22c55e]" /> Action
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[#4a2c1a] border border-[#f97316]" /> Dub Move
          </span>
        </div>
      </div>

      <ModalFooter align="between">
        <div className="flex gap-2">
          <Button
            variant={isLearnMode ? 'primary' : 'default'}
            size="sm"
            icon={<Zap size={14} />}
            onClick={() => setIsLearnMode(!isLearnMode)}
          >
            {isLearnMode ? 'Stop Learn' : 'MIDI Learn'}
          </Button>
          <Button variant="ghost" size="sm" icon={<Download size={14} />} onClick={handleExport}>
            Export
          </Button>
          <Button variant="ghost" size="sm" icon={<Upload size={14} />} onClick={handleImport}>
            Import
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={handleReset}>
            Factory Reset
          </Button>
          <Button variant="default" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
};
