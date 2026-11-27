// Cloudflare Pages Function: www.beaconfamily.app -> https://beaconfamily.app
// 301, path and query kept. Host-based redirects can't be expressed in
// _redirects, so this lives here. Pages only picks up functions/ when the
// deploy runs from docs-site/ (see deploy-docs-cloudflare.yml).
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'www.beaconfamily.app') {
    url.hostname = 'beaconfamily.app';
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
