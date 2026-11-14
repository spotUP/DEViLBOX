/** MCP glue for the share link: the logic lives in @/lib/share/shareService. */

/** Make a share link for the song as currently edited (uploads it). */
export async function shareSong(): Promise<Record<string, unknown>> {
  const { buildShareLink } = await import('@/lib/share/shareService');
  return { ...(await buildShareLink()) };
}

/** Open a share link (full URL or just its #share= hash) the way a visitor's tab does: no autoplay, Play prompt shown. */
export async function openShare(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const link = String(params.link ?? '');
  const hash = link.includes('#') ? link.slice(link.indexOf('#')) : link;
  const { openShareHash } = await import('@/lib/share/shareService');
  const opened = await openShareHash(hash);
  if (!opened) throw new Error('Not a share link: expected a URL or hash with #share=');
  return { opened };
}
