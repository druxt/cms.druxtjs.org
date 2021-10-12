#!/usr/bin/env bash

composer install
ddev start
ddev drush tome:install -y
