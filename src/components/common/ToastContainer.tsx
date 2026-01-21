/**
 * ToastContainer - Display temporary notification messages
 * Appears at bottom-center of screen with smooth animations
 */

import React, { useEffect, useState } from 'react';
import { useToastStore, type Toast } from '@stores/useToastStore';
import { CheckCircle, Info, AlertTriangle, XCircle, X } from 'lucide-react';

const ToastIcon: React.FC<{ type: Toast['type'] }> = React.memo(({ type }) => {
  const iconProps = { size: 18, strokeWidth: 2 };

  switch (type) {
    case 'success':
      return <CheckCircle {...iconProps} className="text-green-500" />;
    case 'warning':
      return <AlertTriangle {...iconProps} className="text-yellow-500" />;
    case 'error':
      return <XCircle {...iconProps} className="text-red-500" />;
    default:
      return <Info {...iconProps} className="text-blue-500" />;
  }
});

const ToastItem: React.FC<{ toast: Toast }> = React.memo(({ toast }) => {
  // PERFORMANCE: Use selector for removeToast action
  const removeToast = useToastStore((state) => state.removeToast);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Trigger exit animation 200ms before removal
    if (toast.duration > 0) {
      const exitTimer = setTimeout(() => {
        setIsExiting(true);
      }, toast.duration - 200);

      return () => clearTimeout(exitTimer);
    }
  }, [toast.duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => removeToast(toast.id), 200);
  };

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3 mb-2 rounded-lg shadow-lg
        bg-dark-bgSecondary border border-dark-border
        transition-all duration-200 ease-out
        ${isExiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}
      `}
      style={{ animation: isExiting ? 'none' : 'slideIn 0.2s ease-out' }}
    >
      <ToastIcon type={toast.type} />
      <span className="text-sm text-text-primary flex-1">{toast.message}</span>
      <button
        onClick={handleClose}
        className="text-text-muted hover:text-text-primary transition-colors p-1"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
});

const ToastContainerComponent: React.FC = () => {
  // Subscribe to toasts (this component NEEDS to re-render when toasts change)
  const toasts = useToastStore((state) => state.toasts);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>
        {`
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 min-w-[300px] max-w-[500px]">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </div>
    </>
  );
};

// PERFORMANCE: Wrap in React.memo to prevent unnecessary re-renders
export const ToastContainer = React.memo(ToastContainerComponent);
