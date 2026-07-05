function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function cleanText(value) {
  return String(value || '').trim();
}

function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, {error: 'Method not allowed'});

  const supabaseUrl = cleanText(process.env.SUPABASE_URL || process.env.LINEK_SUPABASE_URL).replace(/\/$/, '');
  const supabaseAnonKey = cleanText(
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.LINEK_SUPABASE_ANON_KEY
  );

  return json(res, 200, {
    supabaseUrl,
    supabaseAnonKey,
    hasSupabase: Boolean(supabaseUrl && supabaseAnonKey)
  });
}

module.exports = handler;
