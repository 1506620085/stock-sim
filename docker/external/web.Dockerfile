# 模式 B：Web 镜像（Nginx 静态 + /api 反代到 api 服务）
# 构建上下文必须是仓库根目录

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci \
 && npm install --no-save @rollup/rollup-linux-x64-gnu

COPY apps/web/ ./

ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

FROM nginx:1.27-alpine

COPY docker/external/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
