FROM node:24-alpine AS build

WORKDIR /app
ARG BASE_PATH=""

COPY package*.json ./
COPY apps/web/package*.json apps/web/
COPY apps/api/package*.json apps/api/
RUN npm ci

COPY . .

RUN npm run build --workspace @asientos/api
RUN BASE_HREF="/${BASE_PATH:+$BASE_PATH/}" && \
    npm run build --workspace @asientos/web -- --base-href "$BASE_HREF" --deploy-url "$BASE_HREF"

FROM node:24-alpine

WORKDIR /app
ARG BASE_PATH=""
ENV NODE_ENV=production
ENV BASE_PATH=$BASE_PATH

COPY package*.json ./
COPY apps/web/package*.json apps/web/
COPY apps/api/package*.json apps/api/
RUN npm ci --omit=dev

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/api/data/people.seed.csv ./apps/api/data/people.seed.csv

ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
