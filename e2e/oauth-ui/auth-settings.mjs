import { createServer } from 'node:http'

// This fixture exposes only public provider availability. Token/user/database
// requests deliberately fail; provider navigation is intercepted in Playwright.
createServer((request, response) => {
  if (request.url === '/auth/v1/settings') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ external: { google: true, github: true } }))
    return
  }
  response.writeHead(404)
  response.end()
}).listen(54999, '127.0.0.1')
