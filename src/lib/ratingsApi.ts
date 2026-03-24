/**
 * Ratings API client — star ratings for Modland and HVSC items.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';

export type RatingSource = 'modland' | 'hvsc';

export interface RatingInfo {
  avg: number;
  count: number;
  userRating?: number;
}

export type RatingMap = Record<string, RatingInfo>;

function getAuthHeaders(): Record<string, string> {
  // Read token from persisted auth store (Zustand persist uses localStorage)
  try {
    const raw = localStorage.getItem('devilbox-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      const token = parsed?.state?.token;
      if (token) return { Authorization: `Bearer ${token}` };
    }
  } catch { /* ignore */ }
  return {};
}

/**
 * Set or update a rating for a module/tune.
 * Requires authentication.
 */
export async function setRating(
  source: RatingSource,
  itemKey: string,
  rating: number,
): Promise<{ avg: number; count: number; userRating: number }> {
  const response = await fetch(`${API_URL}/ratings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ source, itemKey, rating }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Rating failed' }));
    throw new Error(err.error || 'Failed to set rating');
  }
  return response.json();
}

/**
 * Remove a rating.
 * Requires authentication.
 */
export async function removeRating(
  source: RatingSource,
  itemKey: string,
): Promise<{ avg: number; count: number }> {
  const response = await fetch(`${API_URL}/ratings`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ source, itemKey }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Remove failed' }));
    throw new Error(err.error || 'Failed to remove rating');
  }
  return response.json();
}

/**
 * Batch-fetch ratings for multiple items. Works for logged-out users too
 * (returns community averages only; userRating included if authenticated).
 */
export async function batchGetRatings(
  source: RatingSource,
  keys: string[],
): Promise<RatingMap> {
  if (keys.length === 0) return {};

  const params = new URLSearchParams({
    source,
    keys: keys.join(','),
  });

  const response = await fetch(`${API_URL}/ratings/batch?${params}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!response.ok) {
    // Non-critical — return empty on failure
    console.warn('[Ratings] Batch fetch failed:', response.status);
    return {};
  }
  const data = await response.json();
  return data.ratings || {};
}
