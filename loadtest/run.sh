#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
BASE_URL="${1:?Використання: ./run.sh https://адреса [користувачів] [мітка]}"
USERS="${2:-60}"
TAG="${3:-run}"
mkdir -p results
docker run --rm -i -v "$PWD":/work -w /work \
  -e BASE_URL="${BASE_URL%/}" -e USERS="$USERS" -e TAG="$TAG" -e FAST="${FAST:-0}" \
  grafana/k6:latest run shop.js
