// Cloudflare Turnstile verification, reached as `virtual:turnstile`.
//
// That specifier is a Vite alias to a real generated file rather than a
// plugin-served virtual module: a plugin's resolveId is never consulted for an
// import that appears inside node_modules, so a package that depends on this
// one could not otherwise resolve it.

import type { AstroIntegration } from 'astro'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadEnv } from 'vite'
import { adapterKind, envModule } from './generated.ts'

export interface TurnstileOptions {
  /**
   * The secret key. Usually left unset so it is read from the environment.
   * Server-side only — never expose it.
   */
  secretKey?: string
  /** The variable holding the secret. @default "TURNSTILE_SECRET_KEY" */
  secretKeyEnv?: string
  /**
   * The public site key. Only read at build time to warn when it is missing —
   * the widget reads it on the client via `import.meta.env[siteKeyEnv]`.
   */
  siteKey?: string
  /** @default "PUBLIC_TURNSTILE_SITE_KEY" */
  siteKeyEnv?: string
  /** @default Cloudflare's siteverify endpoint */
  endpoint?: string
  /**
   * A module exporting `readEnv(name)`, for a host this integration does not
   * already know how to read. Rarely needed — Cloudflare and Node are handled.
   */
  env?: string
}

const NAME = '@golumin/turnstile'
const DEFAULT_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

const TYPES = `declare module 'virtual:turnstile' {
  import type {
    VerifyTurnstileOptions,
    TurnstileVerifyResult,
  } from '@golumin/turnstile/client'

  export const verifyTurnstile: (
    token: string,
    options?: VerifyTurnstileOptions,
  ) => Promise<TurnstileVerifyResult>
  export const isTurnstileConfigured: () => boolean
}
`

export default function turnstile(options: TurnstileOptions = {}): AstroIntegration {
  const {
    endpoint = DEFAULT_ENDPOINT,
    secretKeyEnv = 'TURNSTILE_SECRET_KEY',
    siteKeyEnv = 'PUBLIC_TURNSTILE_SITE_KEY',
  } = options

  return {
    name: NAME,
    hooks: {
      'astro:config:setup': ({ command, config, updateConfig, logger }) => {
        const root = fileURLToPath(config.root)

        // Resolved against the project root, not the working directory, so an
        // `astro dev --root <dir>` reads the right .env. `config.root` is a
        // URL. The empty prefix folds in shell exports as well as .env files.
        const env = loadEnv(command === 'dev' ? 'development' : 'production', root, '')
        const secretKey = options.secretKey ?? env[secretKeyEnv]
        const siteKey = options.siteKey ?? env[siteKeyEnv]

        if (!secretKey) {
          logger.warn(
            `no secret key baked in — set \`${secretKeyEnv}\` in the environment or pass \`secretKey\`. ` +
              `A deployed host falls back to its own \`${secretKeyEnv}\` secret; without either, verification is skipped.`
          )
        }
        if (!siteKey) {
          logger.warn(
            `no site key found — set \`${siteKeyEnv}\` so the widget can render on the client.`
          )
        }

        const generatedDir = path.join(root, '.astro', 'turnstile')
        mkdirSync(generatedDir, { recursive: true })
        const emit = (name: string, contents: string): string => {
          const file = path.join(generatedDir, `${name}.mjs`)
          const next = `${contents.trim()}\n`
          try {
            // Only written when it differs, so a watching dev server is not
            // restarted by a build that changed nothing.
            if (readFileSync(file, 'utf8') === next) return file
          } catch {
            // Not written yet.
          }
          writeFileSync(file, next)
          return file
        }

        const envFile = emit(
          'env',
          options.env
            ? `export { readEnv } from ${JSON.stringify(path.resolve(root, options.env))}`
            : envModule(adapterKind(config.adapter?.name))
        )

        const client = [
          `import { createVerifier, secretAvailable } from '@golumin/turnstile/client'`,
          `import { readEnv } from ${JSON.stringify(envFile)}`,
          `const config = { ...${JSON.stringify({ secretKey, secretKeyEnv, endpoint })}, readEnv }`,
          `export const verifyTurnstile = createVerifier(config)`,
          // The gate and the verifier resolve the secret the same way — baked
          // in first, then the host's own — so a build with no local copy
          // verifies against Cloudflare instead of failing closed, and the two
          // can never disagree about whether Turnstile is on.
          `export const isTurnstileConfigured = () => secretAvailable(config)`,
        ].join('\n')

        updateConfig({
          vite: {
            ssr: { noExternal: [NAME] },
            optimizeDeps: { exclude: [NAME] },
            resolve: {
              alias: [{ find: /^virtual:turnstile$/, replacement: emit('client', client) }],
            },
          },
        })
      },

      'astro:config:done': ({ injectTypes }) => {
        injectTypes({ filename: 'turnstile.d.ts', content: TYPES })
      },
    },
  }
}

export type { VerifyTurnstileOptions, TurnstileVerifyResult } from './runtime.ts'
