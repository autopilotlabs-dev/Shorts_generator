# Nightshade — single container: Next.js web app + background render worker.
FROM node:22-bookworm-slim AS base
# ffmpeg encodes the video; libasound2 is required by node-web-audio-api (offline audio render).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg libasound2 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM base AS run
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY --from=build /app ./
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]
