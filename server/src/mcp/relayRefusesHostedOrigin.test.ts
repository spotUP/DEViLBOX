import { describe, expect, it } from 'vitest';
import { acceptsConnection } from './wsRelay';

describe('relay browser slot is local only', () => {
  it('accepts localhost pages on any port', () => {
    expect(acceptsConnection('http://localhost:5174', '/', false)).toBe(true);
    expect(acceptsConnection('http://127.0.0.1:5173', '/', false)).toBe(true);
    expect(acceptsConnection('http://[::1]:5174', '/', false)).toBe(true);
  });
  it('refuses the hosted page unless opted in', () => {
    expect(acceptsConnection('https://devilbox.uprough.net', '/', false)).toBe(false);
    expect(acceptsConnection('https://localhost.evil.example', '/', false)).toBe(false);
    expect(acceptsConnection('https://devilbox.uprough.net', '/', true)).toBe(true);
  });
  it('keeps non-browser clients and the mcp, controller and probe paths', () => {
    expect(acceptsConnection(undefined, '/', false)).toBe(true);
    expect(acceptsConnection('https://devilbox.uprough.net', '/mcp', false)).toBe(true);
    expect(acceptsConnection('https://devilbox.uprough.net', '/controller', false)).toBe(true);
    expect(acceptsConnection('https://devilbox.uprough.net', '/probe', false)).toBe(true);
  });
});
