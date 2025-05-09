FROM node:18-alpine

WORKDIR /app

# Install bash (needed for wait-for-it)
RUN apk add --no-cache bash

# Copy only package files and prisma schema first (layer optimization)
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies early to leverage Docker cache
RUN npm install

# Copy the rest of the application
COPY . .

# Generate the Prisma client at build time
RUN npx prisma generate

# Add wait-for-it script for DB health check
ADD https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh /wait-for-it.sh
RUN chmod +x /wait-for-it.sh

# Optional envs for fallback/debug
ENV PORT=3000

EXPOSE 3000

# Create startup script
RUN echo '#!/bin/bash' > /app/startup.sh && \
    echo 'set -e' >> /app/startup.sh && \
    echo 'echo "📦 Starting CloudChallenge server..."' >> /app/startup.sh && \
    echo 'echo "Waiting for database..."' >> /app/startup.sh && \
    echo '/wait-for-it.sh postgres:5432 -t 60 -- echo "✅ PostgreSQL is ready!"' >> /app/startup.sh && \
    echo 'echo "Running Prisma migrations..."' >> /app/startup.sh && \
    echo 'npx prisma migrate deploy' >> /app/startup.sh && \
    echo 'echo "Launching application in watch mode..."' >> /app/startup.sh && \
    echo 'npm run start:dev' >> /app/startup.sh && \
    echo 'echo "✅ Startup complete. Application running on port $PORT"' >> /app/startup.sh && \
    chmod +x /app/startup.sh

CMD ["/app/startup.sh"]
