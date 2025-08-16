FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p /app/data /app/config

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]