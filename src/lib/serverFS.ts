/**
 * Server File System API
 * Client-side wrapper for file operations on the backend
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ServerFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: string;
}

/**
 * Check if server file system is available
 */
export async function isServerFSAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout
    
    const response = await fetch(`${API_BASE}/api/files/songs`, { 
      method: 'HEAD',
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * List directory contents
 */
export async function listServerDirectory(dirPath: string): Promise<ServerFileEntry[]> {
  const cleanPath = dirPath.replace(/^\/+/, '');
  const response = await fetch(`${API_BASE}/api/files/${cleanPath}`);
  
  if (!response.ok) {
    throw new Error(`Failed to list directory: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.items || [];
}

/**
 * Read file from server
 */
export async function readServerFile(filePath: string): Promise<ArrayBuffer> {
  const cleanPath = filePath.replace(/^\/+/, '');
  const response = await fetch(`${API_BASE}/api/files/${cleanPath}`);
  
  if (!response.ok) {
    throw new Error(`Failed to read file: ${response.statusText}`);
  }
  
  return response.arrayBuffer();
}

/**
 * Write file to server (base64 encoded)
 */
export async function writeServerFile(
  filePath: string,
  content: ArrayBuffer | Uint8Array
): Promise<void> {
  const cleanPath = filePath.replace(/^\/+/, '');
  
  // Convert to base64
  const bytes = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
  const base64 = btoa(String.fromCharCode(...bytes));
  
  const response = await fetch(`${API_BASE}/api/files/${cleanPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: base64 }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to write file: ${response.statusText}`);
  }
}

/**
 * Delete file from server
 */
export async function deleteServerFile(filePath: string): Promise<void> {
  const cleanPath = filePath.replace(/^\/+/, '');
  const response = await fetch(`${API_BASE}/api/files/${cleanPath}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to delete file: ${response.statusText}`);
  }
}
