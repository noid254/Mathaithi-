'use strict';
/* End-to-end checks against a throwaway server. Run: node test.js */
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-')), PORT = 3999, B = 'http://127.0.0.1:' + PORT;
const srv = spawn(process.execPath, ['server.js'], { env: Object.assign({}, process.env, { PORT, DATA_DIR: dir, BASE_DOMAIN: 'tukosoko.com' }), stdio: 'pipe' });
const http = require('http');
const j = (m, u, body, tok, host) => new Promise((ok, no) => {
  const data = body ? JSON.stringify(body) : null;
  const q = http.request({ host: '127.0.0.1', port: PORT, path: u, method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}, host ? { Host: host } : {}, data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }, (res) => {
    let t = ''; res.on('data', c => t += c); res.on('end', () => { let d; try { d = JSON.parse(t); } catch (e) { d = t; } ok({ s: res.statusCode, d }); });
  }); q.on('error', no); if (data) q.write(data); q.end();
});
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };

(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(B + '/api/public'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
  const sup = (await j('POST', '/api/login', { username: 'super', password: 'super123' })).d.token;

  console.log('signup');
  let r = await j('GET', '/api/signup/check?slug=www'); ok(!r.d.ok, 'reserved address rejected');
  r = await j('GET', '/api/signup/check?slug=mathaithi'); ok(!r.d.ok, 'taken address rejected');
  r = await j('GET', '/api/signup/check?slug=ngong'); ok(r.d.ok && r.d.host === 'ngong.tukosoko.com', 'free address accepted');
  const form = { name: 'Ngong Stars FC', slug: 'ngong', short: 'NGS', est: 2015, town: 'Ngong', primary: '#f6c400', secondary: '#ffffff', squads: ['A', 'U13'], trainDays: ['tue', 'sat'], trainTime: '16:00', features: { shop: true, tickets: true, fundraising: true, training: true }, owner: 'Jane Wanjiru', email: 'jane@example.com', password: 'longpassword1' };
  r = await j('POST', '/api/signup', Object.assign({}, form, { password: 'short' })); ok(r.s === 400, 'short password rejected');
  r = await j('POST', '/api/signup', Object.assign({}, form, { email: 'nope' })); ok(r.s === 400, 'bad email rejected');
  r = await j('POST', '/api/signup', form); ok(r.s === 200 && r.d.token && r.d.host === 'ngong.tukosoko.com', 'club created');
  const tok = r.d.token;
  r = await j('POST', '/api/signup', form); ok(r.s === 400, 'duplicate address rejected');
  r = await j('GET', '/api/public', null, null, 'ngong.tukosoko.com'); const pub = r.d;
  ok(pub.team.name === 'Ngong Stars FC' && pub.team.approved === false, 'subdomain serves the new club, unapproved');
  ok(pub.team.features.shop === false && pub.kits.length === 0, 'shop and kits hidden until approved');
  ok(pub.team.squads.length === 2 && pub.training.length === 2 && pub.posts.length === 1 && pub.team.about.includes('Ngong'), 'starter content generated from answers');
  ok(pub.players.length === 0 && pub.standings.length === 1, 'no Mathaithi content leaks into the new club');
  r = await j('GET', '/api/public', null, null, 'ghost.tukosoko.com'); ok(r.s === 404, 'unknown subdomain is 404');

  console.log('login and isolation');
  r = await j('POST', '/api/login', { username: 'jane@example.com', password: 'longpassword1' }); ok(r.s === 200, 'club admin can sign in with email');
  r = await j('GET', '/api/admin/matches', null, tok); ok(r.s === 200 && r.d.length === 0, 'admin sees only own matches');
  r = await j('GET', '/api/super/teams', null, tok); ok(r.s === 403, 'club admin cannot reach super admin');

  console.log('kit designer limits');
  r = await j('GET', '/api/admin/kits', null, tok); ok(r.d.kits.length === 2 && r.d.kits.every(k => k.price === 1650), 'starter Home and Away kits created at KSh 1,650');
  const homeId = r.d.kits[0].id, good = { name: 'Third', kind: 'third', markup: 500, spec: { body: '#1fa463', accent: '#ffffff', trim: '#ffffff', text: '#ffffff', texture: 'hoops' } };
  r = await j('POST', '/api/admin/kits', Object.assign({}, good, { spec: Object.assign({}, good.spec, { text: '#1fb065' }) }), tok); ok(r.s === 400 && /readable|close/i.test(r.d.error), 'unreadable name colour rejected');
  r = await j('POST', '/api/admin/kits', Object.assign({}, good, { spec: Object.assign({}, good.spec, { texture: 'tartan' }) }), tok); ok(r.s === 400, 'texture outside the list rejected');
  r = await j('POST', '/api/admin/kits', Object.assign({}, good, { spec: Object.assign({}, good.spec, { body: 'red' }) }), tok); ok(r.s === 400, 'non-hex colour rejected');
  r = await j('POST', '/api/admin/kits', Object.assign({}, good, { markup: 999999 }), tok); ok(r.s === 200 && r.d.markup === 1500 && r.d.price === 2500, 'markup clamped to the allowed range');
  r = await j('POST', '/api/admin/kits', Object.assign({}, good, { sponsor: '<script>x</script>' }), tok); ok(r.s === 200 && !/[<>]/.test(r.d.sponsor), 'sponsor text sanitised');
  const kitId = r.d.id;

  console.log('shop is closed until the platform approves');
  const order = (host, items, extra) => j('POST', '/api/orders', Object.assign({ team: 'ngong', name: 'Amani', phone: '0712345678', items }, extra || {}));
  const kitLine = { kind: 'kit', ref: homeId, pname: 'Amani', num: '7', size: 'M', price: 1 };
  r = await order(null, [kitLine], { delivery: { method: 'pickup', town: 'Ngong', point: 'Ngong Mall' } }); ok(r.s === 403, 'unapproved club cannot take orders');
  r = await j('PUT', '/api/super/teams/ngong', { approved: true }, sup); ok(r.s === 200, 'super admin approves the club');
  r = await j('GET', '/api/public', null, null, 'ngong.tukosoko.com'); ok(r.d.kits.length === 4 && r.d.team.features.shop, 'kits and shop appear after approval');

  console.log('orders');
  r = await order(null, [kitLine]); ok(r.s === 400 && /receive/i.test(r.d.error), 'physical order needs a delivery choice');
  r = await order(null, [kitLine], { delivery: { method: 'parcel', town: 'Ngong', address: '' } }); ok(r.s === 400, 'parcel needs an address');
  r = await order(null, [Object.assign({}, kitLine, { size: 'XXXL' })], { delivery: { method: 'pickup', town: 'Ngong', point: 'Ngong Mall' } }); ok(r.s === 400, 'size outside the list rejected');
  r = await order(null, [Object.assign({}, kitLine, { ref: 'nope' })], { delivery: { method: 'pickup', town: 'Ngong', point: 'Ngong Mall' } }); ok(r.s === 400, 'unknown kit rejected');
  r = await order(null, [kitLine], { delivery: { method: 'pickup', town: 'Ngong', point: 'Ngong Mall' } }); ok(r.s === 200 && r.d.total === 1650 + 150 && r.d.mode === 'demo', 'price comes from the server (client price ignored), plus pickup fee');
  const oid = r.d.id;
  r = await order(null, [kitLine], { fan: true, delivery: { method: 'parcel', town: 'Nairobi', address: 'Moi Ave, Shop 4' } }); ok(r.s === 200 && r.d.total === 1650 + 300, 'fan discount refused for a phone that is not a registered fan');
  await j('POST', '/api/fans', { team: 'ngong', phone: '0712345678', name: 'Amani' });
  r = await order(null, [kitLine], { fan: true, delivery: { method: 'parcel', town: 'Nairobi', address: 'Moi Ave, Shop 4' } }); ok(r.s === 200 && r.d.total === 1650 - 165 + 300, 'fan discount and parcel fee applied');
  r = await j('GET', '/api/admin/summary', null, tok); ok(r.d.orders === 3 && r.d.expected === 2 * Math.round(650 * .9) + Math.round((650 - 165) * .9), 'club share = markup less discount less platform fee');
  r = await j('GET', '/api/admin/orders', null, tok); ok(r.d[0].delivery && r.d[0].items[0].custom.name === 'AMANI', 'order carries delivery details and the custom name');
  r = await j('GET', '/api/orders/status?id=' + oid + '&phone=0712345678'); ok(r.d.paid === true, 'order status lookup works with the phone number');
  r = await j('GET', '/api/orders/status?id=' + oid + '&phone=0799999999'); ok(r.s === 404, 'order status hidden from the wrong phone');
  r = await order(null, [{ kind: 'ticket', ref: 'nope' }]); ok(r.s === 400, 'ticket for a missing match rejected');

  console.log('print file and kit closing');
  r = await fetch(B + '/api/super/orders/' + oid + '/print?i=0&view=back', { headers: { Authorization: 'Bearer ' + sup } }); const svg = await r.text();
  ok(r.status === 200 && svg.startsWith('<svg') && svg.includes('AMANI'), 'printer file renders the buyer\'s name');
  r = await j('PUT', '/api/admin/kits/' + homeId, { name: 'Home', kind: 'home', markup: 650, closes: new Date(Date.now() - 1000).toISOString(), spec: (await j('GET', '/api/admin/kits', null, tok)).d.kits[0].spec }, tok);
  r = await order(null, [kitLine], { delivery: { method: 'pickup', town: 'Ngong', point: 'Ngong Mall' } }); ok(r.s === 400 && /closed/i.test(r.d.error), 'closed kit drive refuses orders');

  console.log('CMS collections, profile, leads, giving');
  r = await j('POST', '/api/admin/players', { n: 'Test Player', sq: 'A', pos: 'Striker', no: 9, age: 20 }, tok); ok(r.s === 200, 'player added');
  r = await j('POST', '/api/admin/standings', { n: 'Rivals FC', w: 3, d: 1, l: 0 }, tok); ok(r.s === 200 && r.d.p === 4, 'table row added, played computed');
  r = await j('PUT', '/api/admin/profile', { motto: 'Up the Stars', primary: '#123456', about: 'New about text.' }, tok); ok(r.s === 200 && r.d.motto === 'Up the Stars', 'profile updated');
  r = await j('POST', '/api/admin/players', { n: 'X' }, (await j('POST', '/api/login', { username: 'coach', password: 'coach123' })).d.token); ok(r.s === 200, 'Mathaithi admin can add to its own club');
  r = await j('GET', '/api/admin/players', null, tok); ok(r.d.length === 1 && r.d[0].n === 'Test Player', 'each club sees only its own players');
  r = await j('POST', '/api/leads', { team: 'ngong', type: 'enrol', data: { name: 'Mama Tito', phone: '0711222333', who: 'Parent' } }); ok(r.s === 200 && /^L-/.test(r.d.ref), 'enrolment form reaches the club inbox');
  r = await j('POST', '/api/leads', { team: 'ngong', type: 'enrol', data: { name: 'x', phone: '12' } }); ok(r.s === 400, 'bad phone on a lead rejected');
  r = await j('GET', '/api/admin/leads', null, tok); ok(r.d.length === 1 && r.d[0].type === 'enrol', 'club admin reads its inbox');
  r = await j('POST', '/api/admin/funds', { t: 'Kit fund', acct: 'KIT', goal: 50000, got: 0, d: 'x' }, tok); const fid = r.d.id;
  r = await j('POST', '/api/give', { team: 'ngong', fund: fid, amount: 20, phone: '0712345678' }); ok(r.s === 400, 'donation below KSh 50 rejected');
  r = await j('POST', '/api/give', { team: 'ngong', fund: fid, amount: 500, phone: '0712345678' }); ok(r.s === 200 && r.d.mode === 'demo', 'donation recorded in demo mode');
  r = await j('GET', '/api/public', null, null, 'ngong.tukosoko.com'); ok(r.d.funds[0].got === 0, 'demo donations do not inflate fund totals');

  console.log('mathaithi unchanged');
  r = await j('GET', '/api/public'); ok(r.d.team.id === 'mathaithi' && r.d.kits.length === 3 && r.d.players.length === 13 && r.d.kits.every(k => k.price === 1650), 'Mathaithi keeps its content, three kits and KSh 1,650 price');

  console.log('\n' + n + ' checks passed');
})().catch(e => { console.error('\nFAILED:', e.message); process.exitCode = 1; }).finally(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
