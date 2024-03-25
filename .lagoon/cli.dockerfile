FROM amazeeio/php:8.3-cli-drupal

COPY composer.* /app/
# RUN composer global remove hirak/prestissimo
RUN composer self-update --2
RUN composer install --no-dev
COPY . /app
RUN mkdir -p -v -m775 /app/web/sites/default/files

# Generate private and public keys.
# RUN openssl genrsa -out /app/keys/private.key 2048
# RUN openssl rsa -in /app/keys/private.key -pubout > /app/keys/public.key
# RUN chmod 600 /app/keys/*.key

# Define where the Drupal Root is located
ENV WEBROOT=web
