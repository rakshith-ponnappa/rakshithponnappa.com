// Alias hosts (rakshithponnappa.dev, www.rakshithponnappa.dev, www.rakshithponnappa.com) → https://rakshithponnappa.com,
// keeping path and query, so the site has one canonical address.
export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    url.protocol = 'https:';
    url.hostname = 'rakshithponnappa.com';
    url.port = '';
    return new Response(null, { status: 301, headers: { Location: url.toString(), 'Cache-Control': 'public, max-age=86400' } });
  },
};
