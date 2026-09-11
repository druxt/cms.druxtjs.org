<?php

declare(strict_types=1);

namespace Drupal\druxt_docs;

/**
 * Thrown when the corpus cannot be imported as a whole.
 *
 * The message names the document, block or image that stopped the run.
 */
final class ImportException extends \RuntimeException {
}
