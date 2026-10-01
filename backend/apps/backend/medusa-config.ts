import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const redisUrl = process.env.REDIS_URL

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  },
  // Redis-backed modules; without REDIS_URL Medusa falls back to in-memory ones.
  modules: redisUrl
    ? [
        {
          resolve: '@medusajs/medusa/event-bus-redis',
          options: { redisUrl },
        },
        {
          resolve: '@medusajs/medusa/workflow-engine-redis',
          options: { redis: { url: redisUrl } },
        },
        {
          resolve: '@medusajs/medusa/locking',
          options: {
            providers: [
              {
                resolve: '@medusajs/medusa/locking-redis',
                id: 'locking-redis',
                is_default: true,
                options: { redisUrl },
              },
            ],
          },
        },
      ]
    : [],
})
