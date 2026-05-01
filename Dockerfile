FROM node:20-slim

WORKDIR /app

COPY package.json yarn.lock tsconfig.json ./
COPY services ./services
COPY app ./app

RUN yarn install --frozen-lockfile \
  && yarn mcp:build \
  && cd app \
  && yarn install --frozen-lockfile \
  && yarn build

CMD ["sh", "-c", "if [ \"$RAILWAY_SERVICE_NAME\" = \"frontend\" ]; then cd app && yarn preview --host 0.0.0.0 --port \"$PORT\"; else yarn mcp:serve; fi"]
