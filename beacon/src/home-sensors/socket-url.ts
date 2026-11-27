/** Browser URL for the add-on / standalone server websocket bridge. */
export function proxiedHaSocketUrl(
  location: { protocol: string; host: string },
  basePath: string,
): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = basePath.replace(/\/$/, '');
  return `${proto}//${location.host}${base}/beacon-ws/ha`;
}
