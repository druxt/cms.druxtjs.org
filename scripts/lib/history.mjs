// Page dates from the documentation's git history. Needs nothing from
// node_modules, so its unit tests run without an install.

import { execFileSync } from 'node:child_process'

/**
 * Git renders UTC as `Z` or `+00:00` depending on its version, so dates are
 * read as epoch seconds and written in the one form the migration parses.
 */
export function isoDate(seconds) {
  return new Date(Number(seconds) * 1000).toISOString().replace(/\.\d{3}Z$/, '+00:00')
}

/**
 * When a page was written and last changed, from the documentation's own
 * history.
 *
 * `--follow` with a 30% rename threshold carries a page back through a move
 * or a heavy rewrite, which is how the older pages survived the Diataxis
 * rebuild. `origin` is the path the oldest commit knew the page by, so a
 * link someone disagrees with can be seen rather than inferred.
 */
export function history(root, file) {
  const run = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  const dates = run('log', '--follow', '-M30%', '--format=%at', 'HEAD', '--', file).split('\n').filter(Boolean).map(isoDate)
  if (!dates.length) throw new Error(`${file}: no history at HEAD`)
  const paths = run('log', '--follow', '-M30%', '--name-only', '--format=', 'HEAD', '--', file).split('\n').filter(Boolean)
  return { created: dates[dates.length - 1], changed: dates[0], origin: paths[paths.length - 1] ?? file }
}

/**
 * A shallow checkout has no history before its boundary, so every page would
 * be dated to the fetch rather than to when it was written, with no error.
 */
export function assertFullHistory(root) {
  const shallow = execFileSync('git', ['-C', root, 'rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim()
  if (shallow === 'true') {
    throw new Error(`${root} is a shallow clone. Page dates come from git history, so it needs the full history: fetch without --depth.`)
  }
}
