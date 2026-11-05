import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { inventoryMode } from './src/admin/inventory/inventory.mode.js'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  inventoryMode({ ...env, DEV: command === 'serve' && mode !== 'production' })
  const siteUrl = env.PUBLIC_SITE_URL?.trim()
  const socialImageUrl = siteUrl ? new URL('/og-image.jpg', siteUrl).href : '/og-image.jpg'
  return {
    plugins: [vue(), {
      name: 'reshare-social-preview',
      transformIndexHtml(html) {
        return html.replaceAll('content="/og-image.jpg"', `content="${socialImageUrl}"`)
      },
    }],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      proxy: {
        '/v1/contact': {
          target: env.VITE_CONTACT_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
