# ============================================
# STAGE 1: Build Stage
# ============================================
# We use a "multi-stage" build - first stage compiles TypeScript,
# second stage runs the compiled JavaScript (smaller final image)

FROM node:20-alpine AS builder

# Set working directory inside the container
WORKDIR /app

# Copy package files FIRST (for better caching)
# Docker caches each layer - if package.json hasn't changed,
# it won't reinstall dependencies (saves time!)
COPY package*.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci

# Copy the Prisma schema BEFORE building
# Prisma needs to read schema.prisma to generate the database client.
# Without this step, the app will crash at runtime — it won't know
# how to talk to the database.
COPY prisma ./prisma

# Generate the Prisma client (reads schema.prisma, outputs typed DB client)
RUN npx prisma generate

# Now copy the rest of the source code
COPY . .

# Build the TypeScript code into JavaScript
RUN npm run build


# ============================================
# STAGE 2: Production Stage
# ============================================
# Start fresh with a clean image (no dev dependencies, no source code)

FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies (no devDependencies)
# --omit=dev is the modern flag for skipping devDependencies
# --ignore-scripts skips lifecycle scripts like "prepare: husky" which
# only makes sense on a developer machine, not inside a Docker container
RUN npm ci --omit=dev --ignore-scripts

# Copy the Prisma schema into the production image
# We need this here too because Prisma generates its client
# per environment — the production image needs its own copy
COPY prisma ./prisma

# Generate the Prisma client in the production image
# (the generated client in the builder stage belongs to that stage only)
RUN npx prisma generate

# Copy the built JavaScript from the builder stage
COPY --from=builder /app/dist ./dist

# Expose the port your app runs on
EXPOSE 3000

# Start command:
# 1. "npx prisma migrate deploy" — applies any pending database migrations
#    before the app starts. Safe to run on every startup (skips already-applied ones).
# 2. "node dist/main.js" — starts the NestJS application
CMD ["sh", "-c", "npx prisma migrate deploy && node --max-old-space-size=512 dist/main.js"]
