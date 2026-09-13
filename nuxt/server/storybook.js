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
  // `nuxt storybook` hands over to this binary, and finds it only on yarn's PATH.
  const bin = path.join(__dirname, '..', 'node_modules', '@nuxtjs', 'storybook', 'bin', 'nuxt-storybook.js')
  const child = spawn(process.execPath, [bin, '--port', String(port), '--host', env.HOST || '0.0.0.0', '--ci'], {
    cwd: path.join(__dirname, '..'),
    env,
    stdio: 'inherit',
  })
  child.on('exit', (code, signal) => process.exit(signal ? 1 : code || 0))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
