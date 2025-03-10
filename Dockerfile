FROM node:22 AS build
WORKDIR /app
COPY package.json .
COPY yarn.lock .
RUN yarn install
COPY . .
RUN yarn compile

FROM node:22-alpine AS production
WORKDIR /app
COPY package.json .
COPY yarn.lock .
RUN yarn install --production
COPY --from=build /app/build /app/build
CMD ["node", "build/src/index.js"]
