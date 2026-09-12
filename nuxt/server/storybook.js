/**
 * Starts Storybook once Drupal answers. Druxt writes a story per display,
 * block, menu and view from the backend, so it has to be up first.
 *
 *   node server/storybook.js
 */
const path = require('path')
const { spawn } = require('child_process')
const { waitForBackend } = require('./backend')

const env = process.env
const port = Number(env.PORT) || 3000
const baseUrl = env.DRUXT_BASE_URL || 'http://nginx:8080'
const log = (message) => console.log(`[storybook] ${message}`)

const main = async () => {
  await waitForBackend(baseUrl, { log })
  log(`Drupal is ready at ${baseUrl}`)
  const bin = path.join(__dirname, '..', 'node_modules', 'nuxt', 'bin', 'nuxt.js')
  const child = spawn(process.execPath, [bin, 'storybook', '--port', String(port), '--ci'], {
    cwd: path.join(__dirname, '..'),
    env: { ...env, HOST: env.HOST || '0.0.0.0' },
    stdio: 'inherit',
  })
  child.on('exit', (code, signal) => process.exit(signal ? 1 : code || 0))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
