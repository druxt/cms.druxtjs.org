<?php

declare(strict_types=1);

namespace Drupal\druxt_docs\Plugin\migrate\source;

use Drupal\migrate\Attribute\MigrateSource;

/**
 * One row per page, carrying its block keys in reading order.
 *
 * `blocks` holds the identifiers of this page's paragraphs, in order, so
 * the node migration can look each one up and keep the order the page
 * reads in. Order is the property most easily lost here, so it is carried
 * explicitly rather than reconstructed from a query.
 */
#[MigrateSource(id: 'docs_document')]
final class DocsDocument extends DocsSourceBase {

  /**
   * {@inheritdoc}
   */
  public function fields(): array {
    return [
      'source' => 'Path of the markdown file the page came from',
      'url' => 'Public URL, which becomes the path alias',
      'section' => 'Section machine name',
      'title' => 'Page title',
      'description' => 'Page description',
      'weight' => 'Order within the section',
      'isLanding' => 'Whether the page is its section landing page',
      'toc' => 'Table of contents, computed at build time',
      'blocks' => 'Block identifiers, in reading order',
    ];
  }

  /**
   * {@inheritdoc}
   */
  public function getIds(): array {
    return ['source' => ['type' => 'string']];
  }

  /**
   * {@inheritdoc}
   */
  protected function initializeIterator(): \Iterator {
    $rows = [];
    foreach ($this->documents() as $page => $document) {
      $keys = [];
      foreach (array_keys($document['blocks']) as $index) {
        $keys[] = [$page, $index];
      }
      $document['blocks'] = $keys;
      // Normalised here rather than in a process pipeline, because YAML
      // cannot carry a boolean map key and a static_map over true and
      // false is unwritable.
      $document['isLanding'] = (int) !empty($document['isLanding']);
      $document['toc'] = json_encode($document['toc'] ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
      $rows[] = $document;
    }
    return new \ArrayIterator($rows);
  }

}
