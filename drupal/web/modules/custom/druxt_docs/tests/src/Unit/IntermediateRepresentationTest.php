<?php

declare(strict_types=1);

namespace Drupal\Tests\druxt_docs\Unit;

use Drupal\druxt_docs\IntermediateRepresentation;
use Drupal\Tests\UnitTestCase;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\Group;

#[CoversClass(IntermediateRepresentation::class)]
#[Group('druxt_docs')]
final class IntermediateRepresentationTest extends UnitTestCase {

  /**
   * Directory holding this test's fixtures.
   */
  private string $directory;

  /**
   * {@inheritdoc}
   */
  protected function setUp(): void {
    parent::setUp();
    $this->directory = sys_get_temp_dir() . '/druxt-docs-ir-' . uniqid();
    mkdir($this->directory);
  }

  /**
   * {@inheritdoc}
   */
  protected function tearDown(): void {
    foreach (glob($this->directory . '/*') ?: [] as $file) {
      unlink($file);
    }
    @rmdir($this->directory);
    parent::tearDown();
  }

  /**
   * Writes a fixture document.
   */
  private function write(string $name, array|string $document): void {
    file_put_contents(
      $this->directory . '/' . $name,
      is_string($document) ? $document : json_encode($document),
    );
  }

  /**
   * A minimal valid document.
   */
  private function document(string $source = 'how-to/theming.md'): array {
    return [
      'source' => $source,
      'url' => '/how-to/theming',
      'section' => 'how-to',
      'title' => 'Theme Druxt components',
      'blocks' => [['type' => 'text', 'markdown' => 'Hello.']],
    ];
  }

  public function testLoadsAndKeysBySource(): void {
    $this->write('b.json', $this->document('how-to/theming.md'));
    $this->write('a.json', $this->document('explanation/routing.md'));

    $documents = IntermediateRepresentation::load($this->directory, $error);

    $this->assertNull($error);
    $this->assertSame(
      ['explanation/routing.md', 'how-to/theming.md'],
      array_keys($documents),
      'Documents are keyed by source path and sorted, so import order does not depend on filenames.',
    );
  }

  public function testMissingDirectoryReports(): void {
    $this->assertNull(IntermediateRepresentation::load($this->directory . '/absent', $error));
    $this->assertStringContainsString('No such directory', (string) $error);
  }

  public function testEmptyDirectoryReports(): void {
    $this->assertNull(IntermediateRepresentation::load($this->directory, $error));
    $this->assertStringContainsString('No documents found', (string) $error);
  }

  public function testInvalidJsonReports(): void {
    $this->write('broken.json', '{"source": ');

    $this->assertNull(IntermediateRepresentation::load($this->directory, $error));
    $this->assertStringContainsString('Invalid JSON', (string) $error);
  }

  /**
   * A document short of a required key must not import as a partial page.
   */
  public function testMissingKeysReportsEveryMissingKey(): void {
    $document = $this->document();
    unset($document['title'], $document['blocks']);
    $this->write('partial.json', $document);

    $this->assertNull(IntermediateRepresentation::load($this->directory, $error));
    $this->assertStringContainsString('title', (string) $error);
    $this->assertStringContainsString('blocks', (string) $error);
  }

  /**
   * Two documents claiming one source would silently drop a page.
   */
  public function testDuplicateSourceReports(): void {
    $this->write('one.json', $this->document());
    $this->write('two.json', $this->document());

    $this->assertNull(IntermediateRepresentation::load($this->directory, $error));
    $this->assertStringContainsString('same source', (string) $error);
  }

  /**
   * One bad document must fail the whole load, not yield a partial corpus.
   */
  public function testOneBadDocumentFailsTheWholeLoad(): void {
    $this->write('good.json', $this->document());
    $this->write('bad.json', '{');

    $this->assertNull(IntermediateRepresentation::load($this->directory, $error));
  }

}
