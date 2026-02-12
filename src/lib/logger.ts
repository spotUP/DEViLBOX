/**
 * Debug Logger - Conditional logging based on environment
 *
 * Usage:
 *   import { debug, warn, error } from '@lib/logger';
 *   debug('[Component]', 'Some debug message', data);
 *   warn('[Component]', 'Warning message');
 *   error('[Component]', 'Error message', err);
 *
 * In production (NODE_ENV !== 'development'):
 *   - debug() calls are no-ops (silently ignored)
 *   - warn() and error() still log for debugging production issues
 */

const isDev = import.meta.env.DEV;

/**
 * Debug log - Only logs in development mode
 * Use for verbose debugging info that shouldn't appear in production
 */
export const debug = isDev
  ? (...args: unknown[]) => console.log(...args)
  : () => {};

/**
 * Warning log - Logs in all environments
 * Use for non-critical issues that should be investigated
 */
export const warn = (...args: unknown[]) => console.warn(...args);

/**
 * Error log - Logs in all environments
 * Use for errors that need attention
 */
export const error = (...args: unknown[]) => console.error(...args);

/**
 * Grouped debug output - Only in development
 * Use for structured debug output with collapsible groups
 */
export const debugGroup = isDev
  ? (label: string, fn: () => void) => {
      console.groupCollapsed(label);
      fn();
      console.groupEnd();
    }
  : (() => {}) as (label: string, fn: () => void) => void;

/**
 * Performance timing - Only in development
 * Use to measure execution time of operations
 */
export const debugTime = isDev
  ? (label: string) => console.time(label)
  : (() => {}) as (label: string) => void;

export const debugTimeEnd = isDev
  ? (label: string) => console.timeEnd(label)
  : (() => {}) as (label: string) => void;

/**
 * Table output for debugging - Only in development
 */
export const debugTable = isDev
  ? (data: unknown) => console.table(data)
  : (() => {}) as (data: unknown) => void;

export default {
  debug,
  warn,
  error,
  debugGroup,
  debugTime,
  debugTimeEnd,
  debugTable,
};
