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

    // MODO MANUAL (temporal, hasta verificar un dominio propio en Resend):
    // Resend, sin dominio verificado, solo deja mandar mails a la casilla
    // dueña de la cuenta. Por eso, en vez de mandarle el mail directo al
    // comprador, te avisamos A VOS con todos los datos para que se lo
    // reenvíes a mano. El día que verifiques tu dominio, cambiá
    // SELLER_NOTIFY_EMAIL por buyerEmail en el "to" de abajo y listo,
    // vuelve a ser 100% automático.
    const SELLER_NOTIFY_EMAIL = process.env.SELLER_NOTIFY_EMAIL || 'joselotobias@gmail.com';

    if (RESEND_API_KEY) {
      const bumpBlock = metadata.addon && metadata.addon_download_url ? `
        <p><strong>Addon comprado:</strong> ${metadata.addon}</p>
        <p><strong>Link del addon:</strong> <a href="${metadata.addon_download_url}">${metadata.addon_download_url}</a></p>
      ` : '';

      const html = `
        <p>🎉 Nueva venta aprobada — entregala a mano por ahora:</p>
        <p><strong>Comprador:</strong> ${buyerEmail || '(sin email registrado)'}</p>
        <p><strong>Producto:</strong> ${nombreProducto}</p>
        <p><strong>Link de descarga:</strong> <a href="${metadata.download_url || '#'}">${metadata.download_url || ''}</a></p>
        ${bumpBlock}
        <p><strong>Monto:</strong> $${payment.transaction_amount} ${payment.currency_id}</p>
        <p><strong>ID de pago:</strong> ${payment.id}</p>
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
          subject: `🎉 Nueva venta: ${nombreProducto} — entregar a ${buyerEmail}`,
          html
        })
      });

      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        console.error('Error mandando el email de aviso de venta:', emailRes.status, errBody);
      }
    } else {
      console.warn('Falta RESEND_API_KEY — pago aprobado pero no se avisó a nadie:', {
        buyerEmail, nombreProducto, metadata
      });
    }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('Error en mp-webhook:', err);
    return res.status(200).send('ok'); // igual 200 para evitar reintentos infinitos de MP
  }
}
