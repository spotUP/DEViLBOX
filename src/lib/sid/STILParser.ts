/**
 * STILParser.ts
 * 
 * Parser for STIL (SID Tune Information List) format.
 * STIL contains detailed metadata about C64 SID tunes: composer bios,
 * song notes, trivia, cover information, and more.
 * 
 * Format:
 * /Path/To/File.sid
 *   TITLE: Song Title
 *  AUTHOR: Composer Name
 * COMMENT: Detailed information...
 * 
 * (#2)
 * COMMENT: Information about subsong 2...
 */

export interface STILEntry {
  filepath: string;           // Full path in HVSC (e.g., /Hubbard_Rob/Commando.sid)
  global?: STILSubsongInfo;   // Info for all subsongs
  subsongs: Map<number, STILSubsongInfo>; // Per-subsong info (1-based)
}

export interface STILSubsongInfo {
  title?: string;
  author?: string;
  artist?: string;  // Performer/cover artist (if different from original)
  comment?: string[];
  name?: string;    // Subsong name
  year?: string;
}

/**
 * Parse STIL text format
 */
export function parseSTIL(stilText: string): Map<string, STILEntry> {
  const entries = new Map<string, STILEntry>();
  const lines = stilText.split('\n');
  
  let currentEntry: STILEntry | null = null;
  let currentSubsong = 0; // 0 = global, 1+ = subsong number
  let currentField: keyof STILSubsongInfo | null = null;
  let currentValue = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Empty line ends current entry
    if (line.trim() === '') {
      if (currentEntry) {
        // Finalize any pending field
        if (currentField && currentValue) {
          appendFieldToEntry(currentEntry, currentSubsong, currentField, currentValue.trim());
        }
        // Store entry
        entries.set(currentEntry.filepath, currentEntry);
        currentEntry = null;
        currentSubsong = 0;
        currentField = null;
        currentValue = '';
      }
      continue;
    }
    
    // New entry starts with /
    if (line.startsWith('/')) {
      // Save previous entry if exists
      if (currentEntry) {
        if (currentField && currentValue) {
          appendFieldToEntry(currentEntry, currentSubsong, currentField, currentValue.trim());
        }
        entries.set(currentEntry.filepath, currentEntry);
      }
      
      // Start new entry
      currentEntry = {
        filepath: line.trim(),
        subsongs: new Map(),
      };
      currentSubsong = 0;
      currentField = null;
      currentValue = '';
      continue;
    }
    
    // Subsong marker: (#N)
    const subsongMatch = line.match(/^\(#(\d+)\)/);
    if (subsongMatch && currentEntry) {
      // Finalize previous subsong's field
      if (currentField && currentValue) {
        appendFieldToEntry(currentEntry, currentSubsong, currentField, currentValue.trim());
        currentValue = '';
        currentField = null;
      }
      
      currentSubsong = parseInt(subsongMatch[1], 10);
      continue;
    }
    
    // Field line: starts with uppercase keyword followed by colon
    const fieldMatch = line.match(/^\s*([A-Z]+):\s*(.*)$/);
    if (fieldMatch && currentEntry) {
      // Finalize previous field
      if (currentField && currentValue) {
        appendFieldToEntry(currentEntry, currentSubsong, currentField, currentValue.trim());
      }
      
      // Start new field
      const fieldName = fieldMatch[1].toLowerCase();
      currentField = fieldName as keyof STILSubsongInfo;
      currentValue = fieldMatch[2];
      continue;
    }
    
    // Continuation line (indented, part of previous field)
    if (line.startsWith(' ') && currentField) {
      currentValue += ' ' + line.trim();
      continue;
    }
  }
  
  // Finalize last entry
  if (currentEntry) {
    if (currentField && currentValue) {
      appendFieldToEntry(currentEntry, currentSubsong, currentField, currentValue.trim());
    }
    entries.set(currentEntry.filepath, currentEntry);
  }
  
  return entries;
}

/**
 * Append a field value to the appropriate subsong
 */
function appendFieldToEntry(
  entry: STILEntry,
  subsong: number,
  field: keyof STILSubsongInfo,
  value: string
): void {
  if (subsong === 0) {
    // Global info
    if (!entry.global) {
      entry.global = {};
    }
    appendField(entry.global, field, value);
  } else {
    // Subsong-specific info
    if (!entry.subsongs.has(subsong)) {
      entry.subsongs.set(subsong, {});
    }
    appendField(entry.subsongs.get(subsong)!, field, value);
  }
}

/**
 * Append field to subsong info (handles multi-line comments)
 */
function appendField(info: STILSubsongInfo, field: keyof STILSubsongInfo, value: string): void {
  if (field === 'comment') {
    if (!info.comment) {
      info.comment = [];
    }
    info.comment.push(value);
  } else {
    (info as any)[field] = value;
  }
}

/**
 * Lookup STIL entry by filepath
 */
export function lookupSTIL(
  entries: Map<string, STILEntry>,
  filepath: string,
  subsong?: number
): STILSubsongInfo | null {
  // Normalize path (remove leading slash if present)
  const normalizedPath = filepath.startsWith('/') ? filepath : '/' + filepath;
  
  const entry = entries.get(normalizedPath);
  if (!entry) {
    return null;
  }
  
  // If subsong specified, get subsong-specific info merged with global
  if (subsong !== undefined && subsong > 0) {
    const subsongInfo = entry.subsongs.get(subsong);
    if (subsongInfo || entry.global) {
      return {
        ...entry.global,
        ...subsongInfo,
        // Merge comments
        comment: [
          ...(entry.global?.comment || []),
          ...(subsongInfo?.comment || []),
        ],
      };
    }
  }
  
  // Return global info
  return entry.global || null;
}

/**
 * Format STIL info for display
 */
export function formatSTILInfo(info: STILSubsongInfo): string {
  const lines: string[] = [];
  
  if (info.title) lines.push(`Title: ${info.title}`);
  if (info.author) lines.push(`Author: ${info.author}`);
  if (info.artist) lines.push(`Artist: ${info.artist}`);
  if (info.year) lines.push(`Year: ${info.year}`);
  if (info.name) lines.push(`Name: ${info.name}`);
  
  if (info.comment && info.comment.length > 0) {
    lines.push('');
    lines.push(...info.comment);
  }
  
  return lines.join('\n');
}

/**
 * Load STIL from URL
 */
export async function loadSTIL(url: string): Promise<Map<string, STILEntry>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load STIL: ${response.statusText}`);
  }
  const text = await response.text();
  return parseSTIL(text);
}
