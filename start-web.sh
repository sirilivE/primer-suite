#!/usr/bin/env bash
# Starts the Primer Suite web version and opens it in the default browser (needs Node.js installed).
cd "$(dirname "$0")"
( sleep 1; xdg-open http://localhost:8080 2>/dev/null || open http://localhost:8080 2>/dev/null ) &
node serve.js 8080
