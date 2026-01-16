/**
 * PatternManagement - Pattern Browser & Sequencer
 * Manages pattern list, creation, deletion, cloning, resizing, and sequence order
 */

import React, { useState } from 'react';
import { useTrackerStore } from '@stores';
import { useLiveModeStore } from '@stores/useLiveModeStore';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Play, Plus, Copy, Trash2, Edit2, Check, X, GripVertical } from 'lucide-react';
import { PatternContextMenu } from './PatternContextMenu';

interface SortablePatternItemProps {
  pattern: {
    id: string;
    name: string;
    length: number;
  };
  index: number;
  isActive: boolean;
  isQueued: boolean;
  isEditing: boolean;
  editName: string;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditNameChange: (name: string) => void;
  onClone: () => void;
  onDelete: () => void;
}

const SortablePatternItem: React.FC<SortablePatternItemProps> = ({
  pattern,
  index,
  isActive,
  isQueued,
  isEditing,
  editName,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditNameChange,
  onClone,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pattern.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <PatternContextMenu patternIndex={index}>
      <div
        ref={setNodeRef}
        style={style}
        className={`
          flex items-center gap-2 px-3 py-2 border-b border-dark-border
          ${isActive ? 'bg-accent-primary text-text-inverse' : 'bg-dark-bg text-text-primary hover:bg-dark-bgHover'}
          ${isQueued ? 'ring-2 ring-orange-500 ring-inset animate-pulse' : ''}
          transition-colors cursor-pointer
        `}
      >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className={`cursor-grab active:cursor-grabbing ${isActive ? 'text-text-inverse/70' : 'text-text-muted hover:text-text-primary'}`}
      >
        <GripVertical size={14} />
      </div>

      {/* Pattern Index */}
      <div
        onClick={onSelect}
        className="flex-shrink-0 w-6 text-xs font-mono font-bold text-center"
      >
        {index.toString().padStart(2, '0')}
      </div>

      {/* Pattern Name (editable) */}
      {isEditing ? (
        <div className="flex-1 flex items-center gap-1">
          <input
            type="text"
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="flex-1 px-2 py-0.5 text-xs font-mono bg-dark-bg border border-accent-primary text-text-primary rounded focus:outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSaveEdit();
            }}
            className="p-0.5 hover:text-accent-success"
            title="Save"
          >
            <Check size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancelEdit();
            }}
            className="p-0.5 hover:text-accent-error"
            title="Cancel"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div
          onClick={onSelect}
          className="flex-1 text-xs font-mono truncate"
        >
          {pattern.name}
        </div>
      )}

      {/* Pattern Length */}
      <div
        onClick={onSelect}
        className={`flex-shrink-0 text-xs font-mono ${isActive ? 'text-text-inverse/70' : 'text-text-muted'}`}
      >
        {pattern.length}
      </div>

      {/* Action Buttons */}
      {!isEditing && (
        <div className="flex items-center gap-1">
          {isQueued && (
            <span className="text-orange-500 text-xs mr-1" title="Queued">⏳</span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
            className={`p-0.5 ${isActive ? 'hover:text-text-inverse' : 'hover:text-accent-primary'}`}
            title="Rename"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClone();
            }}
            className={`p-0.5 ${isActive ? 'hover:text-text-inverse' : 'hover:text-accent-primary'}`}
            title="Clone"
          >
            <Copy size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-0.5 hover:text-accent-error"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
      </div>
    </PatternContextMenu>
  );
};

export const PatternManagement: React.FC = () => {
  const {
    patterns,
    currentPatternIndex,
    setCurrentPattern,
    addPattern,
    deletePattern,
    clonePattern,
    resizePattern,
    reorderPatterns,
    updatePatternName,
  } = useTrackerStore();

  const { pendingPatternIndex } = useLiveModeStore();

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [selectedSize, setSelectedSize] = useState<number>(64);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);

  // Setup drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = patterns.findIndex((p) => p.id === active.id);
      const newIndex = patterns.findIndex((p) => p.id === over.id);

      // Reorder patterns in the store
      reorderPatterns(oldIndex, newIndex);
    }
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditName(patterns[index].name);
  };

  const handleSaveEdit = () => {
    if (editingIndex !== null && editName.trim()) {
      updatePatternName(editingIndex, editName.trim());
    }
    setEditingIndex(null);
    setEditName('');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditName('');
  };

  const handleAddPattern = () => {
    addPattern(selectedSize);
  };

  const handleClone = (index: number) => {
    clonePattern(index);
  };

  const handleDelete = (index: number) => {
    if (patterns.length === 1) {
      alert('Cannot delete the last pattern');
      return;
    }

    if (showDeleteConfirm === index) {
      deletePattern(index);
      setShowDeleteConfirm(null);
    } else {
      setShowDeleteConfirm(index);
      setTimeout(() => setShowDeleteConfirm(null), 3000);
    }
  };

  const handleResize = (index: number, newSize: number) => {
    resizePattern(index, newSize);
  };

  return (
    <div className="flex flex-col h-full bg-dark-bg border-l border-dark-border">
      {/* Header */}
      <div className="bg-dark-bgTertiary border-b border-dark-border px-4 py-3">
        <div className="font-mono text-sm text-text-primary font-semibold tracking-wide">
          PATTERN MANAGER
        </div>
      </div>

      {/* Add Pattern Controls */}
      <div className="bg-dark-bgSecondary border-b border-dark-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-xs font-mono text-text-secondary">Size:</label>
          <select
            value={selectedSize}
            onChange={(e) => setSelectedSize(Number(e.target.value))}
            className="flex-1 input text-xs font-mono"
          >
            <option value={16}>16 rows</option>
            <option value={32}>32 rows</option>
            <option value={64}>64 rows</option>
            <option value={128}>128 rows</option>
          </select>
        </div>
        <button
          onClick={handleAddPattern}
          className="w-full btn-primary flex items-center justify-center gap-2 py-2.5"
        >
          <Plus size={16} />
          <span className="font-semibold">Add Pattern</span>
        </button>
      </div>

      {/* Current Pattern Info */}
      <div className="bg-dark-bgSecondary border-b border-dark-border px-4 py-3">
        <div className="text-xs font-mono text-text-muted mb-2">Current Pattern</div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-mono text-accent-primary font-bold">
            {patterns[currentPatternIndex]?.name || 'None'}
          </span>
          <div className="flex items-center gap-2">
            <label className="text-xs font-mono text-text-muted">Resize:</label>
            <select
              value={patterns[currentPatternIndex]?.length || 64}
              onChange={(e) => handleResize(currentPatternIndex, Number(e.target.value))}
              className="input px-2 py-1 text-xs font-mono"
            >
              <option value={16}>16</option>
              <option value={32}>32</option>
              <option value={64}>64</option>
              <option value={128}>128</option>
            </select>
          </div>
        </div>
      </div>

      {/* Pattern List with Drag & Drop */}
      <div className="flex-1 overflow-y-auto scrollbar-modern">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={patterns.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            {patterns.map((pattern, index) => (
              <SortablePatternItem
                key={pattern.id}
                pattern={pattern}
                index={index}
                isActive={index === currentPatternIndex}
                isQueued={pendingPatternIndex === index}
                isEditing={editingIndex === index}
                editName={editName}
                onSelect={() => setCurrentPattern(index)}
                onStartEdit={() => handleStartEdit(index)}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={handleCancelEdit}
                onEditNameChange={setEditName}
                onClone={() => handleClone(index)}
                onDelete={() => handleDelete(index)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Pattern Sequence Order */}
      <div className="bg-dark-bgSecondary border-t border-dark-border p-4">
        <div className="text-xs font-mono text-text-muted mb-3">
          PLAYBACK SEQUENCE
        </div>
        <div className="flex flex-wrap gap-1.5">
          {patterns.map((pattern, index) => (
            <div
              key={pattern.id}
              className={`
                px-2.5 py-1.5 text-xs font-mono rounded-md border transition-all
                ${index === currentPatternIndex
                  ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                  : 'bg-dark-bg text-text-primary border-dark-border hover:border-dark-borderLight'
                }
                cursor-pointer
              `}
              onClick={() => setCurrentPattern(index)}
              title={pattern.name}
            >
              {index.toString().padStart(2, '0')}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs font-mono text-text-muted">
          <Play size={12} />
          <span>Drag patterns to reorder playback</span>
        </div>
      </div>

      {/* Delete Confirmation Toast */}
      {showDeleteConfirm !== null && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-accent-error text-white px-4 py-2 rounded-lg shadow-lg font-mono text-xs animate-fade-in">
          Click DELETE again to confirm
        </div>
      )}
    </div>
  );
};
