# Node 20 LTS
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --only=production || npm install

COPY . .

ENV NODE_ENV=production
CMD ["node", "index.js"]