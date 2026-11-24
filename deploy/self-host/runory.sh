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
unset RUNORY_IMAGE RUNORY_PORT RUNORY_SELF_HOST_MAIL_MODE RUNORY_SELF_HOST_EMAIL_OUTBOX_ENABLED RESEND_API_KEY RUNORY_EMAIL_FROM PLATFORM_ADMIN_EMAILS PLATFORM_MAIL_PROVIDER_URL PLATFORM_CRON_SECRET CUSTOMER_ACCESS_SESSION_SECRET COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_ENV_FILES
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
    [[ $# == 2 || $# == 3 ]] || fail "Usage: bash runory.sh init OWNER_EMAIL [PRIVATE_MAIL_ENDPOINT]"
    [[ "$2" =~ ^[A-Za-z0-9._+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || fail "invalid owner email"
    # Restrict the initial supported endpoint syntax, avoiding Compose dotenv
    # interpolation or shell injection; never put credentials in the URL.
    mode=operator
    endpoint=""
    if [[ $# == 3 ]]; then
      [[ "$3" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._/-]*)?$ ]] || fail "invalid private mail endpoint"
      mode=provider
      endpoint="$3"
    fi
    [[ ! -e .env && ! -L .env ]] || fail "existing configuration retained; do not initialize twice"
    cron="$(openssl rand -hex 32)"
    customer="$(openssl rand -hex 32)"
    (set -o noclobber; printf 'RUNORY_PORT=3000\nRUNORY_SELF_HOST_MAIL_MODE=%s\nPLATFORM_ADMIN_EMAILS=%s\nPLATFORM_MAIL_PROVIDER_URL=%s\nPLATFORM_CRON_SECRET=%s\nCUSTOMER_ACCESS_SESSION_SECRET=%s\n' "$mode" "$2" "$endpoint" "$cron" "$customer" > .env)
    printf '{"operation":"init","status":"PASS","next":"load_then_start"}\n'
    ;;
  start)
    verify_image
    compose config --quiet
    compose up -d --wait --wait-timeout 120
    printf '{"operation":"start","status":"PASS","scope":"engineering_candidate_services_started"}\n'
    ;;
  code)
    [[ $# == 1 && -t 0 && -t 1 ]] || fail "Owner code requires an interactive private host terminal"
    verify_image
    compose exec -T runory pnpm exec tsx scripts/self-host-owner-code.mts
    ;;
  status)
    compose ps --format json
    ;;
  doctor)
    verify_image
    compose exec -T runory node -e 'fetch("http://127.0.0.1:3000/api/health",{signal:AbortSignal.timeout(10000)}).then(async r=>{const j=await r.json();if(!r.ok||j.data?.release?.commit!==process.argv[1]||j.data?.readiness?.catalog!=="verified"){console.error(JSON.stringify({status:"FAIL",reason:"runtime_or_release_not_ready"}));process.exitCode=1}else console.log(JSON.stringify(j))}).catch(()=>{console.error(JSON.stringify({status:"FAIL",reason:"readiness_unreachable"}));process.exitCode=1})' "${expected_image##*:}"
    compose exec -T scheduler node /app/deploy/self-host/scheduler.mjs --health
    ;;
  stop)
    compose stop
    ;;
  *)
    printf '%s\n' 'Engineering candidate commands: verify | load | init OWNER_EMAIL [PRIVATE_MAIL_ENDPOINT] | start | code | status | doctor | stop'
    ;;
esac
