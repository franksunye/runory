# B1 engineering candidate. Build from a clean tracked source snapshot.
# Do not use this unverified build as a supported production distribution.
FROM node:24-bookworm-slim
ARG RUNORY_SOURCE_SHA
LABEL org.opencontainers.image.title="Runory FSM self-hosted candidate" \
      org.opencontainers.image.source="https://github.com/franksunye/runory" \
      org.opencontainers.image.revision=$RUNORY_SOURCE_SHA \
      org.opencontainers.image.licenses="Apache-2.0"
RUN test "${#RUNORY_SOURCE_SHA}" -eq 40 && \
    printf '%s' "$RUNORY_SOURCE_SHA" | grep -Eq '^[a-f0-9]{40}$' && \
    npm install --global pnpm@10.31.0 && \
    mkdir -p /app /data /backup && chown node:node /app /data /backup
WORKDIR /app
COPY --chown=node:node . .
USER node
ENV NEXT_TELEMETRY_DISABLED=1 \
    PLATFORM_DEV_BOOTSTRAP=false \
    PLATFORM_OTP_RETURN_DEV_CODE=false \
    PLATFORM_TRUST_IDENTITY_HEADERS=false
RUN pnpm install --frozen-lockfile
# Build against a temporary, isolated database, never the runtime volume.
RUN mkdir -p /tmp/runory-build && \
    LIBSQL_URL=file:/tmp/runory-build/build.db pnpm --filter @runory/cloud build && \
    rm -rf /tmp/runory-build
# Build the bounded, validated Catalog on a separate empty database, then
# copy only its credential-free template and immutable release metadata.
RUN mkdir -p /tmp/runory-catalog-build && \
    NODE_ENV=production PLATFORM_DEPLOYMENT_MODE=local \
    PLATFORM_ADMIN_EMAILS=offline-catalog-builder@runory.invalid \
    LIBSQL_URL=file:/tmp/runory-catalog-build/catalog.db \
    RUNORY_CANDIDATE_CATALOG_BUILD=1 RUNORY_CATALOG_SOURCE_SHA="$RUNORY_SOURCE_SHA" \
    pnpm --filter @runory/cloud exec tsx scripts/build-self-host-catalog.mts && \
    rm -rf /tmp/runory-catalog-build
ENV NODE_ENV=production \
    RUNORY_SELF_HOST_CANDIDATE=1 \
    PLATFORM_DEPLOYMENT_MODE=local \
    LIBSQL_URL=file:/data/platform.db \
    RUNORY_ATTACHMENT_STORAGE=local \
    RUNORY_LOCAL_UPLOADS_DIR=/data/uploads \
    RUNORY_RELEASE_COMMIT=$RUNORY_SOURCE_SHA
WORKDIR /app/apps/cloud
EXPOSE 3000
CMD ["sh","-c","node /app/deploy/self-host/preflight.mjs && node /app/deploy/self-host/initialize.mjs && exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000"]
