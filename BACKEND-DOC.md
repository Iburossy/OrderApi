# 📘 Backend NestJS - Guide Technique

## 🎯 Vue d'ensemble

Backend serverless NestJS déployé sur **AWS Lambda** avec :
- **Framework:** NestJS 10 + Express
- **Runtime:** Node.js 20 (Lambda)
- **DB:** PostgreSQL 15 (RDS)
- **Audit:** DynamoDB
- **Queue:** SQS

---

## 📁 Architecture Backend

```
backend/
├── src/
│   ├── main.ts              # Handler Lambda (serverless-express)
│   ├── app.module.ts        # Module principal (ConfigModule, TypeORM)
│   ├── orders/              # Module commandes
│   │   ├── orders.controller.ts    # Routes POST/GET /orders
│   │   ├── orders.service.ts       # Logique métier
│   │   ├── dto/create-order.dto.ts # Validation DTO
│   │   └── entities/order.entity.ts # Entité TypeORM
│   ├── audit/               # Module DynamoDB
│   │   └── audit.service.ts # Logging événements
│   └── config/
│       └── database.config.ts # Configuration TypeORM + SSL
└── package.json
```

---

## 🔧 Commandes Principales

```bash
# Installation
npm install

# Développement local (port 3000)
npm run start:dev

# Build pour Lambda
npm run build

# Tests
npm test
npm run test:cov

# Lint + Format
npm run lint
npm run format

# Build + Deploy CDK
npm run deploy
```

---

## 🚀 Endpoints API

| Méthode | Route | Description | Status |
|---------|-------|-------------|--------|
| POST | `/orders` | Créer une commande | ✅ 201 |
| GET | `/orders/:id` | Récupérer une commande | ✅ 200 |
| GET | `/health` | Health check | ✅ 200 |

---

## 📤 POST /orders

**Payload:**
```json
{
  "customerEmail": "test@example.com",
  "customerName": "Jean Dupont",
  "shippingAddress": "10 Rue de la Paix, Paris",
  "totalAmount": 299.99,
  "items": [
    {
      "productId": "prod-123",
      "productName": "MacBook Air",
      "quantity": 1,
      "unitPrice": 299.99
    }
  ]
}
```

**Headers (optionnel):**
```
x-idempotency-key: <uuid-v4>
```

**Flux interne:**
1. Validation DTO (class-validator)
2. Création en RDS (TypeORM)
3. Log audit en DynamoDB
4. Envoi message SQS
5. Retour 201 + Order ID

---

## 🔐 Validation & Sécurité

**ValidationPipe global :**
- `whitelist: true` - Supprime propriétés non décorées
- `forbidNonWhitelisted: true` - Rejette requêtes invalides
- `transform: true` - Conversion types automatique

**DTO CreateOrderDto :**
- Email valide
- Nom 2-255 caractères
- Adresse 5-500 caractères
- Montant 0.01-999999.99 (2 décimales max)
- Items min 1 élément

---

## 💾 Base de Données

**Configuration TypeORM :**
- Synchronize: `true` (crée tables automatiquement)
- SSL: `rejectUnauthorized: false` (RDS public)
- Connection Pool: max 5 connexions
- Idle Timeout: 1000ms (Lambda stateless)

**Entité Order :**
```typescript
- id: UUID (PK)
- customerEmail: string (indexed)
- customerName: string
- shippingAddress: string
- totalAmount: decimal(10,2)
- items: JSONB array
- status: enum (PENDING/PROCESSING/COMPLETED/FAILED)
- idempotencyKey: string (unique, nullable)
- createdAt, updatedAt, processedAt: timestamps
```

---

## 📊 Modules

### OrdersModule
- **Controller:** Routes HTTP
- **Service:** Logique création + SQS
- **DTO:** Validation entrées
- **Entity:** Modèle RDS

### AuditModule
- **Service:** Log événements DynamoDB
- **Table:** `order-audit-events`
- **Pattern:** Event sourcing (PK=ORDER#id, SK=EVENT#type#timestamp)

---

## ⚡ Optimisations Lambda

**Cold Start (~2-3s) :**
- Réutilisation serveur via closure `cachedServer`
- Connection pooling TypeORM
- Lazy loading AWS SDK

**Warm Invocation (~500ms) :**
- Serveur Express réutilisé
- DB connection réutilisée
- Pas de re-initialisation

---

## 🔗 Intégration CDK

**Lambda Layer :**
- `backend/layer/nodejs/node_modules/` → `/opt/nodejs` (Lambda)
- Contient toutes les dépendances NestJS
- Réduit taille du code Lambda (~45 MB vs 200+ MB)

**Déploiement :**
```bash
cd cdk
cdk deploy --require-approval never
```

---

## 📋 Variables d'Environnement

```bash
# .env (local dev)
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ordersdb
DB_USERNAME=postgres
DB_PASSWORD=password

# Lambda (via CDK)
DB_HOST=<RDS endpoint>
DB_PORT=5432
DB_NAME=ordersdb
DYNAMODB_TABLE=order-audit-events
SQS_QUEUE_URL=<queue URL>
AWS_REGION=eu-west-1
```

---

## 🧪 Tests Local

```bash
# Démarrer le serveur
npm run start:dev

# Créer une commande
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"customerEmail":"test@example.com",...}'

# Health check
curl http://localhost:3000/health
```

---

## 📚 Dépendances Clés

| Package | Rôle |
|---------|------|
| `@nestjs/core` | Framework |
| `@nestjs/typeorm` | ORM PostgreSQL |
| `@vendia/serverless-express` | Adapter Lambda |
| `aws-sdk` | Services AWS (DynamoDB, SQS) |
| `class-validator` | Validation DTO |
| `pg` | Driver PostgreSQL |
