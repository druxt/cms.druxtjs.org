# cms.druxtjs.org

Drupal backend and content for the [druxtjs.org](https://druxtjs.org)
documentation site.

The documentation is authored as markdown in the
[druxt.js](https://github.com/druxt/druxt.js) monorepo. This project holds the
Drupal content model it is migrated into, the importer that does the
migrating, and the resulting content committed as
[Tome](https://www.drupal.org/project/tome) JSON. The frontend reads it back
over JSON:API with Druxt, which makes druxtjs.org a site built with the
framework it documents.

## Layout

| Path | Purpose |
| ---- | ------- |
| `drupal/` | The Drupal codebase, configuration, content and importer |
| `drupal/.devtools/` | Provisioning scripts: PHP and SQLite, no Docker |
| `drupal/config/sync/` | Exported site configuration |
| `drupal/content/` | Content, committed as Tome JSON |
| `docs-source.json` | The documentation repository and commit the content is built from |
| `scripts/` | The IR builder, the corpus survey and its baseline, content validation |
| `tests/` | Unit tests for the corpus reader, guardrail tests for the scripts |

## Getting started

Requires PHP 8.3 or later and Composer. No Docker, no database server.

```sh
cd drupal
.devtools/assemble     # composer install
.devtools/provision    # install Drupal against a throwaway SQLite database
.devtools/start        # serve it
```

`.devtools/info` reports what is configured, and `.devtools/stop` shuts the
server down. Provisioning reads the checkout to decide how to install: with
committed content it runs `drush tome:install`, with configuration only it
installs from that configuration, and with neither it falls back to a bare
site so that the scripts work on every commit.

## The documentation source

`docs-source.json` pins the documentation repository and the exact commit
the committed content is built from. Nothing here reads a branch: the
content under `drupal/content/` is a function of that commit, the importer
and the content model, and CI proves it on every pipeline by building from
the pin and failing when the result differs from what is committed.

Everything that reads the documentation lives here. `scripts/build-ir.mjs`
turns the pinned checkout into the intermediate representation the importer
consumes, and `scripts/survey-content.mjs` measures the same checkout into
`scripts/content-baseline.json`, the counts validation asserts against.

To move the pin, edit the `ref` in `docs-source.json` to the new commit and
rebuild the content from it:

```sh
npm ci                                   # the IR builder's one dependency
cd drupal
.devtools/assemble
.devtools/provision
.devtools/import                         # fetch, build, import, export
cd ..
npm run survey:content                   # re-measure the baseline
```

Commit the content change together with the pin and the baseline. The merge
request diff is the review: every page the new commit added, removed or
changed shows up as Tome JSON, and nothing else does.

`.devtools/import --check` is what CI runs. It refuses to build from anything
but the pinned commit, so a green pipeline means the committed content and
the pin agree.

## Status

Early. The content model and importer are being built; see the `druxtjs-docs-drupal-migration` change for the plan.

## License

[MIT](./LICENSE)
