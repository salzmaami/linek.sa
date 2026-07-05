function text(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.end(body);
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

async function supabase(config, path) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    headers: {apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`}
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data.message || 'Supabase request failed');
  return data;
}

function ymd(value) {
  return String(value || '').replace(/-/g, '');
}

module.exports = async function handler(req, res) {
  try {
    const propertyId = clean(new URL(req.url, `https://${req.headers.host || 'linek.sa'}`).searchParams.get('property_id'));
    if (!propertyId) return text(res, 400, 'Missing property_id');
    const config = requireConfig();
    const bookings = await supabase(config, `bookings?select=reference,check_in,check_out&property_id=eq.${encodeURIComponent(propertyId)}&status=eq.confirmed`);
    const events = bookings.map(booking => [
      'BEGIN:VEVENT',
      `UID:${booking.reference}@linek.sa`,
      `SUMMARY:Linek ${booking.reference}`,
      `DTSTART;VALUE=DATE:${ymd(booking.check_in)}`,
      `DTEND;VALUE=DATE:${ymd(booking.check_out)}`,
      'END:VEVENT'
    ].join('\r\n'));
    text(res, 200, ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Linek//MVP//AR', ...events, 'END:VCALENDAR'].join('\r\n'));
  } catch (error) {
    text(res, 500, error.message);
  }
};
