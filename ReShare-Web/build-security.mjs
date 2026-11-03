const sensitiveName = /(?:SECRET|PRIVATE_KEY|SERVICE_ACCOUNT|PASSWORD|ACCESS_TOKEN|ID_TOKEN)/i

export function assertPublicEnvironment(env) {
  const unsafe = Object.keys(env).filter(name => name.startsWith('VITE_') && sensitiveName.test(name) && env[name])
  if (unsafe.length) throw new Error(`Không đưa secret vào biến frontend: ${unsafe.join(', ')}`)
}

export function assertNoSecrets(text, env = {}) {
  const markers = [/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, /["']type["']\s*:\s*["']service_account["']/,
    /CLOUDINARY_API_SECRET\s*[:=]/, /FIREBASE_SERVICE_ACCOUNT\s*[:=]/]
  if (markers.some(pattern => pattern.test(text))) throw new Error('Phát hiện thông tin máy chủ trong bản build; không được triển khai.')
  for (const [name, value] of Object.entries(env)) {
    if (sensitiveName.test(name) && typeof value === 'string' && value.length >= 12 && text.includes(value)) {
      throw new Error(`Giá trị bí mật của ${name} xuất hiện trong bản build.`)
    }
  }
}
