# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
# Migrations are shipped so the container can self-migrate on boot if desired.
COPY --from=build /app/dist/db/migrations ./dist/db/migrations
EXPOSE 4000
CMD ["node", "dist/index.js"]
