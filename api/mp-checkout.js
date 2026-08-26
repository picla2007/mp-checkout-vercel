// api/mp-checkout.js
// Función serverless (Vercel) que crea una preferencia de pago en Mercado Pago
// con el total dinámico (producto base + order bumps tildados) y devuelve
// la URL de checkout lista para redirigir al comprador.
//
// La landing generada por el builder ya sabe llamar a este endpoint:
// solo hace falta pegar la URL de esta función (después de desplegarla)
// en el campo "Link de Mercado Pago" del generador.

export default async function handler(req, res) {
  // CORS: permite que tu landing (en cualquier dominio) llame a esta función
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) {
    return res.status(500).json({
      error: 'Falta configurar la variable de entorno MP_ACCESS_TOKEN en Vercel'
    });
  }

  try {
    const { items, payer_email, external_reference } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Faltan items para armar el pago' });
    }

    // Sanitizamos los items que vienen de la landing antes de mandarlos a Mercado Pago
    const cleanItems = items
      .filter(it => it && it.title && Number(it.unit_price) > 0)
      .map(it => ({
        title: String(it.title).slice(0, 256),
        unit_price: Number(it.unit_price),
        quantity: Math.max(1, Number(it.quantity) || 1),
        currency_id: process.env.MP_CURRENCY || 'ARS'
      }));

    if (cleanItems.length === 0) {
      return res.status(400).json({ error: 'Los items recibidos no son válidos' });
    }

    const origin = req.headers.origin || req.headers.referer || undefined;

    const preferenceBody = {
      items: cleanItems,
      external_reference: external_reference || `landing_${Date.now()}`,
      ...(payer_email ? { payer: { email: payer_email } } : {}),
      ...(origin
        ? {
            back_urls: { success: origin, failure: origin, pending: origin },
            auto_return: 'approved'
          }
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

    return res.status(200).json({ checkout_url: data.init_point });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
}

