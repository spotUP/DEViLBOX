/**
 * Authentication store for server-based file storage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { hasElectronFS } from '@utils/electron';

const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';

interface User {
  id: string;
  username: string;
  createdAt: number;
}

interface AuthStore {
  // State
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  // Environment detection
  isElectron: boolean;
  isServerAvailable: boolean;

  // Actions
  signup: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  checkServerAvailability: () => Promise<boolean>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      isLoading: false,
      error: null,
      isElectron: hasElectronFS(),
      isServerAvailable: false,

      // Signup
      signup: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Signup failed');
          }

          const data = await response.json();
          set({
            user: data.user,
            token: data.token,
            isLoading: false,
            error: null
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Signup failed'
          });
          throw error;
        }
      },

      // Login
      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Login failed');
          }

          const data = await response.json();
          set({
            user: data.user,
            token: data.token,
            isLoading: false,
            error: null
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Login failed'
          });
          throw error;
        }
      },

      // Logout
      logout: () => {
        set({ user: null, token: null, error: null });
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },

      // Check if server is available
      checkServerAvailability: async () => {
        try {
          const response = await fetch(`${API_URL}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(3000) // 3 second timeout
          });
          const available = response.ok;
          set({ isServerAvailable: available });
          return available;
        } catch (error) {
          set({ isServerAvailable: false });
          return false;
        }
      }
    }),
    {
      name: 'devilbox-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token
      })
    }
  )
);
