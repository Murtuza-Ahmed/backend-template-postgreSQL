# Same image on every machine — no more "works on mine" surprises.
FROM node:22-alpine

WORKDIR /app

# Install deps, generate the Prisma client, then drop dev dependencies
# (prisma CLI is a devDep — generate must run BEFORE the prune).
COPY package*.json ./
RUN npm ci && npx prisma generate && npm prune --omit=dev

COPY . .

# Run as non-root
RUN addgroup -S app && adduser -S app -G app \
  && chown -R app:app /app
USER app

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "server.js"]
