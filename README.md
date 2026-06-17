# Runory

Runory is an agent-native local business workspace POC.

V1 proves the data-change loop:

```text
semi-structured expense text
-> Runory tool/API
-> Business Engine
-> SQLite
-> Business Event
-> live dashboard and expense intake UI
```

## Development

```bash
pnpm install
pnpm dev
```

Runtime API: `http://127.0.0.1:4310`  
Web UI: `http://127.0.0.1:5173/dashboard`

Start only the runtime:

```bash
pnpm runory start
```

Run the local MCP stdio server:

```bash
pnpm runory mcp
```

Smoke-test the MCP server with a local SDK client while the runtime is running:

```bash
pnpm --filter @runory/runtime mcp:smoke
```

Create a demo expense:

```bash
pnpm runory expense:create --text "Vendor: Restaurant Depot
Date: 2026-06-16
Amount: 286.40
Currency: USD
Category: ingredients
Description: 食材采购
Confidence: 0.95"
```
