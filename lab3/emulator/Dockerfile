FROM node:24.21.0-alpine3.24

WORKDIR /app
COPY package.json index.js config.json ./
COPY images ./images

USER node

CMD ["node", "index.js"]
