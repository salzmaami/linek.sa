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
  if (!response.ok) throw new Error(data?.message || data?.hint || 'Supabase request failed');
  return data;
}

function nights(checkIn, checkOut) {
  return Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
}

function validSaudiMobile(value) {
  return /^05[0-9]{8}$/.test(value);
}

async function paymentSnapshot(config, property) {
  if (property.owner_profile_id) {
    const rows = await supabase(config, `owner_payment_methods?select=*&owner_id=eq.${encodeURIComponent(property.owner_profile_id)}&active=eq.true&limit=1`);
    const method = rows[0];
    if (method) {
      return {
        link: method.payment_url || null,
        instructions: method.instructions || method.iban || null
      };
    }
  }
  return {
    link: property.payment_link || null,
    instructions: property.payment_method_note || null
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, {error: 'Method not allowed'});
    const config = requireConfig();
    const body = await readBody(req);
    const propertyId = clean(body.property_id);
    const guestName = clean(body.guest_name);
    const guestMobile = clean(body.guest_mobile);
    const checkIn = clean(body.check_in);
    const checkOut = clean(body.check_out);
    const guestsCount = Math.max(1, Number(body.guests_count || 1));

    if (!propertyId || !guestName || !validSaudiMobile(guestMobile) || !checkIn || !checkOut) {
      return json(res, 400, {error: 'راجع بيانات الحجز المطلوبة'});
    }

    await supabase(config, 'rpc/expire_pending_bookings', {method: 'POST', body: {}});
    const propertyRows = await supabase(config, `properties?select=*&id=eq.${encodeURIComponent(propertyId)}&status=in.(published,active)&limit=1`);
    const property = propertyRows[0];
    if (!property) return json(res, 404, {error: 'العقار غير منشور'});
    if (guestsCount > Number(property.guests || 1)) return json(res, 400, {error: 'عدد الضيوف يتجاوز سعة العقار'});

    const available = await supabase(config, 'rpc/property_dates_available', {
      method: 'POST',
      body: {
        target_property_id: propertyId,
        target_check_in: checkIn,
        target_check_out: checkOut,
        ignored_booking_id: null
      }
    });
    if (available !== true) return json(res, 409, {error: 'التواريخ المختارة غير متاحة'});

    const snapshot = await paymentSnapshot(config, property);
    const totalPrice = (nights(checkIn, checkOut) * Number(property.base_price || 0)) + Number(property.cleaning_fee || 0);
    const rows = await supabase(config, 'bookings', {
      method: 'POST',
      body: {
        property_id: property.id,
        owner_id: property.owner_id || null,
        owner_profile_id: property.owner_profile_id || null,
        guest_name: guestName,
        guest_mobile: guestMobile,
        guest_phone: guestMobile,
        check_in: checkIn,
        check_out: checkOut,
        booking_date: checkIn,
        guests_count: guestsCount,
        guests: guestsCount,
        notes: clean(body.notes) || null,
        total_price: totalPrice,
        amount: totalPrice,
        payment_link_snapshot: snapshot.link,
        payment_instructions_snapshot: snapshot.instructions,
        status: 'pending',
        payment_status: 'not_started',
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      }
    });
    const booking = rows[0];
    return json(res, 201, {
      ok: true,
      reference: booking.reference || booking.public_code,
      token: booking.guest_access_token,
      expires_at: booking.expires_at,
      status_url: `/booking-status.html?ref=${encodeURIComponent(booking.reference || booking.public_code)}&token=${encodeURIComponent(booking.guest_access_token)}`
    });
  } catch (error) {
    return json(res, error.message.includes('غير متاحة') ? 409 : 500, {error: error.message || 'Internal error'});
  }
};
