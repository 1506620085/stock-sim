# 构建阶段：用 bookworm（glibc），避免 Alpine/musl 下 rollup 可选依赖缺失
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
# Windows 生成的 lock 常缺 Linux 的 rollup 可选依赖，构建时显式补上
RUN npm ci \
 && npm install --no-save @rollup/rollup-linux-x64-gnu

COPY . .

# 留空：浏览器走同域 /api，由 Nginx 反代到后端
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# 运行阶段
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
