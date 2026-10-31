import {
  configureStoreSearch,
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from '@medusajs/framework/http'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { allowedLocations, LOCATION_HEADER, locationAllowed, MANUAL_PROVIDERS } from '../lib/kiosk-location'

function refuse(res: MedusaResponse) {
  res.status(403).json({ type: 'not_allowed', message: 'Bank QR and cash are only available at the gym.' })
}

// Bank QR and cash only from a kiosk opened with a known ?location= (lib/kiosk-location.ts).
function requireLocation(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (locationAllowed(req.headers[LOCATION_HEADER], allowedLocations())) return next()
  refuse(res)
}

// ... the same, but only when this payment session is a bank QR or cash one.
function requireLocationForManualSession(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const provider = (req.body as { provider_id?: unknown } | undefined)?.provider_id
  if (typeof provider !== 'string' || !MANUAL_PROVIDERS.includes(provider)) return next()
  return requireLocation(req, res, next)
}

// ... and when completing a cart paid that way.
async function requireLocationForManualCart(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const allowed = allowedLocations()
  if (locationAllowed(req.headers[LOCATION_HEADER], allowed)) return next()
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: 'cart',
      fields: ['id', 'payment_collection.payment_sessions.provider_id'],
      filters: { id: req.params.id },
    })
    const sessions = (data[0] as { payment_collection?: { payment_sessions?: { provider_id: string }[] } } | undefined)
      ?.payment_collection?.payment_sessions ?? []
    if (sessions.some((s) => MANUAL_PROVIDERS.includes(s.provider_id))) return refuse(res)
    return next()
  } catch (err) {
    return next(err)
  }
}


// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
    {
      method: ['POST'],
      matcher: '/store/payment-collections/:id/payment-sessions',
      middlewares: [requireLocationForManualSession],
    },
    {
      method: ['POST'],
      matcher: '/store/carts/:id/complete',
      middlewares: [requireLocationForManualCart],
    },
    {
      method: ['POST'],
      matcher: '/store/cash-collect/:id',
      middlewares: [requireLocation],
    },
    {
      method: ['POST'],
      matcher: '/store/cash-orders/:id/auto-capture',
      middlewares: [requireLocation],
    },
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
