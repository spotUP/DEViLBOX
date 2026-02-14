import type { KeyboardScheme } from './types';

export class SchemeLoader {
  static async load(schemeId: string): Promise<KeyboardScheme> {
    if (!schemeId || typeof schemeId !== 'string') {
      throw new Error('Invalid scheme ID');
    }

    const response = await fetch(`/keyboard-schemes/${schemeId}.json`);

    if (!response.ok) {
      throw new Error(`Failed to load keyboard scheme: ${schemeId} (HTTP ${response.status})`);
    }

    const scheme = await response.json();
    return scheme as KeyboardScheme;
  }
}
