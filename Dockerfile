# One image, two roles: the Next.js web app (default CMD) and the render worker (`npm run worker`).
FROM node:22-bookworm-slim AS base
# Shared libraries for Remotion's Chrome Headless Shell (per remotion.dev/docs/docker);
# libasound2 is also what node-web-audio-api needs for the offline soundtrack mix.
RUN apt-get update && apt-get install -y \
      ca-certificates libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev \
      libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# Download Remotion's Chrome Headless Shell (stored in node_modules/.remotion).
RUN npx remotion browser ensure

FROM base AS run
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY --from=build /app ./
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx drizzle-kit migrate && npm start"]
