/**
 * Simple ID generator for creating unique IDs
 */

let counter = 0;

export const idGenerator = {
  /**
   * Generate a unique ID with optional prefix
   */
  generate(prefix: string = 'id'): string {
    counter++;
    return `${prefix}-${counter}-${Date.now()}`;
  },

  /**
   * Reset the counter (useful for testing)
   */
  reset(): void {
    counter = 0;
  }
};
