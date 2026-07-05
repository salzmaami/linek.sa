const form = document.getElementById('ownerIntakeForm');
const toast = document.getElementById('toast');
const token = new URLSearchParams(location.search).get('token') || '';

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function setForm(property) {
  document.getElementById('ownerName').textContent = property.owners?.name
    ? `مرحباً ${property.owners.name}`
    : 'مرحباً';
  const isPublished = property.status === 'published';
  document.getElementById('requestStatus').textContent = isPublished
    ? 'تم اعتماد مكانك ونشر صفحة الضيف.'
    : 'طلبك تحت مراجعة Linek. رابط الضيف يظهر بعد اعتماد التوثيق.';
  const publicLink = `${location.origin}/stay.html?slug=${encodeURIComponent(property.slug)}`;
  const linkPanel = document.getElementById('ownerConsoleLinks');
  linkPanel.hidden = !isPublished;
  if (isPublished) {
    document.getElementById('publicGuestLink').value = publicLink;
    document.getElementById('openGuestLink').href = publicLink;
  }
  Object.entries({
    name: property.name,
    city: property.city,
    property_type: property.property_type,
    base_price: property.base_price,
    check_in: property.check_in,
    check_out: property.check_out,
    map_link: property.map_link,
    description: property.description,
    cancellation_policy: property.cancellation_policy,
    rules: property.rules,
    payment_link: property.payment_link,
    payment_method_note: property.payment_method_note
  }).forEach(([key, value]) => {
    const input = form.elements[key];
    if (input && value !== null && value !== undefined) input.value = value;
  });
}

async function loadProperty() {
  if (!token) {
    showToast('الرابط غير صحيح');
    return;
  }
  const response = await fetch(`/api/owner-intake?token=${encodeURIComponent(token)}`);
  const data = await response.json();
  if (!response.ok) {
    document.getElementById('requestStatus').textContent = data.error || 'تعذر تحميل الطلب';
    showToast(data.error || 'تعذر تحميل الطلب');
    return;
  }
  setForm(data.property);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  document.getElementById('saveStatus').textContent = 'جار الإرسال...';
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const response = await fetch(`/api/owner-intake?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر حفظ البيانات');
    document.getElementById('saveStatus').textContent = 'تم الإرسال للمراجعة';
    showToast('تم إرسال البيانات للمراجعة');
    setForm(data.property);
  } catch (error) {
    document.getElementById('saveStatus').textContent = '';
    showToast(error.message);
  }
});

document.getElementById('copyGuestLink').addEventListener('click', async () => {
  const value = document.getElementById('publicGuestLink').value;
  try { await navigator.clipboard.writeText(value); } catch (_) {}
  showToast('تم نسخ رابط الضيف');
});

loadProperty();
