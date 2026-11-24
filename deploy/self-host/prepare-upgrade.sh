#!/usr/bin/env bash
# Offline preparation only: no stop/start/cutover, no .env changes, no deletes.
# Caller must hold the maintenance window and keep all writers stopped.
set -euo pipefail
umask 077
fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ $# == 5 ]] || fail "Usage: prepare-upgrade.sh OLD_IMAGE NEW_IMAGE SOURCE_VOLUME BACKUP_VOLUME TARGET_VOLUME"
old="$1"; new="$2"; source="$3"; backup="$4"; target="$5"
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for v in "$source" "$backup" "$target"; do [[ "$v" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]+$ ]] || fail "invalid named volume"; done
[[ "$source" != "$backup" && "$source" != "$target" && "$backup" != "$target" ]] || fail "volumes must be distinct"
old_id="$(docker image inspect --format '{{.Id}}' "$old")"
new_id="$(docker image inspect --format '{{.Id}}' "$new")"
old_sha="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$old_id")"
new_sha="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$new_id")"
[[ "$old_sha" =~ ^[a-f0-9]{40}$ && "$new_sha" =~ ^[a-f0-9]{40}$ && "$old_sha" != "$new_sha" ]] || fail "invalid or identical release identities"
docker volume inspect "$source" >/dev/null
[[ -z "$(docker ps -q --filter "volume=$source")" ]] || fail "source volume is mounted by a running container; stop all writers"
volumes="$(docker volume ls --format '{{.Name}}')"
for v in "$backup" "$target"; do
  if grep -Fxq "$v" <<<"$volumes"; then fail "backup and target must be new named volumes"; fi
done
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
# Profile is public image metadata only. Old image is inspected with the same
# trusted profile code as the new one; the container has no data or network.
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  -v "$here/release-profile.mjs:/app/deploy/self-host/release-profile.mjs:ro" \
  "$old_id" node /app/deploy/self-host/release-profile.mjs > "$work/source-profile.json"
chmod 644 "$work/source-profile.json"
# Verify compatibility BEFORE creating or copying any volumes.
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  -e RUNORY_UPGRADE_FROM="$old_sha" -v "$work/source-profile.json:/upgrade/source-profile.json:ro" \
  "$new_id" node --input-type=module -e 'import {readFile} from "node:fs/promises"; import {readImageProfile} from "/app/deploy/self-host/release-profile.mjs"; import {assertCompatibleRelease} from "/app/deploy/self-host/upgrade.mjs"; const old=JSON.parse(await readFile("/upgrade/source-profile.json","utf8")); if(old.sourceCommit!==process.env.RUNORY_UPGRADE_FROM)throw Error("source image identity mismatch"); assertCompatibleRelease(old,await readImageProfile(process.env.RUNORY_RELEASE_COMMIT)); console.log(JSON.stringify({operation:"upgrade-compatibility",status:"PASS"}))'
docker volume create "$backup" >/dev/null
docker volume create "$target" >/dev/null
[[ -z "$(docker ps -q --filter "volume=$source")" ]] || fail "source restarted during preparation"
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  -v "$source:/data:ro" -v "$backup:/backup" "$old_id" node /app/deploy/self-host/snapshot.mjs backup
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges \
  -v "$target:/data" -v "$backup:/backup:ro" -v "$source:/source:ro" \
  -v "$work/source-profile.json:/upgrade/source-profile.json:ro" -e RUNORY_UPGRADE_FROM="$old_sha" \
  "$new_id" node /app/deploy/self-host/upgrade.mjs
# Recheck source bytes against the completed backup before admitting cutover.
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  -v "$source:/data:ro" -v "$backup:/backup:ro" "$old_id" node --input-type=module -e 'import {inventory} from "/app/deploy/self-host/snapshot.mjs"; import {readFile} from "node:fs/promises"; const manifest=JSON.parse(await readFile("/backup/manifest.json","utf8")); if(JSON.stringify(await inventory("/data"))!==JSON.stringify(manifest.entries))throw Error("source changed during preparation"); console.log(JSON.stringify({operation:"source-preservation",status:"PASS"}))'
[[ -z "$(docker ps -q --filter "volume=$source")" ]] || fail "source restarted during preparation"
printf '{"operation":"upgrade-volume","status":"prepared","targetVolume":"%s","backupVolume":"%s","cutover":false}\n' "$target" "$backup"
