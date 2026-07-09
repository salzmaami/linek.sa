const DEFAULT_PRICING = {
  single_price: 199,
  multi_price: 299,
  custom_label: 'تواصل معنا',
  discount_enabled: false,
  discount_percent: 0,
  discount_label: '',
  discount_note: '',
  trial_days: 14
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function cleanText(value) {
  return String(value || '').trim();
}

function sanitizePricing(value = {}) {
  const percent = Math.max(0, Math.min(90, Number(value.discount_percent || 0)));
  return {
    single_price: Math.max(0, Math.round(Number(value.single_price || DEFAULT_PRICING.single_price))),
    multi_price: Math.max(0, Math.round(Number(value.multi_price || DEFAULT_PRICING.multi_price))),
    custom_label: cleanText(value.custom_label) || DEFAULT_PRICING.custom_label,
    discount_enabled: Boolean(value.discount_enabled),
    discount_percent: percent,
    discount_label: cleanText(value.discount_label).slice(0, 80),
    discount_note: cleanText(value.discount_note).slice(0, 180),
    trial_days: Math.max(0, Math.min(90, Math.round(Number(value.trial_days || DEFAULT_PRICING.trial_days))))
  };
}

async function fetchPricing(config) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/site_settings?select=value&key=eq.pricing&is_public=eq.true&limit=1`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) throw new Error('Site settings unavailable');
  const rows = await response.json();
  return sanitizePricing(rows?.[0]?.value || DEFAULT_PRICING);
}

async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, {error: 'Method not allowed'});

  const supabaseUrl = cleanText(process.env.SUPABASE_URL || process.env.LINEK_SUPABASE_URL).replace(/\/$/, '');
  const anonKey = cleanText(
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.LINEK_SUPABASE_ANON_KEY
  );

  if (!supabaseUrl || !anonKey) {
    return json(res, 200, {pricing: sanitizePricing(DEFAULT_PRICING), source: 'fallback'});
  }

  try {
    const pricing = await fetchPricing({supabaseUrl, anonKey});
    return json(res, 200, {pricing, source: 'supabase'});
  } catch (error) {
    return json(res, 200, {pricing: sanitizePricing(DEFAULT_PRICING), source: 'fallback', warning: error.message});
  }
}

module.exports = handler;
