// api/paypal-client-id.js
// El Client ID de PayPal es información pública (se usa en el navegador,
// a diferencia del Secret que nunca sale del servidor). Este endpoint solo
// existe para no tener que hardcodear el Client ID directo en el HTML
// estático — así podés cambiarlo en Vercel sin tocar código.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const clientId = process.env.PAYPAL_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Falta configurar PAYPAL_CLIENT_ID en Vercel' });
  }

  return res.status(200).json({ clientId });
}
