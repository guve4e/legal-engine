#!/bin/bash
set -euo pipefail

cd /var/www/legal-engine

mkdir -p logs

# load env if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

/usr/bin/python3 src/ingestion/registry/lex_registry_sync.py >> logs/registry.log 2>&1
