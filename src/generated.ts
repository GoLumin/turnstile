// Code the integration writes at build time, once the host is known.
//
// Generated rather than shipped as a branch behind a runtime check, because the
// branch is not portable: `cloudflare:workers` does not resolve off Cloudflare.
// Emitting only the reader this site can use means the other never reaches the
// bundle.

export type Adapter = 'cloudflare' | 'netlify' | 'node' | 'unknown'

export function adapterKind(name: string | undefined): Adapter {
  if (!name) return 'unknown'
  if (name.includes('cloudflare')) return 'cloudflare'
  if (name.includes('netlify')) return 'netlify'
  if (name.includes('node')) return 'node'
  return 'unknown'
}

/** Reading a variable on one host, for the secret the build did not bake in. */
export function envModule(adapter: Adapter): string {
  if (adapter !== 'cloudflare') {
    // The client already falls back to process.env, so a Node host needs
    // nothing more.
    return 'export const readEnv = () => undefined'
  }
  return `
import { env } from 'cloudflare:workers'

export function readEnv(name) {
  try {
    const value = env[name]
    return value == null ? undefined : String(value)
  } catch {
    // Read outside a request, where the Worker env does not exist yet.
    return undefined
  }
}`
}
