function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function clean(value) {
  return String(value || '').trim();
}

function requireConfig() {
  const supabaseUrl = clean(process.env.SUPABASE_URL || process.env.LINEK_SUPABASE_URL).replace(/\/$/, '');
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.LINEK_SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase server config');
  return {supabaseUrl, serviceKey};
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

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, {error: 'Method not allowed'});
    const config = requireConfig();
    await supabase(config, 'rpc/expire_pending_bookings', {method: 'POST', body: {}});
    const params = new URL(req.url, `https://${req.headers.host || 'linek.sa'}`).searchParams;
    const ref = clean(params.get('ref'));
    const token = clean(params.get('token'));
    if (!ref || !token) return json(res, 400, {error: 'الرابط غير مكتمل'});
    const rows = await supabase(config, `bookings?select=*,properties(title,name,slug,city,check_in,check_out)&or=(reference.eq.${encodeURIComponent(ref)},public_code.eq.${encodeURIComponent(ref)})&guest_access_token=eq.${encodeURIComponent(token)}&limit=1`);
    const booking = rows[0];
    if (!booking) return json(res, 404, {error: 'لم يتم العثور على الطلب'});
    const events = await supabase(config, `booking_events?select=*&booking_id=eq.${encodeURIComponent(booking.id)}&order=created_at.asc`);
    return json(res, 200, {booking, events});
  } catch (error) {
    return json(res, 500, {error: error.message || 'Internal error'});
  }
};
