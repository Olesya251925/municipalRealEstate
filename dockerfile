FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache fontconfig

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/contracts /app/fonts

EXPOSE 3010

CMD ["node", "server.js"]