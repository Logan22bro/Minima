#!/usr/bin/env bash
set -euo pipefail

if [ -z "${NVIDIA_API_KEY:-}" ]; then
  echo "NVIDIA_API_KEY is required. Export it or create it as a Brev secret before starting Minima." >&2
  exit 1
fi

export NVIDIA_MODEL="${NVIDIA_MODEL:-nvidia/nemotron-3-nano-30b-a3b}"
export HOST_PORT="${HOST_PORT:-4000}"

docker compose up --build -d
docker compose ps
