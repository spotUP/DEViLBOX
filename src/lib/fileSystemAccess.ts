/**
 * File System Access API wrapper
 * Provides access to the user's filesystem (Chrome/Edge only)
 */

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: Date;
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
}

// Check if File System Access API is supported
export const isFileSystemAccessSupported = (): boolean => {
  return 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;
};

// Store the directory handle for persistent access
let currentDirectoryHandle: FileSystemDirectoryHandle | null = null;

/**
 * Request permission to access a directory
 */
export async function requestDirectoryAccess(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) {
    console.warn('[FileSystemAccess] API not supported in this browser');
    return null;
  }

  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    });
    currentDirectoryHandle = handle;
    console.log('[FileSystemAccess] Directory access granted:', handle.name);
    return handle;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.log('[FileSystemAccess] User cancelled directory picker');
      return null;
    }
    throw error;
  }
}

/**
 * Get the current directory handle
 */
export function getCurrentDirectory(): FileSystemDirectoryHandle | null {
  return currentDirectoryHandle;
}

/**
 * Set the current directory handle (for restoring from storage)
 */
export function setCurrentDirectory(handle: FileSystemDirectoryHandle | null): void {
  currentDirectoryHandle = handle;
}

/**
 * List files in a directory
 */
export async function listDirectory(
  dirHandle?: FileSystemDirectoryHandle,
  filter?: string[] // file extensions to filter, e.g., ['.dbox', '.mod', '.xm']
): Promise<FileEntry[]> {
  const handle = dirHandle || currentDirectoryHandle;
  if (!handle) throw new Error('No directory handle available');

  const entries: FileEntry[] = [];

  for await (const [name, entryHandle] of (handle as any).entries()) {
    const isDirectory = entryHandle.kind === 'directory';
    let size: number | undefined;
    let modifiedAt: Date | undefined;

    // Apply filter for files
    if (!isDirectory && filter && filter.length > 0) {
      const ext = '.' + name.split('.').pop()?.toLowerCase();
      if (!filter.includes(ext)) continue;
    }

    if (!isDirectory) {
      try {
        const file = await (entryHandle as FileSystemFileHandle).getFile();
        size = file.size;
        modifiedAt = new Date(file.lastModified);
      } catch {
        // Ignore errors getting file metadata
      }
    }

    entries.push({
      name,
      path: `${handle.name}/${name}`,
      isDirectory,
      size,
      modifiedAt,
      handle: entryHandle,
    });
  }

  // Sort: directories first, then by name
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return entries;
}

/**
 * Read a file from the filesystem
 */
export async function readFile(fileHandle: FileSystemFileHandle): Promise<string> {
  const file = await fileHandle.getFile();
  return file.text();
}

/**
 * Read a file as ArrayBuffer (for binary files)
 */
export async function readFileAsBuffer(fileHandle: FileSystemFileHandle): Promise<ArrayBuffer> {
  const file = await fileHandle.getFile();
  return file.arrayBuffer();
}

/**
 * Write content to a file
 */
export async function writeFile(
  fileHandle: FileSystemFileHandle,
  content: string | ArrayBuffer | Blob
): Promise<void> {
  const writable = await (fileHandle as any).createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Create a new file in the current directory
 */
export async function createFile(
  name: string,
  content: string | ArrayBuffer | Blob,
  dirHandle?: FileSystemDirectoryHandle
): Promise<FileSystemFileHandle> {
  const handle = dirHandle || currentDirectoryHandle;
  if (!handle) throw new Error('No directory handle available');

  const fileHandle = await (handle as any).getFileHandle(name, { create: true });
  await writeFile(fileHandle, content);
  return fileHandle;
}

/**
 * Delete a file from the directory
 */
export async function deleteFile(
  name: string,
  dirHandle?: FileSystemDirectoryHandle
): Promise<void> {
  const handle = dirHandle || currentDirectoryHandle;
  if (!handle) throw new Error('No directory handle available');

  await (handle as any).removeEntry(name);
}

/**
 * Create a subdirectory
 */
export async function createDirectory(
  name: string,
  dirHandle?: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle> {
  const handle = dirHandle || currentDirectoryHandle;
  if (!handle) throw new Error('No directory handle available');

  return (handle as any).getDirectoryHandle(name, { create: true });
}

/**
 * Open a file picker to select files
 */
export async function pickFiles(options?: {
  multiple?: boolean;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}): Promise<FileSystemFileHandle[]> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API not supported');
  }

  try {
    const handles = await (window as any).showOpenFilePicker({
      multiple: options?.multiple ?? false,
      excludeAcceptAllOption: false, // Allow "All Files" option
      types: options?.types ?? [
        {
          description: 'All Supported Formats',
          accept: {
            'application/octet-stream': ['.dbox', '.mod', '.xm', '.it', '.s3m', '.sqs', '.seq'],
          },
        },
        {
          description: 'DEViLBOX Modules',
          accept: {
            'application/json': ['.dbox'],
          },
        },
        {
          description: 'Tracker Modules',
          accept: {
            'audio/x-mod': ['.mod', '.xm', '.it', '.s3m'],
          },
        },
        {
          description: 'TD-3 Patterns',
          accept: {
            'application/octet-stream': ['.sqs', '.seq'],
          },
        },
      ],
    });
    return handles;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return [];
    }
    throw error;
  }
}

/**
 * Open a save file picker
 */
export async function pickSaveLocation(
  suggestedName: string,
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>
): Promise<FileSystemFileHandle | null> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API not supported');
  }

  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName,
      types: types ?? [
        {
          description: 'DEViLBOX Module',
          accept: {
            'application/json': ['.dbox'],
          },
        },
      ],
    });
    return handle;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return null;
    }
    throw error;
  }
}

/**
 * Check if we have permission to access a handle
 */
export async function verifyPermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<boolean> {
  const options = { mode };

  // Check if permission was already granted
  if ((await (handle as any).queryPermission(options)) === 'granted') {
    return true;
  }

  // Request permission
  if ((await (handle as any).requestPermission(options)) === 'granted') {
    return true;
  }

  return false;
}
