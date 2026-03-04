/**
 * PixiAuthModal — GL-native version of the DOM AuthModal.
 * Login/signup modal for server storage using pure Pixi components.
 */

import React, { useState, useCallback } from 'react';
import { useAuthStore } from '@stores/useAuthStore';
import { PixiModal } from '../components';
import { PixiButton, PixiLabel } from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme } from '../theme';

interface PixiAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const MODAL_W = 380;
const INPUT_W = MODAL_W - 48;

export const PixiAuthModal: React.FC<PixiAuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const theme = usePixiTheme();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { signup, login, isLoading, error, clearError } = useAuthStore();

  const passwordMismatch = mode === 'signup' && confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = useCallback(async () => {
    clearError();
    if (mode === 'signup' && password !== confirmPassword) return;
    try {
      if (mode === 'signup') {
        await signup(username, password);
      } else {
        await login(username, password);
      }
      onSuccess?.();
      onClose();
    } catch (_err) {
      // Error is set in store
    }
  }, [mode, username, password, confirmPassword, signup, login, clearError, onSuccess, onClose]);

  const handleToggleMode = useCallback(() => {
    setMode(m => m === 'login' ? 'signup' : 'login');
    clearError();
  }, [clearError]);

  const canSubmit = !isLoading
    && username.length >= 3
    && password.length >= 6
    && (mode === 'login' || password === confirmPassword);

  const modalHeight = mode === 'signup' ? 420 : 340;

  return (
    <PixiModal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'login' ? 'Login to DEViLBOX' : 'Create Account'}
      width={MODAL_W}
      height={modalHeight}
    >
      <layoutContainer layout={{ flexDirection: 'column', gap: 10, width: INPUT_W }}>
        {/* Info banner */}
        <layoutContainer
          layout={{
            width: INPUT_W,
            padding: 8,
            backgroundColor: 0x0a1a2a,
            borderWidth: 1,
            borderColor: 0x1a3a5a,
            borderRadius: 4,
          }}
        >
          <PixiLabel
            text={
              mode === 'login'
                ? 'Login to save songs to the server and access them from any device.'
                : 'Create an account to save songs to the server. No email required!'
            }
            size="xs"
            font="sans"
            color="custom"
            customColor={0x60a0e0}
          />
        </layoutContainer>

        {/* Error message */}
        {error && (
          <layoutContainer
            layout={{
              width: INPUT_W,
              padding: 8,
              backgroundColor: 0x2a0a0a,
              borderWidth: 1,
              borderColor: 0x5a1a1a,
              borderRadius: 4,
            }}
          >
            <PixiLabel text={error} size="xs" font="sans" color="error" />
          </layoutContainer>
        )}

        {/* Username */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 4, width: INPUT_W }}>
          <PixiLabel text="Username" size="sm" font="sans" weight="medium" />
          <PixiPureTextInput
            value={username}
            onChange={setUsername}
            placeholder="Enter username"
            width={INPUT_W}
            height={28}
            fontSize={12}
          />
          <PixiLabel text="3-20 characters" size="xs" font="sans" color="textMuted" />
        </layoutContainer>

        {/* Password */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 4, width: INPUT_W }}>
          <PixiLabel text="Password" size="sm" font="sans" weight="medium" />
          <PixiPureTextInput
            value={password}
            onChange={setPassword}
            placeholder="Enter password"
            width={INPUT_W}
            height={28}
            fontSize={12}
            mask="•"
          />
          <PixiLabel text="At least 6 characters" size="xs" font="sans" color="textMuted" />
        </layoutContainer>

        {/* Confirm password (signup only) */}
        {mode === 'signup' && (
          <layoutContainer layout={{ flexDirection: 'column', gap: 4, width: INPUT_W }}>
            <PixiLabel text="Confirm Password" size="sm" font="sans" weight="medium" />
            <PixiPureTextInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Confirm password"
              width={INPUT_W}
              height={28}
              fontSize={12}
              mask="•"
            />
            {passwordMismatch && (
              <PixiLabel text="Passwords don't match" size="xs" font="sans" color="error" />
            )}
          </layoutContainer>
        )}

        {/* Submit button */}
        <PixiButton
          label={isLoading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create Account'}
          variant="primary"
          size="lg"
          width={INPUT_W}
          disabled={!canSubmit}
          loading={isLoading}
          onClick={handleSubmit}
        />

        {/* Toggle mode */}
        <layoutContainer layout={{ width: INPUT_W, justifyContent: 'center', flexDirection: 'row' }}>
          <PixiLabel
            text={mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Login'}
            size="xs"
            font="sans"
            color="accent"
            layout={{
              // Make clickable
            }}
          />
        </layoutContainer>
        {/* Clickable toggle overlay */}
        <layoutContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={handleToggleMode}
          layout={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: INPUT_W,
            height: 20,
          }}
        />
      </layoutContainer>
    </PixiModal>
  );
};
