/**
 * A request listener that hands every request to another local server and
 * streams the answer back: the port stays open while the real server builds.
 */
const http = require('http')

/**
 * @param {object} target - Where requests go.
 * @param {string} target.host - The host, usually 127.0.0.1.
 * @param {number} target.port - The port.
 * @returns {Function} A request listener.
 */
const createProxyHandler = ({ host, port }) => (req, res) => {
  const upstream = http.request(
    { host, port, method: req.method, path: req.url, headers: { ...req.headers, host: `${host}:${port}` } },
    (answer) => {
      res.writeHead(answer.statusCode, answer.headers)
      answer.pipe(res)
    },
  )
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end('Bad Gateway')
  })
  req.pipe(upstream)
}

module.exports = { createProxyHandler }
