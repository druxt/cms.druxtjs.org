<?php

declare(strict_types=1);

namespace Drupal\Tests\druxt_docs\Unit;

use Drupal\Core\Routing\RouteMatchInterface;
use Drupal\druxt_docs\Theme\LoginThemeNegotiator;
use Drupal\Tests\UnitTestCase;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\Group;

/**
 * Which theme the login and password pages use.
 */
#[CoversClass(LoginThemeNegotiator::class)]
#[Group('druxt_docs')]
final class LoginThemeNegotiatorTest extends UnitTestCase {

  /**
   * Signing in happens in the admin theme.
   */
  public function testTheLoginPagesUseTheAdminTheme(): void {
    $negotiator = $this->negotiator('default_admin');
    foreach (LoginThemeNegotiator::ROUTES as $name) {
      self::assertTrue($negotiator->applies($this->route($name)), $name);
    }
    self::assertSame('default_admin', $negotiator->determineActiveTheme($this->route('user.login')));
  }

  /**
   * Other pages keep whatever theme core chooses.
   */
  public function testOtherPagesAreLeftAlone(): void {
    self::assertFalse($this->negotiator('default_admin')->applies($this->route('entity.node.canonical')));
  }

  /**
   * A site without an admin theme leaves the choice to core.
   */
  public function testNothingAppliesWithoutAnAdminTheme(): void {
    self::assertFalse($this->negotiator('')->applies($this->route('user.login')));
  }

  /**
   * The negotiator, on a site whose admin theme is the one given.
   */
  private function negotiator(string $admin): LoginThemeNegotiator {
    return new LoginThemeNegotiator($this->getConfigFactoryStub(['system.theme' => ['admin' => $admin, 'default' => 'druxtjs']]));
  }

  /**
   * A route match for the named route.
   */
  private function route(string $name): RouteMatchInterface {
    $route = $this->createMock(RouteMatchInterface::class);
    $route->method('getRouteName')->willReturn($name);
    return $route;
  }

}
