/**
 * ToastNotification - Display toast notifications
 */

import React from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useNotificationStore, type NotificationType } from '@stores/useNotificationStore';

const iconMap: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle size={18} />,
  error: <AlertCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

const colorMap: Record<NotificationType, string> = {
  success: 'text-accent-success border-accent-success/30 bg-accent-success/10',
  error: 'text-accent-error border-accent-error/30 bg-accent-error/10',
  warning: 'text-accent-warning border-accent-warning/30 bg-accent-warning/10',
  info: 'text-accent-primary border-accent-primary/30 bg-accent-primary/10',
};

export const ToastNotification: React.FC = () => {
  const { notifications, removeNotification } = useNotificationStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`
            flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg
            backdrop-blur-sm animate-slide-in-right
            ${colorMap[notification.type]}
          `}
          role="alert"
        >
          <span className="flex-shrink-0 mt-0.5">
            {iconMap[notification.type]}
          </span>
          <p className="flex-1 text-sm font-medium text-text-primary">
            {notification.message}
          </p>
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
