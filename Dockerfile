# SoulBot MCP server — container for Glama/introspection build phases.
#
# Glama clones this repo, builds this image in a sandbox, then speaks MCP to it
# over stdio and scores the tools. The image therefore has one job: answer the
# handshake in mcp/REGISTRY.md, correctly, from a clean checkout.
#
# It runs the same code path the repo tests do. tsx is a devDependency and the
# server runs from source on purpose — there is no build step to go stale
# between what CI verified and what Glama introspects.

FROM node:20-slim

# Run as the non-root user node already provides. A read-only tool server has no
# reason to hold root, and a sandbox that runs everything as root is a sandbox
# whose escapes are root escapes.
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .

# Fail the image build if the server cannot answer the handshake. An image that
# builds but does not answer would be introspected as an empty server, and the
# failure would surface at Glama as a bad listing rather than here as a red build.
RUN printf '%s\n' \
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
      '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
      '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"soulbot_jataka","arguments":{}}}' \
    | npx tsx mcp/stdio.ts > /tmp/handshake.json \
    && grep -q '"tools"' /tmp/handshake.json \
    && grep -q 'JG-001' /tmp/handshake.json \
    && rm -f /tmp/handshake.json

# Drop privileges. Vendored files are world-readable; nothing is written at runtime.
USER node

# stdio MCP server. Glama runs this image, attaches to stdin/stdout, and
# introspects via the handshake above.
CMD ["npm", "run", "mcp:stdio"]
