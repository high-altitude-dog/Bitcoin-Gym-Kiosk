# Bitcoin Gym Kiosk

**English** · [Español](#español)

An open source self-service kiosk for gyms. Members pick drinks, snacks and supplements on a wall-mounted tablet and pay from
their own phone with **Bitcoin Lightning** or a **bank QR**. Lightning invoices are created and
confirmed through [CoinOS.io](https://coinos.io) and its [API](https://coinos.io/docs). A sale is complete only when
the payment provider confirms it. **Ark**, through [Second](https://second.tech), will shortly be added as an additional
payment method.

It is built on [MedusaJS](https://medusajs.com). It is designed so that adding more gyms later means a new stock
location and a new tablet, not a redesign.

## How it works

```text
 Tablet kiosk (React)  ──┐                         ┌─▶ Yadio       BOB/BTC rate when a Lightning invoice is made
                         ├─▶  Medusa backend  ─────┼─▶ Coinos      Lightning invoices, payment webhook
 Medusa admin (staff)  ──┘    Postgres + Redis     ├─▶ Bank API    bank QR in fiat local currency (not connected yet)
                                                   └─▶ Slack       sales, low stock, payment alerts
```

1. The member taps products on the tablet; Medusa builds the cart in local currency against the gym's stock.
2. They choose **Bitcoin⚡** or **Bank QR**. For Lightning, the backend converts the fiat local currency amount to sats at the current
   Yadio rate and creates a short-lived invoice at Coinos; the tablet shows it as a QR code with a countdown.
3. The member pays from any Lightning wallet. Coinos calls the backend's webhook, the backend re-checks the invoice
   with Coinos, and only then does Medusa create the order and reserve stock. The tablet shows "¡Gracias!" with the
   order number and what to take.
4. Self-serve items are fulfilled automatically; items handed over by staff or brought by a partner café are posted to
   their own Slack channels.

Prices are always set and shown in fiat local currency; sats are worked out only when an invoice is created, and the rate and amount
are stored on the order. A daily job reconciles Coinos's payment history against Medusa's orders.

## What's in the repo

```text
backend/                      Turborepo workspace (npm)
├── apps/backend/             Medusa 2 application
│   └── src/
│       ├── modules/coinos-lightning/      Payment provider: Lightning via Coinos, rates from Yadio
│       ├── modules/slack-notification/    Notification provider posting to Slack incoming webhooks
│       ├── api/hooks/coinos/              Fast webhook route for Coinos payment confirmations
│       ├── api/store/lightning-availability/  Tells the kiosk whether Lightning can be offered right now
│       ├── jobs/                          Daily Coinos reconciliation, "paid but no order" alert
│       ├── subscribers/                   Fulfilment by product type, Slack alerts, product housekeeping
│       └── scripts/                       Setup and catalogue scripts (`npx medusa exec ./src/scripts/<name>.ts`)
└── apps/kiosk/               Tablet storefront: Vite + React + TypeScript, Medusa JS SDK
    ├── src/                  Screens, kiosk state machine (state/useKiosk.ts), design tokens
    └── tests/e2e/            Playwright end-to-end suites against a mocked Store API
deploy/
├── nginx/                    nginx site config (kiosk at the apex, Medusa at api.)
└── backup/                   Nightly pg_dump + uploaded images, as a systemd service and timer
docs/                         Specs for planned features
```

`CLAUDE.md` is the detailed project log: design decisions, the deployment runbook, gotchas found along the way, and
the open checklist. Read it before changing payments or deploying.

## The kiosk app

- Designed for an 11" Android tablet (1200 × 1920) running in Fully Kiosk Browser. It works **in portrait and in
  landscape**, and members can turn the tablet at any time: the layout changes without losing the cart, a live
  invoice or the place in the product list.
- Spanish (Bolivia) UI, dark theme ("Kiosko Byte, La Paz") with Byte, [Second](https://second.tech)'s mascot.
- Built for an unattended device: instant feedback on every tap, a 60-second idle reset (paused while a payment is
  in progress), an offline-capable app shell, automatic retries when the backend can't be reached, and a "tell a
  staff member" screen if a paid order can't be completed.

## Running it locally

**You need:** Node.js 20.19+ (or 22.12+), PostgreSQL 15+ and Redis (Postgres 17 and Redis 8 are used in
development), and a [Coinos](https://coinos.io) account for real Lightning invoices.

```bash
cd backend
npm install

# Backend configuration: copy the template and fill it in (database, secrets, Coinos, Slack)
cp apps/backend/.env.template apps/backend/.env

cd apps/backend
npx medusa db:migrate
npx medusa user -e <your-email> -p <a-password>      # admin login
npx medusa exec ./src/scripts/setup-armor-gym.ts     # region, stock location, sales channel, publishable key
npx medusa exec ./src/scripts/create-armor-gym-products.ts
npx medusa exec ./src/scripts/remove-demo-data.ts    # removes the Medusa starter's demo data
npx medusa develop                                   # http://localhost:9000, admin at /app
```

`setup-armor-gym.ts` prints the kiosk's publishable key. Put it in the kiosk's environment and start the kiosk:

```bash
cd backend/apps/kiosk
cp .env.example .env        # VITE_MEDUSA_BACKEND_URL and VITE_MEDUSA_PUBLISHABLE_KEY
npx vite --port 5173        # http://localhost:5173
```

Notes:

- **Credentials live only in `.env` files**, which are git-ignored. Never commit them. See the comments in
  `.env.example` for what each variable is and where to get it; Yadio needs no key, and the Coinos webhook secret is
  one you generate yourself.
- **Coinos can't reach `localhost`.** A paid invoice won't be confirmed by webhook on a local backend unless you
  expose it (for example with ngrok). Completing the cart re-checks Coinos directly, so local testing still works.
- The setup scripts are idempotent and safe to re-run. Their names reflect the gym this instance was built for;
  change the names and catalogue for another gym.

## Tests

```bash
cd backend/apps/backend && npm run test:unit   # payment provider, Coinos/Yadio clients, jobs, product rules, Slack
cd backend/apps/kiosk && npm run test:e2e      # kiosk in portrait and landscape, ~80 s
```

The kiosk suites build the app and drive it in headless Chromium against a mock of the Store API, so they need no
backend. They need a Chromium (`npx playwright install chromium`); see `backend/apps/kiosk/tests/e2e/README.md`.

## Deployment

The pilot runs on a single Google Cloud VM (Debian, e2-medium) with Medusa, Postgres and Redis, behind nginx and
Let's Encrypt. The kiosk is served as static files; Medusa runs as a systemd service. Updates are pulled from this
repo with a read-only deploy key. Backups run nightly, plus a daily disk snapshot.

The full runbook, including the traps (Medusa's build wiping uploads and `.env`, image URLs that don't follow a
domain change, SSH key handling on GCP), is in `CLAUDE.md` under "Deploying to the VM", "Domain and HTTPS" and
"Database backups". Use `backend/apps/backend/scripts/build.sh` rather than `medusa build` directly.

## Status

Working: Lightning payments end to end on the deployed backend, the kiosk in both orientations, automatic
fulfilment for self-serve items, Slack alerts, reconciliation and backups.

Coming shortly: **Ark payments through [Second](https://second.tech)**, as an additional payment method alongside
Lightning and bank QR. A coin toss will determine whether to route the payment through CoinOS or second.tech,
failing-over to each other.

Not done yet: the bank QR (waiting on API access from the bank; the kiosk has a placeholder with a manual
"Pagado" button for now), partner café items, and multi-gym features, which wait until a second gym exists. The
open checklist is in `CLAUDE.md`.

## Acknowledgements

Thank you to [Second](https://second.tech) for **Byte**, their mascot, who appears throughout the kiosk: on the
start-screen and shop walls, jumping rope while the kiosk reconnects, through the hoops while an invoice is made,
with a banana while the order is empty, and with a bone on "¡Gracias!". Byte's artwork and animations are used in this project and remain theirs (see [NOTICE.md](NOTICE.md)).

## License

[MIT](LICENSE), for the code and documentation. The artwork (Byte, Second's mascot and the wall
images that include him), the Lightning logo and the product photos are **not** covered: see [NOTICE.md](NOTICE.md).
The backend was started from Medusa's [DTC starter](https://docs.medusajs.com), which is also MIT-licensed
(`backend/LICENSE`).

---

# Español

[English](#bitcoin-gym-kiosk) · **Español**

Un kiosco de autoservicio de código abierto para gimnasios. Los socios eligen bebidas, snacks y suplementos en una tableta montada en la
pared y pagan desde su propio celular con **Bitcoin Lightning** o con un **QR bancario**. Las facturas Lightning se
crean y se confirman a través de [CoinOS.io](https://coinos.io) y su [API](https://coinos.io/docs). Una venta solo se
completa cuando el proveedor de pago la confirma. Pronto se añadirá **Ark**, a través de
[Second](https://second.tech), como un método de pago adicional.

Está construido sobre [MedusaJS](https://medusajs.com) y diseñado para que añadir más gimnasios en el futuro
signifique una nueva ubicación de inventario y una nueva tableta, no un rediseño.

## Cómo funciona

```text
 Kiosco en tableta (React) ──┐                         ┌─▶ Yadio       tasa BOB/BTC al crear una factura Lightning
                             ├─▶  Backend Medusa  ─────┼─▶ Coinos      facturas Lightning, webhook de pago
 Admin de Medusa (personal) ─┘    Postgres + Redis     ├─▶ Bank API    QR bancario en moneda fiat local (aún no conectado)
                                                       └─▶ Slack       ventas, stock bajo, alertas de pago
```

1. El socio toca los productos en la tableta; Medusa arma el carrito en moneda local según el stock del gimnasio.
2. Elige **Bitcoin⚡** o **QR bancario**. Para Lightning, el backend convierte el monto en moneda fiat local a sats con la tasa
   actual de Yadio y crea en Coinos una factura de corta duración; la tableta la muestra como código QR con una
   cuenta regresiva.
3. El socio paga desde cualquier billetera Lightning. Coinos llama al webhook del backend, el backend vuelve a
   verificar la factura con Coinos y solo entonces Medusa crea el pedido y reserva el stock. La tableta muestra
   "¡Gracias!" con el número de pedido y lo que hay que llevar.
4. Los productos de autoservicio se despachan automáticamente; los que entrega el personal o trae una cafetería
   asociada se publican en sus propios canales de Slack.

Los precios siempre se fijan y se muestran en moneda fiat local; los sats se calculan solo al crear una factura, y la tasa y el monto
se guardan en el pedido. Un proceso diario concilia el historial de pagos de Coinos con los pedidos de Medusa.

## Qué hay en el repositorio

```text
backend/                      Espacio de trabajo Turborepo (npm)
├── apps/backend/             Aplicación Medusa 2
│   └── src/
│       ├── modules/coinos-lightning/      Proveedor de pago: Lightning vía Coinos, tasas de Yadio
│       ├── modules/slack-notification/    Proveedor de notificaciones que publica en webhooks de Slack
│       ├── api/hooks/coinos/              Ruta rápida de webhook para las confirmaciones de pago de Coinos
│       ├── api/store/lightning-availability/  Le dice al kiosco si puede ofrecer Lightning en este momento
│       ├── jobs/                          Conciliación diaria con Coinos, alerta de "pagado sin pedido"
│       ├── subscribers/                   Despacho por tipo de producto, alertas de Slack, mantenimiento de productos
│       └── scripts/                       Scripts de configuración y catálogo (`npx medusa exec ./src/scripts/<nombre>.ts`)
└── apps/kiosk/               Tienda para la tableta: Vite + React + TypeScript, Medusa JS SDK
    ├── src/                  Pantallas, máquina de estados del kiosco (state/useKiosk.ts), tokens de diseño
    └── tests/e2e/            Pruebas end-to-end con Playwright contra una Store API simulada
deploy/
├── nginx/                    Configuración del sitio en nginx (kiosco en el dominio raíz, Medusa en api.)
└── backup/                   pg_dump nocturno + imágenes subidas, como servicio y temporizador de systemd
docs/                         Especificaciones de funciones planificadas
```

`CLAUDE.md` es el registro detallado del proyecto: decisiones de diseño, el manual de despliegue, los problemas
encontrados en el camino y la lista de pendientes. Léelo antes de cambiar los pagos o desplegar.

## La app del kiosco

- Diseñada para una tableta Android de 11" (1200 × 1920) que corre en Fully Kiosk Browser. Funciona **en vertical y
  en horizontal**, y los socios pueden girar la tableta en cualquier momento: el diseño cambia sin perder el carrito,
  una factura activa ni el lugar en la lista de productos.
- Interfaz en español (Bolivia), tema oscuro ("Kiosko Byte, La Paz") con Byte, la mascota de
  [Second](https://second.tech).
- Hecha para un equipo sin atención: respuesta inmediata en cada toque, reinicio tras 60 segundos de inactividad
  (en pausa mientras hay un pago en curso), una app que funciona sin conexión, reintentos automáticos cuando no se
  puede llegar al backend y una pantalla de "avisa a un miembro del personal" si un pedido pagado no se puede completar.

## Ejecutarlo en local

**Necesitas:** Node.js 20.19+ (o 22.12+), PostgreSQL 15+ y Redis (en desarrollo se usan Postgres 17 y Redis 8), y una
cuenta de [Coinos](https://coinos.io) para facturas Lightning reales.

```bash
cd backend
npm install

# Configuración del backend: copia la plantilla y complétala (base de datos, secretos, Coinos, Slack)
cp apps/backend/.env.template apps/backend/.env

cd apps/backend
npx medusa db:migrate
npx medusa user -e <tu-correo> -p <una-contraseña>    # acceso al admin
npx medusa exec ./src/scripts/setup-armor-gym.ts     # región, ubicación de inventario, canal de ventas, clave publicable
npx medusa exec ./src/scripts/create-armor-gym-products.ts
npx medusa exec ./src/scripts/remove-demo-data.ts    # elimina los datos de demostración del starter de Medusa
npx medusa develop                                   # http://localhost:9000, admin en /app
```

`setup-armor-gym.ts` imprime la clave publicable del kiosco. Ponla en el entorno del kiosco e inicia el kiosco:

```bash
cd backend/apps/kiosk
cp .env.example .env        # VITE_MEDUSA_BACKEND_URL y VITE_MEDUSA_PUBLISHABLE_KEY
npx vite --port 5173        # http://localhost:5173
```

Notas:

- **Las credenciales solo van en archivos `.env`**, que git ignora. Nunca los subas al repositorio. Los comentarios de
  `.env.example` explican cada variable y dónde obtenerla; Yadio no necesita clave, y el secreto del webhook de Coinos
  lo generas tú.
- **Coinos no puede llegar a `localhost`.** Una factura pagada no se confirmará por webhook en un backend local a menos
  que lo expongas (por ejemplo con ngrok). Al completar el carrito se vuelve a consultar a Coinos directamente, así
  que las pruebas en local siguen funcionando.
- Los scripts de configuración son idempotentes y se pueden volver a ejecutar sin riesgo. Sus nombres corresponden al
  gimnasio para el que se construyó esta instancia; cambia los nombres y el catálogo para otro gimnasio.

## Pruebas

```bash
cd backend/apps/backend && npm run test:unit   # proveedor de pago, clientes de Coinos/Yadio, jobs, reglas de productos, Slack
cd backend/apps/kiosk && npm run test:e2e      # kiosco en vertical y en horizontal, ~80 s
```

Las pruebas del kiosco compilan la app y la manejan en Chromium sin interfaz contra una Store API simulada, así que no
necesitan backend. Necesitan un Chromium (`npx playwright install chromium`); ver
`backend/apps/kiosk/tests/e2e/README.md`.

## Despliegue

El piloto corre en una sola VM de Google Cloud (Debian, e2-medium) con Medusa, Postgres y Redis, detrás de nginx y
Let's Encrypt. El kiosco se sirve como archivos estáticos; Medusa corre como servicio de systemd. Las actualizaciones
se descargan de este repositorio con una clave de despliegue de solo lectura. Hay copias de seguridad cada noche, más
una instantánea diaria del disco.

El manual completo, con las trampas (el build de Medusa que borra las imágenes subidas y el `.env`, las URL de imágenes
que no siguen un cambio de dominio, el manejo de claves SSH en GCP), está en `CLAUDE.md` en "Deploying to the VM",
"Domain and HTTPS" y "Database backups". Usa `backend/apps/backend/scripts/build.sh` en lugar de `medusa build`
directamente.

## Estado

Funciona: pagos Lightning de punta a punta en el backend desplegado, el kiosco en ambas orientaciones, despacho
automático de los productos de autoservicio, alertas de Slack, conciliación y copias de seguridad.

Próximamente: **pagos con Ark a través de [Second](https://second.tech)**, como método de pago adicional junto a
Lightning y el QR bancario. Se lanzará una moneda para decidir si el pago pasa por CoinOS o por second.tech, y si uno
falla se usará el otro.

Pendiente: el QR bancario (a la espera del acceso a la API del banco; por ahora el kiosco tiene una pantalla
provisional con un botón manual de "Pagado"), los productos de la cafetería asociada y las funciones para varios
gimnasios, que esperan a que exista un segundo gimnasio. La lista de pendientes está en `CLAUDE.md`.

## Agradecimientos

Gracias a [Second](https://second.tech) por **Byte**, su mascota, que aparece en todo el kiosco: en los murales de la
pantalla de inicio y de la tienda, saltando la cuerda mientras el kiosco se reconecta, pasando por los aros mientras
se crea una factura, con una banana mientras el pedido está vacío y con un hueso en "¡Gracias!". Las ilustraciones y
animaciones de Byte se usan en este proyecto y siguen siendo suyas (ver [NOTICE.md](NOTICE.md)).

## Licencia

[MIT](LICENSE), para el código y la documentación. Las ilustraciones (Byte, la mascota de Second, y
los murales que lo incluyen), el logo de Lightning y las fotos de productos **no** están cubiertas: ver
[NOTICE.md](NOTICE.md). El backend partió del [starter DTC](https://docs.medusajs.com) de Medusa, que también tiene
licencia MIT (`backend/LICENSE`).
