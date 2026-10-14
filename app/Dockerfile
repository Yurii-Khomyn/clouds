# Базовий образ із ЗАФІКСОВАНОЮ версією (вимога методички: не latest).
# Alpine: маленький образ, менша поверхня атаки.
FROM node:24.21.0-alpine3.24

ENV NODE_ENV=production
WORKDIR /app

# Спочатку лише маніфести залежностей, і окремий шар для npm ci.
# Поки package*.json не змінились, Docker бере цей шар з кешу, і зміни в коді
# не змушують перевстановлювати залежності. Так збірка в CI швидша.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Код копіюється ПІСЛЯ залежностей, бо змінюється найчастіше.
COPY src ./src
COPY public ./public

# Процес працює не від root: користувач node (uid 1000) уже є в базовому образі.
USER node

EXPOSE 3000

# Docker сам перевіряє, що застосунок відповідає на /health.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
