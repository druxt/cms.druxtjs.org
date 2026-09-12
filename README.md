# cms.druxtjs.org

Drupal backend and content for the [druxtjs.org](https://druxtjs.org)
documentation site.

The documentation is authored as markdown in the
[druxt.js](https://github.com/druxt/druxt.js) monorepo. This project holds the
Drupal content model it is migrated into and the importer that does the
migrating. The content itself lives in the site's database, the way it does
on any other Drupal site. The frontend reads it back over JSON:API with
Druxt, which makes druxtjs.org a site built with the framework it
documents.

## Layout

| Path | Purpose |
| ---- | ------- |
| `drupal/` | The Drupal codebase, configuration and importer |
| `drupal/.devtools/` | Provisioning scripts: PHP and SQLite, no Docker |
| `drupal/config/sync/` | Exported site configuration |
| `drupal/content/` | A Tome export of the content from before the database became canonical, kept as a backup. Nothing writes to it |
| `docs-source.json` | The documentation repository and commit the content is seeded from |
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
server down. Provisioning installs from the committed configuration, and
falls back to a bare site when there is none, so that the scripts work on
every commit. It gives you an empty site; run the importer to put the
documentation in it.

### Export configuration after changing it

A change made through the admin UI or `drush` stays in the database until
you export it:

```sh
vendor/bin/drush config:export
git status -- config/sync
```

Content is not exported. The database is the source of truth, and the
importer seeds it from the pinned documentation.

## The documentation source

`docs-source.json` pins the documentation repository and the exact commit
the content is seeded from. Nothing here reads a branch: the content is a
function of that commit, the importer and the content model, and CI proves
the importer still produces it on every pipeline by building from the pin
into a throwaway site.

Everything that reads the documentation lives here. `scripts/build-ir.mjs`
turns the pinned checkout into the intermediate representation the importer
consumes, and `scripts/survey-content.mjs` measures the same checkout into
`scripts/content-baseline.json`, the counts validation asserts against.

To move the pin, edit the `ref` in `docs-source.json` to the new commit and
rebuild against it:

```sh
npm ci                                   # the IR builder's one dependency
cd drupal
.devtools/assemble
.devtools/provision                      # an empty site
.devtools/import                         # fetch, build, import
cd ..
npm run survey:content                   # re-measure the baseline
```

Commit the pin together with the baseline.

`.devtools/import --check` is what CI runs. It refuses to build from
anything but the pinned commit, and it fails unless the site ends up holding
a page for every document the source produced, so a green pipeline means the
importer still turns the pinned commit into the whole corpus.

That page count alone would not be enough. It is compared against the
document count from the same build, so a builder that quietly produced fewer
documents would agree with itself. Before importing anything, the run also
checks the documents against the pinned checkout's tracked files and against
the committed baseline, which are two sources the builder does not control.
A page that leaves the corpus fails there, by name.

The importer seeds a site; it is not a synchronisation loop. Running it
against a database an editor has worked in would overwrite them.

## Status

Early. The content model and importer are being built; see the `druxtjs-docs-drupal-migration` change for the plan.

## License

[MIT](./LICENSE)
