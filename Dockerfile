FROM node:26-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ src/
CMD ["node", "--experimental-strip-types", "src/server.ts"]
