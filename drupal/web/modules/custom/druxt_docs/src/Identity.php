<?php

declare(strict_types=1);

namespace Drupal\druxt_docs;

/**
 * Derives every entity UUID from what the entity represents.
 *
 * A page's UUID is a function of its source path, a paragraph's of its page
 * and position, an image's of its path. Two imports of the same corpus, on
 * two machines, a year apart, produce the same identifiers, so the content
 * export is a stable diff of the documentation rather than a churn of
 * generated ids, and a rebuild from nothing lands on the committed UUIDs.
 */
final class Identity {

  /**
   * The project's UUID namespace.
   *
   * Fixed, and never regenerated: every identifier derives from it, so
   * changing it orphans everything already created.
   */
  public const NAMESPACE = '6f0d2b1e-9c3a-5d47-9a58-3b7f1c0e4a26';

  /**
   * A UUIDv5 of a name under the project namespace.
   */
  public static function uuid(string $name): string {
    $hash = sha1(hex2bin(str_replace('-', '', self::NAMESPACE)) . $name);
    return sprintf(
      '%s-%s-%04x-%04x-%s',
      substr($hash, 0, 8),
      substr($hash, 8, 4),
      (hexdec(substr($hash, 12, 4)) & 0x0fff) | 0x5000,
      (hexdec(substr($hash, 16, 4)) & 0x3fff) | 0x8000,
      substr($hash, 20, 12),
    );
  }

  /**
   * The node for a source file.
   */
  public static function page(string $source): string {
    return self::uuid("node:doc_page:$source");
  }

  /**
   * The paragraph at a position within a page.
   */
  public static function paragraph(string $source, int $index): string {
    return self::uuid("paragraph:$source:$index");
  }

  /**
   * The path alias for a source file.
   */
  public static function alias(string $source): string {
    return self::uuid("path_alias:$source");
  }

  /**
   * The media item for an image path.
   */
  public static function media(string $src): string {
    return self::uuid("media:image:$src");
  }

  /**
   * The file for an image path.
   */
  public static function file(string $src): string {
    return self::uuid("file:$src");
  }

  /**
   * The section term for a vocabulary machine name.
   */
  public static function section(string $machine): string {
    return self::uuid("taxonomy_term:documentation_section:$machine");
  }

}
