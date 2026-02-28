/**
 * Server Files API - Authenticated file operations
 * Uses the backend API with JWT authentication for user's private files
 */

import { useAuthStore } from '@stores/useAuthStore';

/**
 * Authenticated fetch wrapper.
 * Clears local auth state when the server returns 403 (invalid/expired token).
 */
async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status === 403) {
    // Token is invalid or expired — log out so the stale token is cleared
    useAuthStore.getState().logout();
  }
  return response;
}

const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';

export interface ServerFile {
  id: string;
  filename: string;
  createdAt: number;
  updatedAt: number;
}

export interface ServerFileWithData extends ServerFile {
  data: object;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const { token, user } = useAuthStore.getState();
  return !!token && !!user;
}

/**
 * Get auth headers
 */
function getAuthHeaders(): HeadersInit {
  const { token } = useAuthStore.getState();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * List user's files
 */
export async function listUserFiles(type: 'songs' | 'instruments' | 'presets' = 'songs'): Promise<ServerFile[]> {
  if (!isAuthenticated()) {
    throw new Error('Not authenticated');
  }

  const response = await authFetch(`${API_URL}/files?type=${type}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to list files' }));
    throw new Error(error.error || 'Failed to list files');
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Get file content by ID
 */
export async function getFile(fileId: string): Promise<ServerFileWithData> {
  if (!isAuthenticated()) {
    throw new Error('Not authenticated');
  }

  const response = await authFetch(`${API_URL}/files/${fileId}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to get file' }));
    throw new Error(error.error || 'Failed to get file');
  }

  return response.json();
}

/**
 * Save file to server
 */
export async function saveFile(
  filename: string,
  data: object,
  type: 'songs' | 'instruments' | 'presets' = 'songs'
): Promise<{ id: string; filename: string }> {
  if (!isAuthenticated()) {
    throw new Error('Not authenticated');
  }

  const response = await authFetch(`${API_URL}/files`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ filename, data, type }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to save file' }));
    throw new Error(error.error || 'Failed to save file');
  }

  return response.json();
}

/**
 * Update existing file
 */
export async function updateFile(
  fileId: string,
  filename: string,
  data: object
): Promise<{ success: boolean }> {
  if (!isAuthenticated()) {
    throw new Error('Not authenticated');
  }

  const response = await authFetch(`${API_URL}/files/${fileId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ filename, data }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update file' }));
    throw new Error(error.error || 'Failed to update file');
  }

  return response.json();
}

/**
 * Delete file from server
 */
export async function deleteFile(fileId: string): Promise<{ success: boolean }> {
  if (!isAuthenticated()) {
    throw new Error('Not authenticated');
  }

  const response = await authFetch(`${API_URL}/files/${fileId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete file' }));
    throw new Error(error.error || 'Failed to delete file');
  }

  return response.json();
}

// =============================================================================
// REVISION API
// =============================================================================

export interface FileRevision {
  id: string;
  revisionNumber: number;
  createdAt: number;
}

export interface FileRevisionWithData extends FileRevision {
  fileId: string;
  filename: string;
  data: object;
}

/**
 * List all revisions for a file
 */
export async function listRevisions(fileId: string): Promise<{
  fileId: string;
  filename: string;
  revisions: FileRevision[];
}> {
  if (!isAuthenticated()) {
    throw new Error('Not authenticated');
  }

  const response = await authFetch(`${API_URL}/files/${fileId}/revisions`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to list revisions' }));
    throw new Error(error.error || 'Failed to list revisions');
  }

  return response.json();
}

/**
 * Get a specific revision
 */
export async function getRevision(fileId: string, revisionNumber: number): Promise<FileRevisionWithData> {
  if (!isAuthenticated()) {
    throw new Error('Not authenticated');
  }

  const response = await authFetch(`${API_URL}/files/${fileId}/revisions/${revisionNumber}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to get revision' }));
    throw new Error(error.error || 'Failed to get revision');
  }

  return response.json();
}

/**
 * Restore a specific revision (creates backup of current state first)
 */
export async function restoreRevision(fileId: string, revisionNumber: number): Promise<{
  success: boolean;
  fileId: string;
  filename: string;
  restoredRevision: number;
  updatedAt: number;
}> {
  if (!isAuthenticated()) {
    throw new Error('Not authenticated');
  }

  const response = await authFetch(`${API_URL}/files/${fileId}/revisions/${revisionNumber}/restore`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to restore revision' }));
    throw new Error(error.error || 'Failed to restore revision');
  }

  return response.json();
}
