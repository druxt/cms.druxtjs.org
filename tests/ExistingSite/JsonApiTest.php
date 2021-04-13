<?php

namespace Drupal\Tests\cms_druxtjs_org\ExistingSite;

use weitzman\DrupalTestTraits\ExistingSiteBase;

class JsonApiTest extends ExistingSiteBase {
  protected function setUp(): void {
    parent::setUp();
  }

  public function testApi() {
    $this->visit('/jsonapi');
    $this->assertSession()->statusCodeEquals(200);
  }

  // public function testRouter() {
  //   $this->visit('/router/translate-path?path=/node/1');
  //   $this->assertSession()->statusCodeEquals(200);

  //   $data = json_decode($this->getCurrentPageContent(), TRUE);
  //   $this->assertArrayHasKey('resolved', $data);
  // }
}
