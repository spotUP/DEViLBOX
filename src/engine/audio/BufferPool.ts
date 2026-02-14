/**
 * BufferPool - Reusable audio buffer management
 *
 * Pools Float32Array buffers to reduce garbage collection pressure.
 * Allocates new buffers when needed, reuses released buffers, and limits
 * pool size to prevent memory bloat.
 *
 * Performance benefit: Reduces GC pauses, smoother audio playback during heavy usage.
 */

export class BufferPool {
  private pools: Map<number, Float32Array[]> = new Map();
  private inUse: Set<Float32Array> = new Set();
  private maxPoolSize: number;

  constructor(maxPoolSize: number = 10) {
    this.maxPoolSize = maxPoolSize;
  }

  /**
   * Acquire a buffer from the pool or create new if none available.
   */
  acquire(size: number): Float32Array {
    let pool = this.pools.get(size);
    if (!pool) {
      pool = [];
      this.pools.set(size, pool);
    }

    let buffer: Float32Array;
    if (pool.length > 0) {
      buffer = pool.pop()!;
    } else {
      buffer = new Float32Array(size);
    }

    this.inUse.add(buffer);
    return buffer;
  }

  /**
   * Release a buffer back to the pool.
   */
  release(buffer: Float32Array): void {
    if (!this.inUse.has(buffer)) {
      console.warn('[BufferPool] Attempted to release buffer not in use');
      return;
    }

    this.inUse.delete(buffer);
    const size = buffer.length;
    const pool = this.pools.get(size)!;

    // Clear buffer before returning to pool
    buffer.fill(0);

    // Limit pool size to prevent memory bloat
    if (pool.length < this.maxPoolSize) {
      pool.push(buffer);
    }
    // Otherwise, let the buffer be garbage collected
  }

  /**
   * Release a buffer and fill with new data (convenience method).
   */
  releaseWithData(buffer: Float32Array, data: Float32Array): void {
    if (buffer.length !== data.length) {
      console.error('[BufferPool] Buffer size mismatch in releaseWithData');
      this.release(buffer);
      return;
    }

    buffer.set(data);
    this.release(buffer);
  }

  /**
   * Clear all pools (for cleanup).
   */
  clear(): void {
    this.pools.clear();
    this.inUse.clear();
  }

  /**
   * Get pool statistics for debugging.
   */
  getStats(): {
    poolSizes: Map<number, number>;
    inUseCount: number;
    totalPooled: number;
  } {
    const poolSizes = new Map<number, number>();
    let totalPooled = 0;

    for (const [size, pool] of this.pools) {
      poolSizes.set(size, pool.length);
      totalPooled += pool.length;
    }

    return {
      poolSizes,
      inUseCount: this.inUse.size,
      totalPooled,
    };
  }

  /**
   * Trim pools to reduce memory footprint (call during idle time).
   */
  trim(targetSize: number = 5): void {
    for (const pool of this.pools.values()) {
      if (pool.length > targetSize) {
        pool.length = targetSize;
      }
    }
  }
}
