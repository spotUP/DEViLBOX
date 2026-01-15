/**
 * ChannelColorPicker - Popup for selecting channel background colors
 * Uses portal to render popup outside overflow containers
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Palette, X } from 'lucide-react';
import { CHANNEL_COLORS } from '@typedefs';

interface ChannelColorPickerProps {
  currentColor: string | null;
  onColorSelect: (color: string | null) => void;
}

export const ChannelColorPicker: React.FC<ChannelColorPickerProps> = ({
  currentColor,
  onColorSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Update popup position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPopupPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [isOpen]);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(!isOpen);
  };

  const handleColorClick = (color: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    onColorSelect(color);
    setIsOpen(false);
  };

  const popup = isOpen ? (
    <div
      ref={popupRef}
      className="fixed bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl p-2 animate-fade-in"
      style={{
        top: popupPosition.top,
        left: popupPosition.left,
        zIndex: 9999,
        minWidth: '140px',
      }}
    >
      <div className="text-xs text-text-muted mb-2 px-1">Channel Color</div>
      <div className="grid grid-cols-4 gap-1">
        {CHANNEL_COLORS.map((color, idx) => (
          <button
            key={idx}
            type="button"
            onClick={(e) => handleColorClick(color, e)}
            className={`w-7 h-7 rounded border-2 transition-all flex items-center justify-center ${
              currentColor === color
                ? 'border-accent-primary scale-110'
                : 'border-transparent hover:border-dark-borderLight hover:scale-105'
            }`}
            style={{
              backgroundColor: color || 'transparent',
            }}
            title={color ? color : 'No color'}
          >
            {color === null && (
              <X size={14} className="text-text-muted" />
            )}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleButtonClick}
        className={`p-1 rounded transition-colors ${
          currentColor
            ? 'text-text-primary'
            : 'text-text-muted hover:text-text-primary hover:bg-dark-bgHover'
        }`}
        style={currentColor ? { color: currentColor } : undefined}
        title="Channel Color"
      >
        <Palette size={12} />
      </button>
      {popup && createPortal(popup, document.body)}
    </>
  );
};
