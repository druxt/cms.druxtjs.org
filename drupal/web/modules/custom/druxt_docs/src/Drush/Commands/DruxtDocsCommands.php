<?php

declare(strict_types=1);

namespace Drupal\druxt_docs\Drush\Commands;

use Drupal\druxt_docs\Importer;
use Drupal\druxt_docs\ImportException;
use Drupal\druxt_docs\IntermediateRepresentation;
use Drush\Attributes as CLI;
use Drush\Commands\DrushCommands;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Imports the authored documentation corpus into Drupal content.
 *
 * The markdown is parsed outside Drupal, into the intermediate
 * representation this command consumes. Splitting it there keeps markdown
 * parsing next to the markdown and entity creation next to the entity API,
 * and gives fidelity checking a stage it can run without a database.
 */
final class DruxtDocsCommands extends DrushCommands {

  public function __construct(
    private readonly Importer $importer,
  ) {
    parent::__construct();
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container): self {
    return new self(
      $container->get('druxt_docs.importer'),
    );
  }

  /**
   * Reports what an intermediate representation directory contains.
   *
   * Reading the input and saying what is in it is a separate act from
   * importing it, and worth having on its own: it is how a broken or stale
   * IR is caught before anything touches content.
   */
  #[CLI\Command(name: 'druxt-docs:inspect')]
  #[CLI\Argument(name: 'directory', description: 'Directory of intermediate representation documents.')]
  #[CLI\Usage(name: 'drush druxt-docs:inspect ../ir', description: 'Summarise the documents in ../ir.')]
  public function inspect(string $directory): int {
    $documents = IntermediateRepresentation::load($directory, $error);
    if ($documents === NULL) {
      $this->logger()->error($error);
      return self::EXIT_FAILURE;
    }

    $blocks = [];
    foreach ($documents as $document) {
      foreach ($document['blocks'] ?? [] as $block) {
        $type = $block['type'] ?? 'unknown';
        $blocks[$type] = ($blocks[$type] ?? 0) + 1;
      }
    }
    ksort($blocks);

    $this->io()->writeln(sprintf('%d documents in %s', count($documents), $directory));
    foreach ($blocks as $type => $count) {
      $this->io()->writeln(sprintf('  %-16s %d', $type, $count));
    }

    return self::EXIT_SUCCESS;
  }

  /**
   * Imports an intermediate representation directory into content.
   *
   * The run is all or nothing: a document, block or image that cannot be
   * imported stops it before anything is written.
   */
  #[CLI\Command(name: 'druxt-docs:import')]
  #[CLI\Argument(name: 'directory', description: 'Directory of intermediate representation documents.')]
  #[CLI\Usage(name: 'drush druxt-docs:import ../ir', description: 'Import the documents in ../ir.')]
  public function import(string $directory): int {
    $documents = IntermediateRepresentation::load($directory, $error);
    if ($documents === NULL) {
      $this->logger()->error($error);
      return self::EXIT_FAILURE;
    }

    try {
      $counts = $this->importer->import($documents, $directory);
    }
    catch (ImportException $exception) {
      $this->logger()->error($exception->getMessage());
      return self::EXIT_FAILURE;
    }

    $this->io()->writeln(sprintf(
      '%d documents imported: %d entities created, %d updated, %d unchanged, %d deleted.',
      count($documents),
      $counts['created'],
      $counts['updated'],
      $counts['unchanged'],
      $counts['deleted'],
    ));

    return self::EXIT_SUCCESS;
  }

}
