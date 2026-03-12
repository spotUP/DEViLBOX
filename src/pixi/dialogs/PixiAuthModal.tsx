/**
 * PixiAuthModal — GL-native version of the DOM AuthModal.
 * Login/signup modal for server storage using pure Pixi components.
 *
 * DOM reference: src/components/dialogs/AuthModal.tsx
 */

import React, { useState, useCallback } from 'react';
import { useAuthStore } from '@stores/useAuthStore';
import { PixiModal, PixiButton, PixiIcon } from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';

interface PixiAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const MODAL_W = 420;
const CONTENT_PAD = 24; // DOM: p-6
const INPUT_W = MODAL_W - CONTENT_PAD * 2;

export const PixiAuthModal: React.FC<PixiAuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const theme = usePixiTheme();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [closeHovered, setCloseHovered] = useState(false);

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

  const modalHeight = mode === 'signup' ? 480 : 400;

  return (
    <PixiModal
      isOpen={isOpen}
      onClose={onClose}
      width={MODAL_W}
      height={modalHeight}
      overlayAlpha={0.7}
      bgColor={theme.bgTertiary.color}
      borderWidth={2}
    >
      {/* Header — DOM: p-4 border-b bg-dark-bgSecondary */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 16,
          backgroundColor: theme.bgSecondary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <pixiBitmapText
          text={mode === 'login' ? 'Login to DEViLBOX' : 'Create Account'}
          style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 20, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{}}
        />
        <layoutContainer
          eventMode="static"
          cursor="pointer"
          onPointerOver={() => setCloseHovered(true)}
          onPointerOut={() => setCloseHovered(false)}
          onPointerUp={onClose}
          onClick={onClose}
          layout={{
            width: 28,
            height: 28,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 4,
            ...(closeHovered ? { backgroundColor: theme.bgHover.color } : {}),
          }}
        >
          <PixiIcon name="close" size={16} color={closeHovered ? theme.text.color : theme.textMuted.color} layout={{}} />
        </layoutContainer>
      </layoutContainer>

      {/* Content — DOM: p-6 space-y-4 */}
      <layoutContainer
        layout={{
          flex: 1,
          flexDirection: 'column',
          gap: 16,
          padding: CONTENT_PAD,
          overflow: 'hidden',
        }}
      >
        {/* Info banner — DOM: bg-accent-info/10 border border-accent-info/30 rounded p-3 */}
        <layoutContainer
          layout={{
            width: INPUT_W,
            padding: 12,
            backgroundColor: 0x0c1a2e,
            borderWidth: 1,
            borderColor: 0x1e3a5f,
            borderRadius: 4,
          }}
        >
          <pixiBitmapText
            text={
              mode === 'login'
                ? 'Login to save your songs to the server and access them from any device.'
                : 'Create an account to save your songs to the server. No email required!'
            }
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
            tint={theme.accentHighlight.color}
            layout={{}}
          />
        </layoutContainer>

        {/* Error message — DOM: bg-accent-error/10 border border-accent-error/30 rounded p-3 */}
        {error && (
          <layoutContainer
            layout={{
              width: INPUT_W,
              padding: 12,
              backgroundColor: 0x2a0c0c,
              borderWidth: 1,
              borderColor: 0x5f1e1e,
              borderRadius: 4,
            }}
          >
            <pixiBitmapText
              text={error}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
              tint={theme.error.color}
              layout={{}}
            />
          </layoutContainer>
        )}

        {/* Username — DOM: label text-sm font-medium mb-2, input py-2, helper text-xs mt-1 */}
        <layoutContainer layout={{ flexDirection: 'column', width: INPUT_W }}>
          <pixiBitmapText
            text="Username"
            style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 16, fill: 0xffffff }}
            tint={theme.text.color}
            layout={{ marginBottom: 8 }}
          />
          <PixiPureTextInput
            value={username}
            onChange={setUsername}
            placeholder="Enter username"
            width={INPUT_W}
            height={32}
            fontSize={14}
          />
          <pixiBitmapText
            text="3-20 characters"
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{ marginTop: 4 }}
          />
        </layoutContainer>

        {/* Password */}
        <layoutContainer layout={{ flexDirection: 'column', width: INPUT_W }}>
          <pixiBitmapText
            text="Password"
            style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 16, fill: 0xffffff }}
            tint={theme.text.color}
            layout={{ marginBottom: 8 }}
          />
          <PixiPureTextInput
            value={password}
            onChange={setPassword}
            placeholder="Enter password"
            width={INPUT_W}
            height={32}
            fontSize={14}
            mask="•"
          />
          <pixiBitmapText
            text="At least 6 characters"
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{ marginTop: 4 }}
          />
        </layoutContainer>

        {/* Confirm password (signup only) */}
        {mode === 'signup' && (
          <layoutContainer layout={{ flexDirection: 'column', width: INPUT_W }}>
            <pixiBitmapText
              text="Confirm Password"
              style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 16, fill: 0xffffff }}
              tint={theme.text.color}
              layout={{ marginBottom: 8 }}
            />
            <PixiPureTextInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Confirm password"
              width={INPUT_W}
              height={32}
              fontSize={14}
              mask="•"
            />
            {passwordMismatch && (
              <pixiBitmapText
                text="Passwords don't match"
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                tint={theme.error.color}
                layout={{ marginTop: 4 }}
              />
            )}
          </layoutContainer>
        )}

        {/* Submit button — DOM: w-full py-3 bg-accent-primary font-bold rounded */}
        <PixiButton
          label={isLoading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create Account'}
          variant="primary"
          size="lg"
          width={INPUT_W}
          height={40}
          disabled={!canSubmit}
          loading={isLoading}
          onClick={handleSubmit}
        />

        {/* Toggle mode — DOM: text-center pt-2, text-sm text-accent-primary */}
        <layoutContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={handleToggleMode}
          onClick={handleToggleMode}
          layout={{
            width: INPUT_W,
            justifyContent: 'center',
            flexDirection: 'row',
            paddingTop: 8,
          }}
        >
          <pixiBitmapText
            text={mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Login'}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 16, fill: 0xffffff }}
            tint={theme.accent.color}
            layout={{}}
          />
        </layoutContainer>
      </layoutContainer>
    </PixiModal>
  );
};
