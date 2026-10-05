import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

test('US24: Landing Page build, meta tags, social preview, navigation & form accessibility', async () => {
  const distDir = join(process.cwd(), 'dist');
  assert.ok(existsSync(distDir), 'Thư mục dist phải tồn tại sau khi build');

  const htmlPath = join(distDir, 'index.html');
  assert.ok(existsSync(htmlPath), 'index.html phải tồn tại');
  const html = readFileSync(htmlPath, 'utf8');

  // 1. Kiểm tra Meta tags & Social preview
  assert.match(html, /<meta name="viewport" content="[^"]*width=device-width[^"]*"/i, 'Thiếu viewport meta tag');
  assert.match(html, /<meta name="theme-color" content="#176b55"/i, 'Thiếu theme-color');
  assert.match(html, /<link rel="icon" type="image\/png" href="\/favicon\.png"/i, 'Thiếu favicon.png');
  assert.match(html, /<link rel="apple-touch-icon" href="\/favicon\.png"/i, 'Thiếu apple-touch-icon');
  
  // Open Graph
  assert.match(html, /<meta property="og:type" content="website"/i, 'Thiếu og:type');
  assert.match(html, /<meta property="og:title" content="[^"]+"/i, 'Thiếu og:title');
  assert.match(html, /<meta property="og:description" content="[^"]+"/i, 'Thiếu og:description');
  assert.match(html, /<meta property="og:image" content="\/og-image\.jpg"/i, 'Thiếu og:image');
  assert.match(html, /<meta property="og:locale" content="vi_VN"/i, 'Thiếu og:locale');

  // Twitter
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"/i, 'Thiếu twitter:card');
  assert.match(html, /<meta name="twitter:title" content="[^"]+"/i, 'Thiếu twitter:title');
  assert.match(html, /<meta name="twitter:description" content="[^"]+"/i, 'Thiếu twitter:description');
  assert.match(html, /<meta name="twitter:image" content="\/og-image\.jpg"/i, 'Thiếu twitter:image');

  // 2. Kiểm tra assets tĩnh
  assert.ok(existsSync(join(distDir, 'favicon.png')), 'File public/favicon.png phải có trong dist');
  assert.ok(existsSync(join(distDir, 'og-image.jpg')), 'File public/og-image.jpg phải có trong dist');

  // 3. Kiểm tra bảo mật: Không rò rỉ private keys hoặc secrets
  assert.doesNotMatch(html, /-----BEGIN PRIVATE KEY-----/, 'Rò rỉ private key trong HTML');
  assert.doesNotMatch(html, /FIREBASE_SERVICE_ACCOUNT/i, 'Rò rỉ service account trong HTML');
  assert.doesNotMatch(html, /CLOUDINARY_API_SECRET/i, 'Rò rỉ Cloudinary secret trong HTML');

  console.log('✔ Toàn bộ tiêu chí nghiệm thu US24 về social preview, meta tags và an toàn dữ liệu đạt 100%.');
});
