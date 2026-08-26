DeliveryFlow — Checkout + entrega automática con Mercado Pago y Zapier
Este proyecto tiene varias piezas que se despliegan juntas en Vercel:
```
mp-checkout-vercel/
├── index.html                  ← página de checkout DeliveryFlow (la que ve el comprador)
├── api/
│   ├── create-preference.js    ← crea el link de pago en Mercado Pago (dinámico, con addon)
│   ├── mp-webhook.js           ← recibe el aviso de "pago aprobado" y dispara la entrega
│   └── mp-checkout.js          ← (opcional) versión simple para el botón de la landing directa
└── README.md
```
El flujo completo
```
Landing → botón "Pagar" → DeliveryFlow (checkout con order bump)
   → /api/create-preference crea el pago en Mercado Pago
   → comprador paga
   → Mercado Pago avisa a /api/mp-webhook
   → mp-webhook VERIFICA el pago (nunca confía ciegamente en el aviso)
   → si está aprobado, reenvía los datos a tu webhook de Zapier
   → Zapier manda el email con el ebook/app (o lo que armes ahí)
```
---
Parte 1 — Desplegar en Vercel
Creá una cuenta gratis en https://vercel.com/signup
En https://vercel.com/new subí esta carpeta completa (o conectá un repo de GitHub con este contenido).
Andá a Settings → Environment Variables del proyecto y cargá:
Variable	Valor	Obligatoria
`MP_ACCESS_TOKEN`	Tu Access Token de Mercado Pago (ver Parte 2)	Sí
`ZAPIER_DELIVERY_WEBHOOK_URL`	La URL del Catch Hook de tu Zap de entrega (ver Parte 3)	No, pero sin esto nadie recibe el producto
`MP_CURRENCY`	Ej: `ARS`, `MXN`, `CLP`	No (default ARS)
Hacé Redeploy para que las variables tomen efecto.
Tu checkout va a quedar en algo como `https://tu-proyecto.vercel.app/`
---
Parte 2 — Mercado Pago
2.1 Access Token
En https://www.mercadopago.com.ar/developers/panel/app, creá o abrí tu aplicación y copiá el Access Token de producción.
2.2 Configurar el webhook de pagos (paso nuevo, importante)
Esto es lo que le avisa a tu sistema cuando un pago se aprueba:
En el panel de tu aplicación de Mercado Pago, andá a Webhooks (o "Notificaciones").
Agregá la URL: `https://tu-proyecto.vercel.app/api/mp-webhook`
Suscribite al evento "Pagos" (payments).
Guardá. Mercado Pago te va a pegar acá cada vez que un pago cambie de estado.
---
Parte 3 — Zapier (la entrega del producto)
Armá un Zap nuevo, separado del que ya usás para leads:
Trigger: Webhooks by Zapier → Catch Hook. Copiá la URL que te da.
Pegá esa URL como `ZAPIER_DELIVERY_WEBHOOK_URL` en Vercel (Parte 1, paso 3) y volvé a desplegar.
Action: lo que quieras que pase cuando alguien compra. Lo más común:
Email by Zapier o Gmail → mandarle al comprador un mail con el link de descarga.
Los campos que te llegan del webhook para usar en el mail:
`email` → a quién mandarle el mail
`nombre_producto` → nombre del producto comprado
`download_url` → el link de descarga del producto principal
`addon` / `addon_download_url` → si compró el order bump, su nombre y link
`monto`, `moneda`, `payment_id` → por si querés loguearlo en una planilla también
Podés encadenar varios Action steps en el mismo Zap: mandar el mail y agregar la fila a Google Sheets y notificarte por Slack, todo en la misma corrida.
Probar el Zap
Hacé un pago de prueba en modo sandbox de Mercado Pago, o simplemente probá el trigger manualmente con este `curl` simulando un pago aprobado (reemplazá con datos reales de un pago tuyo ya aprobado):
```bash
curl "https://tu-proyecto.vercel.app/api/mp-webhook?topic=payment&id=TU_PAYMENT_ID"
```
---
Parte 4 — Armar el link de tu producto
Cuando compartís o pegás el link de DeliveryFlow (en la landing, en redes, donde sea), armalo así:
```
https://tu-proyecto.vercel.app/?nombre=Mi Ebook&precio=9990&moneda=ARS&download=https://drive.google.com/tu-link-privado
```
Con order bump:
```
...&addon=Plantillas Extra&addon_precio=2990&addon_desc=10 plantillas editables&addon_download=https://drive.google.com/otro-link
```
Tip de seguridad: usá links de descarga que no sean adivinables (un ID largo de Drive, un link firmado de S3, etc.) — igual no son 100% privados si alguien los reenvía, pero alcanza para la gran mayoría de ventas de infoproductos. Si vendés algo de alto valor y necesitás control más fino (límite de descargas, expiración), avisame y lo armamos con un link firmado temporal en vez de un link fijo.
---
Conectar esto con la landing generadora
En el generador de landings, campo "Link de Mercado Pago", pegá la URL de tu checkout DeliveryFlow con los parámetros del producto ya armados (como en la Parte 4). El botón de la landing va a redirigir directo ahí — sin fetch, sin CORS, funciona siempre.
---
Notas
El plan gratuito de Vercel y el de Zapier (100 tasks/mes) alcanzan de sobra para arrancar.
Tu Access Token de Mercado Pago nunca sale de Vercel — nunca viaja al navegador del comprador.
`mp-webhook.js` siempre verifica el pago contra la API de Mercado Pago antes de avisar a Zapier — nunca confía en el contenido del aviso por sí solo (así evitás que alguien te "avise" un pago falso).
