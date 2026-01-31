#!/bin/bash
# Wrapper script to make a user admin
# Usage: ./scripts/make-admin.sh <username>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$API_DIR")")"

if [ -z "$1" ]; then
  echo "Usage: $0 <username>"
  echo "Example: $0 johndoe"
  exit 1
fi

cd "$API_DIR"

# Load environment variables
if [ -f "$ROOT_DIR/.env" ]; then
  export $(grep -v '^#' "$ROOT_DIR/.env" | xargs)
fi

# Run the TypeScript script
npx tsx scripts/make-admin.ts "$1"
