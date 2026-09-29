# SoulBot MCP server — container for Glama/introspection build phases.
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# stdio MCP server driving the committed core contracts (tsx, no build emit).
# Glama runs this image in its sandbox and introspects via tools/list.
CMD ["npm", "run", "mcp:stdio"]