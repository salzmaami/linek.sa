const Linek = (() => {
  const config = window.LINEK_LEADS_CONFIG || {};
  const sessionKey = 'linek_mvp_session';
  let configPromise = null;

  function clean(value) {
    return String(value || '').trim();
  }

  function toast(message) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.append(el);
    }
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1800);
  }

  async function loadConfig() {
    if (configPromise) return configPromise;
    configPromise = (async () => {
      const endpoint = clean(config.configEndpoint || '/api/config');
      if (config.supabaseUrl && config.supabaseAnonKey) return config;
      try {
        const response = await fetch(endpoint, {headers: {Accept: 'application/json'}});
        if (!response.ok) throw new Error('تعذر تحميل إعدادات Supabase');
        const data = await response.json();
        config.supabaseUrl = clean(data.supabaseUrl).replace(/\/$/, '');
        config.supabaseAnonKey = clean(data.supabaseAnonKey);
      } catch (_) {
        config.supabaseUrl = clean(config.supabaseUrl).replace(/\/$/, '');
        config.supabaseAnonKey = clean(config.supabaseAnonKey);
      }
      return config;
    })();
    return configPromise;
  }

  function saveSession(session) {
    localStorage.setItem(sessionKey, JSON.stringify(session || {}));
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(sessionKey)) || null;
    } catch (_) {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(sessionKey);
  }

  async function request(path, options = {}) {
    const cfg = await loadConfig();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('إعدادات Supabase غير مكتملة');
    const session = getSession();
    const token = options.public ? cfg.supabaseAnonKey : (options.token || session?.access_token || cfg.supabaseAnonKey);
    const response = await fetch(`${cfg.supabaseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': options.contentType || 'application/json',
        Prefer: options.prefer || 'return=representation',
        ...(options.headers || {})
      },
      body: options.body
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_) { data = text; }
    }
    if (!response.ok) {
      const message = data?.msg || data?.message || data?.error_description || 'تعذر تنفيذ العملية';
      if (response.status === 401 || /jwt expired/i.test(message)) {
        clearSession();
        const error = new Error('انتهت جلسة الدخول. سجل دخولك مرة أخرى.');
        error.code = 'SESSION_EXPIRED';
        throw error;
      }
      throw new Error(message);
    }
    return data;
  }

  async function db(path, options = {}) {
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    return request(`/rest/v1/${path}`, {...options, body});
  }

  async function auth(path, payload) {
    const cfg = await loadConfig();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('إعدادات Supabase غير مكتملة');
    const response = await fetch(`${cfg.supabaseUrl}/auth/v1/${path}`, {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || 'تعذر تنفيذ العملية');
    return data;
  }

  async function signUp(payload) {
    const data = await auth('signup', {
      email: payload.email,
      password: payload.password,
      data: {
        full_name: payload.full_name,
        business_name: payload.business_name || '',
        mobile: payload.mobile,
        city: payload.city
      }
    });
    if (data.access_token) saveSession(data);
    if (data.user?.id && data.access_token) {
      await db('users', {
        method: 'POST',
        body: {id: data.user.id, email: payload.email, mobile: payload.mobile, role: 'owner'},
        headers: {'Prefer': 'resolution=merge-duplicates,return=representation'}
      });
      await db('owner_profiles', {
        method: 'POST',
        body: {
          user_id: data.user.id,
          full_name: payload.full_name,
          business_name: payload.business_name || null,
          city: payload.city,
          whatsapp_number: payload.mobile,
          verification_status: 'pending'
        },
        headers: {'Prefer': 'resolution=merge-duplicates,return=representation'}
      });
    }
    return data;
  }

  async function signIn(identifier, password) {
    const data = await auth('token?grant_type=password', {email: identifier, password});
    saveSession(data);
    return data;
  }

  async function resetPassword(email) {
    return auth('recover', {email});
  }

  async function currentUser() {
    const session = getSession();
    if (!session?.access_token) return null;
    try {
      return await request('/auth/v1/user', {token: session.access_token});
    } catch (error) {
      if (error.code === 'SESSION_EXPIRED') return null;
      throw error;
    }
  }

  async function ownerProfile() {
    const rows = await db('owner_profiles?select=*&limit=1');
    return rows[0] || null;
  }

  async function ensureOwnerProfile() {
    const user = await currentUser();
    if (!user) return null;
    const existing = await ownerProfile();
    if (existing) return existing;
    const metadata = user.user_metadata || {};
    const fullName = clean(metadata.full_name) || clean(user.email).split('@')[0] || 'مالك Linek';
    const mobile = clean(metadata.mobile || user.phone) || '0500000000';
    const city = clean(metadata.city) || 'غير محدد';
    await db('users', {
      method: 'POST',
      body: {id: user.id, email: user.email || null, mobile, role: 'owner'},
      headers: {'Prefer': 'resolution=merge-duplicates,return=representation'}
    });
    const rows = await db('owner_profiles', {
      method: 'POST',
      body: {
        user_id: user.id,
        full_name: fullName,
        business_name: clean(metadata.business_name) || null,
        city,
        whatsapp_number: mobile,
        verification_status: 'pending'
      },
      headers: {'Prefer': 'resolution=merge-duplicates,return=representation'}
    });
    return rows[0] || null;
  }

  async function latestVerificationRequest(ownerId) {
    if (!ownerId) return null;
    const rows = await db(`verification_requests?select=*&owner_id=eq.${encodeURIComponent(ownerId)}&order=created_at.desc&limit=10`);
    return rows.find(request =>
      request.status === 'submitted' &&
      clean(request.national_id_file) &&
      clean(request.selfie_file)
    ) || null;
  }

  async function requireOwner() {
    const user = await currentUser();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    return user;
  }

  async function uploadPrivateFile(file, folder = 'verification') {
    if (!file) return null;
    const cfg = await loadConfig();
    const session = getSession();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${folder}/${Date.now()}-${safeName}`;
    const response = await fetch(`${cfg.supabaseUrl}/storage/v1/object/verification-documents/${path}`, {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true'
      },
      body: file
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'تعذر رفع الملف');
    return `verification-documents/${path}`;
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function setLoading(button, isLoading, text = 'جار المعالجة...') {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = text;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  return {
    clean,
    toast,
    loadConfig,
    db,
    signUp,
    signIn,
    resetPassword,
    getSession,
    saveSession,
    clearSession,
    currentUser,
    ownerProfile,
    ensureOwnerProfile,
    latestVerificationRequest,
    requireOwner,
    uploadPrivateFile,
    formData,
    setLoading
  };
})();

document.addEventListener('click', event => {
  const logout = event.target.closest('[data-logout]');
  if (!logout) return;
  event.preventDefault();
  Linek.clearSession();
  window.location.href = 'login.html';
});
