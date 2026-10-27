# StreamGate — Telegram bot for selling subscription access to video content

A complete **subscription platform that runs inside Telegram**: users discover content through a bot, pay in crypto and watch through short-lived signed links; the owner runs everything from a protected web admin panel. One Node.js process serves the bot(s), the REST API, the video player and the admin UI.

It was originally built as a bot for selling premium video subscriptions. This repo is a **sanitized demo export**: branding and user-facing copy are neutral, and all credentials and subscriber data are removed. The engine is content-agnostic, so the same flow fits **online courses, coaching programs, fitness or training videos, premium channels or workshops**.

## What it does

**For subscribers (Telegram bot)**
- Menu with latest videos, search, categories, free previews and a monthly VIP drop reserved for monthly subscribers
- Weekly and monthly plans paid in **crypto** (NOWPayments), with automatic access activation on payment confirmation
- Free 2-hour trial for new users
- **Referral system** with tiers (more referrals, more free days) and a monthly cap
- Support relay: messages go to the admin's Telegram chat and replies come back inside the bot
- Playback through **signed, expiring JWT links** to a web player, so video URLs can't be shared indefinitely

**For the owner (web admin panel)**
- Login with password and optional **TOTP two-factor**, with **progressive brute-force lockout** (1 min, 5 min, 30 min, 1 h)
- Video catalogue with categories, free / premium / VIP types, uploads to IPFS
- Users and subscriptions management (grant or extend access, expiry handling)
- **Analytics** and a **broadcast** tool with pre-written message templates, including a win-back message for expired users
- **Multi-bot** support (a second bot for redundancy)
- Encrypted backups of the subscriber database sent to the admin

## Stack

Node.js (ESM) · Express · Telegraf (Telegram Bot API) · NOWPayments (crypto) · IPFS via Pinata · JSON Web Tokens · otplib (TOTP) · vanilla JS admin panel and player · GitHub API used as a simple persistence layer for the subscriber database.

## Engineering notes

- **Payments**: the NOWPayments IPN webhook is verified with an **HMAC-SHA512 signature over the raw request body** before any subscription is activated.
- **Privacy**: Telegram IDs are hashed and encrypted at rest (`utils/crypto.mjs`, salted with `ID_SALT`), so a leaked database doesn't directly expose user identities.
- **Auth**: admin sessions are short-lived JWTs; the lockout state machine lives in one place (`proxy/routes/adminLogin.js`).
- **Low-infra persistence**: subscribers and catalogue metadata are stored through the GitHub and Pinata APIs, which kept hosting needs minimal.
- Pricing constants are intentionally visible in `bot/bot.js` and `proxy/routes/payments.js` (they must match).

## Run it

```bash
cp .env.example .env     # fill in Telegram, Pinata, NOWPayments, JWT and admin secrets
npm install
npm start
```

`.env.example` documents every variable. No real credentials or data are included, and `config.json` is git-ignored.

## Status

Used in production, then set aside. Not packaged for third parties: expect to adapt copy, prices and hosting to your own project.

## License

[MIT](LICENSE): you are free to use, adapt and build on this code. Credit is appreciated.
