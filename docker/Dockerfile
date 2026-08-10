# One image, three processes. The api, worker and bot differ only in the command
# compose gives them, so there is a single thing to build, push and keep in sync.
#
# The Node apps run through tsx rather than a bundle. Prisma 7 with driver
# adapters ships a WASM query compiler that a bundler has to be taught to carry,
# and the payoff would be a faster start for three processes that restart once
# per deploy. Running the same TypeScript in development and production is worth
# more than that.

FROM node:22-alpine AS base

RUN corepack enable
WORKDIR /app

# Keeps pnpm non-interactive: without it removal steps refuse to touch
# node_modules because there is no TTY to confirm at.
ENV CI=true

# `prisma generate` reads the datasource; it never connects, but the value has
# to parse. The real one arrives from the environment at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"


# Full dependency tree, only to produce the built admin panel.
FROM base AS build

COPY . .
RUN pnpm install --frozen-lockfile

# `run` is not optional: bare `pnpm --filter x <name>` resolves to pnpm's own
# command when one exists by that name, which is how `deploy` silently became
# pnpm's own deploy rather than the package script.
RUN pnpm --filter web run build


# Production dependencies, installed from scratch rather than pruned out of the
# stage above. Pruning in place leaves the build-only tree behind — vite,
# typescript, turbo and the platform binaries — and roughly doubles the image.
# postinstall generates the Prisma client, so it lands in the source tree here.
FROM base AS prod-deps

COPY . .

# Everything except the two browser packages. The panel is served from a
# pre-built dist, so React, lucide and the shadcn toolchain are dead weight at
# runtime — dropping them takes the image from 910 MB to under 300.
#
# Stated as an exclusion rather than a list of the seven Node packages, so a new
# shared package is included by default instead of being silently left out.
RUN pnpm install --prod --frozen-lockfile \
  --filter "!web" \
  --filter "!@workspace/ui"


FROM node:22-alpine AS runtime

RUN corepack enable
WORKDIR /app

ENV NODE_ENV=production
# Relative to the working directory of whichever app is running.
ENV WEB_DIST_DIR=../web/dist

COPY --from=prod-deps /app /app
COPY --from=build /app/apps/web/dist /app/apps/web/dist
# corepack only installs a shim; without the primed cache the first `pnpm` in a
# container downloads the pinned version, making startup depend on the network.
COPY --from=build /root/.cache/node /root/.cache/node

# The api answers on this one; worker and bot listen on nothing.
EXPOSE 3000

# Overridden per service in docker-compose.yml.
CMD ["pnpm", "--filter", "@workspace/api", "run", "start"]
