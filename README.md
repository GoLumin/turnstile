# @golumin/turnstile

An Astro integration for [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/):
a `virtual:turnstile` verifier that reads its secret wherever the host keeps it,
and tells you plainly when there is none.

## Requirements

Astro 6 or newer, Node 20 or newer. Nothing else.

## Install

```sh
npm install @golumin/turnstile
```

```js
// astro.config.mjs
import turnstile from '@golumin/turnstile'

integrations: [
  turnstile({
    secretKeyEnv: 'TURNSTILE_SECRET_TOKEN',
    siteKeyEnv: 'TURNSTILE_SITE_KEY',
  }),
]
```

```ts
import { isTurnstileConfigured, verifyTurnstile } from 'virtual:turnstile'

if (isTurnstileConfigured()) {
  const result = await verifyTurnstile(token, { remoteIp })
}
```

## What it does

- **The gate and the verifier agree.** `isTurnstileConfigured()` and
  `verifyTurnstile()` resolve the secret the same way — baked in at build time
  first, then the host's own secret — so a build with no local copy verifies
  against Cloudflare instead of failing closed, and the two can never disagree
  about whether Turnstile is on.
- **The secret is read where the host keeps it.** Cloudflare's reader is
  generated at build time, because `cloudflare:workers` resolves nowhere else;
  every other host falls back to `process.env`.
- **It warns at build time**, separately, when the secret or the public site key
  is missing — a missing site key means the widget never renders, which looks
  nothing like a missing secret.

## Options

| | |
|---|---|
| `secretKeyEnv` | the variable holding the secret. Default `TURNSTILE_SECRET_KEY` |
| `siteKeyEnv` | the public site key variable. Default `PUBLIC_TURNSTILE_SITE_KEY` |
| `secretKey`, `siteKey` | the values themselves, if you would rather not use the environment |
| `endpoint` | Cloudflare's `siteverify` endpoint |
| `env` | a module exporting `readEnv(name)`, for a host this does not know |

## Notes

`virtual:turnstile` is a Vite **alias** to a generated file under
`.astro/turnstile/`, not a plugin-served virtual module. A plugin's `resolveId`
is never consulted for an import that appears inside `node_modules`, so a
package that depends on this one could not otherwise resolve it.
