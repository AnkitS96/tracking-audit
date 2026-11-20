/* Tracking Audit: checks for pixel / Conversions API setups and product catalogs.
 * Pure functions, no dependencies. Works in the browser (window.TrackingAudit) and Node (module.exports).
 * ponytail: rules are starter rules kept in plain tables below. Verify against each platform's current docs. */
(function (root) {
  const f = (severity, rule, message, where) => ({ severity, rule, message, where: where || '' });

  // ---------- Google Tag Manager container export ----------
  const PLATFORMS = [
    { id: 'meta', has: /fbq\s*\(/, track: /fbq\s*\(\s*['"]track(?:Custom)?['"]\s*,\s*['"]([^'"]+)['"]/g, init: /fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d+)/g },
    { id: 'tiktok', has: /ttq\./, track: /ttq\.track\s*\(\s*['"]([^'"]+)['"]/g, init: /ttq\.load\s*\(\s*['"]([^'"]+)['"]/g },
    { id: 'snapchat', has: /snaptr\s*\(/, track: /snaptr\s*\(\s*['"]track['"]\s*,\s*['"]([^'"]+)['"]/g, init: /snaptr\s*\(\s*['"]init['"]\s*,\s*['"]([^'"]+)['"]/g },
    { id: 'linkedin', has: /lintrk\s*\(/, track: /conversion_id\s*:\s*['"]?(\d+)/g, init: /_linkedin_partner_id\s*=\s*['"]?(\d+)/g },
  ];

  function auditGtm(input) {
    const out = [];
    const cv = (input && input.containerVersion) || input || {};
    const tags = cv.tag || [];
    const triggers = cv.trigger || [];
    const trig = (id) => (triggers.find((t) => String(t.triggerId) === String(id)) || {}).name || 'trigger ' + id;
    if (!tags.length) return [f('warning', 'no-tags', 'No tags found. Is this a Google Tag Manager container export (JSON)?')];

    const fired = {}; // platform|event|trigger -> tag names
    const inits = {}; // platform|pixel id -> tag names
    tags.forEach((tag) => {
      const html = (tag.parameter || []).filter((p) => p.key === 'html').map((p) => p.value).join('\n');
      const triggersOf = tag.firingTriggerId || [];
      if (tag.paused) out.push(f('info', 'tag-paused', `Tag "${tag.name}" is paused.`, tag.name));
      else if (!triggersOf.length) out.push(f('error', 'tag-no-trigger', `Tag "${tag.name}" has no firing trigger, so it never fires.`, tag.name));
      if (tag.paused) return;
      PLATFORMS.forEach((p) => {
        if (!p.has.test(html)) return;
        for (const m of html.matchAll(p.init)) (inits[p.id + '|' + m[1]] = inits[p.id + '|' + m[1]] || []).push(tag.name);
        for (const m of html.matchAll(p.track)) {
          triggersOf.forEach((tid) => {
            const k = [p.id, m[1], tid].join('|');
            (fired[k] = fired[k] || []).push(tag.name);
          });
        }
      });
    });

    Object.entries(fired).forEach(([k, names]) => {
      if (names.length < 2) return;
      const [p, ev, tid] = k.split('|');
      out.push(f('error', 'duplicate-event',
        `${p} "${ev}" is sent ${names.length} times on the same trigger ("${trig(tid)}") by: ${names.join(', ')}. Every conversion would be counted ${names.length}x.`, names.join(', ')));
    });
    Object.entries(inits).forEach(([k, names]) => {
      if (names.length < 2) return;
      const [p, id] = k.split('|');
      out.push(f('warning', 'multiple-init', `${p} pixel ${id} is initialised in ${names.length} tags (${names.join(', ')}). Initialise it once.`, names.join(', ')));
    });
    if (!out.some((x) => x.severity === 'error')) out.push(f('info', 'gtm-ok', `Checked ${tags.length} tags: no duplicate events or dead tags found.`));
    return out;
  }

  // ---------- Browser vs server events (deduplication) ----------
  const STANDARD = {
    meta: ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead', 'CompleteRegistration', 'Search'],
    tiktok: ['ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'CompletePayment', 'Search'],
    snapchat: ['PAGE_VIEW', 'VIEW_CONTENT', 'ADD_CART', 'START_CHECKOUT', 'PURCHASE', 'SIGN_UP'],
  };
  const PURCHASE = { meta: 'Purchase', tiktok: 'CompletePayment', snapchat: 'PURCHASE' };
  const ALIASES = { tiktok: { purchase: 'CompletePayment' }, snapchat: { purchase: 'PURCHASE' } };

  function auditEvents(events) {
    const out = [];
    if (!Array.isArray(events) || !events.length) return [f('warning', 'no-events', 'No events found. Expected a JSON array of events.')];
    const key = (e) => [e.platform, e.event_name, e.source, e.event_id].join('|');
    const counts = {};
    const ids = { browser: new Set(), server: new Set() };
    events.forEach((e, i) => {
      const where = `event ${i + 1} (${e.platform} ${e.event_name}, ${e.source})`;
      const std = STANDARD[e.platform];
      if (std) {
        const alias = (ALIASES[e.platform] || {})[String(e.event_name).toLowerCase()];
        const exact = std.includes(e.event_name);
        const ci = std.find((s) => s.toLowerCase() === String(e.event_name).toLowerCase());
        if (!exact && alias) out.push(f('warning', 'event-name', `${e.platform} uses "${alias}" for purchases, not "${e.event_name}".`, where));
        else if (!exact && ci) out.push(f('error', 'event-name-case', `"${e.event_name}" is not a standard ${e.platform} event. Use "${ci}" (names are case sensitive).`, where));
        else if (!exact) out.push(f('info', 'custom-event', `"${e.event_name}" is not a standard ${e.platform} event, so it is treated as a custom event.`, where));
      }
      if (e.event_name === PURCHASE[e.platform]) {
        const v = Number(e.value);
        if (e.value === undefined || e.value === '' || !isFinite(v) || typeof e.value === 'string') out.push(f('error', 'purchase-value', 'Purchase value is missing or not a number.', where));
        else if (v <= 0) out.push(f('warning', 'purchase-value-zero', 'Purchase value is zero or negative.', where));
        if (!/^[A-Z]{3}$/.test(e.currency || '')) out.push(f('error', 'purchase-currency', 'Purchase currency is missing or not a 3 letter uppercase code (for example EUR).', where));
      }
      if (!e.event_id) {
        out.push(f(e.source === 'server' ? 'error' : 'warning', 'no-event-id',
          e.source === 'server' ? 'Server event has no event_id, so it cannot be matched to the browser event and will count twice.' : 'Browser event has no event_id, so the platform cannot remove duplicates against the server event.', where));
        return;
      }
      ids[e.source] && ids[e.source].add([e.platform, e.event_name, e.event_id].join('|'));
      counts[key(e)] = (counts[key(e)] || 0) + 1;
    });
    Object.entries(counts).forEach(([k, n]) => {
      if (n > 1) { const [p, ev, src, id] = k.split('|'); out.push(f('error', 'double-fire', `${p} ${ev} (${src}, event_id ${id}) was sent ${n} times.`, k)); }
    });
    let matched = 0;
    ids.server.forEach((k) => {
      if (ids.browser.has(k)) matched++;
      else out.push(f('info', 'server-only', `Server event ${k.split('|').join(' / ')} has no browser twin (fine for offline events, a problem if the pixel should have fired).`, k));
    });
    ids.browser.forEach((k) => { if (!ids.server.has(k)) out.push(f('info', 'browser-only', `Browser event ${k.split('|').join(' / ')} has no server twin.`, k)); });
    out.push(f('info', 'dedup-summary', `${matched} browser/server pairs share an event_id and will be deduplicated.`));
    return out;
  }

  // ---------- Catalog feed (CSV) ----------
  const REQUIRED = {
    meta: ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand'],
    tiktok: ['sku_id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand'],
    snapchat: ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand'],
  };
  const ALLOWED = {
    meta: { availability: ['in stock', 'out of stock', 'preorder', 'available for order', 'discontinued'], condition: ['new', 'refurbished', 'used'] },
  };

  function parseCsv(text) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    const useful = rows.filter((r) => r.some((x) => x.trim() !== ''));
    if (!useful.length) return { headers: [], rows: [] };
    const headers = useful[0].map((h) => h.trim());
    return { headers, rows: useful.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()]))) };
  }

  function auditCatalog(csv, platform) {
    const out = [];
    const need = REQUIRED[platform];
    if (!need) return [f('error', 'platform', `Unknown platform "${platform}".`)];
    const { headers, rows } = parseCsv(csv);
    if (!rows.length) return [f('warning', 'no-rows', 'No product rows found. Expected a CSV with a header row.')];
    const missing = need.filter((h) => !headers.includes(h));
    if (missing.length) out.push(f('error', 'missing-column', `Missing required column(s) for ${platform}: ${missing.join(', ')}.`));
    const idCol = platform === 'tiktok' ? 'sku_id' : 'id';
    const seen = {};
    rows.forEach((r, i) => {
      const where = `row ${i + 2} (${r[idCol] || 'no id'})`;
      need.filter((h) => headers.includes(h) && r[h] === '').forEach((h) => out.push(f('error', 'empty-value', `${h} is empty.`, where)));
      if (r[idCol]) { if (seen[r[idCol]]) out.push(f('error', 'duplicate-id', `${idCol} "${r[idCol]}" is also used in row ${seen[r[idCol]]}.`, where)); else seen[r[idCol]] = i + 2; }
      if (r.price && !/^\d+(\.\d{1,2})?\s[A-Z]{3}$/.test(r.price)) out.push(f(platform === 'meta' ? 'error' : 'warning', 'price-format', `price "${r.price}" should look like "19.99 EUR" (number, space, currency code).`, where));
      ['link', 'image_link'].forEach((h) => { if (r[h] && !/^https:\/\//i.test(r[h])) out.push(f('warning', 'not-https', `${h} should start with https:// ("${r[h]}").`, where)); });
      const allowed = ALLOWED[platform] || {};
      Object.keys(allowed).forEach((h) => { if (r[h] && !allowed[h].includes(r[h].toLowerCase())) out.push(f('error', 'bad-value', `${h} "${r[h]}" is not one of: ${allowed[h].join(', ')}.`, where)); });
    });
    out.push(f('info', 'catalog-summary', `Checked ${rows.length} products against ${platform} starter rules.`));
    return out;
  }

  function summarize(findings) {
    const s = { error: 0, warning: 0, info: 0 };
    findings.forEach((x) => s[x.severity]++);
    return s;
  }

  const api = { auditGtm, auditEvents, auditCatalog, parseCsv, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrackingAudit = api;
})(typeof window !== 'undefined' ? window : globalThis);
