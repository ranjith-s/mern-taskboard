FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Copy package files first: Docker caches the npm install layer
# until dependencies actually change.
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
# Don't run as root inside the container
USER node
EXPOSE 5000
CMD ["node", "src/server.js"]
