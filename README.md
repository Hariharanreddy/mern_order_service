# Pizza Delivery Platform - Order Service (`mernspace-c-order-service`)

The **Order Service** is a core microservice in the Pizza Delivery Platform. It manages order placement, customer profiles, delivery addresses, discount coupons, credit card/cash payments, and coordinates asynchronous event workflows using Apache Kafka.

---

## 🛠️ Technology Stack

- **Core**: Node.js & TypeScript (running on Express)
- **Database**: MongoDB (Mongoose ODM) with Transaction support (Sessions) for idempotency and ordering integrity
- **Event Broker**: Apache Kafka (`kafkajs`) for distributed event streaming and data replication
- **Payment Gateway**: Stripe API (`stripe`) for secure billing & card transactions
- **Authentication**: JWT token validation using `express-jwt` and `jwks-rsa` (via asymmetric RS256 keys)
- **Configuration Management**: `node-config` (supporting hierarchical profiles and environment variables)
- **Logging**: Winston logger for centralized, structured error and event logging

---

## 📂 Project Structure

```bash
mernspace-c-order-service/
├── config/                     # Configuration files (default, dev, production mapping)
│   ├── custom-environment-variables.json
│   ├── default.json
│   └── development.json
├── docs/                       # Technical documentations
│   ├── architecture.md         # Detailed sequence flows and system charts
│   └── kafka.md                # Kafka message structures
├── src/                        # Application source
│   ├── common/                 # Shared middleware and factories
│   │   ├── factories/          # Factory classes (e.g., brokerFactory)
│   │   └── middleware/         # Auth validation & global error handlers
│   ├── config/                 # DB, Kafka broker, and Winston logger instantiations
│   ├── coupon/                 # Coupon model, routing, and verification controller
│   ├── customer/               # Customer profile creation and address book controller
│   ├── idempotency/            # Mongoose schema for API idempotency tracking
│   ├── order/                  # Core order routing, calculations, models, and controllers
│   ├── payment/                # Stripe Gateway wrapper and webhook handler
│   ├── productCache/           # Local replicated cache of catalog products
│   ├── toppingCache/           # Local replicated cache of catalog toppings
│   ├── types/                  # Common TypeScript interfaces & enums
│   ├── app.ts                  # Express application setup (CORS, JSON parsers, Routers)
│   └── utils.ts                # Middleware error wrappers and utilities
├── server.ts                   # Service entry point (Starts DB, Kafka client, and HTTP server)
└── tsconfig.json               # TypeScript compiler config
```

---

## 🔄 Core Workflows

### 1. Catalog Pricing Synchronization (Kafka Consuming)
To eliminate synchronous cross-service HTTP calls to the Catalog Service during checkout validation, the Order Service maintains a local read-only cache of products and toppings.
- Whenever a product or topping is created/modified/deleted in the Catalog Service, a Kafka event is published.
- The Order Service listens to the `product` and `topping` topics (via [KafkaBroker](file:///e:/Hari/Desktop/Code/Pizza/Delivery/Platform/mernspace-c-order-service/src/config/kafka.ts)), parsing incoming payloads and syncing them to local MongoDB collections (`productCache` and `toppingCache`).

### 2. Order Placement & Idempotency
- When a customer submits an order, the frontend must supply an `idempotency-key` header.
- The service performs a transaction:
  1. Checks if the `idempotency-key` is already present in MongoDB.
  2. If found, returns the cached order response without re-processing.
  3. If not found, computes the total cart cost using pricing configurations fetched from the local caches (`ProductPricingCache` & `ToppingPricingCache`).
  4. Resolves any applied coupon codes and checks validity against the expiry date.
  5. Calculates taxes (18% flat rate) and delivery charges (100 INR flat rate).
  6. Creates the order document with `paymentStatus: PENDING` and `orderStatus: RECEIVED` inside a **MongoDB Session Transaction**, saving the idempotency key simultaneously.
  
### 3. Payment Processing & Kafka Events
- If the payment mode is `CARD`:
  1. Redirects the user to a secure **Stripe Checkout Session**.
  2. Dispatches an `ORDER_CREATE` event to the `order` Kafka topic.
  3. Returns the checkout URL to the client.
- If the payment mode is `CASH`:
  1. Dispatches an `ORDER_CREATE` event to the `order` Kafka topic.
  2. Returns a null payment URL to let the frontend know no card redirection is needed.

### 4. Stripe Webhooks
- The server exposes a `/payments/webhook` endpoint listening to Stripe events.
- On receipt of a `checkout.session.completed` event:
  1. Retrieves the session details from Stripe.
  2. Checks if `payment_status` is `paid`.
  3. Updates the order's `paymentStatus` to `PAID` (or `FAILED` if canceled/declined).
  4. Dispatches a `PAYMENT_STATUS_UPDATE` event to the Kafka `order` topic to notify downstream services (like Notification or Delivery).

---

## ⚙️ Configuration Guide

The service relies on `node-config` and maps variables using environment variables in production. Below are the key environment configurations expected:

| Variable | Description | Default (Local) |
| --- | --- | --- |
| `PORT` | The HTTP server listening port | `5503` |
| `DATABASE_URL` | MongoDB connection URI | `mongodb://localhost:27017/order` |
| `JWKS_URI` | JSON Web Key Sets URI from Auth Service | `http://localhost:5501/.well-known/jwks.json` |
| `STRIPE_SECRET_KEY`| Stripe API private key | `mock-stripe-secret-key` |
| `KAFKA_BROKER` | Array of Kafka bootstrap server addresses | `["localhost:9092"]` |
| `KAFKA_SSL` | Enable SSL for Kafka connections | `false` |
| `KAFKA_SASL_USERNAME`| Kafka username (Production) | `""` |
| `KAFKA_SASL_PASSWORD`| Kafka password (Production) | `""` |
| `CLIENT_UI_URL` | Frontend Customer client URL (CORS allowed) | `http://localhost:3000` |
| `ADMIN_UI_URL` | Frontend Admin/Manager portal URL (CORS allowed) | `http://localhost:5173` |

---

## 🚀 Running the Service

### Installation
Ensure you have Node.js (v18+) and install all packages:
```bash
npm install
```

### Run in Development Mode
Starts the application with `nodemon` and auto-reloading:
```bash
npm run dev
```

### Build & Compilation
Checks linting and compiles TypeScript source into the `dist/` directory:
```bash
npm run build
```

### Code Styling & Linters
Format the codebase using Prettier:
```bash
npm run format
```
Check for syntactic or styling errors via ESLint:
```bash
npm run lint
```
