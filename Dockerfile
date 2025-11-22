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
RUN npm ci --only=production

# Copy the built JavaScript from the builder stage
COPY --from=builder /app/dist ./dist

# Expose the port your app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "--max-old-space-size=512", "dist/main.js"]
