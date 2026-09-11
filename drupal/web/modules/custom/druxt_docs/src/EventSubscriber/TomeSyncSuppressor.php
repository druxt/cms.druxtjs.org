<?php

declare(strict_types=1);

namespace Drupal\druxt_docs\EventSubscriber;

use Drupal\migrate\Event\MigrateEvents;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Drupal\tome_sync\ImporterInterface as TomeImporterInterface;

/**
 * Keeps a migration from rewriting the committed Tome export.
 *
 * `tome_sync` exports every entity as it is saved, and Migrate saves
 * through the ordinary entity API, so without this a single run rewrites
 * the whole of `drupal/content/`. Measured on 2026-09-10: 374 files, with
 * no warning and no failure, because a silent export is exactly what the
 * module is for.
 *
 * The importer this replaces already did the same thing around its own
 * transaction. This does it around the migration, using the same flag.
 *
 * The export is a backup rather than the transport, so nothing wants it
 * written from here: it is refreshed deliberately, not as a side effect of
 * a build. Rollback is covered as well as import, because deleting an
 * entity exports too.
 */
final class TomeSyncSuppressor implements EventSubscriberInterface {

  public function __construct(
    private readonly ?TomeImporterInterface $tomeImporter = NULL,
  ) {}

  /**
   * {@inheritdoc}
   */
  public static function getSubscribedEvents(): array {
    return [
      MigrateEvents::PRE_IMPORT => ['suppress'],
      MigrateEvents::POST_IMPORT => ['restore'],
      MigrateEvents::PRE_ROLLBACK => ['suppress'],
      MigrateEvents::POST_ROLLBACK => ['restore'],
    ];
  }

  /**
   * Stops Tome exporting while a migration runs.
   */
  public function suppress(): void {
    $this->tomeImporter?->isImporting(TRUE);
  }

  /**
   * Lets Tome export again once it has finished.
   */
  public function restore(): void {
    $this->tomeImporter?->isImporting(FALSE);
  }

}
