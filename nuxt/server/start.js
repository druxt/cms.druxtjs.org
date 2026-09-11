#!/usr/bin/env node
/**
 * Start the site in production.
 *
 * Holds the port with a holding page while Drupal comes up, builds the app
 * against it (the display schemas and decoupled settings are read at build
 * time), then serves pre-rendered pages first and renders the rest live.
 */
const fs = require('fs')
const http = require('http')
const path = require('path')
const { spawn } = require('child_process')
const { serviceRoute, waitForBackend } = require('./backend')
const { createHandler, createPageCache, crawl } = require('./page-cache')

const rootDir = path.join(__dirname, '..')
const env = process.env
const port = Number(env.PORT) || 3000
const host = env.HOST || '0.0.0.0'
const baseUrl = env.DRUXT_BASE_URL || 'http://nginx:8080'
const log = (message) => process.stdout.write(`start: ${message}\n`)

const HOLDING = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="15">
<meta name="robots" content="noindex">
<title>DruxtJS is starting</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem}</style>
</head>
<body>
<h1>DruxtJS is starting</h1>
<p>The site builds against Drupal as it starts. This page reloads itself until it is ready.</p>
</body>
</html>
`

// Until the app is ready, every request gets the holding page.
let handler = (req, res) => {
  res.writeHead(503, {
    'Content-Type': 'text/html; charset=utf-8',
    'Retry-After': '15',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
  })
  res.end(req.method === 'HEAD' ? undefined : HOLDING)
}
const server = http.createServer((req, res) => handler(req, res))

const nuxt = (args, extraEnv) =>
  new Promise((resolve, reject) => {
    const bin = path.join(rootDir, 'node_modules', 'nuxt', 'bin', 'nuxt.js')
    const child = spawn(process.execPath, [bin, ...args], { cwd: rootDir, env: { ...env, ...extraEnv }, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`nuxt ${args.join(' ')} exited with ${signal || code}`)),
    )
  })

const main = async () => {
  await new Promise((resolve) => server.listen(port, host, resolve))
  log(`holding page on http://${host}:${port}`)

  await waitForBackend(baseUrl, { log })
  log(`Drupal is ready at ${baseUrl}`)

  // Canonical links and share cards name this environment's own origin.
  const origin = env.SITE_ORIGIN || env.DRUXT_FRONTEND_URL || serviceRoute(env.LAGOON_ROUTES, 'nuxt')
  if (origin) env.SITE_ORIGIN = origin.replace(/\/+$/, '')

  // The machine-readable indexes `nuxt generate` used to write, from the same corpus.
  try {
    const { readContent } = require('../lib/content-index')
    const { buildSitemap } = require('../lib/sitemap')
    const { buildLlmsTxt } = require('../lib/llms-txt')
    const docs = readContent(path.join(rootDir, 'content'))
    const siteOrigin = env.SITE_ORIGIN || 'https://druxtjs.org'
    fs.writeFileSync(path.join(rootDir, 'static', 'sitemap.xml'), buildSitemap(docs, { origin: siteOrigin }))
    fs.writeFileSync(path.join(rootDir, 'static', 'llms.txt'), buildLlmsTxt(docs, { origin: siteOrigin }))
    log(`wrote sitemap.xml and llms.txt for ${docs.length} documents`)
  } catch (error) {
    log(`sitemap.xml and llms.txt not written: ${error.message}`)
  }

  const started = Date.now()
  await nuxt(['build'])
  log(`built in ${Math.round((Date.now() - started) / 1000)}s`)

  const { loadNuxt } = require('nuxt')
  const app = await loadNuxt({ for: 'start', rootDir })
  const cache =
    env.DOCS_CACHE === '0'
      ? null
      : createPageCache({
          dir: env.DOCS_CACHE_DIR || path.join(rootDir, '.cache', 'pages'),
          ttl: (Number(env.DOCS_CACHE_TTL) || 300) * 1000,
          render: (route) => app.server.renderRoute(route),
          log,
        })
  handler = createHandler({ cache, live: app.render, noindex: env.LAGOON_ENVIRONMENT_TYPE !== 'production' })
  log(`serving ${env.SITE_ORIGIN || `http://${host}:${port}`}`)

  if (cache) {
    const warmed = Date.now()
    const seeds = ['/', ...(await app.options.generate.routes())]
    const { stored, visited } = await crawl({ seeds, store: cache.store })
    log(`pre-rendered ${stored} of ${visited} pages in ${Math.round((Date.now() - warmed) / 1000)}s`)
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 10000).unref()
  })
}

main().catch((error) => {
  process.stderr.write(`start: ${error.stack || error}\n`)
  process.exit(1)
})
