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
  /** A button on the notification; running it also dismisses the notification. */
  action?: { label: string; run: () => void };
}

interface NotificationStore {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => string;
  removeNotification: (id: string) => void;
  /** Stops the auto-dismiss clock while the reader is on the notification (pointer or focus), so it can be read or copied. */
  pauseDismiss: (id: string) => void;
  /** Restarts the clock with the time that was left when it paused. */
  resumeDismiss: (id: string) => void;
  clearAll: () => void;
}

let notificationId = 0;

/** The running auto-dismiss clock per notification: its timer, when it ends, and the time left while paused. */
const dismissClocks = new Map<string, { timer: ReturnType<typeof setTimeout> | null; endsAt: number; remaining: number }>();

function startClock(id: string, ms: number, remove: (id: string) => void): void {
  dismissClocks.set(id, { timer: setTimeout(() => remove(id), ms), endsAt: Date.now() + ms, remaining: ms });
}

function stopClock(id: string): void {
  const clock = dismissClocks.get(id);
  if (clock?.timer) clearTimeout(clock.timer);
  dismissClocks.delete(id);
}

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
      startClock(id, newNotification.duration, (gone) => get().removeNotification(gone));
    }

    return id;
  },

  removeNotification: (id) => {
    stopClock(id);
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  pauseDismiss: (id) => {
    const clock = dismissClocks.get(id);
    if (!clock?.timer) return;
    clearTimeout(clock.timer);
    dismissClocks.set(id, { timer: null, endsAt: clock.endsAt, remaining: Math.max(0, clock.endsAt - Date.now()) });
  },

  resumeDismiss: (id) => {
    const clock = dismissClocks.get(id);
    if (!clock || clock.timer) return;
    startClock(id, clock.remaining, (gone) => get().removeNotification(gone));
  },

  clearAll: () => {
    for (const id of [...dismissClocks.keys()]) stopClock(id);
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
