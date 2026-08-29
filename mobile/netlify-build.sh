#!/bin/bash
set -e
# Shim: if Netlify UI Base directory is "mobile", this shim delegates to repo-root netlify-build.sh
exec sh ../netlify-build.sh "$@"
