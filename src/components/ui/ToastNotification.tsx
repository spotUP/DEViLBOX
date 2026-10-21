/**
 * ToastNotification - Display toast notifications
 */

import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Copy, Check } from 'lucide-react';
import { useNotificationStore, type NotificationType } from '@stores/useNotificationStore';
import { Button } from './Button';

const iconMap: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle size={18} />,
  error: <AlertCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

const colorMap: Record<NotificationType, string> = {
  success: 'text-accent-success border-accent-success/40 bg-dark-bg/95',
  error: 'text-accent-error border-accent-error/40 bg-dark-bg/95',
  warning: 'text-accent-warning border-accent-warning/40 bg-dark-bg/95',
  info: 'text-accent-primary border-accent-primary/40 bg-dark-bg/95',
};

export const ToastNotification: React.FC = () => {
  const { notifications, removeNotification, pauseDismiss, resumeDismiss } = useNotificationStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[10050] flex flex-col gap-2 max-w-sm backdrop-blur-sm">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`
            flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg
            animate-slide-in-right
            ${colorMap[notification.type]}
          `}
          role="alert"
          onMouseEnter={() => pauseDismiss(notification.id)}
          onMouseLeave={() => resumeDismiss(notification.id)}
          onFocus={() => pauseDismiss(notification.id)}
          onBlur={() => resumeDismiss(notification.id)}
        >
          <span className="flex-shrink-0 mt-0.5">
            {iconMap[notification.type]}
          </span>
          <div className="flex-1 flex flex-col items-start gap-2">
            <p className="text-sm font-medium text-text-primary select-text cursor-text break-words">
              {notification.message}
            </p>
            {notification.action && (
              <Button
                variant="default"
                size="sm"
                onClick={() => { removeNotification(notification.id); notification.action!.run(); }}
              >
                {notification.action.label}
              </Button>
            )}
          </div>
          <CopyMessageButton text={notification.message} />
          <button
            onClick={() => removeNotification(notification.id)}
            className="flex-shrink-0 p-0.5 rounded hover:bg-dark-bgHover transition-colors"
            aria-label="Dismiss notification"
          >
            <X size={14} className="text-text-muted" />
          </button>
        </div>
      ))}
    </div>
  );
};

/** Copies a toast's text, so an error can be pasted into a report. */
const CopyMessageButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="flex-shrink-0 p-0.5 rounded hover:bg-dark-bgHover transition-colors"
      aria-label="Copy message"
      title="Copy message"
    >
      {copied ? <Check size={14} className="text-accent-success" /> : <Copy size={14} className="text-text-muted" />}
    </button>
  );
};
