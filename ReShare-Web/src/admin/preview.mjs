import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ADMIN_DEMO_TOOLCHAIN can reuse an existing toolchain without installing files
// elsewhere. All generated output and Vite cache stay under this admin folder.
const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(process.env.ADMIN_DEMO_TOOLCHAIN || root, 'package.json'));
const { build, createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href);
const config = {
  configFile: false,
  root,
  plugins: [vue()],
  cacheDir: resolve(root, '.preview/cache'),
  publicDir: false,
  resolve: { alias: { vue: require.resolve('vue/dist/vue.runtime.esm-bundler.js') } },
  build: { outDir: resolve(root, '.preview/dist'), emptyOutDir: true },
  server: { host: '127.0.0.1', port: Number(process.env.ADMIN_DEMO_PORT || 5173), strictPort: true, fs: { allow: [root, dirname(require.resolve('vue'))] } }
};
if (process.argv.includes('--build')) {
  await build(config);
} else {
  const server = await createServer(config);
  await server.listen();
  server.printUrls();
}
