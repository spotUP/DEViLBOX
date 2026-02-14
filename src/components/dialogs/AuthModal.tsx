/**
 * AuthModal - Login/Signup modal for server storage
 */

import React, { useState } from 'react';
import { X, User, Lock, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@stores/useAuthStore';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { signup, login, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (mode === 'signup' && password !== confirmPassword) {
      return;
    }

    try {
      if (mode === 'signup') {
        await signup(username, password);
      } else {
        await login(username, password);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      // Error is already set in store
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-[10001]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-dark-bgTertiary border-2 border-dark-border rounded-lg shadow-2xl z-[10002]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border bg-dark-bgSecondary">
          <h2 className="font-bold text-lg text-text-primary">
            {mode === 'login' ? 'Login to DEViLBOX' : 'Create Account'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-dark-bgHover rounded transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Info banner */}
          <div className="bg-accent-info/10 border border-accent-info/30 rounded p-3">
            <p className="text-xs text-accent-info">
              {mode === 'login'
                ? 'Login to save your songs to the server and access them from any device.'
                : 'Create an account to save your songs to the server. No email required!'}
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-accent-error/10 border border-accent-error/30 rounded p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-accent-error flex-shrink-0 mt-0.5" />
              <p className="text-xs text-accent-error">{error}</p>
            </div>
          )}

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Username
            </label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-dark-bgSecondary border border-dark-border rounded text-text-primary focus:outline-none focus:border-accent-primary"
                placeholder="Enter username"
                required
                minLength={3}
                maxLength={20}
                autoComplete="username"
              />
            </div>
            <p className="text-xs text-text-muted mt-1">3-20 characters</p>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Password
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-dark-bgSecondary border border-dark-border rounded text-text-primary focus:outline-none focus:border-accent-primary"
                placeholder="Enter password"
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
            <p className="text-xs text-text-muted mt-1">At least 6 characters</p>
          </div>

          {/* Confirm Password (signup only) */}
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-dark-bgSecondary border border-dark-border rounded text-text-primary focus:outline-none focus:border-accent-primary"
                  placeholder="Confirm password"
                  required
                  autoComplete="new-password"
                />
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-accent-error mt-1">Passwords don't match</p>
              )}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading || (mode === 'signup' && password !== confirmPassword)}
            className="w-full py-3 bg-accent-primary hover:bg-accent-primary/90 disabled:bg-accent-primary/50 disabled:cursor-not-allowed text-white font-bold rounded transition-colors"
          >
            {isLoading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create Account'}
          </button>

          {/* Toggle mode */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                clearError();
              }}
              className="text-sm text-accent-primary hover:underline"
            >
              {mode === 'login'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Login'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
