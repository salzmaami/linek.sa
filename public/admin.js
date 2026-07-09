const state = {
  token: sessionStorage.getItem('linek_admin_token') || '',
  data: {leads: [], owners: [], properties: [], bookings: [], ownerProfiles: [], verificationRequests: [], subscriptions: [], siteSettings: null}
};

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

const tokenInput = document.getElementById('adminToken');
const statusLine = document.getElementById('statusLine');
const toast = document.getElementById('toast');
let pricingForm = document.getElementById('pricingForm');
let pricingStatus = document.getElementById('pricingStatus');

function ensurePricingSection() {
  pricingForm = document.getElementById('pricingForm');
  pricingStatus = document.getElementById('pricingStatus');

  if (pricingForm) return;

  const toolbar = document.querySelector('.toolbar');
  if (!toolbar) return;

  const section = document.createElement('section');
  section.className = 'grid';
  section.innerHTML = `
    <details class="panel span-12 admin-section" id="pricingPanel" open>
      <summary class="panel-head">
        <h2>تسعير الموقع والخصومات</h2>
        <span>تظهر هذه القيم تلقائياً في الصفحة الرئيسية بعد الحفظ</span>
      </summary>
      <form class="settings-form" id="pricingForm">
        <label>
          <span>سعر الباقة الأساسية</span>
          <input name="single_price" type="number" min="0" step="1" value="199">
        </label>
        <label>
          <span>سعر باقة النمو</span>
          <input name="multi_price" type="number" min="0" step="1" value="299">
        </label>
        <label>
          <span>نص الباقة المخصصة</span>
          <input name="custom_label" value="تواصل معنا">
        </label>
        <label>
          <span>مدة التجربة بالأيام</span>
          <input name="trial_days" type="number" min="0" max="90" step="1" value="14">
        </label>
        <label class="check-field">
          <input name="discount_enabled" type="checkbox">
          <span>تفعيل خصم على الباقات</span>
        </label>
        <label>
          <span>نسبة الخصم</span>
          <input name="discount_percent" type="number" min="0" max="90" step="1" value="0">
        </label>
        <label>
          <span>عنوان الخصم</span>
          <input name="discount_label" placeholder="مثال: عرض الإطلاق">
        </label>
        <label class="full">
          <span>ملاحظة الخصم</span>
          <textarea name="discount_note" placeholder="مثال: الخصم متاح لأول 10 ملاك في التجربة المغلقة"></textarea>
        </label>
        <div class="actions full">
          <button type="submit">حفظ التسعير</button>
          <span class="settings-status" id="pricingStatus">لم يتم تحميل التسعير بعد.</span>
        </div>
      </form>
    </details>
  `;
  toolbar.insertAdjacentElement('afterend', section);
  pricingForm = document.getElementById('pricingForm');
  pricingStatus = document.getElementById('pricingStatus');
}

ensurePricingSection();

tokenInput.value = state.token;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function money(value) {
  return `${Number(value || 0).toLocaleString('ar-SA')} ر.س`;
}

function compactMoney(value) {
  const number = Number(value || 0);
  if (number >= 1000) return `${(number / 1000).toLocaleString('ar-SA', {maximumFractionDigits: 1})} ألف`;
  return `${number.toLocaleString('ar-SA')} ر.س`;
}

function pricing() {
  return {
    ...DEFAULT_PRICING,
    ...(state.data.siteSettings?.pricing || {})
  };
}

function setPricingForm() {
  ensurePricingSection();
  if (!pricingForm) return;
  const value = pricing();
  pricingForm.elements.namedItem('single_price').value = value.single_price;
  pricingForm.elements.namedItem('multi_price').value = value.multi_price;
  pricingForm.elements.namedItem('custom_label').value = value.custom_label;
  pricingForm.elements.namedItem('trial_days').value = value.trial_days;
  pricingForm.elements.namedItem('discount_enabled').checked = Boolean(value.discount_enabled);
  pricingForm.elements.namedItem('discount_percent').value = value.discount_percent;
  pricingForm.elements.namedItem('discount_label').value = value.discount_label || '';
  pricingForm.elements.namedItem('discount_note').value = value.discount_note || '';
  const source = state.data.siteSettings?.source === 'fallback' ? 'إعدادات افتراضية' : 'محفوظ في Supabase';
  if (pricingStatus) {
    pricingStatus.textContent = `${source}${state.data.siteSettings?.updated_at ? ` · آخر تحديث ${dateText(state.data.siteSettings.updated_at)}` : ''}`;
  }
}

function readPricingForm() {
  ensurePricingSection();
  const data = Object.fromEntries(new FormData(pricingForm).entries());
  return {
    single_price: Number(data.single_price || DEFAULT_PRICING.single_price),
    multi_price: Number(data.multi_price || DEFAULT_PRICING.multi_price),
    custom_label: String(data.custom_label || DEFAULT_PRICING.custom_label).trim(),
    trial_days: Number(data.trial_days || DEFAULT_PRICING.trial_days),
    discount_enabled: pricingForm.elements.namedItem('discount_enabled').checked,
    discount_percent: Number(data.discount_percent || 0),
    discount_label: String(data.discount_label || '').trim(),
    discount_note: String(data.discount_note || '').trim()
  };
}

function dateText(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ar-SA', {dateStyle: 'medium'}).format(new Date(value));
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
    'الدمام': 'dammam'
  };
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map(word => map[word] || word)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `place-${Date.now().toString().slice(-5)}`;
}

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-linek-admin-token': state.token
  };
}

async function apiGet() {
  const response = await fetch('/api/admin', {headers: apiHeaders()});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'تعذر تحميل البيانات');
  return data;
}

async function apiPost(payload) {
  const response = await fetch('/api/admin', {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'تعذر تنفيذ العملية');
  return data.result;
}

async function loadDashboard() {
  if (!state.token) {
    statusLine.textContent = 'أدخل التوكن لتحميل البيانات.';
    return;
  }
  statusLine.textContent = 'جار تحميل البيانات...';
  try {
    state.data = await apiGet();
    render();
    statusLine.textContent = `آخر تحديث: ${new Date().toLocaleTimeString('ar-SA')}`;
  } catch (error) {
    statusLine.textContent = error.message;
    showToast(error.message);
  }
}

function setMetrics() {
  const leads = state.data.leads || [];
  const owners = state.data.owners || [];
  const properties = state.data.properties || [];
  const ownerProfiles = state.data.ownerProfiles || [];
  const verificationRequests = state.data.verificationRequests || [];
  const subscriptions = state.data.subscriptions || [];
  const pricingValue = pricing();
  const subscriptionPlanPrice = plan => {
    if (['multi', 'professional'].includes(plan)) return Number(pricingValue.multi_price || DEFAULT_PRICING.multi_price);
    if (plan === 'custom') return 0;
    return Number(pricingValue.single_price || DEFAULT_PRICING.single_price);
  };
  const activeSubscriptionKeys = new Set();
  const activeSubscriptionsFromOwners = owners.filter(owner => owner.subscription_status === 'active' && owner.status === 'active');
  const activeSubscriptionsFromTable = subscriptions.filter(subscription => subscription.status === 'active');
  activeSubscriptionsFromOwners.forEach(owner => activeSubscriptionKeys.add(owner.owner_profile_id || owner.user_id || owner.id));
  activeSubscriptionsFromTable.forEach(subscription => activeSubscriptionKeys.add(subscription.owner_id || subscription.id));
  const activeSubscriptions = activeSubscriptionKeys.size;
  const expiredKeys = new Set();
  owners
    .filter(owner => owner.subscription_status === 'expired' || (owner.subscription_status === 'trial' && owner.trial_expired))
    .forEach(owner => expiredKeys.add(owner.owner_profile_id || owner.user_id || owner.id));
  subscriptions
    .filter(subscription => subscription.status === 'expired')
    .forEach(subscription => expiredKeys.add(subscription.owner_id || subscription.id));
  const expiredTrials = expiredKeys.size;
  const cancelledKeys = new Set();
  owners
    .filter(owner => owner.subscription_status === 'cancelled')
    .forEach(owner => cancelledKeys.add(owner.owner_profile_id || owner.user_id || owner.id));
  subscriptions
    .filter(subscription => subscription.status === 'cancelled')
    .forEach(subscription => cancelledKeys.add(subscription.owner_id || subscription.id));
  const cancelledOwners = cancelledKeys.size;
  const pendingApprovals = [
    ...ownerProfiles.filter(profile => profile.verification_status === 'pending'),
    ...verificationRequests.filter(request => request.status === 'submitted'),
    ...properties.filter(property => ['draft', 'under_review'].includes(property.status))
  ].length;
  const rejectedRequests = [
    ...leads.filter(lead => ['rejected', 'not_fit'].includes(lead.status)),
    ...owners.filter(owner => owner.status === 'rejected'),
    ...ownerProfiles.filter(profile => profile.verification_status === 'rejected'),
    ...verificationRequests.filter(request => request.status === 'rejected'),
    ...properties.filter(property => property.status === 'rejected' || property.verification_status === 'rejected')
  ].length;
  const subscriptionRevenue = [
    ...activeSubscriptionsFromOwners.map(owner => ({
      key: owner.owner_profile_id || owner.user_id || owner.id,
      amount: subscriptionPlanPrice(owner.plan_code)
    })),
    ...activeSubscriptionsFromTable.map(subscription => ({
      key: subscription.owner_id || subscription.id,
      amount: subscriptionPlanPrice(subscription.plan)
    }))
  ].reduce((sum, item, index, list) => {
    if (list.findIndex(other => other.key === item.key) !== index) return sum;
    return sum + item.amount;
  }, 0);

  const maxMetric = Math.max(activeSubscriptions, expiredTrials, cancelledOwners, pendingApprovals, rejectedRequests, 1);
  setMetricRing('metricActiveSubscriptions', activeSubscriptions, maxMetric);
  setMetricRing('metricExpiredTrials', expiredTrials, maxMetric);
  setMetricRing('metricCancelledOwners', cancelledOwners, maxMetric);
  setMetricRing('metricPendingApprovals', pendingApprovals, maxMetric);
  setMetricRing('metricRejectedRequests', rejectedRequests, maxMetric);
  setMetricRing('metricLinekRevenue', compactMoney(subscriptionRevenue), Math.max(subscriptionRevenue, Number(pricingValue.multi_price || DEFAULT_PRICING.multi_price), 1), subscriptionRevenue);
}

function setMetricRing(id, value, maxValue, angleValue = value) {
  const number = document.getElementById(id);
  if (!number) return;
  const safeValue = Number(angleValue || 0);
  const angle = safeValue === 0 ? 0 : Math.max(42, Math.round((safeValue / maxValue) * 360));
  number.textContent = value;
  number.closest('.metric-card')?.style.setProperty('--metric-angle', `${angle}deg`);
}

function leadBadge(status) {
  const labels = {
    new: 'جديد',
    contacted: 'تم التواصل',
    qualified: 'مناسب',
    rejected: 'مرفوض',
    converted: 'تحول لعقار',
    closed: 'مغلق',
    not_fit: 'غير مناسب'
  };
  return labels[status] || status || 'جديد';
}

function ownerBadge(owner) {
  if (owner.status === 'paused' && owner.subscription_status === 'trial') return '<span class="badge warn">بانتظار اعتماد</span>';
  if (owner.status === 'rejected') return '<span class="badge danger">مرفوض</span>';
  if (owner.subscription_status === 'cancelled') return '<span class="badge danger">ملغي</span>';
  if (owner.subscription_status === 'active') return '<span class="badge">مشترك</span>';
  if (owner.trial_expired) return '<span class="badge danger">انتهت التجربة</span>';
  if (owner.trial_needs_alert) return '<span class="badge warn">يحتاج تنبيه</span>';
  return '<span class="badge">تجربة فعالة</span>';
}

function propertyStatusLabel(status) {
  const labels = {
    draft: 'بانتظار بيانات المالك',
    under_review: 'تحت مراجعة Linek',
    published: 'منشور',
    paused: 'متوقف',
    rejected: 'مرفوض'
  };
  return labels[status] || status || '-';
}

function whatsappLink(phone, message) {
  const clean = String(phone || '').replace(/[^\d]/g, '');
  return clean ? `https://wa.me/${clean}?text=${encodeURIComponent(message)}` : '#';
}

function ownerSetupLink(property) {
  return `${location.origin}/owner-intake.html?token=${encodeURIComponent(property.owner_setup_token || '')}`;
}

function publicStayLink(property) {
  return `${location.origin}/stay.html?slug=${encodeURIComponent(property.slug)}`;
}

function renderLeads() {
  const list = document.getElementById('leadsList');
  const leads = (state.data.leads || []).filter(lead => lead.status !== 'converted').slice(0, 30);
  if (!leads.length) {
    list.innerHTML = '<div class="empty">لا توجد طلبات بداية تحتاج إجراء.</div>';
    return;
  }

  list.innerHTML = leads.map(lead => {
    const planCode = Number(lead.places || 1) > 1 ? 'multi' : 'single';
    const applyLink = `${location.origin}/owner-apply.html?plan=${encodeURIComponent(planCode)}`;
    const applyWhatsapp = whatsappLink(lead.phone, `مرحباً ${lead.name || ''}،\nهذا رابط إكمال طلب الانضمام إلى تجربة Linek:\n${applyLink}\nبعد تعبئة بيانات المالك والمكان ووسيلة الدفع، يدخل الطلب لمراجعة Linek قبل نشر رابط الضيف.`);
    return `
      <details class="card" data-lead-card="${escapeHtml(lead.id)}">
        <summary class="card-head">
          <div class="title">
            <b>${escapeHtml(lead.name)}</b>
            <small>${escapeHtml(lead.phone)} · ${escapeHtml(lead.city)} · ${escapeHtml(lead.property_type)} · ${lead.places || 1} مكان</small>
          </div>
          <span class="badge">${escapeHtml(leadBadge(lead.status))}</span>
        </summary>
        <small>${escapeHtml(lead.message || 'لا توجد ملاحظات')}</small>
        <small>هذا طلب تواصل مختصر فقط. مسار الانضمام الصحيح يبدأ من صفحة المالك الكاملة ثم يظهر في طلبات التوثيق.</small>
        <div class="actions">
          <a class="button-link secondary" href="${applyWhatsapp}" target="_blank" rel="noopener">إرسال رابط الانضمام واتساب</a>
          <button type="button" class="secondary" data-copy="${escapeHtml(applyLink)}">نسخ رابط الانضمام</button>
          <button type="button" class="danger" data-action="reject-lead" data-lead-id="${escapeHtml(lead.id)}">رفض</button>
        </div>
      </details>
    `;
  }).join('');
}

function trialMessage(owner) {
  const paymentLine = owner.linek_subscription_payment_link
    ? `رابط الاشتراك: ${owner.linek_subscription_payment_link}`
    : 'أرسلوا لنا لتفعيل الاشتراك الشهري.';
  return encodeURIComponent([
    `مرحباً ${owner.name}،`,
    'تنبيه من Linek: تجربة 14 يوم قاربت على الانتهاء أو انتهت.',
    'لاستمرار صفحة الحجز الموثقة بدون توقف، فضلاً أكمل الاشتراك الشهري.',
    paymentLine
  ].join('\n'));
}

function renderOwners() {
  const list = document.getElementById('ownersList');
  const owners = state.data.owners || [];
  if (!owners.length) {
    list.innerHTML = '<div class="empty">لا توجد تجارب ملاك بعد.</div>';
    return;
  }

  list.innerHTML = owners.map(owner => {
    const days = owner.trial_days_left;
    const daysText = days === null ? '-' : days <= 0 ? 'منتهية' : `${days} يوم`;
    const whatsapp = `https://wa.me/${String(owner.phone || '').replace(/[^\d]/g, '')}?text=${trialMessage(owner)}`;
    return `
      <details class="card" data-owner-card="${escapeHtml(owner.id)}">
        <summary class="card-head">
          <div class="title">
            <b>${escapeHtml(owner.name)}</b>
            <small>${escapeHtml(owner.phone)} · نهاية التجربة: ${dateText(owner.trial_ends_at)} · المتبقي: ${daysText}</small>
          </div>
          ${ownerBadge(owner)}
        </summary>
        <label><span>رابط دفع اشتراك Linek</span><input data-field="linek_subscription_payment_link" value="${escapeHtml(owner.linek_subscription_payment_link || '')}" placeholder="https://..." dir="ltr"></label>
        <div class="actions">
          <button type="button" data-action="save-owner" data-owner-id="${escapeHtml(owner.id)}">حفظ الرابط</button>
          <button type="button" data-action="mark-paid" data-owner-id="${escapeHtml(owner.id)}">تسجيل أنه دفع لنا</button>
          <a class="button-link secondary" href="${whatsapp}" target="_blank" rel="noopener" data-action="alert-owner" data-owner-id="${escapeHtml(owner.id)}">إرسال تنبيه واتساب</a>
          <button type="button" class="danger" data-action="cancel-owner" data-owner-id="${escapeHtml(owner.id)}">إلغاء الاشتراك وإيقاف الخدمة</button>
        </div>
      </details>
    `;
  }).join('');
}

function renderProperties() {
  const list = document.getElementById('propertiesList');
  const properties = state.data.properties || [];
  if (!properties.length) {
    list.innerHTML = '<div class="empty">لا توجد طلبات توثيق أو عقارات منشورة بعد.</div>';
    return;
  }

  list.innerHTML = properties.map(property => {
    const publicLink = publicStayLink(property);
    const consoleLink = ownerSetupLink(property);
    const ownerPhone = property.owners?.phone || '';
    const consoleWhatsapp = whatsappLink(ownerPhone, `مرحباً، تم قبول توثيق مكانك في Linek.\nهذا رابط التحكم الخاص بك:\n${consoleLink}\nومن داخله تقدر تراجع رابط صفحة الضيف وتشاركه.`);
    const publicWhatsapp = whatsappLink(ownerPhone, `تم نشر صفحة الحجز الموثقة الخاصة بك في Linek:\n${publicLink}`);
    const photos = (property.property_photos || [])
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .map(photo => photo.url)
      .filter(Boolean);
    return `
      <details class="card" data-property-card="${escapeHtml(property.id)}">
        <summary class="card-head">
          <div class="title">
            <b>${escapeHtml(property.name)}</b>
            <small>${escapeHtml(property.city)} · ${escapeHtml(property.property_type)} · ${money(property.base_price)} · ${escapeHtml(property.owners?.name || '')} · ${dateText(property.owner_setup_submitted_at || property.created_at)}</small>
          </div>
          <span class="badge">${escapeHtml(propertyStatusLabel(property.status))}</span>
        </summary>
        <div class="fields">
          <label><span>الحالة</span><input value="${escapeHtml(propertyStatusLabel(property.status))}" readonly></label>
          <label><span>حالة التوثيق</span><input value="${escapeHtml(property.verification_status || '-')}" readonly dir="ltr"></label>
          <label><span>رابط دفع المالك</span><input value="${escapeHtml(property.payment_link || 'لم يضاف')}" readonly dir="ltr"></label>
          <label><span>وقت الدخول / الخروج</span><input value="${escapeHtml(`${property.check_in || '-'} / ${property.check_out || '-'}`)}" readonly></label>
          <label class="full"><span>رابط الموقع على الخرائط</span><input value="${escapeHtml(property.map_link || 'لم يضاف')}" readonly dir="ltr"></label>
          <label class="full"><span>الوصف</span><textarea readonly>${escapeHtml(property.description || '-')}</textarea></label>
          <label class="full"><span>سياسة الإلغاء</span><textarea readonly>${escapeHtml(property.cancellation_policy || '-')}</textarea></label>
          <label class="full"><span>تعليمات المكان</span><textarea readonly>${escapeHtml(property.rules || '-')}</textarea></label>
          <label class="full"><span>ملاحظة الدفع</span><textarea readonly>${escapeHtml(property.payment_method_note || '-')}</textarea></label>
          ${photos.length ? `<label class="full"><span>روابط الصور</span><textarea readonly dir="ltr">${escapeHtml(photos.join('\n'))}</textarea></label>` : ''}
        </div>
        ${property.status === 'published' ? `<label><span>رابط الضيف المنشور</span><input value="${escapeHtml(publicLink)}" readonly dir="ltr"></label>` : ''}
        ${property.status === 'published' && property.owner_setup_token ? `<label><span>رابط تحكم المالك</span><input value="${escapeHtml(consoleLink)}" readonly dir="ltr"></label>` : ''}
        <div class="actions">
          ${property.status === 'under_review' || property.status === 'draft' ? `<button type="button" data-action="publish-property" data-property-id="${escapeHtml(property.id)}">اعتماد التوثيق ونشر رابط الضيف</button><button type="button" class="danger" data-action="reject-property" data-property-id="${escapeHtml(property.id)}">رفض الطلب</button>` : ''}
          ${property.status === 'published' && property.owner_setup_token ? `<a class="button-link secondary" href="${consoleWhatsapp}" target="_blank" rel="noopener">إرسال رابط التحكم واتساب</a><button type="button" class="secondary" data-copy="${escapeHtml(consoleLink)}">نسخ رابط التحكم</button>` : ''}
          ${property.status === 'published' ? `<a class="button-link" href="${publicLink}" target="_blank" rel="noopener">فتح رابط الضيف</a><a class="button-link secondary" href="${publicWhatsapp}" target="_blank" rel="noopener">إرسال رابط الضيف واتساب</a><button type="button" class="secondary" data-copy="${escapeHtml(publicLink)}">نسخ رابط الضيف</button>` : ''}
        </div>
      </details>
    `;
  }).join('');
}

function profileStatusLabel(status) {
  const labels = {
    pending: 'بانتظار المراجعة',
    approved: 'معتمد',
    rejected: 'مرفوض',
    more_information_required: 'معلومات إضافية'
  };
  return labels[status] || status || 'بانتظار';
}

function latestRequestForProfile(profileId) {
  return (state.data.verificationRequests || []).find(request => request.owner_id === profileId) || null;
}

function renderVerifications() {
  const list = document.getElementById('verificationList');
  if (!list) return;
  const profiles = state.data.ownerProfiles || [];
  if (!profiles.length) {
    list.innerHTML = '<div class="empty">لا توجد حسابات ملاك من مسار التسجيل الجديد.</div>';
    return;
  }
  list.innerHTML = profiles.map(profile => {
    const request = latestRequestForProfile(profile.id);
    const whatsapp = whatsappLink(profile.whatsapp_number, `مرحباً ${profile.full_name || ''}،\nتم تحديث حالة توثيق حسابك في Linek: ${profileStatusLabel(profile.verification_status)}.`);
    return `
      <details class="card" data-profile-card="${escapeHtml(profile.id)}">
        <summary class="card-head">
          <div class="title">
            <b>${escapeHtml(profile.full_name)}</b>
            <small>${escapeHtml(profile.whatsapp_number)} · ${escapeHtml(profile.city)} · ${dateText(profile.created_at)}</small>
          </div>
          <span class="badge ${profile.verification_status === 'rejected' ? 'danger' : profile.verification_status === 'pending' ? 'warn' : ''}">${escapeHtml(profileStatusLabel(profile.verification_status))}</span>
        </summary>
        <div class="fields">
          <label><span>النشاط</span><input value="${escapeHtml(profile.business_name || '-')}" readonly></label>
          <label><span>حالة الطلب</span><input value="${escapeHtml(request?.status || 'لا يوجد طلب مرفوع')}" readonly></label>
          <label class="full"><span>ملفات التوثيق</span><textarea readonly dir="ltr">${escapeHtml([
            request?.national_id_file,
            request?.selfie_file,
            request?.ownership_document,
            request?.commercial_registration
          ].filter(Boolean).join('\n') || 'لم ترفع ملفات بعد')}</textarea></label>
          <label class="full"><span>ملاحظات المالك</span><textarea readonly>${escapeHtml(request?.notes || '-')}</textarea></label>
          <label class="full"><span>سبب القرار</span><textarea data-field="verification_reason" placeholder="يظهر للمالك عند الرفض أو طلب معلومات إضافية">${escapeHtml(profile.rejection_reason || '')}</textarea></label>
        </div>
        <div class="actions">
          <button type="button" data-action="verification-decision" data-decision="approve" data-profile-id="${escapeHtml(profile.id)}">اعتماد الحساب</button>
          <button type="button" class="secondary" data-action="verification-decision" data-decision="more" data-profile-id="${escapeHtml(profile.id)}">طلب معلومات إضافية</button>
          <button type="button" class="danger" data-action="verification-decision" data-decision="reject" data-profile-id="${escapeHtml(profile.id)}">رفض</button>
          <a class="button-link secondary" href="${whatsapp}" target="_blank" rel="noopener">إشعار واتساب</a>
        </div>
      </details>
    `;
  }).join('');
}

function bookingActions(booking) {
  return `
    <button type="button" data-action="booking-status" data-booking-id="${escapeHtml(booking.id)}" data-status="pending_payment" data-payment-status="waiting_for_payment">قبول وبانتظار الدفع</button>
    <button type="button" data-action="booking-status" data-booking-id="${escapeHtml(booking.id)}" data-status="confirmed" data-payment-status="paid_confirmed">تأكيد</button>
    <button type="button" class="danger" data-action="booking-status" data-booking-id="${escapeHtml(booking.id)}" data-status="rejected" data-payment-status="cancelled">رفض</button>
  `;
}

function renderBookings() {
  const list = document.getElementById('bookingsList');
  const bookings = state.data.bookings || [];
  if (!bookings.length) {
    list.innerHTML = '<div class="empty">لا توجد طلبات حجز بعد.</div>';
    return;
  }

  list.innerHTML = bookings.map(booking => `
    <details class="card">
      <summary class="card-head">
        <div class="title">
          <b>${escapeHtml(booking.guest_name)} · ${escapeHtml(booking.public_code)}</b>
          <small>${escapeHtml(booking.guest_phone)} · ${escapeHtml(booking.properties?.name || '')} · ${dateText(booking.booking_date)} · ${money(booking.amount)}</small>
        </div>
        <span class="badge">${escapeHtml(booking.status)}</span>
      </summary>
      <small>حالة الدفع: ${escapeHtml(booking.payment_status)}</small>
      <div class="actions">${bookingActions(booking)}</div>
    </details>
  `).join('');
}

function render() {
  setMetrics();
  setPricingForm();
  renderVerifications();
  renderLeads();
  renderOwners();
  renderProperties();
  renderBookings();
}

function readCardFields(card) {
  const data = {};
  card.querySelectorAll('[data-field]').forEach(input => {
    data[input.dataset.field] = input.value;
  });
  return data;
}

document.getElementById('tokenForm').addEventListener('submit', event => {
  event.preventDefault();
  state.token = tokenInput.value.trim();
  sessionStorage.setItem('linek_admin_token', state.token);
  loadDashboard();
});

document.getElementById('refreshData').addEventListener('click', loadDashboard);

document.getElementById('pauseExpired').addEventListener('click', async () => {
  try {
    const result = await apiPost({action: 'pauseExpiredTrials'});
    showToast(`تم إيقاف ${result.length || 0} تجربة منتهية`);
    await loadDashboard();
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector('.metrics')?.addEventListener('click', event => {
  const metric = event.target.closest('[data-open-section]');
  if (!metric) return;

  const section = document.getElementById(metric.dataset.openSection);
  if (!section) return;

  section.open = true;
  section.scrollIntoView({behavior: 'smooth', block: 'start'});
});

document.body.addEventListener('submit', async event => {
  if (event.target?.id !== 'pricingForm') return;
  event.preventDefault();
  ensurePricingSection();
  try {
    if (pricingStatus) pricingStatus.textContent = 'جار حفظ التسعير...';
    const result = await apiPost({
      action: 'updateSiteSettings',
      pricing: readPricingForm()
    });
    state.data.siteSettings = result;
    setPricingForm();
    showToast('تم حفظ التسعير والخصومات');
  } catch (error) {
    if (pricingStatus) pricingStatus.textContent = error.message;
    showToast(error.message);
  }
});

document.body.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  const copy = event.target.closest('[data-copy]');

  if (copy) {
    try { await navigator.clipboard.writeText(copy.dataset.copy); } catch (_) {}
    showToast('تم نسخ الرابط');
    return;
  }

  if (!button) return;

  try {
    if (button.dataset.action === 'convert-lead') {
      const card = button.closest('[data-lead-card]');
      const fields = readCardFields(card);
      if (!fields.slug) throw new Error('أدخل slug للرابط');
      await apiPost({
        action: 'convertLead',
        leadId: button.dataset.leadId,
        ...fields
      });
      showToast('تم إنشاء ملف مالك يدوي');
      await loadDashboard();
    }

    if (button.dataset.action === 'reject-lead') {
      const reason = prompt('سبب الرفض الداخلي؟') || 'مرفوض';
      await apiPost({action: 'rejectLead', leadId: button.dataset.leadId, reason});
      showToast('تم رفض الطلب');
      await loadDashboard();
    }

    if (button.dataset.action === 'save-owner') {
      const card = button.closest('[data-owner-card]');
      const fields = readCardFields(card);
      await apiPost({
        action: 'updateOwner',
        ownerId: button.dataset.ownerId,
        linek_subscription_payment_link: fields.linek_subscription_payment_link
      });
      showToast('تم حفظ رابط اشتراك Linek');
      await loadDashboard();
    }

    if (button.dataset.action === 'mark-paid') {
      await apiPost({action: 'updateOwner', ownerId: button.dataset.ownerId, markPaid: true});
      showToast('تم تسجيل الاشتراك كمدفوع');
      await loadDashboard();
    }

    if (button.dataset.action === 'cancel-owner') {
      if (!confirm('تأكيد إلغاء الاشتراك وإيقاف صفحات هذا المالك؟')) return;
      await apiPost({action: 'updateOwner', ownerId: button.dataset.ownerId, cancelSubscription: true});
      showToast('تم إلغاء الاشتراك وإيقاف الخدمة');
      await loadDashboard();
    }

    if (button.dataset.action === 'alert-owner') {
      event.preventDefault();
      await apiPost({action: 'updateOwner', ownerId: button.dataset.ownerId, markAlerted: true});
      window.open(button.href, '_blank', 'noopener');
      await loadDashboard();
    }

    if (button.dataset.action === 'booking-status') {
      await apiPost({
        action: 'updateBooking',
        bookingId: button.dataset.bookingId,
        status: button.dataset.status,
        payment_status: button.dataset.paymentStatus
      });
      showToast('تم تحديث طلب الحجز');
      await loadDashboard();
    }

    if (button.dataset.action === 'verification-decision') {
      const card = button.closest('[data-profile-card]');
      const fields = readCardFields(card);
      await apiPost({
        action: 'updateVerification',
        profileId: button.dataset.profileId,
        decision: button.dataset.decision,
        reason: fields.verification_reason || ''
      });
      showToast('تم تحديث حالة التوثيق');
      await loadDashboard();
    }

    if (button.dataset.action === 'publish-property') {
      await apiPost({
        action: 'updateProperty',
        propertyId: button.dataset.propertyId,
        status: 'published',
        verification_status: 'verified_payment_reviewed'
      });
      showToast('تم اعتماد الطلب ونشر رابط الضيف');
      await loadDashboard();
    }

    if (button.dataset.action === 'reject-property') {
      const reason = prompt('سبب رفض طلب التوثيق؟') || 'لم يتم قبول الطلب وفق معايير Linek الحالية';
      await apiPost({
        action: 'updateProperty',
        propertyId: button.dataset.propertyId,
        status: 'rejected',
        verification_status: 'rejected',
        internal_note: reason
      });
      showToast('تم رفض طلب التوثيق');
      await loadDashboard();
    }
  } catch (error) {
    showToast(error.message);
  }
});

if (state.token) loadDashboard();
