function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function clean(value) {
  return String(value || '').trim();
}

module.exports = async function handler(req, res) {
  try {
    const supabaseUrl = clean(process.env.SUPABASE_URL || process.env.LINEK_SUPABASE_URL).replace(/\/$/, '');
    const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.LINEK_SUPABASE_SERVICE_ROLE_KEY);
    if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase server config');
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/expire_pending_bookings`, {
      method: 'POST',
      headers: {apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json'},
      body: '{}'
    });
    const data = await response.json().catch(() => 0);
    if (!response.ok) throw new Error(data.message || 'Supabase request failed');
    return json(res, 200, {ok: true, expired: data || 0});
  } catch (error) {
    return json(res, 500, {error: error.message || 'Internal error'});
  }
};
