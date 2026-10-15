import { Agent } from 'node:https'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// Development-only, fixed-destination proxies. TLS verification stays enabled.
// Node uses the cloud environment's existing trusted CA configuration.
const providers = {
  nominatim: 'https://nominatim.openstreetmap.org',
  forecast: 'https://api.open-meteo.com',
  archive: 'https://archive-api.open-meteo.com',
  air: 'https://air-quality-api.open-meteo.com',
}
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    proxy: Object.fromEntries(
      Object.entries(providers).map(([name, target]) => [
        `/external/${name}`,
        {
          target,
          changeOrigin: true,
          secure: true,
          agent: new Agent({ proxyEnv: process.env }),
          rewrite: (path: string) => path.replace(`/external/${name}`, ''),
          headers: { 'User-Agent': 'BoogerAtlas/0.1 (local development)' },
        },
      ]),
    ),
  },
})
