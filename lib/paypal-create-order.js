
// api/paypal-create-order.js
// Lo llama el botón de PayPal del checkout (index.html) al arrancar el pago.
// Crea la orden en PayPal con el monto en USD, y guarda el link de
// descarga empaquetado en custom_id para poder entregarlo apenas se
// confirme el pago (igual que hacemos con metadata en Mercado Pago).

import { getPaypalAccessToken, paypalApiBase, packCustomId } from '../lib/paypal.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { nombre, precio_total, download_url, addon, addon_download_url } = req.body || {};

    const amount = Number(precio_total);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Falta un precio_total válido' });
    }
    if (!download_url) {
      return res.status(400).json({ error: 'Falta download_url' });
    }

    const accessToken = await getPaypalAccessToken();

    const orderRes = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            description: (nombre || 'Producto digital').slice(0, 127),
            custom_id: packCustomId({ nombre, download_url, addon, addon_download_url }),
            amount: {
              currency_code: 'USD',
              value: amount.toFixed(2)
            }
          }
        ]
      })
    });

    const order = await orderRes.json();

    if (!orderRes.ok) {
      console.error('Error creando orden PayPal:', order);
      return res.status(502).json({ error: order.message || 'Error creando la orden en PayPal' });
    }

    return res.status(200).json({ id: order.id });
  } catch (err) {
    console.error('Error en paypal-create-order:', err);
    return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
}
