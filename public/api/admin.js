const DEFAULT_LIMIT = 80;
const crypto = require('crypto');

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

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function sanitizePricing(value = {}) {
  return {
    single_price: clampNumber(value.single_price, DEFAULT_PRICING.single_price, 0, 99999),
    multi_price: clampNumber(value.multi_price, DEFAULT_PRICING.multi_price, 0, 99999),
    custom_label: cleanText(value.custom_label, DEFAULT_PRICING.custom_label).slice(0, 80) || DEFAULT_PRICING.custom_label,
    discount_enabled: Boolean(value.discount_enabled),
    discount_percent: clampNumber(value.discount_percent, DEFAULT_PRICING.discount_percent, 0, 90),
    discount_label: cleanText(value.discount_label).slice(0, 80),
    discount_note: cleanText(value.discount_note).slice(0, 180),
    trial_days: clampNumber(value.trial_days, DEFAULT_PRICING.trial_days, 0, 90)
  };
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function requireConfig() {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL || process.env.LINEK_SUPABASE_URL).replace(/\/$/, '');
  const serviceKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.LINEK_SUPABASE_SERVICE_ROLE_KEY);
  const adminToken = cleanText(process.env.LINEK_ADMIN_TOKEN);

  if (!supabaseUrl || !serviceKey || !adminToken) {
    throw new Error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or LINEK_ADMIN_TOKEN');
  }

  return {supabaseUrl, serviceKey, adminToken};
}

function authorize(req, adminToken) {
  const headerToken = cleanText(req.headers['x-linek-admin-token']);
  const bearer = cleanText(req.headers.authorization).replace(/^Bearer\s+/i, '');
  return headerToken === adminToken || bearer === adminToken;
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
    const message = typeof data === 'string' ? data : (data?.message || data?.hint || 'Supabase request failed');
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

function enrichOwner(owner) {
  const now = Date.now();
  const trialEndsAt = owner.trial_ends_at ? new Date(owner.trial_ends_at).getTime() : null;
  const msLeft = trialEndsAt ? trialEndsAt - now : null;
  const daysLeft = msLeft === null ? null : Math.ceil(msLeft / 86400000);
  const isTrial = owner.subscription_status === 'trial';
  return {
    ...owner,
    trial_days_left: daysLeft,
    trial_needs_alert: isTrial && daysLeft !== null && daysLeft <= 3,
    trial_expired: isTrial && daysLeft !== null && daysLeft <= 0
  };
}

async function getDashboard(config) {
  const [leads, owners, properties, bookings, ownerProfiles, verificationRequests, subscriptions, siteSettings] = await Promise.all([
    supabase(config, `leads?select=*&order=created_at.desc&limit=${DEFAULT_LIMIT}`),
    supabase(config, `owners?select=*&order=created_at.desc&limit=${DEFAULT_LIMIT}`),
    supabase(config, `properties?select=*,owners(name,phone,subscription_status,trial_ends_at,linek_subscription_payment_link),property_photos(url,sort_order,is_cover)&order=created_at.desc&limit=${DEFAULT_LIMIT}`),
    supabase(config, `bookings?select=*,properties(name,title,slug,owner_id,owner_profile_id,owners(name,phone))&order=created_at.desc&limit=${DEFAULT_LIMIT}`),
    supabase(config, `owner_profiles?select=*&order=created_at.desc&limit=${DEFAULT_LIMIT}`),
    supabase(config, `verification_requests?select=*&order=created_at.desc&limit=${DEFAULT_LIMIT}`),
    supabase(config, `subscriptions?select=*&order=created_at.desc&limit=${DEFAULT_LIMIT}`),
    getSiteSettings(config)
  ]);

  return {
    leads,
    owners: owners.map(enrichOwner),
    properties,
    bookings,
    ownerProfiles,
    verificationRequests,
    subscriptions,
    siteSettings
  };
}

async function getSiteSettings(config) {
  try {
    const rows = await supabase(config, 'site_settings?select=key,value,is_public,updated_at&key=eq.pricing&limit=1');
    return {
      pricing: sanitizePricing(rows?.[0]?.value || DEFAULT_PRICING),
      updated_at: rows?.[0]?.updated_at || null,
      source: rows?.length ? 'supabase' : 'default'
    };
  } catch (error) {
    return {
      pricing: sanitizePricing(DEFAULT_PRICING),
      updated_at: null,
      source: 'fallback',
      warning: error.message
    };
  }
}

async function updateSiteSettings(config, body) {
  const pricing = sanitizePricing(body.pricing || body);
  const rows = await supabase(config, 'site_settings?on_conflict=key', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      key: 'pricing',
      value: pricing,
      is_public: true
    }
  });
  return {
    pricing: sanitizePricing(rows?.[0]?.value || pricing),
    updated_at: rows?.[0]?.updated_at || null,
    source: 'supabase'
  };
}

async function getLead(config, leadId) {
  const rows = await supabase(config, `leads?select=*&id=eq.${encodeURIComponent(leadId)}&limit=1`);
  if (!rows.length) {
    const error = new Error('Lead not found');
    error.status = 404;
    throw error;
  }
  return rows[0];
}

async function convertLead(config, body) {
  const lead = await getLead(config, body.leadId);
  const now = new Date().toISOString();
  const planCode = cleanText(body.planCode, Number(lead.places || 1) > 1 ? 'multi' : 'single');
  const ownerRows = await supabase(config, 'owners', {
    method: 'POST',
    body: {
      lead_id: lead.id,
      name: lead.name,
      phone: lead.phone,
      city: lead.city,
      status: 'active',
      plan_code: planCode,
      trial_started_at: now,
      trial_ends_at: addDays(now, 14),
      subscription_status: 'trial',
      linek_subscription_payment_link: cleanText(body.linekSubscriptionPaymentLink) || null,
      internal_note: cleanText(body.internalNote) || null
    }
  });
  const owner = ownerRows[0];

  const propertyRows = await supabase(config, 'properties', {
    method: 'POST',
    body: {
      owner_id: owner.id,
      name: cleanText(body.propertyName, `${lead.property_type || 'مكان'} ${lead.city || ''}`),
      slug: cleanText(body.slug),
      city: lead.city,
      property_type: lead.property_type,
      description: cleanText(body.description) || null,
      base_price: Number(body.basePrice || 0),
      payment_link: cleanText(body.paymentLink) || null,
      payment_method_note: cleanText(body.paymentMethodNote) || null,
      verification_status: 'under_review',
      status: 'draft',
      owner_setup_token: generateToken(),
      published_at: null,
      internal_note: cleanText(body.internalNote) || null
    }
  });

  await supabase(config, `leads?id=eq.${encodeURIComponent(lead.id)}`, {
    method: 'PATCH',
    body: {
      status: 'converted',
      admin_note: cleanText(body.internalNote) || null,
      decided_at: now
    }
  });

  return {owner, property: propertyRows[0]};
}

async function rejectLead(config, body) {
  const rows = await supabase(config, `leads?id=eq.${encodeURIComponent(body.leadId)}`, {
    method: 'PATCH',
    body: {
      status: 'rejected',
      admin_note: cleanText(body.reason) || 'رفض من لوحة Linek',
      decided_at: new Date().toISOString()
    }
  });
  return rows[0];
}

async function updateOwner(config, body) {
  const patch = {};
  ['status', 'subscription_status', 'linek_subscription_payment_link', 'internal_note'].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(body, key)) patch[key] = body[key] || null;
  });
  if (body.extendTrialDays) patch.trial_ends_at = addDays(new Date(), Number(body.extendTrialDays));
  if (body.markPaid) {
    patch.status = 'active';
    patch.subscription_status = 'active';
    patch.linek_subscription_paid_at = new Date().toISOString();
  }
  if (body.markAlerted) patch.last_trial_alert_at = new Date().toISOString();
  if (body.cancelSubscription) {
    patch.status = 'paused';
    patch.subscription_status = 'cancelled';
  }
  patch.updated_at = new Date().toISOString();

  const rows = await supabase(config, `owners?id=eq.${encodeURIComponent(body.ownerId)}`, {
    method: 'PATCH',
    body: patch
  });
  if (body.markPaid) {
    await supabase(config, `properties?owner_id=eq.${encodeURIComponent(body.ownerId)}&status=eq.paused`, {
      method: 'PATCH',
      body: {
        status: 'published',
        updated_at: new Date().toISOString()
      }
    });
  }
  if (body.cancelSubscription) {
    await supabase(config, `properties?owner_id=eq.${encodeURIComponent(body.ownerId)}&status=in.(published,under_review,draft)`, {
      method: 'PATCH',
      body: {
        status: 'paused',
        updated_at: new Date().toISOString()
      }
    });
  }
  return enrichOwner(rows[0]);
}

async function updateProperty(config, body) {
  const patch = {};
  ['name', 'slug', 'description', 'payment_link', 'payment_method_note', 'verification_status', 'status', 'internal_note'].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(body, key)) patch[key] = body[key] || null;
  });
  if (Object.prototype.hasOwnProperty.call(body, 'base_price')) patch.base_price = Number(body.base_price || 0);
  const now = new Date().toISOString();
  if (body.status === 'published') patch.published_at = now;

  const rows = await supabase(config, `properties?id=eq.${encodeURIComponent(body.propertyId)}`, {
    method: 'PATCH',
    body: patch
  });
  const property = rows[0];

  if (body.status === 'published' && property?.owner_id) {
    await supabase(config, `owners?id=eq.${encodeURIComponent(property.owner_id)}`, {
      method: 'PATCH',
      body: {
        status: 'active',
        subscription_status: 'trial',
        trial_started_at: now,
        trial_ends_at: addDays(now, 14),
        updated_at: now
      }
    });
    await supabase(config, 'verification_reviews', {
      method: 'POST',
      body: {
        property_id: property.id,
        status: 'approved_payment_reviewed',
        provider_checked: true,
        payment_method_checked: true,
        reviewer_note: cleanText(body.internal_note) || 'تم اعتماد الطلب من لوحة Linek.',
        reviewed_at: now
      }
    });
  }

  if (body.status === 'rejected' && property?.owner_id) {
    await supabase(config, `owners?id=eq.${encodeURIComponent(property.owner_id)}`, {
      method: 'PATCH',
      body: {
        status: 'rejected',
        updated_at: now
      }
    });
    await supabase(config, 'verification_reviews', {
      method: 'POST',
      body: {
        property_id: property.id,
        status: 'rejected',
        provider_checked: false,
        payment_method_checked: false,
        reviewer_note: cleanText(body.internal_note) || 'تم رفض الطلب من لوحة Linek.',
        reviewed_at: now
      }
    });
  }

  return property;
}

async function updateBooking(config, body) {
  const status = cleanText(body.status);
  const paymentStatus = cleanText(body.payment_status);
  const patch = {
    updated_at: new Date().toISOString()
  };
  if (status) patch.status = status;
  if (paymentStatus) patch.payment_status = paymentStatus;
  if (body.owner_decision_note !== undefined) patch.owner_decision_note = cleanText(body.owner_decision_note) || null;
  if (['pending_payment', 'confirmed', 'rejected', 'cancelled'].includes(status)) patch.decided_at = new Date().toISOString();

  const rows = await supabase(config, `bookings?id=eq.${encodeURIComponent(body.bookingId)}`, {
    method: 'PATCH',
    body: patch
  });
  return rows[0];
}

async function updateVerification(config, body) {
  const profileId = cleanText(body.profileId);
  const decision = cleanText(body.decision);
  const reason = cleanText(body.reason);
  const statusMap = {
    approve: 'approved',
    reject: 'rejected',
    more: 'more_information_required'
  };
  const requestStatusMap = {
    approve: 'approved',
    reject: 'rejected',
    more: 'need_more_information'
  };
  if (!profileId || !statusMap[decision]) {
    const error = new Error('Invalid verification decision');
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const profileRows = await supabase(config, `owner_profiles?id=eq.${encodeURIComponent(profileId)}`, {
    method: 'PATCH',
    body: {
      verification_status: statusMap[decision],
      approved_at: decision === 'approve' ? now : null,
      rejection_reason: decision === 'approve' ? null : (reason || 'قرار مراجعة من لوحة Linek')
    }
  });
  const profile = profileRows[0];

  await supabase(config, `verification_requests?owner_id=eq.${encodeURIComponent(profileId)}&status=in.(submitted,draft,need_more_information)`, {
    method: 'PATCH',
    body: {
      status: requestStatusMap[decision],
      reviewed_at: now,
      rejection_reason: decision === 'approve' ? null : (reason || 'قرار مراجعة من لوحة Linek')
    }
  });

  const existingSubscriptions = await supabase(config, `subscriptions?select=id&owner_id=eq.${encodeURIComponent(profileId)}&limit=1`);
  if (decision === 'approve' && !existingSubscriptions.length) {
    const subscriptionPlan = profile?.requested_plan === 'multi' || Number(profile?.property_limit || 1) > 1 ? 'professional' : 'starter';
    await supabase(config, 'subscriptions', {
      method: 'POST',
      body: {
        owner_id: profileId,
        plan: subscriptionPlan,
        status: 'trial',
        start_date: new Date().toISOString().slice(0, 10),
        renewal_date: addDays(new Date(), 14).slice(0, 10)
      }
    });
  }

  await supabase(config, 'audit_logs', {
    method: 'POST',
    body: {
      action: decision === 'approve' ? 'Verification Approved' : decision === 'reject' ? 'Verification Rejected' : 'Verification More Information',
      metadata: {owner_profile_id: profileId, reason}
    }
  });

  return profile;
}

async function pauseExpiredTrials(config) {
  const now = new Date().toISOString();
  const expiredOwners = await supabase(config, `owners?select=id&subscription_status=eq.trial&trial_ends_at=lte.${encodeURIComponent(now)}`);
  if (!expiredOwners.length) return [];
  const ids = expiredOwners.map(owner => owner.id);
  const rows = await supabase(config, `owners?id=in.(${ids.join(',')})`, {
    method: 'PATCH',
    body: {
      status: 'paused',
      subscription_status: 'expired',
      updated_at: now
    }
  });
  await supabase(config, `properties?owner_id=in.(${ids.join(',')})&status=eq.published`, {
    method: 'PATCH',
    body: {
      status: 'paused',
      updated_at: now
    }
  });
  return rows.map(enrichOwner);
}

async function handler(req, res) {
  try {
    const config = requireConfig();
    if (!authorize(req, config.adminToken)) return json(res, 401, {error: 'Unauthorized'});

    if (req.method === 'GET') {
      return json(res, 200, await getDashboard(config));
    }

    if (req.method !== 'POST') return json(res, 405, {error: 'Method not allowed'});

    const body = await readBody(req);
    const action = cleanText(body.action);
    const actions = {
      convertLead,
      rejectLead,
      updateOwner,
      updateProperty,
      updateBooking,
      updateVerification,
      pauseExpiredTrials,
      updateSiteSettings
    };

    if (!actions[action]) return json(res, 400, {error: 'Unknown action'});
    const result = await actions[action](config, body);
    return json(res, 200, {ok: true, result});
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.message || 'Internal error',
      details: error.details || null
    });
  }
}

module.exports = handler;
