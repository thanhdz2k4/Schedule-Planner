# Skeddy User Relay

Relay nay nhan webhook tu Schedule Planner va gui lenh den `@SkeddyBot` bang **tai khoan Telegram cua ban** (khong phai bot).

## 1. Cai dat

```bash
cd skeddy-relay
npm install
```

## 2. Tao session string Telegram

1. Tao app o `https://my.telegram.org` de lay `API ID` va `API HASH`.
2. Chay script:

```bash
TELEGRAM_API_ID=123456 TELEGRAM_API_HASH=xxxx npm run session
```

3. Copy gia tri in ra va luu vao `TELEGRAM_SESSION_STRING`.

## 3. Cau hinh env

Tao file `.env` dua tren `.env.example`.

Bat buoc:
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_SESSION_STRING`
- `SKEDDY_RELAY_WEBHOOK_SECRET`

Quan trong:
- `SKEDDY_BOT_USERNAME=@SkeddyBot`
- `SKEDDY_CMD_CREATE_TEMPLATE`
- `SKEDDY_CMD_UPDATE_TEMPLATE`
- `SKEDDY_CMD_DELETE_TEMPLATE` (de trong neu khong muon auto xoa reminder)

## 4. Chay relay

```bash
npm start
```

Health check:
- `GET /health`

Webhook:
- `POST /webhook`

### Chay bang Docker

```bash
docker build -t skeddy-relay .
docker run --rm -p 8787:8787 --env-file .env skeddy-relay
```

## 5. Noi voi Schedule Planner

Trong app Schedule Planner (Vercel env):

- `SKEDDY_BRIDGE_WEBHOOK_URL=https://<relay-domain>/webhook`
- `SKEDDY_BRIDGE_WEBHOOK_SECRET=<giong SKEDDY_RELAY_WEBHOOK_SECRET>`

Khi task duoc tao/sua/xoa, app se tu dong ban webhook toi relay.

### Tu dong set env cho Vercel app

Tu root project:

```bash
node scripts/setup-skeddy-bridge.cjs --url https://<relay-domain>/webhook
```

Script se:
- tao secret moi
- set `SKEDDY_BRIDGE_WEBHOOK_URL`, `SKEDDY_BRIDGE_WEBHOOK_SECRET`, `SKEDDY_BRIDGE_TIMEOUT_MS` tren Vercel production
- in ra secret de ban copy sang relay env (`SKEDDY_RELAY_WEBHOOK_SECRET`)

Sau do deploy lai app.

## 6. Luu y

- Day la user automation. Ban can tu chiu trach nhiem voi Telegram ToS.
- Nen dung tai khoan Telegram phu de han che rui ro.
- Neu muon test ma khong gui that, dat `SKEDDY_RELAY_DRY_RUN=true` (luc nay khong can Telegram credentials).
