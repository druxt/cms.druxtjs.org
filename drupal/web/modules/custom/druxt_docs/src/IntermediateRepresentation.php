<?php

declare(strict_types=1);

namespace Drupal\druxt_docs;

/**
 * Reads the intermediate representation the markdown stage produces.
 *
 * One JSON document per authored page: its frontmatter, its computed table
 * of contents, and an ordered list of typed blocks. This class is the only
 * place that knows the on-disk shape, so a change to the contract has one
 * place to land on the Drupal side.
 */
final class IntermediateRepresentation {

  /**
   * Every key a document must carry to be worth importing.
   */
  private const REQUIRED_KEYS = ['source', 'url', 'section', 'title', 'blocks'];

  /**
   * Loads and validates every document in a directory.
   *
   * Returns NULL rather than a partial set when anything is wrong: a
   * half-read corpus imported as if it were whole is the failure mode worth
   * designing against, because the result looks plausible.
   *
   * @param string $directory
   *   Directory holding the documents.
   * @param string|null $error
   *   Set to the reason when NULL is returned.
   *
   * @return array[]|null
   *   The documents keyed by source path, or NULL on any error.
   */
  public static function load(string $directory, ?string &$error = NULL): ?array {
    $error = NULL;

    if (!is_dir($directory)) {
      $error = sprintf('No such directory: %s', $directory);
      return NULL;
    }

    $files = glob(rtrim($directory, '/') . '/*.json');
    if ($files === FALSE || $files === []) {
      $error = sprintf('No documents found in %s', $directory);
      return NULL;
    }

    $documents = [];
    foreach ($files as $file) {
      $raw = file_get_contents($file);
      if ($raw === FALSE) {
        $error = sprintf('Unreadable: %s', $file);
        return NULL;
      }

      try {
        $document = json_decode($raw, TRUE, 512, JSON_THROW_ON_ERROR);
      }
      catch (\JsonException $exception) {
        $error = sprintf('Invalid JSON in %s: %s', $file, $exception->getMessage());
        return NULL;
      }

      if (!is_array($document)) {
        $error = sprintf('Not an object: %s', $file);
        return NULL;
      }

      $missing = array_diff(self::REQUIRED_KEYS, array_keys($document));
      if ($missing !== []) {
        $error = sprintf('%s is missing: %s', $file, implode(', ', $missing));
        return NULL;
      }

      if (isset($documents[$document['source']])) {
        $error = sprintf('Two documents claim the same source: %s', $document['source']);
        return NULL;
      }

      $documents[$document['source']] = $document;
    }

    ksort($documents);

    return $documents;
  }

}
