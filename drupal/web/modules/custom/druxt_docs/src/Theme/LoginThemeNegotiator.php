<?php

declare(strict_types=1);

namespace Drupal\druxt_docs\Theme;

use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Routing\RouteMatchInterface;
use Drupal\Core\Theme\ThemeNegotiatorInterface;

/**
 * Shows the login and password pages in the admin theme.
 *
 * The default theme is the frontend's, with no form styling, and core only
 * shows the admin theme to users allowed to see it, which rules out anyone
 * signing in.
 */
final class LoginThemeNegotiator implements ThemeNegotiatorInterface {

  /**
   * The routes an editor signs in or recovers an account through.
   */
  public const ROUTES = ['user.login', 'user.pass', 'user.reset', 'user.reset.form', 'user.reset.login'];

  public function __construct(
    private readonly ConfigFactoryInterface $configFactory,
  ) {}

  /**
   * {@inheritdoc}
   */
  public function applies(RouteMatchInterface $route_match): bool {
    return in_array($route_match->getRouteName(), self::ROUTES, TRUE) && $this->adminTheme() !== NULL;
  }

  /**
   * {@inheritdoc}
   */
  public function determineActiveTheme(RouteMatchInterface $route_match): ?string {
    return $this->adminTheme();
  }

  /**
   * The admin theme, or NULL when the site has none.
   */
  private function adminTheme(): ?string {
    $theme = (string) $this->configFactory->get('system.theme')->get('admin');
    return $theme !== '' ? $theme : NULL;
  }

}
