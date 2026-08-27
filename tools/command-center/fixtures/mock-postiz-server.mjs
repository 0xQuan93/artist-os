import { createServer } from 'node:http';

const port = Number(process.env.MOCK_POSTIZ_PORT || 9123);
const server = createServer((request, response) => {
  const payload = request.url === '/public/v1/is-connected'
    ? { connected: true }
    : request.url === '/public/v1/integrations'
      ? [
          { id: 'mock-x', name: 'OxQuan', identifier: 'x', profile: '@_0xQuan', disabled: false },
          { id: 'mock-youtube', name: 'OxQuan TV', identifier: 'youtube', profile: 'OxQuan', disabled: false }
        ]
      : { message: 'Mock route not found' };
  const body = JSON.stringify(payload);
  response.writeHead(request.url.startsWith('/public/v1/') ? 200 : 404, {
    'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)
  });
  response.end(body);
});

server.listen(port, '127.0.0.1', () => console.log(`Mock Postiz listening on ${port}`));
