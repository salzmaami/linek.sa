function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function requireConfig() {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL || process.env.LINEK_SUPABASE_URL).replace(/\/$/, '');
  const serviceKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.LINEK_SUPABASE_SERVICE_ROLE_KEY);
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
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || 'Supabase request failed');
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function getProperty(config, token) {
  const rows = await supabase(
    config,
    `properties?select=*,owners(name,phone)&owner_setup_token=eq.${encodeURIComponent(token)}&limit=1`
  );
  if (!rows.length) {
    const error = new Error('رابط تجهيز البيانات غير صحيح أو منتهي');
    error.status = 404;
    throw error;
  }
  return rows[0];
}

async function handler(req, res) {
  try {
    const config = requireConfig();
    const token = cleanText(new URL(req.url, `https://${req.headers.host || 'linek.sa'}`).searchParams.get('token'));
    if (!token || token.length < 20) return json(res, 400, {error: 'Missing token'});

    if (req.method === 'GET') {
      return json(res, 200, {property: await getProperty(config, token)});
    }

    if (req.method !== 'POST') return json(res, 405, {error: 'Method not allowed'});

    await getProperty(config, token);
    const body = await readBody(req);
    const patch = {
      name: cleanText(body.name),
      city: cleanText(body.city),
      property_type: cleanText(body.property_type),
      description: cleanText(body.description) || null,
      base_price: Number(body.base_price || 0),
      check_in: cleanText(body.check_in) || null,
      check_out: cleanText(body.check_out) || null,
      rules: cleanText(body.rules) || null,
      cancellation_policy: cleanText(body.cancellation_policy) || null,
      payment_link: cleanText(body.payment_link) || null,
      payment_method_note: cleanText(body.payment_method_note) || null,
      status: 'under_review',
      verification_status: 'under_review',
      owner_setup_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (!patch.name || !patch.city || !patch.property_type || !patch.base_price) {
      return json(res, 400, {error: 'راجع البيانات الأساسية المطلوبة'});
    }

    const rows = await supabase(config, `properties?owner_setup_token=eq.${encodeURIComponent(token)}`, {
      method: 'PATCH',
      body: patch
    });

    return json(res, 200, {ok: true, property: rows[0]});
  } catch (error) {
    return json(res, error.status || 500, {error: error.message || 'Internal error'});
  }
}

module.exports = handler;
