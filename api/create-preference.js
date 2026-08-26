
// api/create-preference.js
// Función serverless (Vercel) que usa la página de checkout DeliveryFlow (index.html)
// para crear una preferencia de pago en Mercado Pago con el total correcto
// (producto base + addon si el comprador lo tildó).
//
// Clave: guardamos el link de descarga del producto en el "metadata" de la
// preferencia. Cuando Mercado Pago nos avise que el pago se aprobó
// (ver api/mp-webhook.js), vamos a poder recuperar ESE link exacto para
// mandárselo al comprador — sin necesidad de una base de datos.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Falta configurar MP_ACCESS_TOKEN en Vercel' });
  }

  try {
    const {
      email,
      nombre,
      moneda,
      precio_total,
      addon,
      download_url,        // link de descarga del producto principal (ebook/app)
      addon_download_url   // link de descarga del addon, si lo hay
    } = req.body || {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }
    const total = Number(precio_total);
    if (!total || total <= 0) {
      return res.status(400).json({ error: 'Precio inválido' });
    }

    const title = addon ? `${nombre} + ${addon}` : (nombre || 'Producto digital');
    const origin = req.headers.origin || req.headers.referer || undefined;

    // Guardamos todo lo necesario para la entrega en "metadata".
    // Mercado Pago nos lo devuelve intacto cuando consultamos el pago después.
    const metadata = {
      nombre: nombre || '',
      download_url: download_url || '',
      addon: addon || '',
      addon_download_url: addon_download_url || ''
    };

    const preferenceBody = {
      items: [{
        title: String(title).slice(0, 256),
        unit_price: total,
        quantity: 1,
        currency_id: moneda || 'ARS'
      }],
      payer: { email },
      metadata,
      external_reference: `df_${Date.now()}`,
      ...(origin
        ? { back_urls: { success: origin, failure: origin, pending: origin }, auto_return: 'approved' }
        : {})
    };

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`
      },
      body: JSON.stringify(preferenceBody)
    });

    const data = await mpRes.json();

    if (!mpRes.ok) {
      return res.status(mpRes.status).json({
        error: data.message || 'Mercado Pago rechazó la solicitud',
        detail: data
      });
    }

    return res.status(200).json({ url: data.init_point });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
}
