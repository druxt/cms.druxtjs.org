<?php

declare(strict_types=1);

namespace Drupal\druxt_docs\Normalizer;

use Drupal\Core\TypedData\Type\UriInterface;
use Drupal\tome_sync\Normalizer\UriNormalizer as TomeUriNormalizer;

/**
 * Limits Tome's URI normalizer to URI data.
 *
 * Tome declares its scope through $supportedInterfaceOrClass, which Drupal 11
 * no longer reads, so the normalizer claims every primitive and its
 * denormalize() hands values back untouched. That skips the serialize() core
 * applies to serialized properties, and a paragraph's behavior_settings lands
 * in the database as the string "Array".
 */
final class UriNormalizer extends TomeUriNormalizer {

  /**
   * {@inheritdoc}
   */
  public function getSupportedTypes(?string $format): array {
    return [UriInterface::class => TRUE];
  }

}
