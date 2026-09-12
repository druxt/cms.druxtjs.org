<?php

declare(strict_types=1);

namespace Drupal\druxt_docs\Normalizer;

use Drupal\path\Plugin\Field\FieldType\PathItem;
use Drupal\serialization\Normalizer\FieldItemNormalizer;

/**
 * Keeps a page's alias out of its node export.
 *
 * The alias is exported as a path_alias entity with a derived UUID. Exported
 * on the node as well, a Tome import saves the node first and the path item
 * creates a second alias for it with a random UUID.
 */
final class PathItemNormalizer extends FieldItemNormalizer {

  /**
   * {@inheritdoc}
   */
  public function normalize($object, $format = NULL, array $context = []): array {
    return [];
  }

  /**
   * {@inheritdoc}
   */
  public function getSupportedTypes(?string $format): array {
    return [PathItem::class => TRUE];
  }

}
