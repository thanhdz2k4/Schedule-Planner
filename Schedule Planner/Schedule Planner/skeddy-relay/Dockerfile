FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV SKEDDY_RELAY_PORT=8787
EXPOSE 8787

CMD ["npm", "start"]

