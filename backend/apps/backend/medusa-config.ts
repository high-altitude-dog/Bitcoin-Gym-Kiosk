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
  modules: [
    ...(redisUrl
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
      : []),
    {
      // Unconfigured, this defaults to hardcoding http://localhost:9000/static
      // for every uploaded file's URL (@medusajs/file-local's own fallback),
      // which only happened to work locally because MEDUSA_BACKEND_URL is
      // also localhost there. Deployed, that broke every product image.
      //
      // Don't try to redirect storage elsewhere with `upload_dir`: the
      // GET /static route that actually serves these files is hardcoded in
      // @medusajs/framework's express-loader to `<cwd>/static` regardless of
      // this provider's config ("Currently we don't allow configuration of
      // static files" per that file's own comment) — upload_dir only moves
      // where uploads are WRITTEN, not where they're served FROM, so the two
      // go out of sync and every image 404s. See the "known gap" note in
      // CLAUDE.md for how uploads actually survive a `medusa build` deploy.
      resolve: '@medusajs/medusa/file',
      options: {
        providers: [
          {
            resolve: '@medusajs/medusa/file-local',
            id: 'local',
            options: {
              backend_url: `${process.env.MEDUSA_BACKEND_URL}/static`,
            },
          },
        ],
      },
    },
    {
      resolve: '@medusajs/medusa/payment',
      options: {
        providers: [
          {
            resolve: './src/modules/coinos-lightning',
            id: 'coinos-lightning',
            options: {
              coinosApiUrl: process.env.COINOS_API_URL,
              coinosApiToken: process.env.COINOS_API_TOKEN,
              yadioApiUrl: process.env.YADIO_API_URL,
              webhookSecret: process.env.COINOS_WEBHOOK_SECRET,
              webhookBaseUrl: process.env.MEDUSA_BACKEND_URL,
            },
          },
        ],
      },
    },
    {
      // Configuring this module replaces Medusa's default one, so its
      // default provider (the admin's notification feed) is listed again.
      resolve: '@medusajs/medusa/notification',
      options: {
        providers: [
          {
            resolve: '@medusajs/medusa/notification-local',
            id: 'local',
            options: { name: 'Local Notification Provider', channels: ['feed'] },
          },
          // Kiosk alerts to Slack (see src/lib/notify-slack.ts). Only
          // registered when the webhook is configured, so a machine without
          // it still starts and just sends no alerts.
          ...(process.env.SLACK_WEBHOOK_URL
            ? [
                {
                  resolve: './src/modules/slack-notification',
                  id: 'slack',
                  options: {
                    channels: ['slack'],
                    webhook_url: process.env.SLACK_WEBHOOK_URL,
                    staff_webhook_url: process.env.SLACK_STAFF_WEBHOOK_URL || undefined,
                    cafe_webhook_url: process.env.SLACK_CAFE_WEBHOOK_URL || undefined,
                    label: process.env.NODE_ENV === 'production' ? '' : '[prueba] ',
                  },
                },
              ]
            : []),
        ],
      },
    },
  ],
})
