<?php

namespace Drupal\Tests\cms_druxtjs_org\ExistingSite;

use weitzman\DrupalTestTraits\ExistingSiteBase;

class BrowserTest extends ExistingSiteBase {
  protected function setUp(): void {
    parent::setUp();
  }

  public function testHomepage() {
    $this->visit('/');
    $this->assertSession()->statusCodeEquals(200);

    $title = $this->getCurrentPage()->find('css', 'title')->getText();
    $this->assertEqual($title, 'Log in | DruxtJS');
  }
}
