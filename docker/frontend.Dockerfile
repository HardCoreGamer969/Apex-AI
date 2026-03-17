# ── ApexAI Frontend — Development Image ─────────────────────────────────────
# Node 20 + Vite dev server with HMR
# Hot-reload enabled: mount frontend/src/ and frontend/public/ as volumes.

FROM node:20-alpine

WORKDIR /app

# ── Dependency layer (cached unless package.json / package-lock.json changes) ─
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

# ── Source (overridden by volume mounts in docker-compose for hot-reload) ────
COPY frontend/ .

EXPOSE 5173

# --host binds Vite to 0.0.0.0 so it's reachable outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
