# API image: Node.js backend (registrations, Razorpay, admin API)

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json schema.sql ./
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations

# Run as the unprivileged "node" user that ships with the image
USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health > /dev/null || exit 1

CMD ["node", "src/server.js"]
