/**
 * URL Utilities
 * Helpers for handling asset paths and BASE_URL normalization
 */

/**
 * Normalizes a URL by prepending the BASE_URL if it's a root-relative path
 * This ensures assets load correctly when the app is hosted in a subdirectory (e.g. GitHub Pages)
 */
export function normalizeUrl(url: string | undefined): string {
  if (!url) return '';
  
  // Return as-is if it's an absolute URL (http/https), a data URL, or a blob URL
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
  // If baseUrl is just '/', no normalization needed for root-relative paths
  if (normalizedBase === '' || normalizedBase === '/') return url;

  // Ensure url starts with a slash for consistent comparison
  const path = url.startsWith('/') ? url : '/' + url;

  // If url already starts with normalizedBase, don't prepend it again
  if (path.startsWith(normalizedBase)) {
    return path;
  }
  
  const result = normalizedBase + path;
  return result;
}
