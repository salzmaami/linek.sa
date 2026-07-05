const crypto = require('crypto');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
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

function cleanText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function token() {
  return crypto.randomBytes(24).toString('hex');
}

function slugify(value) {
  const map = {
    'شاليه': 'chalet',
    'شاليهات': 'chalets',
    'سكون': 'sukoon',
    'سُكون': 'sukoon',
    'شقة': 'apartment',
    'استراحة': 'retreat',
    'الرياض': 'riyadh',
    'جدة': 'jeddah',
    'الخبر': 'khobar',
    'الدمام': 'dammam',
    'الطائف': 'taif',
    'العلا': 'alula'
  };
  const base = cleanText(value)
    .split(/\s+/)
    .map(word => map[word] || word)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || `place-${Date.now().toString().slice(-6)}`;
}

function normalizePhotos(value) {
  return cleanText(value)
    .split(/\n|,/)
    .map(item => item.trim())
    .filter(url => /^https?:\/\//i.test(url))
    .slice(0, 12);
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
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = text;
    }
  }
  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || 'Supabase request failed');
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function validate(body) {
  const required = ['owner_name', 'owner_phone', 'property_name', 'property_type', 'city', 'description', 'base_price', 'cancellation_policy', 'rules', 'owner_declaration'];
  const missing = required.filter(key => !cleanText(body[key]));
  if (missing.length || !body.verification_ack) {
    const error = new Error('راجع الحقول المطلوبة والإقرار');
    error.status = 400;
    throw error;
  }
}

async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, {error: 'Method not allowed'});
    const config = requireConfig();
    const body = await readBody(req);
    validate(body);

    const now = new Date().toISOString();
    const planCode = ['single', 'multi', 'custom'].includes(cleanText(body.plan_code)) ? cleanText(body.plan_code) : 'single';
    const placeCount = Math.max(1, Math.min(20, Number(body.place_count || 1)));
    const ownerRows = await supabase(config, 'owners', {
      method: 'POST',
      body: {
        name: cleanText(body.owner_name),
        phone: cleanText(body.owner_phone),
        city: cleanText(body.city),
        status: 'paused',
        plan_code: planCode,
        trial_started_at: now,
        trial_ends_at: addDays(now, 14),
        subscription_status: 'trial',
        internal_note: `طلب انضمام من صفحة المالك. عدد الأماكن: ${placeCount}. التجربة تبدأ فعلياً عند اعتماد Linek.`
      }
    });
    const owner = ownerRows[0];

    const propertyName = cleanText(body.property_name);
    const propertyRows = await supabase(config, 'properties', {
      method: 'POST',
      body: {
        owner_id: owner.id,
        name: propertyName,
        slug: `${slugify(propertyName)}-${Date.now().toString().slice(-5)}`,
        city: cleanText(body.city),
        property_type: cleanText(body.property_type),
        description: cleanText(body.description),
        base_price: Number(body.base_price || 0),
        check_in: cleanText(body.check_in) || null,
        check_out: cleanText(body.check_out) || null,
        map_link: cleanText(body.map_link) || null,
        rules: cleanText(body.rules),
        cancellation_policy: cleanText(body.cancellation_policy),
        payment_link: cleanText(body.payment_link) || null,
        payment_method_note: cleanText(body.payment_method_note) || null,
        verification_status: 'under_review',
        status: 'under_review',
        owner_setup_token: token(),
        owner_setup_submitted_at: now,
        internal_note: `إقرار المالك: ${cleanText(body.owner_declaration)}`
      }
    });
    const property = propertyRows[0];

    const photos = normalizePhotos(body.photo_urls).map((url, index) => ({
      property_id: property.id,
      url,
      sort_order: index,
      is_cover: index === 0
    }));
    if (photos.length) {
      await supabase(config, 'property_photos', {
        method: 'POST',
        body: photos
      });
    }

    await supabase(config, 'verification_reviews', {
      method: 'POST',
      body: {
        property_id: property.id,
        status: 'under_review',
        provider_checked: false,
        payment_method_checked: false,
        reviewer_note: 'طلب انضمام جديد من صفحة المالك العامة.'
      }
    });

    return json(res, 201, {ok: true, owner_id: owner.id, property_id: property.id, status: 'under_review'});
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.message || 'Internal error',
      details: error.details || null
    });
  }
}

module.exports = handler;
