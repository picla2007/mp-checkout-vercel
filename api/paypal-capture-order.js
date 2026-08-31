
// api/paypal-capture-order.js
// Lo llama el botón de PayPal apenas el comprador aprueba el pago de su
// lado. Acá "capturamos" la orden (se efectiviza el cobro), verificamos
// que haya quedado COMPLETED, y devolvemos el link de descarga al
// instante — igual que hace success.html con Mercado Pago. También manda
// el mismo mail de aviso de venta que el webhook de MP, para que tengas
// registro de todas las ventas en un solo lugar.

import { getPaypalAccessToken, paypalApiBase, unpackCustomId } from '../lib/paypal.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { orderID, buyerEmail } = req.body || {};
  if (!orderID) return res.status(400).json({ ok: false, error: 'Falta orderID' });

  try {
    const accessToken = await getPaypalAccessToken();

    const captureRes = await fetch(`${paypalApiBase()}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const capture = await captureRes.json();

    if (!captureRes.ok) {
      console.error('Error capturando orden PayPal:', capture);
      return res.status(502).json({ ok: false, error: capture.message || 'No se pudo capturar el pago' });
    }

    if (capture.status !== 'COMPLETED') {
      return res.status(200).json({ ok: true, status: capture.status });
    }

    const purchaseUnit = capture.purchase_units?.[0];
    const customId = purchaseUnit?.payments?.captures?.[0]?.custom_id || purchaseUnit?.custom_id || '';
    const { nombre, download_url, addon, addon_download_url } = unpackCustomId(customId);

    const amount = purchaseUnit?.payments?.captures?.[0]?.amount;
    const captureId = purchaseUnit?.payments?.captures?.[0]?.id || capture.id;
    const payerEmail = buyerEmail || capture.payer?.email_address || '';

    await avisarVenta({
      buyerEmail: payerEmail,
      nombreProducto: nombre || 'tu producto',
      downloadUrl: download_url,
      addon,
      addonDownloadUrl: addon_download_url,
      monto: amount ? `${amount.value} ${amount.currency_code}` : '',
      paymentId: captureId,
      metodo: 'PayPal'
    });

    return res.status(200).json({
      ok: true,
      status: 'COMPLETED',
      nombre: nombre || 'tu producto',
      download_url,
      addon,
      addon_download_url
    });
  } catch (err) {
    console.error('Error en paypal-capture-order:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Error interno del servidor' });
  }
}

// Mismo formato de mail que usa mp-webhook.js, para que todas las ventas
// (MP y PayPal) te lleguen con la misma pinta a la misma bandeja.
async function avisarVenta({ buyerEmail, nombreProducto, downloadUrl, addon, addonDownloadUrl, monto, paymentId, metodo }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';
  const SELLER_NOTIFY_EMAIL = process.env.SELLER_NOTIFY_EMAIL || 'joselotobias@gmail.com';

  if (!RESEND_API_KEY) {
    console.warn('Falta RESEND_API_KEY — pago de PayPal aprobado pero no se avisó a nadie:', {
      buyerEmail, nombreProducto, downloadUrl
    });
    return;
  }

  const bumpBlock = addon && addonDownloadUrl ? `
    <p><strong>Addon comprado:</strong> ${addon}</p>
    <p><strong>Link del addon:</strong> <a href="${addonDownloadUrl}">${addonDownloadUrl}</a></p>
  ` : '';

  const html = `
    <p>🎉 Nueva venta aprobada (${metodo}) — entregala a mano por ahora:</p>
    <p><strong>Comprador:</strong> ${buyerEmail || '(sin email registrado)'}</p>
    <p><strong>Producto:</strong> ${nombreProducto}</p>
    <p><strong>Link de descarga:</strong> <a href="${downloadUrl || '#'}">${downloadUrl || ''}</a></p>
    ${bumpBlock}
    <p><strong>Monto:</strong> ${monto}</p>
    <p><strong>ID de pago:</strong> ${paymentId}</p>
    <hr>
    <p style="color:#888;font-size:12px;">Este mail te llega a vos (no al comprador) porque todavía no verificaste un dominio propio en Resend. Reenviale al comprador el link de descarga de arriba.</p>
  `;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: SELLER_NOTIFY_EMAIL,
      subject: `🎉 Nueva venta (${metodo}): ${nombreProducto} — entregar a ${buyerEmail}`,
      html
    })
  });

  if (!emailRes.ok) {
    const errBody = await emailRes.text();
    console.error('Error mandando el email de aviso de venta (PayPal):', emailRes.status, errBody);
  }
}
