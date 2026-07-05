const toast = document.getElementById('selectionToast');
const setupModal = document.getElementById('setupModal');
const setupSteps = document.querySelectorAll('.setup-step');
const progressBars = document.querySelectorAll('.setup-progress i');
const LINEK_WHATSAPP_NUMBER = '966570547475';
const LINEK_LEADS_CONFIG = window.LINEK_LEADS_CONFIG || {};
let setupStep = 1;
let selectedPlan = 'single';

const placeModes = {
  single: {
    title: 'صفحة موثقة تليق بمكانك',
    description: 'صورك، وصفك، موقعك، بطاقة التوثيق، وسياسات الحجز في صفحة واضحة تبني الثقة قبل الدفع.',
    name: 'شاليه سُكون',
    prompt: 'موثق من Linek · اختر تاريخك المناسب',
    action: 'عرض الأيام المتاحة'
  },
  multi: {
    title: 'كل أماكنك موثقة في منصة واحدة',
    description: 'اعرض شاليهاتك أو شققك اليومية معًا، ولكل مكان صفحته الموثقة وتقويمه وسعره وبطاقة الثقة الخاصة به.',
    name: 'مجموعة سُكون · ٣ أماكن',
    prompt: 'أماكن موثقة من Linek',
    action: 'استعرض كل الأماكن'
  }
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function setSetupStep(step) {
  setupStep = step;
  setupSteps.forEach(item => item.classList.toggle('active', Number(item.dataset.step) === step));
  progressBars.forEach((item, index) => item.classList.toggle('active', index < step));
}

function setPlan(plan) {
  selectedPlan = plan;
  setupModal.dataset.plan = plan;
  document.querySelectorAll('[data-plan-choice]').forEach(item => item.classList.toggle('active', item.dataset.planChoice === plan));
}

function openSetup(plan = 'single') {
  setPlan(plan);
  setSetupStep(1);
  setupModal.classList.add('open');
  setupModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeSetup() {
  setupModal.classList.remove('open');
  setupModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function validateSetupStep() {
  const stepPanel = document.querySelector(`.setup-step[data-step="${setupStep}"]`);
  if (!stepPanel) return true;
  const controls = [...stepPanel.querySelectorAll('input, select, textarea')];
  for (const control of controls) {
    if (!control.checkValidity()) {
      control.focus();
      control.reportValidity();
      showToast(control.title || 'راجع الخانات المطلوبة');
      return false;
    }
  }
  return true;
}

function slugify(value) {
  const clean = value.normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g, '');
  const map = {'شاليه': 'chalet', 'سكون': 'sukoon', 'شقة': 'apartment', 'استراحة': 'retreat'};
  return clean.trim().split(/\s+/).map(word => map[word] || word).join('-').replace(/[^a-zA-Z0-9\u0600-\u06FF-]/g, '') || 'my-place';
}

function buildLeadMessage(data) {
  return [
    'طلب بداية جديد من Linek',
    '',
    `الاسم: ${data.name || '-'}`,
    `الجوال: ${data.phone || '-'}`,
    `الباقة: ${data.topic || '-'}`,
    `عدد الأماكن: ${data.places || '-'}`,
    `نوع العقار: ${data.propertyType || '-'}`,
    `المدينة: ${data.city || '-'}`,
    `ملاحظات: ${data.message || '-'}`,
    '',
    'أرغب بتجربة 14 يوم وترتيب صفحة حجز موثقة تبني ثقة الضيف قبل الدفع.'
  ].join('\n');
}

function buildWhatsappUrl(data) {
  const message = encodeURIComponent(buildLeadMessage(data));
  return LINEK_WHATSAPP_NUMBER
    ? `https://wa.me/${LINEK_WHATSAPP_NUMBER}?text=${message}`
    : `https://wa.me/?text=${message}`;
}

function normalizeLeadData(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  return {
    name: String(data.name || '').trim(),
    phone: String(data.phone || '').trim(),
    topic: String(data.topic || '').trim(),
    places: Number(data.places || 1),
    propertyType: String(data.propertyType || '').trim(),
    city: String(data.city || '').trim(),
    message: String(data.message || '').trim()
  };
}

function normalizeSetupLeadData() {
  const places = selectedPlan === 'single' ? 1 : Number(document.getElementById('setupPlaceCount').value || 2);
  const placeName = document.getElementById('setupPlaceName').value.trim();
  const planName = selectedPlan === 'single' ? 'أبي أبدأ الباقة الأساسية' : 'أبي باقة النمو حتى ٥ أماكن';
  return {
    name: document.getElementById('setupOwnerName').value.trim(),
    phone: document.getElementById('setupOwnerPhone').value.trim(),
    topic: planName,
    places,
    propertyType: document.getElementById('setupPlaceType').value,
    city: document.getElementById('setupCity').value,
    message: `طلب بداية من نافذة 14 يوم. اسم المكان: ${placeName}. لا يتم إصدار الرابط إلا بعد مراجعة Linek وقبول الطلب.`
  };
}

function toLeadPayload(data) {
  return {
    name: data.name,
    phone: data.phone,
    topic: data.topic,
    places: data.places,
    property_type: data.propertyType,
    city: data.city,
    message: data.message || null,
    status: 'new',
    source: 'site_contact_form'
  };
}

async function saveLead(data) {
  const endpoint = (LINEK_LEADS_CONFIG.endpoint || '').trim();
  const supabaseUrl = (LINEK_LEADS_CONFIG.supabaseUrl || '').trim().replace(/\/$/, '');
  const supabaseAnonKey = (LINEK_LEADS_CONFIG.supabaseAnonKey || '').trim();
  const payload = toLeadPayload(data);

  if (endpoint) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Lead endpoint failed');
    return {saved: true, mode: 'endpoint'};
  }

  if (supabaseUrl && supabaseAnonKey) {
    const response = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Supabase insert failed');
    return {saved: true, mode: 'supabase'};
  }

  return {saved: false, mode: 'whatsapp'};
}

function renderLeadSummary(summary, data, saveResult) {
  summary.hidden = false;
  summary.dataset.saveStatus = saveResult.saved ? 'saved' : saveResult.mode === 'error' ? 'error' : 'pending';
  summary.replaceChildren();
  document.getElementById('requestReceived').hidden = false;

  const title = document.createElement('b');
  title.textContent = 'ملخص طلب البداية';

  const customer = document.createElement('span');
  customer.textContent = `${data.name || 'عميل جديد'} · ${data.phone || 'بدون رقم'}`;

  const details = document.createElement('span');
  details.textContent = `${data.topic} · ${data.places} مكان · ${data.propertyType} · ${data.city}`;

  const note = document.createElement('small');
  if (saveResult.saved) {
    note.textContent = 'تم حفظ الطلب للمتابعة. أرسل نسخة واتساب لتسريع التواصل.';
  } else if (saveResult.mode === 'error') {
    note.textContent = 'تعذر حفظ الطلب الآن. أرسل نسخة واتساب حتى لا يضيع الطلب.';
  } else {
    note.textContent = LINEK_WHATSAPP_NUMBER
      ? 'قاعدة البيانات غير مفعلة بعد. اضغط الزر لإرسال الطلب إلى واتساب Linek الرسمي.'
      : 'قاعدة البيانات ورقم Linek الرسمي غير مفعلة بعد. اضغط الزر لفتح واتساب برسالة جاهزة.';
  }

  const whatsapp = document.createElement('a');
  whatsapp.className = 'whatsapp-button';
  whatsapp.href = buildWhatsappUrl(data);
  whatsapp.target = '_blank';
  whatsapp.rel = 'noopener';
  whatsapp.textContent = 'إرسال الطلب عبر واتساب';

  summary.append(title, customer, details, note, whatsapp);
}

document.querySelectorAll('[data-place-mode]').forEach(button => button.addEventListener('click', () => {
  const content = placeModes[button.dataset.placeMode];
  document.querySelectorAll('[data-place-mode]').forEach(item => item.classList.toggle('active', item === button));
  document.getElementById('portfolioTitle').textContent = content.title;
  document.getElementById('portfolioDescription').textContent = content.description;
  document.getElementById('screenPlaceName').textContent = content.name;
  document.getElementById('screenPrompt').textContent = content.prompt;
  document.getElementById('screenAction').textContent = content.action;
}));

document.querySelectorAll('[data-start-plan]').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  openSetup(button.dataset.startPlan);
}));
document.querySelectorAll('[data-close-setup]').forEach(button => button.addEventListener('click', closeSetup));
document.querySelectorAll('[data-plan-choice]').forEach(button => button.addEventListener('click', () => setPlan(button.dataset.planChoice)));
document.querySelectorAll('.setup-next').forEach(button => button.addEventListener('click', () => {
  if (!validateSetupStep()) return;
  if (setupStep === 2) {
    return;
  }
  setSetupStep(Math.min(3, setupStep + 1));
}));

document.getElementById('submitSetupLead').addEventListener('click', async () => {
  if (!validateSetupStep()) return;
  const button = document.getElementById('submitSetupLead');
  const data = normalizeSetupLeadData();
  const price = selectedPlan === 'single' ? '١٩٩' : '٣٩٩';
  const count = selectedPlan === 'single' ? 'مكان واحد' : `${data.places} أماكن`;
  button.disabled = true;
  button.textContent = 'جار حفظ الطلب...';
  try {
    const saveResult = await saveLead(data);
    document.getElementById('setupSummary').textContent = `${count} · ${price} ر.س شهريًا بعد تجربة 14 يوم · ${saveResult.saved ? 'تم حفظ الطلب' : 'أرسل نسخة واتساب للتأكيد'}`;
    showToast(saveResult.saved ? 'تم حفظ طلب البداية' : 'تم تجهيز الطلب');
    setSetupStep(3);
  } catch (_) {
    document.getElementById('setupSummary').textContent = `${count} · ${price} ر.س شهريًا بعد تجربة 14 يوم · تعذر الحفظ`;
    showToast('تعذر حفظ الطلب، استخدم نموذج التواصل');
    setSetupStep(3);
  } finally {
    button.disabled = false;
    button.textContent = 'أرسل طلب البداية ←';
  }
});

document.querySelector('.setup-back').addEventListener('click', () => setSetupStep(1));
document.getElementById('viewProduct').addEventListener('click', () => document.getElementById('product').scrollIntoView({behavior: 'smooth'}));
document.getElementById('contactForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) {
    showToast('راجع الخانات المطلوبة قبل إرسال الطلب');
    form.reportValidity();
    return;
  }
  const submitButton = form.querySelector('button[type="submit"]');
  const data = normalizeLeadData(form);
  const summary = document.getElementById('leadSummary');
  let saveResult;

  submitButton.disabled = true;
  submitButton.textContent = 'جار حفظ الطلب...';

  try {
    saveResult = await saveLead(data);
    showToast(saveResult.saved ? 'تم حفظ الطلب وتجهيز واتساب' : 'تم تجهيز الطلب ورسالة واتساب');
  } catch (_) {
    saveResult = {saved: false, mode: 'error'};
    showToast('تعذر حفظ الطلب، أرسل نسخة واتساب');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'جهّز طلب البداية';
  }

  renderLeadSummary(summary, data, saveResult);
});
document.querySelector('.custom-plan a').addEventListener('click', () => {
  document.querySelector('#contactForm select[name="topic"]').selectedIndex = 2;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeSetup();
});
