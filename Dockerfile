FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
# data/ не копируем — в проде монтируется volume; при первом запуске initDb() создаст data/db.json
COPY .env.example ./.env.example
COPY README.md ./README.md
RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server/index.js"]
