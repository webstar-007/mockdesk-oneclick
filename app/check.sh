#!/usr/bin/env bash
# Checks that everything is ready. Add --full for tests and a fresh build.
cd "$(dirname "$0")" && exec node scripts/check.mjs "$@"
