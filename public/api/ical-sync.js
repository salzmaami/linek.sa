function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function clean(value) {
  return String(value || '').trim();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
    });
  });
}

function requireConfig() {
  const supabaseUrl = clean(process.env.SUPABASE_URL || process.env.LINEK_SUPABASE_URL).replace(/\/$/, '');
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.LINEK_SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = clean(process.env.SUPABASE_ANON_KEY || process.env.LINEK_SUPABASE_ANON_KEY);
  if (!supabaseUrl || !serviceKey || !anonKey) throw new Error('Missing Supabase server config');
  return {supabaseUrl, serviceKey, anonKey};
}

async function supabase(config, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || 'Supabase request failed');
  return data;
}

async function userFromToken(config, req) {
  const token = clean(req.headers.authorization).replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Missing auth token');
  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: {apikey: config.anonKey, Authorization: `Bearer ${token}`}
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Unauthorized');
  return data;
}

function datesBetween(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  for (; cursor < stop; cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(cursor.toISOString().slice(0, 10));
  return dates;
}

function parseIcal(text) {
  const events = [];
  const blocks = text.split('BEGIN:VEVENT').slice(1);
  for (const block of blocks) {
    const start = block.match(/DTSTART(?:;VALUE=DATE)?:([0-9]{8})/);
    const end = block.match(/DTEND(?:;VALUE=DATE)?:([0-9]{8})/);
    if (!start || !end) continue;
    const s = `${start[1].slice(0, 4)}-${start[1].slice(4, 6)}-${start[1].slice(6, 8)}`;
    const e = `${end[1].slice(0, 4)}-${end[1].slice(4, 6)}-${end[1].slice(6, 8)}`;
    events.push(...datesBetween(s, e));
  }
  return [...new Set(events)];
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, {error: 'Method not allowed'});
    const config = requireConfig();
    const user = await userFromToken(config, req);
    const body = await readBody(req);
    const propertyId = clean(body.property_id);
    const allowed = await supabase(config, `properties?select=id,owner_profiles!inner(user_id)&id=eq.${encodeURIComponent(propertyId)}&owner_profiles.user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!allowed.length) return json(res, 403, {error: 'Access denied'});
    const calendars = await supabase(config, `external_calendars?select=*&property_id=eq.${encodeURIComponent(propertyId)}&active=eq.true`);
    let imported = 0;
    for (const calendar of calendars) {
      try {
        const response = await fetch(calendar.calendar_url);
        if (!response.ok) throw new Error('تعذر تحميل التقويم الخارجي');
        const dates = parseIcal(await response.text());
        if (dates.length) {
          await supabase(config, 'blocked_dates', {
            method: 'POST',
            prefer: 'resolution=ignore-duplicates,return=minimal',
            body: dates.map(date => ({property_id: propertyId, date, source: 'ical', external_calendar_id: calendar.id}))
          });
        }
        imported += dates.length;
        await supabase(config, `external_calendars?id=eq.${calendar.id}`, {method: 'PATCH', body: {last_sync: new Date().toISOString(), sync_status: 'active', imported_reservations: dates.length, last_error: null}});
      } catch (error) {
        await supabase(config, `external_calendars?id=eq.${calendar.id}`, {method: 'PATCH', body: {last_sync: new Date().toISOString(), sync_status: 'error', last_error: error.message}});
      }
    }
    await supabase(config, `properties?id=eq.${encodeURIComponent(propertyId)}`, {method: 'PATCH', body: {calendar_last_synced_at: new Date().toISOString()}});
    return json(res, 200, {ok: true, imported});
  } catch (error) {
    return json(res, 500, {error: error.message || 'Internal error'});
  }
};
