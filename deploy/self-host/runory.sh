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
unset RUNORY_IMAGE RUNORY_PORT RUNORY_DATA_VOLUME RUNORY_SELF_HOST_MAIL_MODE RUNORY_SELF_HOST_EMAIL_OUTBOX_ENABLED RESEND_API_KEY RUNORY_EMAIL_FROM PLATFORM_ADMIN_EMAILS PLATFORM_MAIL_PROVIDER_URL PLATFORM_CRON_SECRET CUSTOMER_ACCESS_SESSION_SECRET COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_ENV_FILES
verify_image() {
  [[ "$(docker image inspect --format '{{.Id}}' "$expected_image")" == "$expected_id" ]] || fail "loaded image does not match bundle"
}
# Only the local bundle's explicit volume selection is authoritative.
# An environment variable or copied dotenv cannot silently select another DB.
selected_volume() {
  if [[ -e data-volume.txt || -L data-volume.txt ]]; then
    [[ -f data-volume.txt && ! -L data-volume.txt ]] || fail "invalid local volume selection"
    local selected
    selected="$(cat data-volume.txt)"
    [[ "$selected" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]+$ ]] || fail "invalid selected volume"
    docker volume inspect "$selected" >/dev/null || fail "prepared volume does not exist"
    printf '%s\n' "$selected"
  else
    printf '%s\n' runory-self-host_runory-data
  fi
}
compose() {
  [[ -f .env && ! -L .env ]] || fail "run init first or copy the prior private configuration for upgrade"
  local selected
  selected="$(selected_volume)"
  RUNORY_IMAGE="$expected_image" RUNORY_DATA_VOLUME="$selected" docker compose --env-file .env --project-name runory-self-host -f compose.yaml "$@"
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
  prepare-upgrade)
    [[ $# == 5 ]] || fail "Usage: bash runory.sh prepare-upgrade PRIOR_BUNDLE SOURCE_VOLUME BACKUP_VOLUME TARGET_VOLUME"
    sha256sum --check SHA256SUMS >/dev/null
    verify_image
    prior="$(cd -- "$2" && pwd)"
    (cd -- "$prior" && sha256sum --check SHA256SUMS >/dev/null)
    old_image="$(cat "$prior/image-reference.txt")"
    old_id="$(cat "$prior/image-id.txt")"
    [[ "$old_image" =~ ^runory/self-host-candidate:[a-f0-9]{40}$ && "$old_id" =~ ^sha256:[a-f0-9]{64}$ ]] || fail "invalid prior bundle identity"
    [[ "$(docker image inspect --format '{{.Id}}' "$old_image")" == "$old_id" ]] || fail "prior image must match the verified bundle"
    [[ ! -e data-volume.txt && ! -L data-volume.txt ]] || fail "bundle already has a volume selection; use a fresh extracted bundle"
    bash prepare-upgrade.sh "$old_id" "$expected_id" "$3" "$4" "$5"
    # Local selection is written only after successful clone preparation.
    # No live services are switched or started by this command.
    (set -o noclobber; printf '%s\n' "$5" > data-volume.txt)
    ;;
  start)
    verify_image
    if [[ -e data-volume.txt || -L data-volume.txt ]]; then
      selected="$(selected_volume)"
      docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
        -v "$selected:/data:ro" "$expected_id" node --input-type=module -e 'import {readFile} from "node:fs/promises"; import {readImageProfile,validateVolumeRelease} from "/app/deploy/self-host/release-profile.mjs"; const marker=JSON.parse(await readFile("/data/release.json","utf8")); if(marker.format!=="runory.self-host.volume/v2")throw Error("explicit volume is not prepared for upgrade"); validateVolumeRelease(marker,await readImageProfile(process.env.RUNORY_RELEASE_COMMIT));'
    fi
    compose config --quiet
    compose up -d --wait --wait-timeout 120
    printf '{"operation":"start","status":"PASS","scope":"engineering_candidate_services_started"}\n'
    ;;
  code)
    [[ $# == 1 && -t 0 && -t 1 ]] || fail "Owner code requires an interactive private host terminal"
    verify_image
    compose exec -T runory pnpm exec tsx scripts/self-host-owner-code.mts
    ;;
  mcp)
    [[ $# == 1 && -n "${RUNORY_API_KEY:-}" && "${RUNORY_WORKSPACE_ID:-}" =~ ^[A-Za-z0-9_-]+$ ]] || fail "MCP requires an authorized scoped RUNORY_API_KEY and RUNORY_WORKSPACE_ID"
    verify_image
    running="$(compose ps -q runory)"
    [[ -n "$running" && "$(docker inspect --format '{{.Image}}' "$running")" == "$expected_id" ]] || fail "expected release is not running"
    # Stdio contains only MCP protocol messages. Keep the bearer credential
    # in the client-provided environment; do not persist it in .env or argv.
    compose exec -T -e RUNORY_API_KEY -e RUNORY_WORKSPACE_ID \
      -e RUNORY_API_BASE=http://127.0.0.1:3000 runory \
      node --import tsx /app/apps/mcp/src/server.ts
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
    printf '%s\n' 'Engineering candidate commands: verify | load | init OWNER_EMAIL [PRIVATE_MAIL_ENDPOINT] | prepare-upgrade PRIOR_BUNDLE SOURCE_VOLUME BACKUP_VOLUME TARGET_VOLUME | start | code | mcp | status | doctor | stop'
    ;;
esac
