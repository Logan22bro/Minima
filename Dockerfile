FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

COPY public ./public
COPY server.mjs ./server.mjs

EXPOSE 3000

CMD ["npm", "start"]
