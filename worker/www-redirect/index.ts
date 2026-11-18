// www.rakshithponnappa.dev → https://rakshithponnappa.dev, keeping path and query.
export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.hostname = 'rakshithponnappa.dev';
    url.port = '';
    return new Response(null, { status: 301, headers: { Location: url.toString(), 'Cache-Control': 'public, max-age=86400' } });
  },
};
