// api/mp-verify-payment.js
// Lo llama la página de éxito (public/success.html) apenas el comprador
// vuelve de pagar. Recibe el payment_id que Mercado Pago agrega solo a
// la URL de vuelta y, IGUAL que en mp-webhook.js, nunca confía en eso:
// vuelve a preguntarle a la API de Mercado Pago si ese pago existe y
// está realmente aprobado antes de devolver el link de descarga.
//
// Solo devolvemos datos de entrega (nombre, links) — nunca el
// ACCESS_TOKEN ni datos sensibles del comprador.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) {
    return res.status(500).json({ ok: false, error: 'Falta configurar MP_ACCESS_TOKEN en Vercel' });
  }

  const paymentId = req.query?.payment_id || req.query?.collection_id;
  if (!paymentId) {
    return res.status(400).json({ ok: false, error: 'Falta payment_id' });
  }

  try {
    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
    });

    if (!payRes.ok) {
      return res.status(404).json({ ok: false, error: 'No se encontró ese pago' });
    }

    const payment = await payRes.json();
    const metadata = payment.metadata || {};

    return res.status(200).json({
      ok: true,
      status: payment.status, // 'approved' | 'pending' | 'in_process' | 'rejected' | ...
      nombre: metadata.nombre || payment.description || 'tu producto',
      download_url: metadata.download_url || '',
      addon: metadata.addon || '',
      addon_download_url: metadata.addon_download_url || ''
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Error interno del servidor' });
  }
}
