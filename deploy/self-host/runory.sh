#!/usr/bin/env bash
# Operator/Agent helper shipped in the engineering bundle (no source build).
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
umask 077
fail() { printf '%s\n' "$1" >&2; exit 1; }
expected_image="$(cat image-reference.txt)"
expected_id="$(cat image-id.txt)"
[[ "$expected_image" =~ ^runory/self-host-candidate:[a-f0-9]{40}$ ]] || fail "invalid bundled image reference"
[[ "$expected_id" =~ ^sha256:[a-f0-9]{64}$ ]] || fail "invalid bundled image ID"
# Do not let ambient host provider credentials or compose overrides silently
# replace the selected bundle image. Compose reads only this local .env.
unset RUNORY_IMAGE RUNORY_PORT PLATFORM_ADMIN_EMAILS PLATFORM_MAIL_PROVIDER_URL PLATFORM_CRON_SECRET CUSTOMER_ACCESS_SESSION_SECRET COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_ENV_FILES
verify_image() {
  [[ "$(docker image inspect --format '{{.Id}}' "$expected_image")" == "$expected_id" ]] || fail "loaded image does not match bundle"
}
compose() {
  [[ -f .env && ! -L .env ]] || fail "run init first"
  RUNORY_IMAGE="$expected_image" docker compose --env-file .env --project-name runory-self-host -f compose.yaml "$@"
}
case "${1:-help}" in
  verify)
    sha256sum --check SHA256SUMS
    ;;
  load)
    sha256sum --check SHA256SUMS
    docker load -i image.tar.gz
    verify_image
    printf '{"operation":"load","status":"PASS"}\n'
    ;;
  init)
    [[ $# == 3 ]] || fail "Usage: bash runory.sh init OWNER_EMAIL PRIVATE_MAIL_ENDPOINT"
    [[ "$2" =~ ^[A-Za-z0-9._+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || fail "invalid owner email"
    # Restrict the initial supported endpoint syntax, avoiding Compose dotenv
    # interpolation or shell injection; never put credentials in the URL.
    [[ "$3" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._/-]*)?$ ]] || fail "invalid private mail endpoint"
    [[ ! -e .env && ! -L .env ]] || fail "existing configuration retained; do not initialize twice"
    cron="$(openssl rand -hex 32)"
    customer="$(openssl rand -hex 32)"
    (set -o noclobber; printf 'RUNORY_PORT=3000\nPLATFORM_ADMIN_EMAILS=%s\nPLATFORM_MAIL_PROVIDER_URL=%s\nPLATFORM_CRON_SECRET=%s\nCUSTOMER_ACCESS_SESSION_SECRET=%s\n' "$2" "$3" "$cron" "$customer" > .env)
    printf '{"operation":"init","status":"PASS","next":"load_then_start"}\n'
    ;;
  start)
    verify_image
    compose config --quiet
    compose up -d --wait --wait-timeout 120
    printf '{"operation":"start","status":"PASS","scope":"engineering_candidate_services_started"}\n'
    ;;
  status)
    compose ps --format json
    ;;
  stop)
    compose stop
    ;;
  *)
    printf '%s\n' 'Engineering candidate commands: verify | load | init OWNER_EMAIL PRIVATE_MAIL_ENDPOINT | start | status | stop'
    ;;
esac
