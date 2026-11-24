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
    mkdir -p /app /data && chown node:node /app /data
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
ENV NODE_ENV=production \
    PLATFORM_DEPLOYMENT_MODE=local \
    LIBSQL_URL=file:/data/platform.db \
    RUNORY_ATTACHMENT_STORAGE=local \
    RUNORY_LOCAL_UPLOADS_DIR=/data/uploads \
    RUNORY_RELEASE_COMMIT=$RUNORY_SOURCE_SHA
WORKDIR /app/apps/cloud
EXPOSE 3000
CMD ["sh","-c","node /app/deploy/self-host/preflight.mjs && exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000"]
