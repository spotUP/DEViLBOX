/**
 * Notification Store - Toast/notification management
 */

import { create } from 'zustand';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number; // ms, undefined = no auto-dismiss
}

interface NotificationStore {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

let notificationId = 0;

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],

  addNotification: (notification) => {
    const id = `notification-${++notificationId}`;
    const newNotification: Notification = {
      ...notification,
      id,
      duration: notification.duration ?? 5000, // Default 5 second display
    };

    set((state) => ({
      notifications: [...state.notifications, newNotification],
    }));

    // Auto-dismiss after duration (if set)
    if (newNotification.duration && newNotification.duration > 0) {
      setTimeout(() => {
        get().removeNotification(id);
      }, newNotification.duration);
    }

    return id;
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearAll: () => {
    set({ notifications: [] });
  },
}));

// Helper function for quick notifications
export const notify = {
  success: (message: string, duration?: number) =>
    useNotificationStore.getState().addNotification({ type: 'success', message, duration }),
  error: (message: string, duration?: number) =>
    useNotificationStore.getState().addNotification({ type: 'error', message, duration: duration ?? 8000 }),
  warning: (message: string, duration?: number) =>
    useNotificationStore.getState().addNotification({ type: 'warning', message, duration }),
  info: (message: string, duration?: number) =>
    useNotificationStore.getState().addNotification({ type: 'info', message, duration }),
};
