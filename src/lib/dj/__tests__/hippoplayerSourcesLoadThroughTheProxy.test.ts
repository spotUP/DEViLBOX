/**
 * Regression: hippoplayer.se moved its module tree from /data/Modules to
 * /webdata/Modules (the old path redirects to https and 404s). HippoPlayer
 * playlists still carry /data/Modules URLs. The DJ loader fetches them
 * through the server's download proxy at the current path; hosts the proxy
 * does not serve (live streams) are refused with a reason.
 */
import { describe, it, expect } from 'vitest';
import { remoteSourceProxyUrl, remoteUpstreamUrl } from '../remoteSources';

const MOZART = 'http://hippoplayer.se/data/Modules/Protracker/M/M-Litz/mozart is a fake.mod';
const MOZART_PROXY = '/api/remote/hippoplayer.se/webdata/Modules/Protracker/M/M-Litz/mozart%20is%20a%20fake.mod';

describe('hippoplayer.se sources load through the proxy', () => {
  it('maps an old /data/Modules URL to the proxy at /webdata/Modules', () => {
    expect(remoteSourceProxyUrl(MOZART)).toBe(MOZART_PROXY);
  });

  it('keeps a current /webdata URL and its escapes', () => {
    expect(remoteSourceProxyUrl('https://hippoplayer.se/webdata/Modules/Video Game Music/Bubble_Bobble_%28Arcade%29/07 Real Ending.vgz'))
      .toBe('/api/remote/hippoplayer.se/webdata/Modules/Video%20Game%20Music/Bubble_Bobble_%28Arcade%29/07%20Real%20Ending.vgz');
  });

  it('the proxy route fetches what the loader asked for, over https', () => {
    const [, host, rest] = /^\/api\/remote\/([^/]+)(\/.+)$/.exec(MOZART_PROXY)!;
    expect(remoteUpstreamUrl(host, rest)).toBe('https://hippoplayer.se/webdata/Modules/Protracker/M/M-Litz/mozart%20is%20a%20fake.mod');
  });

  it('refuses hosts it does not serve and paths that leave the host tree', () => {
    expect(remoteSourceProxyUrl('http://ice1.somafm.com/groovesalad-256-mp3')).toBeNull();
    expect(remoteSourceProxyUrl('modland:pub/modules/Protracker/DWB/stainless.mod')).toBeNull();
    expect(remoteUpstreamUrl('evil.example', '/x.mod')).toBeNull();
    expect(remoteUpstreamUrl('hippoplayer.se', '/webdata/../../etc/passwd')).toBeNull();
    expect(remoteUpstreamUrl('hippoplayer.se', '/webdata/%2e%2e/secret')).toBeNull();
  });
});
