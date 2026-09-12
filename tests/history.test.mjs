// Unit tests for the page dates read from git history.
//
//   node --test "tests/*.test.mjs"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { isoDate } from '../scripts/lib/history.mjs'

describe('isoDate', () => {
  test('writes UTC with an offset, the form the migration parses', () => {
    assert.equal(isoDate('1667435566'), '2022-11-03T00:32:46+00:00')
  })

  test('keeps the exact second', () => {
    assert.equal(Date.parse(isoDate('1612141200')) / 1000, 1612141200)
  })

  test('refuses a value git did not give as seconds', () => {
    assert.throws(() => isoDate('2022-11-03T00:32:46Z'), RangeError)
  })
})
