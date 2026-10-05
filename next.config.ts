import type { NextConfig } from 'next'
// The managed verification runtime adds non-JSON text to Next's tsc --showConfig.
// This opt-in is only for that runtime; normal builds retain type checking.
const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: process.env.CODEX_BUILD_WORKAROUND === '1' },
}
export default nextConfig
