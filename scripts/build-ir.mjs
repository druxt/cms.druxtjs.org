#!/usr/bin/env node
// Converts the authored documentation into the intermediate representation
// the Drupal importer consumes: one JSON document per page, holding the
// frontmatter, the computed table of contents, and an ordered list of typed
// blocks matching the content model's paragraph bundles.
//
// Markdown parsing lives here rather than in PHP because this is where the
// markdown is, and because a round-trip check that needs no database is the
// cheap half of proving the migration lossless. Every block carries its
// source verbatim, so the serialiser below can rebuild the page and compare
// it against the file it came from.
//
// Nothing is guessed. A construct no rule covers, a fence in a language the
// model does not accept, or a link that resolves to nothing stops the run
// with the file and line named, because a page that migrates with a section
// quietly missing looks exactly like one that did not.
//
// Usage:
//   node scripts/build-ir.mjs --source <checkout> [--out <dir>] [--check]
//
//   --source  a git checkout of the documentation repository.
//   --out     directory to write the documents to, with every image the
//             pages embed copied under static/, so the importer reads one
//             directory and never the checkout.
//   --check   round-trip every page and report, writing nothing.

import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  CODE_LANGUAGES,
  CONTENT_DIR,
  DIAGRAM_SYNTAXES,
  STATIC_DIR,
  calloutType,
  classify,
  extractImages,
  extractLinks,
  isGeneratedPath,
  readDocument,
  routeFor,
  trackedContentFiles,
} from './lib/corpus.mjs'

const require = createRequire(import.meta.url)

// github-slugger, the same implementation @nuxt/content reaches through
// remark-slug, so stored anchors and the ids the current site renders agree
// by construction rather than by a reimplementation that drifts.
const GithubSlugger = require('github-slugger')

/** A defect that stops the run, collected so one pass reports all of them. */
class Defects {
  constructor() {
    this.items = []
  }

  add(file, line, message) {
    this.items.push({ file, line, message })
  }

  get failed() {
    return this.items.length > 0
  }

  report() {
    for (const { file, line, message } of this.items) {
      process.stderr.write(`${file}:${line}: ${message}\n`)
    }
    process.stderr.write(`\n${this.items.length} defects; nothing written.\n`)
  }
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/**
 * Turns one tokenized block into its IR form.
 *
 * Returns null when the block joins the prose accumulating around it, which
 * is how headings, lists, tables and ordinary blockquotes reach the model:
 * inside a text block, not beside one.
 *
 * @param {object} block - A tokenized block.
 * @param {object} context - `{file, defects, groups}`.
 * @returns {object|null} The IR block, or null to accumulate as prose.
 */
function toBlock(block, context) {
  const kind = classify(block)

  switch (kind) {
    case 'code': {
      if (!block.lang) {
        context.defects.add(context.file, block.line, 'fenced code with no language')
        return null
      }
      if (!CODE_LANGUAGES.includes(block.lang)) {
        context.defects.add(
          context.file,
          block.line,
          `fence language "${block.lang}" is outside the model's set (${CODE_LANGUAGES.join(', ')})`,
        )
        return null
      }
      if (!block.closed) {
        context.defects.add(context.file, block.line, 'unclosed fence')
        return null
      }
      return { type: 'code', language: block.lang, code: block.code }
    }

    case 'diagram': {
      if (!DIAGRAM_SYNTAXES.includes(block.lang)) return null
      return { type: 'diagram', syntax: block.lang, source: block.code }
    }

    case 'image': {
      const [image] = extractImages(block.lines[0])
      if (!image.alt.trim()) {
        context.defects.add(context.file, block.line, `image with no alt text: ${image.src}`)
        return null
      }
      return { type: 'image', src: image.src, alt: image.alt }
    }

    case 'callout': {
      const type = calloutType(block)
      if (!type) {
        context.defects.add(
          context.file,
          block.line,
          `callout lead not recognised: ${block.lines[0].slice(0, 60)}`,
        )
        return null
      }
      return { type: 'callout', callout: type, markdown: block.lines.join('\n') }
    }

    case 'output':
      return { type: 'callout', callout: 'output', markdown: block.lines.join('\n') }

    case 'html': {
      const raw = block.lines.join('\n')
      if (/^<div\b/.test(raw.trim())) return { type: '__wrapper', open: true, raw }
      if (/^<\/div>/.test(raw.trim())) return { type: '__wrapper', open: false, raw }
      context.defects.add(context.file, block.line, `raw HTML block: ${block.lines[0].slice(0, 60)}`)
      return null
    }

    default:
      return null
  }
}

/**
 * Builds the ordered block list for a document.
 *
 * Prose accumulates until something typed interrupts it, which is what keeps
 * a heading with the paragraphs beneath it and a list with the fences its
 * steps contain.
 *
 * @param {object} doc - A document from readDocument().
 * @param {Defects} defects - Collector.
 * @returns {object[]} The IR blocks.
 */
function buildBlocks(doc, defects) {
  const context = { file: doc.file, defects }
  const blocks = []
  const presentation = []
  let prose = []
  let group = null
  let groupCount = 0

  const flushProse = () => {
    if (!prose.length) return
    blocks.push({ type: 'text', markdown: prose.join('\n\n') })
    prose = []
  }

  for (const block of doc.blocks) {
    const built = toBlock(block, context)

    if (built && built.type === '__wrapper') {
      // Layout, not content: recorded with the block index it sits in front
      // of, so the source can be rebuilt exactly, while the model stores only
      // the group id it implies. Flushed first, because the wrapper belongs
      // between the prose above it and the diagrams below.
      flushProse()
      group = built.open ? `group-${(groupCount += 1)}` : null
      presentation.push({ before: blocks.length, raw: built.raw })
      continue
    }

    if (!built) {
      // A fence only comes back null with a defect recorded, and the run
      // fails before anything is written, so there is no prose to keep.
      if (block.kind !== 'fence') prose.push(block.lines.join('\n'))
      continue
    }

    flushProse()
    if (built.type === 'diagram' && group) built.group = group
    blocks.push(built)
  }
  flushProse()

  return { blocks, presentation }
}

// ---------------------------------------------------------------------------
// Table of contents
// ---------------------------------------------------------------------------

/**
 * The headings a page renders, with the ids the site gives them.
 *
 * Computed here because Drupal has no native shape for it and deriving it in
 * the browser after mount breaks deep links on first paint under static
 * generation. Headings inside fenced code are excluded: the tokenizer has
 * already separated them, so a `# comment` in a shell example cannot appear.
 *
 * @param {object} doc - A document from readDocument().
 * @returns {object[]} `{id, depth, text}` per heading.
 */
function buildToc(doc) {
  const slugger = new GithubSlugger()
  const toc = []
  for (const block of doc.blocks) {
    if (block.kind === 'fence') continue
    for (const line of block.lines) {
      const match = /^(#{1,6})\s+(.*?)\s*$/.exec(line)
      if (!match) continue
      const text = match[2].replace(/`([^`]*)`/g, '$1').trim()
      toc.push({ id: slugger.slug(text), depth: match[1].length, text })
    }
  }
  return toc
}

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

/**
 * Rebuilds a page's markdown from its IR blocks.
 *
 * @param {object[]} blocks - IR blocks.
 * @param {object[]} presentation - Wrappers the model does not store, with
 *   the block index each sits in front of.
 * @returns {string} The reconstructed body.
 */
export function serialise(blocks, presentation = []) {
  const pieces = blocks
    .map((block) => {
      switch (block.type) {
        case 'code':
          return '```' + block.language + '\n' + block.code + '\n```'
        case 'diagram':
          return '```' + block.syntax + '\n' + block.source + '\n```'
        case 'image':
          return `![${block.alt}](${block.src})`
        case 'callout':
          return block.markdown
        default:
          return block.markdown
      }
    })

  // Reinserted from the end, so an earlier index is not shifted by a later
  // insertion.
  for (const entry of [...presentation].sort((a, b) => b.before - a.before)) {
    pieces.splice(entry.before, 0, entry.raw)
  }

  return pieces.join('\n\n')
}

/**
 * The only differences a round-trip is allowed to forgive.
 *
 * Written down and bounded on purpose: a comparison whose normalisation can
 * be widened until it passes is not a comparison. Adding to this list is a
 * finding, not a fix.
 *
 *   1. Trailing whitespace on a line.
 *   2. Runs of blank lines collapsed to one.
 *   3. Leading and trailing blank lines.
 *
 * @param {string} markdown - Either side of the comparison.
 * @returns {string} The normalised form.
 */
export function normalise(markdown) {
  return markdown
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * Builds the IR for every authored page.
 *
 * @param {string} root - Root of the documentation checkout.
 * @returns {{documents: object[], defects: Defects}} The result.
 */
export function build(root) {
  const defects = new Defects()
  const files = trackedContentFiles(root)
  const routes = new Set(files.map(routeFor))
  const documents = []

  for (const file of files) {
    const doc = readDocument(root, file)

    for (const line of doc.unparsed) {
      defects.add(file, 1, `frontmatter this parser does not understand: ${line}`)
    }
    for (const key of ['title', 'description']) {
      if (!doc.frontmatter[key]) defects.add(file, 1, `frontmatter is missing ${key}`)
    }

    for (const link of extractLinks(doc.body)) {
      if (link.kind !== 'internal') continue
      const [pathPart] = link.target.split('#')
      if (routes.has(pathPart) || isGeneratedPath(link.target)) continue
      defects.add(file, 1, `internal link resolves to neither an authored page nor generated output: ${link.target}`)
    }

    for (const image of extractImages(doc.body)) {
      if (!image.src.startsWith('/') || !existsSync(path.join(root, STATIC_DIR, image.src))) {
        defects.add(file, 1, `image is not a file under ${STATIC_DIR}: ${image.src}`)
      }
    }

    const { blocks, presentation } = buildBlocks(doc, defects)

    documents.push({
      source: file,
      url: doc.route,
      section: doc.section,
      isLanding: doc.isLanding,
      title: doc.frontmatter.title ?? null,
      description: doc.frontmatter.description ?? null,
      weight: doc.frontmatter.weight ?? null,
      toc: buildToc(doc),
      links: extractLinks(doc.body).map((link) => ({
        ...link,
        resolves: link.kind !== 'internal'
          ? link.kind
          : (routes.has(link.target.split('#')[0]) ? 'authored' : 'generated'),
      })),
      images: extractImages(doc.body),
      blocks,
      presentation,
      // Kept so validation can compare without re-reading the source tree,
      // and so a defect found later can be traced to what was parsed.
      sourceBody: doc.body,
    })
  }

  return { documents, defects }
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const flag = (name) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? null : args[index + 1]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const source = flag('source')
  if (!source) {
    process.stderr.write('--source <checkout> is required: the documentation repository to build from.\n')
    process.exit(2)
  }
  if (!existsSync(path.join(source, '.git'))) {
    process.stderr.write(`${source} is not a git checkout. The corpus is listed with git, so it needs one.\n`)
    process.exit(2)
  }

  const { documents, defects } = build(source)

  // An empty corpus is a wrong checkout, not a documentation set with no
  // pages: the importer must not be handed nothing and read it as success.
  if (!documents.length) {
    process.stderr.write(`No tracked files under ${CONTENT_DIR} in ${source}. Is this a checkout of the documentation repository?\n`)
    process.exit(1)
  }

  if (defects.failed) {
    defects.report()
    process.exit(1)
  }

  let mismatched = 0
  for (const doc of documents) {
    const rebuilt = normalise(serialise(doc.blocks, doc.presentation))
    const original = normalise(doc.sourceBody)
    if (rebuilt !== original) {
      mismatched += 1
      process.stderr.write(`${doc.source}: does not round-trip\n`)
      const a = original.split('\n')
      const b = rebuilt.split('\n')
      for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        if (a[i] !== b[i]) {
          process.stderr.write(`  line ${i + 1}\n    source: ${JSON.stringify(a[i])}\n    rebuilt: ${JSON.stringify(b[i])}\n`)
          break
        }
      }
    }
  }

  if (mismatched) {
    process.stderr.write(`\n${mismatched} of ${documents.length} pages do not round-trip; nothing written.\n`)
    process.exit(1)
  }

  const out = flag('out')
  if (args.includes('--check') || !out) {
    process.stdout.write(`${documents.length} pages, all round-trip.\n`)
    const blocks = {}
    for (const doc of documents) {
      for (const block of doc.blocks) blocks[block.type] = (blocks[block.type] || 0) + 1
    }
    for (const [type, count] of Object.entries(blocks).sort((a, b) => b[1] - a[1])) {
      process.stdout.write(`  ${type.padEnd(10)} ${count}\n`)
    }
    process.exit(0)
  }

  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  for (const doc of documents) {
    const name = doc.source.replace(`${CONTENT_DIR}/`, '').replace(/\//g, '__').replace(/\.md$/, '.json')
    // Dropped rather than written: it exists so validation can compare
    // without re-reading the source tree, and duplicating every page's body
    // into the IR on disk would double the artifact for no reader.
    const document = { ...doc }
    delete document.sourceBody
    writeFileSync(path.join(out, name), `${JSON.stringify(document, null, 2)}\n`)
  }

  const images = new Set(documents.flatMap((doc) => doc.images.map((image) => image.src)))
  for (const src of images) {
    const target = path.join(out, 'static', src)
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(path.join(source, STATIC_DIR, src), target)
  }
  process.stdout.write(`${documents.length} documents and ${images.size} images written to ${out}\n`)
}
