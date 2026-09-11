<?php

declare(strict_types=1);

namespace Drupal\druxt_docs;

use Drupal\Core\Database\Connection;
use Drupal\Core\Entity\ContentEntityInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\File\FileExists;
use Drupal\Core\File\FileSystemInterface;
use Drupal\file\FileInterface;
use Drupal\tome_sync\ImporterInterface as TomeImporterInterface;

/**
 * Writes the intermediate representation into content entities.
 *
 * Every entity is found by the UUID its source derives, so a run updates in
 * place, a run over unchanged input saves nothing, and a rebuild from an
 * empty database lands on the same identifiers. The corpus is imported
 * whole or not at all: the checks that can fail run before anything is
 * written, and the writes share one transaction.
 */
final class Importer {

  /**
   * The text format markdown paragraphs are stored in.
   */
  public const TEXT_FORMAT = 'docs_markdown';

  /**
   * Where imported images live. The import owns everything under it.
   */
  public const FILE_DIRECTORY = 'public://documentation';

  /**
   * The paragraph bundle for each block type.
   */
  private const BUNDLES = [
    'text' => 'docs_text',
    'code' => 'docs_code',
    'diagram' => 'docs_diagram',
    'callout' => 'docs_callout',
    'image' => 'docs_image',
  ];

  /**
   * The vocabulary the documentation sections live in.
   */
  private const SECTION_VOCABULARY = 'documentation_section';

  /**
   * The documentation sections, in sidebar order.
   *
   * Terms are content, not configuration, so a provisioned site has none
   * and the importer creates them. The machine name is stored in the
   * description because that is what a route segment is matched against.
   *
   * Written out rather than derived from each section's landing page.
   * Three of the four landing titles happen to equal their term today and
   * the modules one does not: its page is titled "Druxt modules" and its
   * term is "Modules". Deriving would rename that term now, and would
   * rename any other the day someone retitles a landing page, which is a
   * documentation edit nobody would expect to migrate data. A section this
   * map does not name fails the run instead.
   */
  private const SECTIONS = [
    'tutorials' => ['name' => 'Tutorials', 'weight' => -10],
    'how-to' => ['name' => 'How-to guides', 'weight' => -9],
    'explanation' => ['name' => 'Concepts', 'weight' => -8],
    'modules' => ['name' => 'Modules', 'weight' => -7],
  ];

  /**
   * The keys each block type must carry.
   */
  private const BLOCK_KEYS = [
    'text' => ['markdown'],
    'code' => ['language', 'code'],
    'diagram' => ['syntax', 'source'],
    'callout' => ['callout', 'markdown'],
    'image' => ['src', 'alt'],
  ];

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly FileSystemInterface $fileSystem,
    private readonly Connection $database,
    private readonly ?TomeImporterInterface $tomeImporter = NULL,
  ) {
  }

  /**
   * Imports a corpus, making the documentation content match it.
   *
   * @param array[] $documents
   *   The documents, keyed by source path.
   * @param string $directory
   *   The directory the documents came from; images sit under its static/.
   *
   * @return array<string, int>
   *   Entities created, updated, unchanged and deleted.
   *
   * @throws \Drupal\druxt_docs\ImportException
   *   When the corpus cannot be imported whole. Nothing is written.
   */
  public function import(array $documents, string $directory): array {
    if ($this->entityTypeManager->getStorage('filter_format')->load(self::TEXT_FORMAT) === NULL) {
      throw new ImportException(sprintf('The %s text format is not installed. The content model has to be installed first.', self::TEXT_FORMAT));
    }
    $this->checkSections($documents);
    $images = $this->images($documents, $directory);
    $this->checkBlocks($documents);

    $counts = ['created' => 0, 'updated' => 0, 'unchanged' => 0, 'deleted' => 0];

    // Tome exports every saved entity as it is saved. Paused, so a run that
    // rolls back leaves no half-written export behind; the export is run
    // whole afterwards.
    $this->tomeImporter?->isImporting(TRUE);
    $transaction = $this->database->startTransaction();
    try {
      $sections = $this->sections($documents, $counts);
      $media = [];
      foreach ($images as $src => $image) {
        $media[$src] = $this->importImage($src, $image['alt'], $image['path'], $counts);
      }
      $pages = [];
      foreach ($documents as $document) {
        $pages[] = $this->importPage($document, $sections, $media, $counts);
      }
      $this->prunePages($pages, $counts);
      $this->pruneMedia(array_keys($media), $counts);
    }
    catch (\Throwable $throwable) {
      $transaction->rollBack();
      throw $throwable;
    }
    finally {
      $this->tomeImporter?->isImporting(FALSE);
    }

    return $counts;
  }

  /**
   * Rejects a section this importer has no definition for.
   *
   * Runs before the transaction, so an unknown section stops the run
   * before anything is written rather than rolling one back.
   */
  private function checkSections(array $documents): void {
    foreach ($documents as $document) {
      $machine = $document['section'] ?? NULL;
      if (!is_string($machine) || $machine === '') {
        throw new ImportException(sprintf('%s: no section.', $document['source']));
      }
      if (!isset(self::SECTIONS[$machine])) {
        throw new ImportException(sprintf('%s: "%s" is not a documentation section. Add it to Importer::SECTIONS, or correct the source.', $document['source'], $machine));
      }
    }
  }

  /**
   * The section term for every document, created when the site lacks it.
   *
   * @return \Drupal\Core\Entity\ContentEntityInterface[]
   *   Terms keyed by section machine name.
   */
  private function sections(array $documents, array &$counts): array {
    $terms = [];
    foreach ($documents as $document) {
      $machine = $document['section'];
      if (isset($terms[$machine])) {
        continue;
      }
      $definition = self::SECTIONS[$machine];
      $term = $this->load('taxonomy_term', Identity::section($machine))
        ?? $this->entityTypeManager->getStorage('taxonomy_term')->create([
          'vid' => self::SECTION_VOCABULARY,
          'uuid' => Identity::section($machine),
        ]);
      $this->apply($term, [
        'name' => $definition['name'],
        'description' => ['value' => $machine, 'format' => 'plain_text'],
        'weight' => $definition['weight'],
        'langcode' => 'en',
        'status' => 1,
      ]);
      $this->persist($term, $machine, $counts);
      $terms[$machine] = $term;
    }
    return $terms;
  }

  /**
   * Collects every image, and checks that each exists and agrees on its alt.
   *
   * @return array<string, array{alt: string, path: string}>
   *   Images keyed by src.
   */
  private function images(array $documents, string $directory): array {
    $images = [];
    foreach ($documents as $document) {
      foreach ($document['blocks'] as $index => $block) {
        if (($block['type'] ?? NULL) !== 'image') {
          continue;
        }
        $src = $block['src'] ?? '';
        $alt = $block['alt'] ?? '';
        if (!is_string($src) || $src === '' || !is_string($alt) || $alt === '') {
          throw new ImportException(sprintf('%s block %d: an image needs a src and alt text.', $document['source'], $index));
        }
        // Alt text lives on the media item, so two pages sharing an image
        // have to describe it the same way.
        if (isset($images[$src]) && $images[$src]['alt'] !== $alt) {
          throw new ImportException(sprintf('%s block %d: %s has different alt text in %s.', $document['source'], $index, $src, $images[$src]['source']));
        }
        $path = rtrim($directory, '/') . '/static/' . ltrim($src, '/');
        if (!is_file($path)) {
          throw new ImportException(sprintf('%s block %d: %s is not in the intermediate representation at %s.', $document['source'], $index, $src, $path));
        }
        $images[$src] = ['alt' => $alt, 'path' => $path, 'source' => $document['source']];
      }
    }
    return $images;
  }

  /**
   * Checks every block is of a known type and carries what its bundle needs.
   */
  private function checkBlocks(array $documents): void {
    foreach ($documents as $document) {
      if (!is_array($document['blocks'])) {
        throw new ImportException(sprintf('%s: blocks is not a list.', $document['source']));
      }
      foreach ($document['blocks'] as $index => $block) {
        $type = $block['type'] ?? NULL;
        if (!isset(self::BLOCK_KEYS[$type])) {
          throw new ImportException(sprintf('%s block %d: unknown block type "%s".', $document['source'], $index, (string) $type));
        }
        foreach (self::BLOCK_KEYS[$type] as $key) {
          if (!isset($block[$key]) || !is_string($block[$key])) {
            throw new ImportException(sprintf('%s block %d: %s block is missing %s.', $document['source'], $index, $type, $key));
          }
        }
      }
    }
  }

  /**
   * Copies an image into the file system and finds or makes its media item.
   */
  private function importImage(string $src, string $alt, string $path, array &$counts): ContentEntityInterface {
    $basename = basename($src);
    $uri = self::FILE_DIRECTORY . '/' . $basename;
    $directory = self::FILE_DIRECTORY;
    $this->fileSystem->prepareDirectory($directory, FileSystemInterface::CREATE_DIRECTORY | FileSystemInterface::MODIFY_PERMISSIONS);
    if (!is_file($uri) || md5_file($uri) !== md5_file($path)) {
      $this->fileSystem->copy($path, $uri, FileExists::Replace);
    }

    $file = $this->load('file', Identity::file($src))
      ?? $this->entityTypeManager->getStorage('file')->create(['uuid' => Identity::file($src), 'uri' => $uri]);
    // No owner: a Tome import leaves the file with none, and setting one
    // would count as a change on every rebuild.
    $this->apply($file, [
      'uri' => $uri,
      'filename' => $basename,
      'filesize' => filesize($uri),
      'status' => FileInterface::STATUS_PERMANENT,
    ]);
    $this->persist($file, $src, $counts);

    $media = $this->load('media', Identity::media($src))
      ?? $this->entityTypeManager->getStorage('media')->create(['bundle' => 'image', 'uuid' => Identity::media($src)]);
    $this->apply($media, [
      'name' => $basename,
      'langcode' => 'en',
      'status' => 1,
      'uid' => 0,
    ]);
    // The item also holds the dimensions read from the file, so only the alt
    // is touched on an item that already points at the file.
    $image = $media->get('field_media_image');
    if ($image->isEmpty() || (int) $image->target_id !== (int) $file->id()) {
      $media->set('field_media_image', [['target_id' => $file->id(), 'alt' => $alt]]);
    }
    elseif ($image->alt !== $alt) {
      $image->first()->set('alt', $alt);
    }
    $this->persist($media, $src, $counts);

    return $media;
  }

  /**
   * Imports one page: its paragraphs, then the node, then the alias.
   *
   * @return string
   *   The node UUID.
   */
  private function importPage(array $document, array $sections, array $media, array &$counts): string {
    $source = $document['source'];
    $storage = $this->entityTypeManager->getStorage('paragraph');

    $references = [];
    foreach ($document['blocks'] as $index => $block) {
      $uuid = Identity::paragraph($source, $index);
      $bundle = self::BUNDLES[$block['type']];
      $paragraph = $this->load('paragraph', $uuid);
      // A bundle cannot change, so a block that changed type is remade.
      if ($paragraph !== NULL && $paragraph->bundle() !== $bundle) {
        $paragraph->delete();
        $paragraph = NULL;
        $counts['deleted']++;
      }
      $paragraph ??= $storage->create(['type' => $bundle, 'uuid' => $uuid]);
      $this->apply($paragraph, ['langcode' => 'en', 'status' => 1] + $this->paragraphValues($block, $media));
      $this->persist($paragraph, sprintf('%s block %d', $source, $index), $counts);
      $references[] = ['target_id' => $paragraph->id(), 'target_revision_id' => $paragraph->getRevisionId()];
    }

    $uuid = Identity::page($source);
    $node = $this->load('node', $uuid)
      ?? $this->entityTypeManager->getStorage('node')->create(['type' => 'doc_page', 'uuid' => $uuid]);
    $this->apply($node, [
      'title' => $document['title'],
      'langcode' => 'en',
      'status' => 1,
      'promote' => 0,
      'sticky' => 0,
      'uid' => 0,
      'field_description' => $document['description'] ?? NULL,
      'field_weight' => $document['weight'] ?? NULL,
      'field_section' => $sections[$document['section']]->id(),
      'field_is_landing' => (int) !empty($document['isLanding']),
      'field_source_path' => $source,
      'field_toc' => json_encode($document['toc'] ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
      'field_content' => $references,
    ]);
    $this->persist($node, $source, $counts);

    // Blocks beyond the end of a page that shrank.
    for ($index = count($document['blocks']); ($stale = $this->load('paragraph', Identity::paragraph($source, $index))) !== NULL; $index++) {
      $stale->delete();
      $counts['deleted']++;
    }

    $alias = $this->load('path_alias', Identity::alias($source))
      ?? $this->entityTypeManager->getStorage('path_alias')->create(['uuid' => Identity::alias($source)]);
    $this->apply($alias, [
      'path' => '/node/' . $node->id(),
      'alias' => $document['url'],
      'langcode' => 'en',
    ]);
    $this->persist($alias, $source, $counts);

    return $uuid;
  }

  /**
   * The field values a block's paragraph carries.
   *
   * Text and callout bodies are stored as markdown, in the docs_markdown
   * format, because an exact round trip against the authored source is a
   * migration gate and it needs the stored value to be the same language
   * the source was written in.
   *
   * That reason expires at cutover. Once the database is the source and
   * the markdown files are retired, nothing needs the round trip, and what
   * is left is an editor typing markdown into a textarea for the life of
   * the site. Whether these fields then gain a rich-text editing surface
   * is an open question on the migration change, not a decision anyone has
   * made. It is written here because the alternative is that nobody
   * decides, and a format change costs more with every page an editor has
   * touched.
   */
  private function paragraphValues(array $block, array $media): array {
    return match ($block['type']) {
      'text' => ['field_text' => ['value' => $block['markdown'], 'format' => self::TEXT_FORMAT]],
      'code' => ['field_code' => $block['code'], 'field_language' => $block['language']],
      'diagram' => ['field_diagram' => $block['source'], 'field_syntax' => $block['syntax'], 'field_group' => $block['group'] ?? NULL],
      'callout' => ['field_callout' => ['value' => $block['markdown'], 'format' => self::TEXT_FORMAT], 'field_callout_type' => $block['callout']],
      'image' => ['field_media' => $media[$block['src']]->id()],
    };
  }

  /**
   * Deletes every page the corpus no longer contains.
   */
  private function prunePages(array $keep, array &$counts): void {
    $storage = $this->entityTypeManager->getStorage('node');
    $ids = $storage->getQuery()->accessCheck(FALSE)->condition('type', 'doc_page')->execute();
    foreach ($storage->loadMultiple($ids) as $node) {
      if (in_array($node->uuid(), $keep, TRUE)) {
        continue;
      }
      foreach ($node->get('field_content')->referencedEntities() as $paragraph) {
        $paragraph->delete();
        $counts['deleted']++;
      }
      $node->delete();
      $counts['deleted']++;
    }
  }

  /**
   * Deletes every imported image the corpus no longer references.
   *
   * Ownership is the file's directory: everything under it came from an
   * import, and nothing an editor uploads lands there.
   */
  private function pruneMedia(array $keep, array &$counts): void {
    $keep = array_map(Identity::media(...), $keep);
    $storage = $this->entityTypeManager->getStorage('media');
    $ids = $storage->getQuery()->accessCheck(FALSE)->condition('bundle', 'image')->execute();
    foreach ($storage->loadMultiple($ids) as $media) {
      $file = $media->get('field_media_image')->entity;
      if (in_array($media->uuid(), $keep, TRUE) || !$file instanceof FileInterface || !str_starts_with($file->getFileUri(), self::FILE_DIRECTORY . '/')) {
        continue;
      }
      $media->delete();
      $file->delete();
      $counts['deleted'] += 2;
    }
  }

  /**
   * Loads an entity by UUID.
   */
  private function load(string $entity_type, string $uuid): ?ContentEntityInterface {
    $entities = $this->entityTypeManager->getStorage($entity_type)->loadByProperties(['uuid' => $uuid]);
    $entity = reset($entities);
    return $entity instanceof ContentEntityInterface ? $entity : NULL;
  }

  /**
   * Sets field values.
   */
  private function apply(ContentEntityInterface $entity, array $values): void {
    foreach ($values as $name => $value) {
      $entity->set($name, $value);
    }
  }

  /**
   * Saves an entity when it is new or differs from what is stored.
   */
  private function persist(ContentEntityInterface $entity, string $label, array &$counts): void {
    if (!$entity->isNew() && !$entity->hasTranslationChanges()) {
      $counts['unchanged']++;
      return;
    }
    $messages = [];
    foreach ($entity->validate() as $violation) {
      // A text format is validated against the permissions of whoever runs
      // the command, and the command runs as nobody. The format is checked
      // for existence before the run instead.
      if (str_ends_with($violation->getPropertyPath(), '.format')) {
        continue;
      }
      $messages[] = $violation->getPropertyPath() . ': ' . strip_tags((string) $violation->getMessage());
    }
    if ($messages !== []) {
      throw new ImportException(sprintf('%s: %s', $label, implode('; ', $messages)));
    }
    $counts[$entity->isNew() ? 'created' : 'updated']++;
    $entity->save();
  }

}
