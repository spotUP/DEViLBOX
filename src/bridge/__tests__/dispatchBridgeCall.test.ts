import { describe, it, expect } from 'vitest';
import { dispatchBridgeCall } from '../MCPBridge';

describe('dispatchBridgeCall', () => {
  it('returns an error result for an unknown method', async () => {
    expect(await dispatchBridgeCall('no_such_method_xyz', {})).toEqual({
      ok: false,
      error: 'Unknown method: no_such_method_xyz',
    });
  });

  it('does not resolve inherited object keys as handlers', async () => {
    const r = await dispatchBridgeCall('toString', {});
    expect(r.ok).toBe(false);
  });
});
