// api/mp-webhook.js
// Mercado Pago llama a esta URL automáticamente cada vez que cambia el
// estado de un pago (la configurás una sola vez en tu panel de MP).
//
// Acá pasa lo importante:
//  1. Recibimos el aviso (solo trae un ID, nunca hay que confiar en el
//     contenido del aviso en sí — por seguridad, siempre volvemos a
//     preguntarle a Mercado Pago "¿este pago realmente se aprobó?").
//  2. Si está aprobado, sacamos el email del comprador y los links de
//     descarga que guardamos en el metadata al crear la preferencia.
//  3. Le mandamos el email de entrega DIRECTO con Resend (sin pasar por
//     Zapier — así no depende de un plan pago ni de que un Zap esté
//     publicado).
//
// IMPORTANTE: Mercado Pago necesita una respuesta 200 rápida o reintenta
// el envío. Por eso esta función no hace nada lento: verifica y manda.

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).send('Método no permitido');
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';

  if (!ACCESS_TOKEN) {
    console.error('Falta MP_ACCESS_TOKEN');
    return res.status(200).send('ok'); // 200 igual, para que MP no reintente en loop
  }

  try {
    // Mercado Pago manda el id del pago de dos formas posibles según el tipo
    // de notificación (IPN clásico por query string, o Webhooks v2 por body).
    const paymentId =
      req.query?.['data.id'] ||
      req.body?.data?.id ||
      req.query?.id ||
      null;

    const topic = req.query?.topic || req.body?.type;

    // Solo nos interesan las notificaciones de pagos (ignoramos merchant_order, etc.)
    if (!paymentId || (topic && topic !== 'payment')) {
      return res.status(200).send('ignored');
    }

    // Verificamos el pago REAL contra la API de Mercado Pago.
    // Nunca confiamos en datos que vengan directo del webhook sin verificar.
    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
    });

    if (!payRes.ok) {
      console.error('No se pudo verificar el pago', paymentId, payRes.status);
      return res.status(200).send('ok');
    }

    const payment = await payRes.json();

    if (payment.status !== 'approved') {
      // pending, rejected, in_process, etc. — no entregamos nada todavía.
      return res.status(200).send('not approved yet');
    }

    const metadata = payment.metadata || {};
    const buyerEmail = payment.payer?.email || '';
    const nombreProducto = metadata.nombre || payment.description || 'tu producto';

    if (buyerEmail && RESEND_API_KEY) {
      const bumpBlock = metadata.addon && metadata.addon_download_url ? `
        <p>También incluye tu bonus:</p>
        <p><a href="${metadata.addon_download_url}">${metadata.addon_download_url}</a></p>
      ` : '';

      const html = `
        <p>¡Hola!</p>
        <p>Gracias por tu compra. Acá tenés el acceso a ${nombreProducto}:</p>
        <p><a href="${metadata.download_url || '#'}">${metadata.download_url || ''}</a></p>
        ${bumpBlock}
        <p>Cualquier duda, respondé este mismo mail.</p>
        <p>¡Saludos!</p>
      `;

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: buyerEmail,
          subject: `Tu acceso a ${nombreProducto} ya está listo 🎉`,
          html
        })
      });

      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        console.error('Error mandando el email de entrega:', emailRes.status, errBody);
      }
    } else {
      console.warn('Falta RESEND_API_KEY o el email del comprador — pago aprobado pero no se entregó nada:', {
        buyerEmail, nombreProducto, metadata
      });
    }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('Error en mp-webhook:', err);
    return res.status(200).send('ok'); // igual 200 para evitar reintentos infinitos de MP
  }
}
