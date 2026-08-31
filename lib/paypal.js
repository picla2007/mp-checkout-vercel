// lib/paypal.js
// Helper compartido por los endpoints de PayPal. Vive FUERA de /api a
// propósito: en Vercel, cualquier archivo dentro de /api se convierte
// automáticamente en un endpoint público, así que el código compartido
// va acá.

// PAYPAL_ENV: 'live' (default, cobra plata real) o 'sandbox' (para probar
// gratis con cuentas de test). Se configura como variable de entorno en Vercel.
export function paypalApiBase() {
  const env = (process.env.PAYPAL_ENV || 'live').toLowerCase();
  return env === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

// Pide un access token OAuth2 (client_credentials) contra PayPal.
// Se pide uno nuevo en cada request: son gratis y evitamos manejar
// vencimientos/cache en funciones serverless que no comparten memoria.
export async function getPaypalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Faltan PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET en Vercel');
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`No se pudo autenticar con PayPal (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.access_token;
}

// Empaqueta la info de entrega en un string corto para meter en custom_id
// (PayPal limita custom_id a 127 caracteres). Si no entra todo, primero
// se saca el addon y, si igual no entra, se prioriza el download_url.
export function packCustomId({ nombre, download_url, addon, addon_download_url }) {
  const full = JSON.stringify({ n: nombre, d: download_url, a: addon, ad: addon_download_url });
  if (full.length <= 127) return full;

  const noAddon = JSON.stringify({ n: nombre, d: download_url });
  if (noAddon.length <= 127) return noAddon;

  return JSON.stringify({ d: download_url }).slice(0, 127);
}

export function unpackCustomId(customId) {
  try {
    const parsed = JSON.parse(customId || '{}');
    return {
      nombre: parsed.n || '',
      download_url: parsed.d || '',
      addon: parsed.a || '',
      addon_download_url: parsed.ad || ''
    };
  } catch {
    return { nombre: '', download_url: '', addon: '', addon_download_url: '' };
  }
}
