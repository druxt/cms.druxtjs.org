// Unit tests for the frontend's production server: the page cache, its
// request handler and the Drupal readiness check.
//
//   node --test "tests/*.test.mjs"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { existsSync, mkdtempSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createHandler, createPageCache, crawl, isPage } = require('../nuxt/server/page-cache.js')
const { backendReady, serviceRoute, waitForBackend } = require('../nuxt/server/backend.js')

// Serve a request listener on a free port for the length of one callback.
const withServer = async (listener, callback) => {
  const server = http.createServer(listener)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}

const request = (url, { method = 'GET', headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    http
      .request(url, { method, headers }, (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
      })
      .on('error', reject)
      .end()
  })

const until = async (condition) => {
  for (let i = 0; i < 100 && !condition(); i++)
    await new Promise((resolve) => setTimeout(resolve, 10))
  return condition()
}

const tempDir = () => mkdtempSync(path.join(tmpdir(), 'page-cache-'))

const live =
  (status = 200) =>
  (req, res) => {
    res.writeHead(status, { 'Content-Type': 'text/plain' })
    res.end('live')
  }

describe('isPage', () => {
  test('takes a GET or HEAD of a page path', () => {
    for (const pathname of ['/', '/tutorials/getting-started', '/api/druxt', '/modules']) {
      assert.equal(isPage('GET', pathname), true, pathname)
    }
    assert.equal(isPage('HEAD', '/how-to'), true)
  })

  test('leaves assets, APIs and other methods alone', () => {
    const others = ['/_nuxt/app.js', '/_content/x', '/_decoupled/logo', '/jsonapi/node/doc_page']
    for (const pathname of [
      ...others,
      '/router/translate-path',
      '/sites/default/files/a.png',
      '/icon.png',
      '/sitemap.xml',
    ]) {
      assert.equal(isPage('GET', pathname), false, pathname)
    }
    assert.equal(isPage('POST', '/'), false)
  })
})

describe('createPageCache', () => {
  test('stores a rendered page and reads it back fresh', async () => {
    const dir = tempDir()
    try {
      const cache = createPageCache({ dir, ttl: 60000, render: async () => ({ html: '<p>a</p>' }) })
      assert.equal(await cache.store('/a/b'), '<p>a</p>')
      assert.ok(existsSync(path.join(dir, 'a', 'b', 'index.html')))
      const page = await cache.read('/a/b')
      assert.equal(page.html, '<p>a</p>')
      assert.equal(page.stale, false)
      assert.equal(await cache.read('/missing'), null)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('marks a page older than the time to live as stale', async () => {
    const dir = tempDir()
    try {
      const cache = createPageCache({ dir, ttl: 60000, render: async () => ({ html: 'x' }) })
      await cache.store('/')
      const old = new Date(Date.now() - 120000)
      utimesSync(cache.fileFor('/'), old, old)
      assert.equal((await cache.read('/')).stale, true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('drops a page that now fails or redirects', async () => {
    const dir = tempDir()
    try {
      let result = { html: 'x' }
      const lines = []
      const cache = createPageCache({
        dir,
        ttl: 60000,
        render: async () => result,
        log: (line) => lines.push(line),
      })
      await cache.store('/gone')
      result = { html: 'error page', error: { statusCode: 404 } }
      assert.equal(await cache.store('/gone'), null)
      assert.equal(await cache.read('/gone'), null)
      result = { html: '', redirected: { path: '/elsewhere' } }
      assert.equal(await cache.store('/moved'), null)
      assert.equal(existsSync(cache.fileFor('/moved')), false)
      assert.deepEqual(lines, [
        'cache: /gone not stored: 404',
        'cache: /moved not stored: redirect',
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('renders a path once while a render is in flight', async () => {
    const dir = tempDir()
    try {
      let renders = 0
      const cache = createPageCache({
        dir,
        ttl: 60000,
        render: async () => ({ html: `render ${++renders}` }),
      })
      const [first, second] = await Promise.all([cache.store('/a'), cache.store('/a')])
      assert.equal(renders, 1)
      assert.equal(first, second)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('logs a render that throws and stores nothing', async () => {
    const dir = tempDir()
    try {
      const lines = []
      const render = async () => {
        throw new Error('boom')
      }
      const cache = createPageCache({ dir, ttl: 60000, render, log: (line) => lines.push(line) })
      assert.equal(await cache.store('/a'), null)
      assert.deepEqual(lines, ['cache: /a did not render: boom'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('refuses a path outside its directory', async () => {
    const cache = createPageCache({ dir: tempDir(), ttl: 0, render: async () => ({ html: 'x' }) })
    assert.equal(cache.fileFor('/../../outside'), null)
    assert.equal(await cache.read('/../../outside'), null)
    assert.equal(await cache.store('/../../outside'), null)
  })
})

describe('createHandler', () => {
  test('renders assets and APIs live, with no cache header', async () => {
    const handler = createHandler({ cache: null, live: live() })
    await withServer(handler, async (base) => {
      const res = await request(`${base}/jsonapi/node/doc_page`)
      assert.equal(res.body, 'live')
      assert.equal(res.headers['x-docs-cache'], undefined)
    })
  })

  test('redirects a trailing slash away, keeping the query', async () => {
    await withServer(createHandler({ cache: null, live: live() }), async (base) => {
      const res = await request(`${base}/how-to/?a=1`)
      assert.equal(res.status, 301)
      assert.equal(res.headers.location, '/how-to?a=1')
      // An encoded "//host" stays a path, never a protocol-relative redirect.
      const encoded = encodeURIComponent('//example.com')
      const odd = await request(`${base}/${encoded}//`)
      assert.equal(odd.headers.location, `/${encoded}`)
    })
  })

  test('renders a missing page live, then serves it stored', async () => {
    const dir = tempDir()
    try {
      const cache = createPageCache({
        dir,
        ttl: 60000,
        render: async () => ({ html: '<p>stored</p>' }),
      })
      await withServer(createHandler({ cache, live: live() }), async (base) => {
        const miss = await request(`${base}/page`)
        assert.equal(miss.headers['x-docs-cache'], 'MISS')
        assert.equal(miss.body, 'live')
        assert.ok(await until(() => existsSync(cache.fileFor('/page'))))

        const hit = await request(`${base}/page`)
        assert.equal(hit.status, 200)
        assert.equal(hit.headers['x-docs-cache'], 'HIT')
        assert.equal(hit.headers['content-type'], 'text/html; charset=utf-8')
        assert.equal(hit.headers['cache-control'], 'no-cache')
        assert.equal(hit.body, '<p>stored</p>')

        const since = new Date(Date.now() + 60000).toUTCString()
        const unchanged = await request(`${base}/page`, { headers: { 'If-Modified-Since': since } })
        assert.equal(unchanged.status, 304)
        const head = await request(`${base}/page`, { method: 'HEAD' })
        assert.equal(head.body, '')
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('never stores a page that did not answer 200', async () => {
    const dir = tempDir()
    try {
      let renders = 0
      const cache = createPageCache({
        dir,
        ttl: 60000,
        render: async () => ({ html: `${++renders}` }),
      })
      await withServer(createHandler({ cache, live: live(404) }), async (base) => {
        assert.equal((await request(`${base}/nowhere`)).status, 404)
        await new Promise((resolve) => setTimeout(resolve, 50))
        assert.equal(renders, 0)
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('serves a stale page and renders a fresh copy behind it', async () => {
    const dir = tempDir()
    try {
      let renders = 0
      const cache = createPageCache({
        dir,
        ttl: 0,
        render: async () => ({ html: `render ${++renders}` }),
      })
      await cache.store('/page')
      await withServer(createHandler({ cache, live: live() }), async (base) => {
        const res = await request(`${base}/page`)
        assert.equal(res.headers['x-docs-cache'], 'STALE')
        assert.equal(res.body, 'render 1')
        assert.ok(await until(() => renders === 2))
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('renders a page with a query string live', async () => {
    const dir = tempDir()
    try {
      const cache = createPageCache({ dir, ttl: 60000, render: async () => ({ html: 'stored' }) })
      await cache.store('/page')
      await withServer(createHandler({ cache, live: live() }), async (base) => {
        const res = await request(`${base}/page?preview=1`)
        assert.equal(res.body, 'live')
        assert.equal(res.headers['x-docs-cache'], undefined)
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('asks search engines to stay away only when told to', async () => {
    await withServer(createHandler({ cache: null, live: live(), noindex: true }), async (base) => {
      assert.equal((await request(`${base}/`)).headers['x-robots-tag'], 'noindex, nofollow')
    })
    await withServer(createHandler({ cache: null, live: live() }), async (base) => {
      assert.equal((await request(`${base}/`)).headers['x-robots-tag'], undefined)
    })
  })
})

describe('crawl', () => {
  const site = {
    '/': '<a href="/a">A</a> <a href="/b/">B</a> <link href="/_nuxt/app.css"> <a href="/jsonapi/x">API</a>',
    '/a': '<a href="/">Home</a> <a href="/c#part">C</a> <a href="/c?x=1">C</a>',
    '/b': '<p>b</p>',
    '/c': '<p>c</p>',
  }

  test('stores every page it can reach, once each', async () => {
    const visits = []
    const store = async (pathname) => {
      visits.push(pathname)
      return site[pathname] || null
    }
    const result = await crawl({ seeds: ['/', '/missing'], store })
    assert.deepEqual([...visits].sort(), ['/', '/a', '/b', '/c', '/missing'])
    assert.deepEqual(result, { stored: 4, visited: 5 })
  })

  test('stops at the limit', async () => {
    const result = await crawl({
      seeds: ['/'],
      store: async (pathname) => site[pathname],
      limit: 2,
    })
    assert.equal(result.visited, 2)
  })
})

describe('backend', () => {
  test('finds the route a service answers on', () => {
    const routes =
      'https://nginx.main.site.example.com, https://nuxt.main.site.example.com,not a url'
    assert.equal(serviceRoute(routes, 'nuxt'), 'https://nuxt.main.site.example.com')
    assert.equal(serviceRoute(routes, 'php'), undefined)
    assert.equal(serviceRoute(undefined, 'nuxt'), undefined)
  })

  test('is ready once the footer menu has items', async () => {
    let answer
    const drupal = (req, res) => {
      const [status, body] = req.url === '/jsonapi/menu_items/footer' ? answer : [404, '{}']
      res.writeHead(status, { 'Content-Type': 'application/vnd.api+json' })
      res.end(body)
    }
    await withServer(drupal, async (base) => {
      for (const [status, body, expected] of [
        [200, '{"data":[{"id":"a"}]}', true],
        [200, '{"data":[]}', false],
        [200, '<html>', false],
        [404, '{"data":[{"id":"a"}]}', false],
      ]) {
        answer = [status, body]
        assert.equal(await backendReady(base), expected, `${status} ${body}`)
      }
    })
    const closed = await withServer(live(), async (base) => base)
    assert.equal(await backendReady(closed), false)
  })

  test('waits until Drupal is ready', async () => {
    let checks = 0
    const lines = []
    await waitForBackend('http://drupal', {
      interval: 1,
      ready: async () => ++checks === 3,
      log: (line) => lines.push(line),
    })
    assert.equal(checks, 3)
    assert.equal(lines.length, 1)
    assert.match(lines[0], /^waiting for Drupal at http:\/\/drupal/)
  })
})
