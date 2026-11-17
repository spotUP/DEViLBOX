/**
 * ValueOpsDialog - Scale / Transpose / Randomize the values of one column in the selection.
 * Glue only: the maths lives in patternEditActions via the store's editSelectionValues.
 */

import React, { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useTrackerStore, useCursorStore } from '@stores';
import { valueColumnOf, type NibbleMode, type ValueColumn } from '@stores/tracker/patternEditActions';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { useDialogKeyboard } from '@hooks/useDialogKeyboard';
import { CustomSelect } from '@components/common/CustomSelect';

export type ValueOpKind = 'scale' | 'transpose' | 'transposeNotes' | 'randomize';

interface ValueOpsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Operation shown when the dialog opens. */
  initialOp: ValueOpKind;
}

const COLUMN_OPTIONS: { value: ValueColumn; label: string }[] = [
  { value: 'instrument', label: 'Instrument' },
  { value: 'volume', label: 'Volume' },
  { value: 'effParam', label: 'Effect 1 Parameter' },
  { value: 'effParam2', label: 'Effect 2 Parameter' },
];

const NIBBLE_OPTIONS: { value: NibbleMode; label: string }[] = [
  { value: 'both', label: 'Whole Value' },
  { value: 'high', label: 'High Nibble' },
  { value: 'low', label: 'Low Nibble' },
];

const OP_OPTIONS: { value: ValueOpKind; label: string }[] = [
  { value: 'scale', label: 'Scale by Percent' },
  { value: 'transposeNotes', label: 'Transpose Notes by Semitones' },
  { value: 'transpose', label: 'Transpose Values by Amount' },
  { value: 'randomize', label: 'Randomize' },
];

const INPUT_CLASS = 'w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-text-primary font-mono focus:outline-none focus:border-accent-primary';
const SELECT_CLASS = 'w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-text-primary';

export const ValueOpsDialog: React.FC<ValueOpsDialogProps> = ({ isOpen, onClose, initialOp }) => {
  const selection = useCursorStore((s) => s.selection);
  const cursorColumn = useCursorStore((s) => valueColumnOf(s.cursor.columnType));
  const editSelectionValues = useTrackerStore((s) => s.editSelectionValues);
  const transposeSelection = useTrackerStore((s) => s.transposeSelection);
  const [opChoice, setOpChoice] = useState<{ from: ValueOpKind; op: ValueOpKind }>({ from: initialOp, op: initialOp });
  // Follow the menu entry that opened the dialog without an effect: a new initialOp resets the pick.
  const op = opChoice.from === initialOp ? opChoice.op : initialOp;
  const [columnPick, setColumnPick] = useState<ValueColumn | null>(null);
  const column = columnPick ?? cursorColumn ?? 'volume';
  const [nibble, setNibble] = useState<NibbleMode>('both');
  const [percent, setPercent] = useState(110);
  const [amount, setAmount] = useState(1);
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(255);
  const [setEffect, setSetEffect] = useState(-1);

  const handleApply = () => {
    if (!selection) return;
    if (op === 'transposeNotes') transposeSelection(amount);
    else if (op === 'scale') editSelectionValues({ kind: 'scale', percent }, column, nibble);
    else if (op === 'transpose') editSelectionValues({ kind: 'transpose', amount }, column, nibble);
    else editSelectionValues({ kind: 'randomize', min: Math.min(min, max), max: Math.max(min, max), setEffect: setEffect >= 0 ? setEffect : null }, column, nibble);
    onClose();
  };

  const { shortcuts } = useDialogKeyboard({ isOpen, onConfirm: handleApply, onCancel: onClose, confirmDisabled: !selection });

  const numberField = (label: string, value: number, set: (v: number) => void) => (
    <div>
      <label className="block text-xs text-text-muted mb-1">{label}</label>
      <input type="number" value={value} onChange={(e) => set(parseInt(e.target.value) || 0)} className={INPUT_CLASS} />
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" theme="modern" backdropOpacity="medium" closeOnBackdropClick closeOnEscape>
      <ModalHeader title="Change Values" icon={<SlidersHorizontal size={18} />} onClose={onClose} theme="modern" />
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1">Operation</label>
          <CustomSelect value={op} onChange={(v) => setOpChoice({ from: initialOp, op: v as ValueOpKind })} options={OP_OPTIONS} className={SELECT_CLASS} />
        </div>
        {op !== 'transposeNotes' && <>
        <div>
          <label className="block text-xs text-text-muted mb-1">Column</label>
          <CustomSelect value={column} onChange={(v) => setColumnPick(v as ValueColumn)} options={COLUMN_OPTIONS} className={SELECT_CLASS} />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Nibble Mode</label>
          <CustomSelect value={nibble} onChange={(v) => setNibble(v as NibbleMode)} options={NIBBLE_OPTIONS} className={SELECT_CLASS} />
        </div>
        </>}
        {op === 'scale' && numberField('Percent', percent, setPercent)}
        {(op === 'transpose' || op === 'transposeNotes') && numberField(op === 'transposeNotes' ? 'Semitones (negative lowers)' : 'Amount (negative lowers)', amount, setAmount)}
        {op === 'randomize' && (
          <div className="grid grid-cols-2 gap-2">
            {numberField('Minimum', min, setMin)}
            {numberField('Maximum', max, setMax)}
            {(column === 'effParam' || column === 'effParam2') && numberField('Set Effect Type (-1 keeps existing)', setEffect, setSetEffect)}
          </div>
        )}
        {!selection && <p className="text-xs text-accent-warning">No selection active. Use Alt+Arrow keys to select a region.</p>}
      </div>
      <ModalFooter theme="modern" align="right">
        <Button variant="ghost" onClick={onClose}>
          Cancel {shortcuts.cancel && <span className="text-xs opacity-70 ml-2">{shortcuts.cancel}</span>}
        </Button>
        <Button variant="primary" onClick={handleApply} disabled={!selection}>Apply</Button>
      </ModalFooter>
    </Modal>
  );
};
