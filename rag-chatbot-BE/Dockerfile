FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
COPY rag-chatbot-BE/package.json ./rag-chatbot-BE/
COPY rag-chatbot-UI/package.json ./rag-chatbot-UI/
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY package*.json ./
COPY rag-chatbot-BE/package.json ./rag-chatbot-BE/
COPY rag-chatbot-UI/package.json ./rag-chatbot-UI/
RUN npm ci --omit=dev
COPY --from=build /app/rag-chatbot-BE/dist ./rag-chatbot-BE/dist
COPY --from=build /app/rag-chatbot-UI/public ./rag-chatbot-UI/public
WORKDIR /app/rag-chatbot-BE
EXPOSE 3000
CMD ["node", "dist/main.js"]
