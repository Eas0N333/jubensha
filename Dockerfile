# 前端零构建，直接把源码拷进去就能跑
FROM node:22-alpine

WORKDIR /app

# 先装依赖，利用镜像层缓存
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

# 容器里以非 root 的 node 用户运行，工作目录要归它
RUN mkdir -p /app/.certs && chown -R node:node /app

ENV NODE_ENV=production \
    PORT=5178 \
    HOST_BIND=0.0.0.0

EXPOSE 5178

# 健康检查走现成的接口
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5178)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "server/index.js"]
