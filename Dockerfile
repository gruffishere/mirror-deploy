# THE MIRROR, as it runs in production.
FROM node:24-slim

# ⚠️ CHROMIUM IS A REAL DEPENDENCY, not an optional extra. /api/card.png shells out to a browser to
# rasterise the card, so without one every share and every download on the site returns an error.
# fonts-dejavu-core is a backstop and NOT the design: the card ships its own Inter, JetBrains Mono
# and Caveat under cards/fonts. This is here so that a character none of those three own comes out
# as a character instead of an empty box, which is what a slim image with no fonts at all would give.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV MIRROR_CHROME=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

# dependencies first, so editing the site does not reinstall ethers on every deploy
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

# ⛔ THE EXECUTE BIT CANNOT BE TRUSTED TO SURVIVE. It was set on the file and Windows does not record
# it in git, so the first deploy built perfectly and then refused to start: "We do not have
# permission to execute your start command". Setting it here means it no longer depends on which
# machine the commit was made on.
RUN chmod +x /app/docker-entrypoint.sh

# ⛔ THE TWO DIRECTORIES THAT MUST OUTLIVE A DEPLOY.
# Everything under /app is replaced wholesale each time this image is rebuilt. signed.jsonl is the
# one file in this project that CANNOT be reconstructed: a signature can only be re-verified against
# the exact bytes that were signed, and those bytes live in the row. Mount a disk at /data.
ENV MIRROR_LISTS_DIR=/data/lists \
    MIRROR_CACHE_DIR=/data/cache \
    MIRROR_PNG_DIR=/data/png

EXPOSE 8141
ENTRYPOINT ["/app/docker-entrypoint.sh"]
