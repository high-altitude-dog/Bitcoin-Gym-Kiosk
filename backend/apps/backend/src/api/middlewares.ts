import { configureStoreSearch, defineMiddlewares } from '@medusajs/framework/http'

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
    {
      method: ['POST'],
      matcher: '/store/search',
      middlewares: [
        configureStoreSearch({
          allowed_indexes: {
            product: true,
          },
        }),
      ],
    },
    {
      // Same body handling Medusa gives its own /hooks/payment/:provider.
      method: ['POST'],
      matcher: '/hooks/coinos',
      bodyParser: { preserveRawBody: true },
    },
    {
      // Bark Pay signs the raw body (see src/modules/bark-ark).
      method: ['POST'],
      matcher: '/hooks/bark',
      bodyParser: { preserveRawBody: true },
    },
  ],
})
