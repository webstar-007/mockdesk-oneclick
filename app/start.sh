#!/usr/bin/env bash
# Starts MockDesk end to end and opens it in the browser. Extra options: --preview --port 3000 --no-open --rebuild --reset-db
cd "$(dirname "$0")" && exec node scripts/start.mjs "$@"
