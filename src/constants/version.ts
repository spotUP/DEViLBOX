// Application version - uses auto-generated build info from git commits
// BUILD_NUMBER auto-increments with each commit
import {
  BUILD_VERSION,
  BUILD_NUMBER,
  BUILD_HASH,
  BUILD_DATE,
  FULL_VERSION,
} from '../generated/changelog';

// Main version display (e.g., "1.0.0+42")
export const APP_VERSION = FULL_VERSION;

// Individual components for detailed display
export { BUILD_VERSION, BUILD_NUMBER, BUILD_HASH, BUILD_DATE, FULL_VERSION };
