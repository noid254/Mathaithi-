'use strict';
/* Kit renderer + design rules. One source of truth, used by:
   - the fan site (live preview), the team designer (admin), and the server (validation + print files).
   Works in the browser (window.Kit) and in Node (require('./kit.js')). No dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Kit = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var TEXTURES = [
    { id: 'plain', label: 'Plain' }, { id: 'hoops', label: 'Hoops' }, { id: 'stripes', label: 'Stripes' },
    { id: 'pinstripes', label: 'Pinstripes' }, { id: 'sash', label: 'Sash' }, { id: 'halves', label: 'Halves' },
    { id: 'checks', label: 'Checks' }, { id: 'diagonal', label: 'Diagonal' }
  ];
  var KINDS = ['home', 'away', 'third', 'training'];
  var HEX = /^#[0-9a-f]{6}$/i;
  var COLOR_KEYS = ['body', 'accent', 'trim', 'text'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function col(x, d) { return HEX.test(x) ? String(x).toLowerCase() : d; }
  function lum(h) {
    var n = parseInt(h.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  }
  /* WCAG contrast ratio, 1 to 21 */
  function contrast(a, b) { var x = lum(a), y = lum(b), hi = Math.max(x, y), lo = Math.min(x, y); return (hi + .05) / (lo + .05); }

  function defaults(primary, secondary) {
    primary = col(primary, '#f6c400'); secondary = col(secondary, '#0b0b0f');
    return { body: primary, accent: secondary, trim: secondary, text: secondary, texture: 'plain' };
  }
  function norm(spec, d) {
    d = d || defaults();
    spec = spec || {};
    var o = { texture: TEXTURES.some(function (t) { return t.id === spec.texture; }) ? spec.texture : 'plain' };
    COLOR_KEYS.forEach(function (k) { o[k] = col(spec[k], d[k]); });
    return o;
  }
  /* The three looks the original Mathaithi site shipped with, derived from the club colours. */
  function legacy(primary, secondary) {
    var h = defaults(primary, secondary);
    return {
      home: h,
      hoops: Object.assign({}, h, { texture: 'hoops' }),
      away: { body: h.accent, accent: h.body, trim: h.body, text: h.body, texture: 'diagonal' }
    };
  }

  /* Design limits. Returns { spec, errors }. Limits come from platform settings so they can be tuned without code. */
  function validate(spec, limits) {
    limits = limits || {};
    var errors = [], s = norm(spec, defaults());
    COLOR_KEYS.forEach(function (k) { if (!spec || !HEX.test(spec[k])) errors.push('Pick a valid colour for ' + k + '.'); });
    if (!spec || !TEXTURES.some(function (t) { return t.id === spec.texture; })) errors.push('Pick a texture from the list.');
    var min = limits.minContrast || 3;
    if (HEX.test(s.text) && HEX.test(s.body) && contrast(s.text, s.body) < min) errors.push('Name and number colour is too close to the shirt colour. They must be easy to read.');
    if (s.texture !== 'plain' && contrast(s.body, s.accent) < 1.5) errors.push('Pattern colour is too close to the shirt colour. The pattern would not show when printed.');
    return { spec: s, errors: errors };
  }

  function texture(t, s, id) {
    var a = s.accent, out = '';
    var i;
    if (t === 'hoops') [126, 184, 242].forEach(function (y) { out += '<rect x="0" y="' + y + '" width="300" height="30" fill="' + a + '"/>'; });
    else if (t === 'stripes') for (i = 0; i < 6; i++) out += '<rect x="' + (13 + i * 52) + '" y="0" width="26" height="320" fill="' + a + '"/>';
    else if (t === 'pinstripes') for (i = 0; i < 22; i++) out += '<rect x="' + (6 + i * 14) + '" y="0" width="3" height="320" fill="' + a + '"/>';
    else if (t === 'sash') out += '<rect x="-60" y="168" width="440" height="46" transform="rotate(38 150 190)" fill="' + a + '"/>';
    else if (t === 'halves') out += '<rect x="150" y="0" width="150" height="320" fill="' + a + '"/>';
    else if (t === 'checks') out += '<rect width="300" height="320" fill="url(#ck' + id + ')"/>';
    else if (t === 'diagonal') out += '<rect width="300" height="320" fill="url(#dg' + id + ')"/>';
    return out;
  }

  /* o: { view:'front'|'back', name, num, crest:url|null, short:'MU', sponsor:'', uid:'x', noText:bool, label:'aria text' } */
  function render(spec, o) {
    o = o || {};
    var s = norm(spec), view = o.view === 'back' ? 'back' : 'front', id = String(o.uid || 'k').replace(/[^\w]/g, '');
    var neck = view === 'back' ? 'Q150 40' : 'Q150 66';
    var body = 'M100 22 L62 36 L8 86 L44 122 L72 100 L72 300 L228 300 L228 100 L256 122 L292 86 L238 36 L200 22 ' + neck + ' 100 22 Z';
    var halo = s.texture === 'plain' ? '' : ' stroke="' + s.body + '" stroke-width="7" stroke-linejoin="round" paint-order="stroke"';
    var r = '<svg viewBox="0 0 300 320" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-label="' + esc(o.label || 'Shirt') + ', ' + view + '">';
    r += '<defs><clipPath id="cp' + id + '"><path d="' + body + '"/></clipPath>' +
      '<pattern id="dg' + id + '" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="5" height="16" fill="' + s.accent + '" opacity=".4"/></pattern>' +
      '<pattern id="ck' + id + '" width="56" height="56" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="' + s.accent + '"/><rect x="28" y="28" width="28" height="28" fill="' + s.accent + '"/></pattern></defs>';
    r += '<path d="' + body + '" fill="' + s.body + '"/><g clip-path="url(#cp' + id + ')">' + texture(s.texture, s, id) +
      '<polygon points="8,86 44,122 56,110 20,74" fill="' + s.trim + '"/><polygon points="292,86 256,122 244,110 280,74" fill="' + s.trim + '"/><rect x="72" y="292" width="156" height="8" fill="' + s.trim + '"/></g>';
    r += '<path d="M100 22 ' + neck + ' 200 22" fill="none" stroke="' + s.trim + '" stroke-width="9"/><path d="' + body + '" fill="none" stroke="rgba(128,128,128,.55)" stroke-width="2"/>';
    if (view === 'front') {
      if (o.crest) r += '<image href="' + esc(o.crest) + '" xlink:href="' + esc(o.crest) + '" x="196" y="62" width="36" height="36"/>';
      else r += '<circle cx="214" cy="80" r="17" fill="' + s.trim + '"/><text x="214" y="86" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="15" fill="' + s.body + '">' + esc(String(o.short || '').slice(0, 3)) + '</text>';
      if (o.sponsor) {
        var sp = String(o.sponsor).toUpperCase().slice(0, 16);
        r += '<text x="150" y="152" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="' + Math.min(26, Math.floor(120 / (sp.length * .56))) + '" letter-spacing="1" fill="' + s.text + '"' + halo + '>' + esc(sp) + '</text>';
      }
    } else if (!o.noText) {
      var nm = String(o.name || 'YOUR NAME').toUpperCase().slice(0, 12), nu = (o.num === '' || o.num == null) ? '10' : String(o.num).slice(0, 2);
      r += '<text x="150" y="98" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="' + Math.min(30, Math.floor(150 / (nm.length * .56))) + '" letter-spacing="1" fill="' + s.text + '"' + halo + '>' + esc(nm) + '</text>' +
        '<text x="150" y="208" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="118" fill="' + s.text + '"' + halo + '>' + esc(nu) + '</text>';
    }
    return r + '</svg>';
  }

  /* Readable text colour for a shirt colour: first of the preferences (then white, then near-black) that passes the contrast rule. */
  function autoText(body, prefs) { var l = (prefs || []).concat(['#ffffff', '#0b0b0f']); for (var i = 0; i < l.length; i++) if (HEX.test(l[i]) && contrast(l[i], body) >= 3) return l[i]; return '#ffffff'; }
  /* Starter Home and Away kits for a new club, guaranteed to pass validate(). */
  function autoKits(primary, secondary) {
    primary = col(primary, '#1fa463'); secondary = col(secondary, '#ffffff');
    return [
      { name: 'Home', kind: 'home', spec: { body: primary, accent: secondary, trim: secondary, text: autoText(primary, [secondary]), texture: 'plain' } },
      { name: 'Away', kind: 'away', spec: { body: secondary, accent: primary, trim: primary, text: autoText(secondary, [primary]), texture: 'plain' } }
    ];
  }

  return { autoKits: autoKits, autoText: autoText, TEXTURES: TEXTURES, KINDS: KINDS, COLOR_KEYS: COLOR_KEYS, render: render, validate: validate, defaults: defaults, norm: norm, legacy: legacy, contrast: contrast };
});
