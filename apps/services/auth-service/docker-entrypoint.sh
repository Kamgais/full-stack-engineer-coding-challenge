#!/bin/sh
# Bootstraps the auth-service on first container start:
#   1. Runs pending TypeORM migrations.
#   2. Seeds users (idempotent Ã¢â‚¬â€ safe to re-run).
#   3. Hands off to the dev server.
#
# The seed step is wrapped in `|| true` because the migration is the only
# step that *must* succeed; seeding may fail on re-runs if a user's schema
# state has drifted, and we'd rather log it than refuse to start.

set -e

echo "[auth-service] running migrationsÃ¢â‚¬Â¦"
yarn migration:run

echo "[auth-service] seedingÃ¢â‚¬Â¦"
yarn seed || echo "[auth-service] seed step finished with warnings (likely already seeded)"

echo "[auth-service] startingÃ¢â‚¬Â¦"
exec "$@"
