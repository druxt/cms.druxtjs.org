FROM amazeeio/php:7.4-cli-drupal

COPY composer.* /app/
RUN composer global remove hirak/prestissimo
RUN composer self-update --2
RUN COMPOSER_MEMORY_LIMIT=-1 composer install --no-dev
COPY . /app
RUN mkdir -p -v -m775 /app/web/sites/default/files

# Define where the Drupal Root is located
ENV WEBROOT=web
