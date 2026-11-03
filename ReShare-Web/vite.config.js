import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { assertPublicEnvironment, assertNoSecrets } from './build-security.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  assertPublicEnvironment(env)
  const siteUrl = env.PUBLIC_SITE_URL?.trim()
  const socialImageUrl = siteUrl ? new URL('/og-image.jpg', siteUrl).href : '/og-image.jpg'
  return {
    plugins: [vue(), {
      name: 'reshare-build-security',
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          assertNoSecrets(output.type === 'chunk' ? output.code : String(output.source), env)
        }
      },
    }, {
      name: 'reshare-social-preview',
      transformIndexHtml(html) {
        return html.replaceAll('content="/og-image.jpg"', `content="${socialImageUrl}"`)
      },
    }],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: { sourcemap: false },
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
