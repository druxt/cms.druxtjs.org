/**
 * Pre-rendered pages, served ahead of live rendering.
 *
 * Pages render into a directory of HTML files, as `nuxt generate` writes
 * them. A stored page is served from its file, and one older than the time
 * to live is served while a fresh copy renders behind it. A page that is not
 * stored yet renders live, and is stored once it has answered 200.
 */
const fs = require('fs')
const path = require('path')

/** Paths the frontend serves that are not pages: its assets, its APIs and Drupal's. */
const NOT_PAGES = /^\/(_nuxt|_content|_decoupled|__webpack_hmr|jsonapi|router|sites)(\/|$)/
const ASSET = /\.(js|mjs|css|map|json|xml|txt|ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|webmanifest|pdf)$/i
const LINK = /href="(\/[^"#?]*)/g

/**
 * Whether a request asks for a page rather than an asset or an API.
 *
 * @param {string} method - The request method.
 * @param {string} pathname - The request path.
 * @returns {boolean} True for a GET or HEAD of a page path.
 */
const isPage = (method, pathname) =>
  (method === 'GET' || method === 'HEAD') && !ASSET.test(pathname) && !NOT_PAGES.test(pathname)

/**
 * A directory of rendered pages.
 *
 * @param {object} options - Options.
 * @param {string} options.dir - Where the HTML files go.
 * @param {number} options.ttl - Milliseconds before a stored page renders again.
 * @param {Function} options.render - Renders a path to `{ html, error, redirected }`.
 * @param {Function} [options.log] - Logs a line.
 * @returns {{ read: Function, store: Function, fileFor: Function }} The cache.
 */
const createPageCache = ({ dir, ttl, render, log = () => {} }) => {
  const root = path.resolve(dir)
  const pending = new Map()

  const fileFor = (pathname) => {
    const file = path.resolve(root, `.${pathname}`, 'index.html')
    return file.startsWith(root + path.sep) ? file : null
  }

  const read = async (pathname) => {
    const file = fileFor(pathname)
    if (!file) return null
    try {
      const [html, stats] = await Promise.all([fs.promises.readFile(file, 'utf8'), fs.promises.stat(file)])
      return { html, modified: stats.mtime, stale: Date.now() - stats.mtimeMs >= ttl }
    } catch (e) {
      return null
    }
  }

  const store = (pathname) => {
    if (pending.has(pathname)) return pending.get(pathname)
    const job = (async () => {
      const file = fileFor(pathname)
      if (!file) return null
      const { html, error, redirected } = (await render(pathname)) || {}
      if (!html || error || redirected) {
        // Gone, moved or failing: the next request renders live.
        const reason = error ? error.statusCode || 'error' : redirected ? 'redirect' : 'empty'
        log(`cache: ${pathname} not stored: ${reason}`)
        await fs.promises.rm(file, { force: true })
        return null
      }
      await fs.promises.mkdir(path.dirname(file), { recursive: true })
      const partial = `${file}.${process.pid}.partial`
      await fs.promises.writeFile(partial, html)
      await fs.promises.rename(partial, file)
      return html
    })()
      .catch((e) => {
        log(`cache: ${pathname} did not render: ${e.message}`)
        return null
      })
      .finally(() => pending.delete(pathname))
    pending.set(pathname, job)
    return job
  }

  return { read, store, fileFor }
}

/**
 * Render and store every page reachable from the seeds by links.
 *
 * @param {object} options - Options.
 * @param {string[]} options.seeds - Paths to start from.
 * @param {Function} options.store - The cache's store.
 * @param {number} [options.concurrency] - Pages rendering at once.
 * @param {number} [options.limit] - Most pages to visit.
 * @returns {Promise<{ stored: number, visited: number }>} What it did.
 */
const crawl = async ({ seeds, store, concurrency = 2, limit = 5000 }) => {
  const seen = new Set()
  const queue = []
  const add = (pathname) => {
    const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
    if (seen.size < limit && !seen.has(clean) && isPage('GET', clean)) {
      seen.add(clean)
      queue.push(clean)
    }
  }
  seeds.forEach(add)
  let stored = 0
  const worker = async () => {
    while (queue.length) {
      const html = await store(queue.shift())
      if (!html) continue
      stored += 1
      for (const match of html.matchAll(LINK)) add(match[1])
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return { stored, visited: seen.size }
}

/**
 * Serve stored pages first and everything else live.
 *
 * @param {object} options - Options.
 * @param {object|null} options.cache - The page cache, or null to render every page live.
 * @param {Function} options.live - Nuxt's renderer, `(req, res) => void`.
 * @param {boolean} [options.noindex] - Ask search engines not to index this environment.
 * @returns {Function} An HTTP request listener.
 */
const createHandler =
  ({ cache, live, noindex = false }) =>
  async (req, res) => {
    if (noindex) res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    let url
    try {
      url = new URL(req.url, 'http://internal')
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('Bad Request')
    }
    const { pathname, search } = url
    if (!isPage(req.method, pathname)) return live(req, res)

    // Canonical page URLs carry no trailing slash.
    if (pathname !== '/' && pathname.endsWith('/')) {
      res.writeHead(301, { Location: `/${pathname.replace(/^\/+|\/+$/g, '')}${search}` })
      return res.end()
    }
    if (!cache || search) return live(req, res)

    const page = await cache.read(pathname)
    if (!page) {
      res.setHeader('X-Docs-Cache', 'MISS')
      res.on('finish', () => {
        if (res.statusCode === 200) cache.store(pathname)
      })
      return live(req, res)
    }
    if (page.stale) cache.store(pathname)
    res.setHeader('X-Docs-Cache', page.stale ? 'STALE' : 'HIT')
    const since = Date.parse(req.headers['if-modified-since'] || '')
    if (since >= Math.floor(page.modified.getTime() / 1000) * 1000) {
      res.writeHead(304)
      return res.end()
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(page.html),
      'Last-Modified': page.modified.toUTCString(),
      'Cache-Control': 'no-cache',
    })
    return res.end(req.method === 'HEAD' ? undefined : page.html)
  }

module.exports = { createHandler, createPageCache, crawl, isPage }
