# Hair Beauty Store

A UK-based hair storefront, adapted from the supplied Glowify preview images. Prices, inventory, studio availability, delivery fees, and policies are sample data.

## Implemented

- Responsive home with a four-slide hair carousel, 28-product catalogue, product details, search, six categories, texture filters, sorting, and saved favorites. The pink and purple design follows the supplied Glowify screenshots.
- Flash sale, featured products, new arrivals, offers, hair tips, and a create-account section.
- Length-specific prices, quantities, a persistent bag, and the `BEAUTY10` product discount.
- Service appointment requests with a date, preferred time, and UK studio or virtual consultation.
- UK and international delivery, express delivery, UK collection, and a combined product/service checkout.
- GBP base prices with currency estimates from ExchangeRate-API. A dated snapshot works when the live rate service is unavailable. Display currencies are estimates, not a promise that Stripe supports every currency.
- A no-payment checkout preview saved in browser storage. Contact details and addresses are not included in those saved preview orders.
- A server-side Stripe test integration with catalog-validated amounts, idempotent session creation, test-order records, a token-protected return endpoint, and signed webhooks. The Site uses D1; Render uses PostgreSQL.
- ChatGPT-based sign-in on the hosted Site and email/password preview accounts on Render, with saved profiles and private support conversations. Support messages are stored in the host's database and polled while the chat is open.
- One-to-one virtual consultation requests in the support chat. Staff can confirm a time and provide an HTTPS meeting link in the customer's account. Video calls use the meeting link supplied by staff; the store does not host video itself.
- An administrator dashboard for verified test orders, delivery status, consultation requests, support replies, customer profiles, and signed-in activity. `ADMIN_USER_IDS` authorizes administrators server-side.
- An AI support endpoint using OpenAI Responses, with explicit chat consent and an unavailable state until the server key and model are configured.

## Run locally

Requires Node 22.13 or newer. Run commands from this directory.

```powershell
npm ci
npm run dev
```

The development server prints its local URL. For a local demo with customer/admin views, chat, and persistent SQLite data, run `npm run preview` and open `http://localhost:4173`. Use the **Customer view** and **Admin view** buttons. Demo records stay in ignored `.local-data/`; test payment and AI providers are not connected in this local demo. The older `preview:static` script serves a storefront-only view.

## Render free preview

`render.yaml` provisions a free Node web service and a free PostgreSQL database. Connect this repository as a Render Blueprint; it installs only the lightweight `render/` package and serves the same storefront with database-backed accounts, messages, bookings, and order records. Render initializes `render/schema.sql` on startup. `/health` checks the database connection.

Preview accounts have no email confirmation or password reset, so do not reuse an important password. The admin dashboard is protected by authenticated account ID. After creating the owner's account, set `ADMIN_USER_IDS` on the Render web service to that account ID, then redeploy; merely claiming an email address never grants admin access. The ID is shown on the admin access message. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, and `OPENAI_MODEL` in Render environment settings when ready. Leave payment and AI keys unset for a no-charge preview; checkout clearly reports that test payment is not yet configured.

The free database has a limited lifetime; export records or upgrade before it expires. The free web service may sleep when idle. This is a demonstration deployment, with no live payments or fulfilment.

```powershell
npm run check
npm test
npm run build
```

## Add Stripe test credentials

The owner chose to add their own test key later. No real credentials are included, and live keys are rejected.

For the development server, copy `.dev.vars.example` to `.dev.vars`, replace the placeholders privately, and restart `npm run dev`. For the hosted Site, set the same names as server-side runtime secrets using Sites environment settings. For Render, use its web-service environment settings. Never place a secret in `public/`, source control, or chat.

| Secret | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | An `sk_test_…` secret key from the Stripe test account. Enables hosted test Checkout. |
| `STRIPE_WEBHOOK_SECRET` | The `whsec_…` signing secret for the test webhook endpoint. |

For a new local D1 database with the Vinext development server, build once and apply all generated migrations in order. `npm run preview` applies them automatically to its separate `.local-data/` SQLite database.

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_ambitious_kate_bishop.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_careless_makkari.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_tranquil_war_machine.sql
```

The hosted deployment provisions the `DB` binding and applies the migration separately.

## Accounts, AI support, and administration

The hosted Site uses its own ChatGPT sign-in. Customer account creation there means signing in and saving a store profile; no passwords are stored by the Site. Render has separate email/password preview accounts and salted password hashes in PostgreSQL. To authorize the management dashboard, configure `ADMIN_USER_IDS` with the owner's ID from that host's account page. Site and Render IDs are separate. Without it, the admin API rejects access. Local demo role buttons exist only on the loopback Node preview; hosted deployments never enable them. The preview will show the ID on the admin access message if needed.

For AI support, enable the OpenAI Developers plugin's `openai-platform-api-key` setup and configure `OPENAI_API_KEY` and `OPENAI_MODEL` as hosted server secrets. Do not place the key in this repository or in a browser. Until these are set, AI replies remain unavailable and human support messages still work. Chat history is sent to OpenAI only after the customer selects AI support and consents. The AI can explain sample products and policies but cannot confirm orders, bookings, or refunds.

The dashboard reads order records, but does not change payment status. It allows delivery updates only after Stripe verifies a test payment. Consultation confirmations require a meeting link and prevent two confirmed bookings for the same UK time slot. No automated email or video service is configured; the customer reads replies and joining links in their account.

Test webhook endpoint: `/api/stripe/webhook`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`. For local webhook testing, Stripe CLI forwarding supplies a local signing secret. An owner-private Site requires sign-in, so Stripe cannot directly deliver webhooks to it; use local forwarding for webhook tests, or configure publicly reachable hosting before live launch. The authenticated browser return flow also checks the session directly with Stripe.

The server creates GBP-priced sessions with Adaptive Pricing enabled. Stripe determines available local currencies and payment methods for the account and customer. Shipping destination is locked to the selected country so changing destination cannot bypass delivery charges. Stripe confirms the shipping address on its hosted page. The database stores the item summary, amount, delivery option, country, and payment status, not card details.

References: [Stripe Checkout](https://docs.stripe.com/payments/checkout/quickstarts), [Checkout Sessions API](https://docs.stripe.com/api/checkout/sessions/create), [payment fulfilment](https://docs.stripe.com/checkout/fulfillment), [Adaptive Pricing](https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing).

## Verification and remaining launch work

The tests cover price tampering, options, quantities, product-only discounts, UK/international delivery, appointment dates, webhook signatures, cross-origin requests, order tokens, exact test-payment matching, admin access, private messages, staff replies, and booking confirmation. Browser walkthroughs covered account creation, virtual booking, support messaging, and dashboard activity. A production build passed.

Actual Stripe sessions, payment completion, and externally delivered webhooks need the owner's test credentials and remain unverified. The preview does not reserve real stock, confirm a stylist, dispatch a parcel, calculate live taxes/customs, or send confirmation emails. Before accepting real purchases, add the final catalog, UK studio address, fulfilment rules, tax configuration, business policies, customer support details, and live operational integrations. This version deliberately rejects live Stripe keys.

## Main files

- `public/app.js` — storefront screens and browser interactions.
- `public/styles.css` — responsive visual design.
- `public/glowify.css` and `public/workspace.css` — reference palette and customer/admin styles.
- `public/workspace.js` — account, chat, booking, and admin screens.
- `public/catalog.js` — products, variants, and services.
- `public/commerce.js` — trusted pricing and cart rules shared with the server.
- `server/api.mjs` — Stripe test sessions, verification, webhooks, and exchange rates.
- `server/workspace.mjs` — protected customer and administrator operations, including AI support when configured.
- `server-preview.mjs` — local demo server with SQLite and explicit customer/admin views.
- `render/` and `render.yaml` — Render Node server, PostgreSQL adapter and schema, preview account auth, and free Blueprint.
- `db/schema.ts` and `drizzle/` — persistent test-order schema and migration.
- `public/assets/` — generated photography and local illustrations. See `ASSETS.md` for image briefs.
- `.openai/hosting.json` — the existing Site identity and D1 binding; reuse this identity for publication.

The generated photographs are illustrative product imagery, not evidence of live stock. The source previews remain in the parent workspace's ignored `.reference/` directory.
