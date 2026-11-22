'use strict';
/* M-Pesa (Safaricom Daraja) STK push. Live only when all env vars are set, otherwise the server runs in demo mode
   (orders are recorded but no money moves). Not yet exercised against the live Daraja API: test in the sandbox first.

   MPESA_ENV=sandbox|production   MPESA_KEY  MPESA_SECRET  MPESA_SHORTCODE  MPESA_PASSKEY
   MPESA_CALLBACK_BASE=https://tukosoko.com   MPESA_CALLBACK_SECRET=<long random string> */
const E = process.env;
const live = () => !!(E.MPESA_KEY && E.MPESA_SECRET && E.MPESA_SHORTCODE && E.MPESA_PASSKEY && E.MPESA_CALLBACK_BASE && E.MPESA_CALLBACK_SECRET);
const base = () => E.MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
let tok = null;

/* 0712345678 / +254712345678 / 712345678 -> 254712345678, or null */
function msisdn(p) {
  const d = String(p || '').replace(/\D/g, '');
  const m = /^(?:254|0)?([71]\d{8})$/.exec(d);
  return m ? '254' + m[1] : null;
}
async function token() {
  if (tok && tok.exp > Date.now()) return tok.v;
  const r = await fetch(base() + '/oauth/v1/generate?grant_type=client_credentials', { headers: { Authorization: 'Basic ' + Buffer.from(E.MPESA_KEY + ':' + E.MPESA_SECRET).toString('base64') } });
  if (!r.ok) throw new Error('M-Pesa auth failed (' + r.status + ')');
  const j = await r.json(); tok = { v: j.access_token, exp: Date.now() + (+j.expires_in - 60) * 1000 };
  return tok.v;
}
const stamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14);

/* Ask the customer's phone to approve a payment. Returns { checkout } or throws. */
async function stkPush({ phone, amount, ref, desc }) {
  const to = msisdn(phone); if (!to) throw new Error('Bad phone number');
  const ts = stamp(), pw = Buffer.from(E.MPESA_SHORTCODE + E.MPESA_PASSKEY + ts).toString('base64');
  const r = await fetch(base() + '/mpesa/stkpush/v1/processrequest', {
    method: 'POST', headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ BusinessShortCode: E.MPESA_SHORTCODE, Password: pw, Timestamp: ts, TransactionType: 'CustomerPayBillOnline', Amount: Math.max(1, Math.round(amount)),
      PartyA: to, PartyB: E.MPESA_SHORTCODE, PhoneNumber: to, CallBackURL: E.MPESA_CALLBACK_BASE.replace(/\/$/, '') + '/api/pay/mpesa/' + E.MPESA_CALLBACK_SECRET,
      AccountReference: String(ref).slice(0, 12), TransactionDesc: String(desc || 'Tukosoko').slice(0, 13) })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ResponseCode !== '0') throw new Error(j.errorMessage || j.ResponseDescription || 'M-Pesa request failed');
  return { checkout: j.CheckoutRequestID };
}
/* Parse Daraja's callback body. Returns { checkout, ok, receipt, amount } or null. */
function parseCallback(b) {
  const c = b && b.Body && b.Body.stkCallback; if (!c || !c.CheckoutRequestID) return null;
  const items = (c.CallbackMetadata && c.CallbackMetadata.Item) || [], get = (n) => (items.find(i => i.Name === n) || {}).Value;
  return { checkout: c.CheckoutRequestID, ok: c.ResultCode === 0, desc: c.ResultDesc, receipt: get('MpesaReceiptNumber') || null, amount: get('Amount') || 0 };
}
module.exports = { live, msisdn, stkPush, parseCallback };
