// The authored pages come from Drupal through the router: what the page
// component reads from the answer, and when a request's spelling differs
// from the alias.
//
//   node --test "tests/*.test.mjs"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

const { fetchDrupalPage, sectionOf } = await import('../nuxt/lib/drupal-document.js')

// The router store's answer: the route, and where it sends the request instead.
const store = (route, redirect, resource) => ({
  dispatch: async (action) => (action === 'druxtRouter/get' ? { route, redirect } : resource),
})
const page = { entity: { type: 'node', bundle: 'doc_page', uuid: 'u-1' } }
const node = {
  data: {
    attributes: { title: 'Getting started', field_description: 'Start here.', field_toc: [] },
  },
}

describe('fetchDrupalPage', () => {
  test('reads the page, with no redirect when the path is the alias', async () => {
    const doc = await fetchDrupalPage(store(page, false, node), '/tutorials/getting-started')
    assert.equal(doc.path, '/tutorials/getting-started')
    assert.equal(doc.redirect, null)
    assert.equal(doc.type, 'node--doc_page')
    assert.equal(doc.title, 'Getting started')
    assert.equal(doc.description, 'Start here.')
  })

  test('carries the redirect the router gives for another spelling of the alias', async () => {
    const doc = await fetchDrupalPage(
      store(page, '/tutorials/getting-started', node),
      '/Tutorials/Getting-Started'
    )
    assert.equal(doc.redirect, '/tutorials/getting-started')
  })

  test('is null for anything that is not a node', async () => {
    assert.equal(await fetchDrupalPage(store({ error: true }), '/nope'), null)
    assert.equal(
      await fetchDrupalPage(store({ entity: { type: 'taxonomy_term' } }), '/tags/x'),
      null
    )
  })
})

describe('sectionOf', () => {
  test('is the first segment', () => {
    assert.equal(sectionOf('/how-to/proxy'), 'how-to')
    assert.equal(sectionOf('/'), '')
  })
})
