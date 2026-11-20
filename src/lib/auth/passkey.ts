/**
 * Passkey (WebAuthn) sign-in service. The server (hippoplayer.se, reached through the
 * DEViLBOX /api/auth forward) creates the options and verifies the result; this file
 * only turns its JSON into navigator.credentials calls and back.
 * Not every browser has PublicKeyCredential.parseCreationOptionsFromJSON / toJSON
 * (Safari 17), so the base64url conversion is done here.
 */

import { API_URL } from '@lib/apiBase';

export interface PasskeyUser {
  id: string;
  username: string;
  createdAt: number;
}

export interface PasskeyInfo {
  id: string;
  name: string;
  createdAt: number;
  lastUsed: number | null;
}

export interface PasskeyList {
  passkeys: PasskeyInfo[];
  hasPassword: boolean;
}

interface CredentialDescriptorJSON {
  id: string;
  type: 'public-key';
  transports?: AuthenticatorTransport[];
}

interface CreationOptionsJSON {
  challenge: string;
  rp: PublicKeyCredentialRpEntity;
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  excludeCredentials?: CredentialDescriptorJSON[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
}

interface RequestOptionsJSON {
  challenge: string;
  rpId?: string;
  timeout?: number;
  allowCredentials?: CredentialDescriptorJSON[];
  userVerification?: UserVerificationRequirement;
}

export function passkeySupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function'
    && typeof navigator.credentials?.create === 'function';
}

export function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const descriptor = (d: CredentialDescriptorJSON): PublicKeyCredentialDescriptor => ({
  id: fromBase64Url(d.id), type: d.type, transports: d.transports,
});

async function api<T>(path: string, init: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const response = await fetch(`${API_URL}/auth/passkey${path}`, {
    method: init.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || 'Passkey request failed');
  return data as T;
}

// The browser's own cancel / timeout message is not useful to show.
function ceremonyError(error: unknown): Error {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
    return new Error('Passkey request was cancelled or timed out');
  }
  if (error instanceof DOMException && error.name === 'InvalidStateError') {
    return new Error('This device already has a passkey for this account');
  }
  return error instanceof Error ? error : new Error('Passkey request failed');
}

async function createCredential(options: CreationOptionsJSON) {
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        ...options,
        challenge: fromBase64Url(options.challenge),
        user: { ...options.user, id: fromBase64Url(options.user.id) },
        excludeCredentials: options.excludeCredentials?.map(descriptor),
      },
    });
  } catch (error) {
    throw ceremonyError(error);
  }
  if (!(credential instanceof PublicKeyCredential)) throw new Error('Passkey request was cancelled or timed out');
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      attestationObject: toBase64Url(response.attestationObject),
      transports: typeof response.getTransports === 'function' ? response.getTransports() : undefined,
    },
  };
}

async function getAssertion(options: RequestOptionsJSON) {
  let credential: Credential | null;
  try {
    credential = await navigator.credentials.get({
      publicKey: {
        ...options,
        challenge: fromBase64Url(options.challenge),
        allowCredentials: options.allowCredentials?.map(descriptor),
      },
    });
  } catch (error) {
    throw ceremonyError(error);
  }
  if (!(credential instanceof PublicKeyCredential)) throw new Error('Passkey request was cancelled or timed out');
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      authenticatorData: toBase64Url(response.authenticatorData),
      signature: toBase64Url(response.signature),
      userHandle: response.userHandle ? toBase64Url(response.userHandle) : undefined,
    },
  };
}

/** A short default name for a new passkey, e.g. "Mac" or "iPhone". */
export function defaultPasskeyName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Macintosh/.test(ua)) return navigator.maxTouchPoints > 1 ? 'iPad' : 'Mac';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Passkey';
}

export async function passkeySignIn(): Promise<{ token: string; user: PasskeyUser }> {
  const options = await api<RequestOptionsJSON>('/login/options', { body: {} });
  const response = await getAssertion(options);
  return api('/login/verify', { body: { response } });
}

export async function passkeySignUp(username: string): Promise<{ token: string; user: PasskeyUser }> {
  const options = await api<CreationOptionsJSON>('/register/options', { body: { username } });
  const response = await createCredential(options);
  return api('/register/verify', { body: { response, name: defaultPasskeyName() } });
}

export async function passkeyAdd(token: string, name = defaultPasskeyName()): Promise<PasskeyInfo> {
  const options = await api<CreationOptionsJSON>('/register/options', { body: {}, token });
  const response = await createCredential(options);
  return (await api<{ passkey: PasskeyInfo }>('/register/verify', { body: { response, name }, token })).passkey;
}

export const passkeyList = (token: string): Promise<PasskeyList> => api('', { method: 'GET', token });

export const passkeyRename = (token: string, id: string, name: string): Promise<void> =>
  api(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name }, token });

export const passkeyRemove = (token: string, id: string): Promise<void> =>
  api(`/${encodeURIComponent(id)}`, { method: 'DELETE', token });

/** The server refuses to remove an account's last sign-in method; the UI mirrors that rule. */
export const canRemovePasskey = (list: PasskeyList): boolean => list.hasPassword || list.passkeys.length > 1;
