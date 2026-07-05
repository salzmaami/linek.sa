const state = {
  token: sessionStorage.getItem('linek_admin_token') || '',
  data: {leads: [], owners: [], properties: [], bookings: []}
};

const tokenInput = document.getElementById('adminToken');
const statusLine = document.getElementById('statusLine');
const toast = document.getElementById('toast');

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
  const bookings = state.data.bookings || [];
  const alerts = owners.filter(owner => owner.trial_needs_alert || owner.trial_expired).length;
  document.getElementById('metricLeads').textContent = leads.filter(lead => ['new', 'contacted', 'qualified'].includes(lead.status)).length;
  document.getElementById('metricOwners').textContent = owners.filter(owner => owner.subscription_status === 'trial').length;
  document.getElementById('metricAlerts').textContent = alerts;
  document.getElementById('metricBookings').textContent = bookings.length;
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
    const initialName = `${lead.property_type || 'مكان'} ${lead.city || ''}`.trim();
    const suggestedSlug = slugify(initialName || lead.name);
    const planCode = Number(lead.places || 1) > 1 ? 'multi' : 'single';
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
        <div class="fields">
          <label><span>اسم العقار</span><input data-field="propertyName" value="${escapeHtml(initialName || 'شاليه جديد')}"></label>
          <label><span>الرابط slug</span><input data-field="slug" value="${escapeHtml(suggestedSlug)}" dir="ltr"></label>
          <label><span>الخطة</span><select data-field="planCode"><option value="single" ${planCode === 'single' ? 'selected' : ''}>مكان واحد - 199</option><option value="multi" ${planCode === 'multi' ? 'selected' : ''}>حتى 5 أماكن - 399</option><option value="custom">عرض مخصص</option></select></label>
          <label class="full"><span>رابط دفع اشتراك Linek بعد 14 يوم</span><input data-field="linekSubscriptionPaymentLink" type="url" placeholder="https://..." dir="ltr"></label>
          <label class="full"><span>ملاحظة داخلية</span><textarea data-field="internalNote" placeholder="سبب القبول/ملاحظات التشغيل"></textarea></label>
        </div>
        <div class="actions">
          <button type="button" data-action="convert-lead" data-lead-id="${escapeHtml(lead.id)}">قبول مبدئي وإنشاء رابط تجهيز البيانات</button>
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
    list.innerHTML = '<div class="empty">لا توجد عقارات منشأة بعد.</div>';
    return;
  }

  list.innerHTML = properties.map(property => {
    const publicLink = publicStayLink(property);
    const setupLink = ownerSetupLink(property);
    const ownerPhone = property.owners?.phone || '';
    const setupWhatsapp = whatsappLink(ownerPhone, `مرحباً، هذا رابط تجهيز بيانات مكانك في Linek:\n${setupLink}\nبعد الإرسال سنراجع البيانات ونرسل لك رابط صفحة الضيف.`);
    const publicWhatsapp = whatsappLink(ownerPhone, `تم نشر صفحة الحجز الموثقة الخاصة بك في Linek:\n${publicLink}`);
    return `
      <details class="card" data-property-card="${escapeHtml(property.id)}">
        <summary class="card-head">
          <div class="title">
            <b>${escapeHtml(property.name)}</b>
            <small>${escapeHtml(property.city)} · ${escapeHtml(property.property_type)} · ${money(property.base_price)} · ${escapeHtml(property.owners?.name || '')}</small>
          </div>
          <span class="badge">${escapeHtml(propertyStatusLabel(property.status))}</span>
        </summary>
        ${property.status === 'published' ? `<label><span>رابط الضيف المنشور</span><input value="${escapeHtml(publicLink)}" readonly dir="ltr"></label>` : ''}
        ${property.owner_setup_token ? `<label><span>رابط تجهيز بيانات المالك</span><input value="${escapeHtml(setupLink)}" readonly dir="ltr"></label>` : ''}
        <div class="actions">
          ${property.owner_setup_token ? `<a class="button-link secondary" href="${setupWhatsapp}" target="_blank" rel="noopener">إرسال رابط التجهيز واتساب</a><button type="button" class="secondary" data-copy="${escapeHtml(setupLink)}">نسخ رابط التجهيز</button>` : ''}
          ${property.status === 'under_review' || property.status === 'draft' ? `<button type="button" data-action="publish-property" data-property-id="${escapeHtml(property.id)}">اعتماد ونشر رابط الضيف</button>` : ''}
          ${property.status === 'published' ? `<a class="button-link" href="${publicLink}" target="_blank" rel="noopener">فتح رابط الضيف</a><a class="button-link secondary" href="${publicWhatsapp}" target="_blank" rel="noopener">إرسال رابط الضيف واتساب</a><button type="button" class="secondary" data-copy="${escapeHtml(publicLink)}">نسخ رابط الضيف</button>` : ''}
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
      showToast('تم قبول المالك وإنشاء رابط تجهيز البيانات');
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

    if (button.dataset.action === 'publish-property') {
      await apiPost({
        action: 'updateProperty',
        propertyId: button.dataset.propertyId,
        status: 'published',
        verification_status: 'verified_payment_reviewed'
      });
      showToast('تم نشر رابط الضيف');
      await loadDashboard();
    }
  } catch (error) {
    showToast(error.message);
  }
});

if (state.token) loadDashboard();
