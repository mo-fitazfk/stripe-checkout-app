# Multi-stage build for production
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies
RUN npm run install-all

# Copy source code
COPY . .

# Build client
WORKDIR /app/client
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Copy server files
COPY server/package*.json ./
COPY server/index.js ./
RUN npm install --only=production

# Copy built client
COPY --from=builder /app/client/build ./public

# Expose port
EXPOSE 5000

# Start server
CMD ["node", "index.js"]
