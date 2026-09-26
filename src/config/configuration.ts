export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER,
    pass: process.env.DB_PASS,
    name: process.env.DB_NAME,
    ssl: process.env.DB_SSL ?? 'false',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://app:app123@localhost:5672',
    exchange: process.env.RABBITMQ_EXCHANGE ?? 'ingest.topic',
    imageQueue: process.env.RABBITMQ_IMAGE_QUEUE ?? 'ingest.image.queue',
    pdfQueue: process.env.RABBITMQ_PDF_QUEUE ?? 'ingest.pdf.queue',
  },
  llm: {
    provider: process.env.LLM_PROVIDER ?? 'anthropic',
    model: process.env.LLM_MODEL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    embeddingProvider: process.env.EMBEDDING_PROVIDER ?? 'openai',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
  },
  tavily: {
    apiKey: process.env.TAVILY_API_KEY,
  },
  auth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL,
    jwtSecret: process.env.AUTH_JWT_SECRET,
    jwtExpiresInSeconds: process.env.AUTH_JWT_EXPIRES_IN_SECONDS ?? '86400',
    successRedirectUrl: process.env.AUTH_SUCCESS_REDIRECT_URL,
  },
  receiptAnalytics: {
    cursorHmacSecret: process.env.RECEIPT_CURSOR_HMAC_SECRET,
  },
});
