const singlePlaceStorageKey = 'linek_demo_place';
const placesStorageKey = 'linek_demo_places';
const bookingStorageKey = 'linek_demo_bookings';
const selectedBookingKey = 'linek_demo_selected_booking';
const toast = document.getElementById('toast');
let ownerStep = 1;
let activePlaceId = null;
let places = [];

const defaultDates = [
  {label: 'الخميس 18 يوليو', value: '2026-07-18', price: 850, available: true},
  {label: 'الجمعة 19 يوليو', value: '2026-07-19', price: 1200, available: true},
  {label: 'السبت 20 يوليو', value: '2026-07-20', price: 950, available: true},
  {label: 'الخميس 25 يوليو', value: '2026-07-25', price: 850, available: false},
  {label: 'الجمعة 26 يوليو', value: '2026-07-26', price: 1200, available: true},
  {label: 'السبت 27 يوليو', value: '2026-07-27', price: 950, available: true}
];

const defaultPlace = {
  id: 'place-1',
  name: 'شاليه سُكون',
  city: 'الرياض',
  type: 'شاليه',
  stayType: 'كاملة',
  checkIn: '4:00 مساءً',
  checkOut: '12:00 ظهراً',
  basePrice: 850,
  merchantWhatsapp: '966501234567',
  nationalAddress: 'ABCD1234',
  googleMapsLink: 'https://maps.google.com/?q=Riyadh',
  photos: [],
  extraDescription: 'جلسة خارجية، مسبح، ومساحات مناسبة للعائلة.',
  cancelPolicy: 'استرداد كامل قبل 72 ساعة من موعد الحجز. بعد ذلك يتم التعامل مع الطلب حسب سياسة مقدم الخدمة.',
  rules: 'الحجز للعائلات فقط. يمنع تجاوز عدد الضيوف المتفق عليه. المحافظة على المكان شرط أساسي لتأكيد أي حجز لاحق.',
  providerRole: 'مالك',
  legalName: 'شاليه سُكون للتأجير اليومي',
  beneficiary: 'شاليه سُكون للتأجير اليومي',
  ownerPaymentLink: '',
  legalAck: false,
  airbnbCalendar: '',
  gathernCalendar: '',
  bookingCalendar: '',
  otherCalendar: '',
  dates: defaultDates
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (_) {
    return fallback;
  }
}

function normalizePlace(place = {}, index = 0) {
  const base = {...defaultPlace, id: `place-${index + 1}`};
  const normalized = {...base, ...place};
  normalized.id = place.id || base.id;
  normalized.dates = Array.isArray(place.dates) && place.dates.length ? place.dates : defaultDates;
  normalized.photos = Array.isArray(place.photos) ? place.photos : [];
  normalized.description = buildDescription(normalized);
  return normalized;
}

function buildDescription(place) {
  const stayText = place.stayType === 'جزئية' ? 'إقامة جزئية' : 'إقامة كاملة';
  const details = (place.extraDescription || '').trim();
  return `${stayText} في ${place.type || 'مكان'} بمدينة ${place.city || 'الرياض'}. الدخول ${place.checkIn || '4:00 مساءً'} والخروج ${place.checkOut || '12:00 ظهراً'}.${details ? ` ${details}` : ''}`;
}

function loadPlaces() {
  const savedPlaces = readJson(placesStorageKey, null);
  if (Array.isArray(savedPlaces) && savedPlaces.length) return savedPlaces.map(normalizePlace);

  const singlePlace = readJson(singlePlaceStorageKey, null);
  if (singlePlace && Object.keys(singlePlace).length) {
    return [normalizePlace(singlePlace, 0)];
  }

  return [normalizePlace(defaultPlace, 0)];
}

function savePlaces() {
  const normalized = places.map(normalizePlace);
  places = normalized;
  localStorage.setItem(placesStorageKey, JSON.stringify(normalized));
  localStorage.setItem(singlePlaceStorageKey, JSON.stringify(normalized[0]));
}

function loadBookings() {
  return readJson(bookingStorageKey, []);
}

function saveBookings(bookings) {
  localStorage.setItem(bookingStorageKey, JSON.stringify(bookings));
}

function selectedBooking() {
  return readJson(selectedBookingKey, null);
}

function saveSelectedBooking(booking) {
  const current = selectedBooking();
  if (current?.id === booking.id) {
    localStorage.setItem(selectedBookingKey, JSON.stringify(booking));
  }
}

function refreshExpiredBookings() {
  const now = Date.now();
  const bookings = loadBookings();
  let changed = false;
  const updated = bookings.map(booking => {
    if (booking.status === 'بانتظار موافقة المالك' && booking.expiresAt && now > booking.expiresAt) {
      changed = true;
      return {...booking, status: 'ملغي لانتهاء مهلة 30 دقيقة', paymentStatus: 'ملغي'};
    }
    return booking;
  });
  if (changed) saveBookings(updated);
  return updated;
}

function activePlace() {
  return places.find(place => place.id === activePlaceId) || places[0];
}

function collectDates() {
  const dateCards = [...document.querySelectorAll('[data-date-value]')];
  return dateCards.map(item => ({
    label: item.dataset.dateLabel,
    value: item.dataset.dateValue,
    price: Number(item.dataset.datePrice),
    available: item.querySelector('input').checked
  }));
}

function collectActivePlace() {
  const current = activePlace() || normalizePlace();
  const draft = {
    ...current,
    name: document.getElementById('placeName').value.trim() || 'مكان جديد',
    city: document.getElementById('city').value.trim() || 'الرياض',
    type: document.getElementById('placeType').value,
    stayType: document.getElementById('stayType').value,
    checkIn: document.getElementById('checkIn').value.trim(),
    checkOut: document.getElementById('checkOut').value.trim(),
    basePrice: Number(document.getElementById('basePrice').value || 850),
    merchantWhatsapp: document.getElementById('merchantWhatsapp').value.trim(),
    nationalAddress: document.getElementById('nationalAddress').value.trim().toUpperCase(),
    googleMapsLink: document.getElementById('googleMapsLink').value.trim(),
    photos: current.photos || [],
    extraDescription: document.getElementById('extraDescription').value.trim(),
    cancelPolicy: document.getElementById('cancelPolicy').value.trim(),
    rules: document.getElementById('rules').value.trim(),
    providerRole: document.getElementById('providerRole').value,
    legalName: document.getElementById('legalName').value.trim(),
    beneficiary: document.getElementById('beneficiary').value.trim(),
    ownerPaymentLink: document.getElementById('ownerPaymentLink').value.trim(),
    legalAck: document.getElementById('legalAck').checked,
    airbnbCalendar: document.getElementById('airbnbCalendar').value.trim(),
    gathernCalendar: document.getElementById('gathernCalendar').value.trim(),
    bookingCalendar: document.getElementById('bookingCalendar').value.trim(),
    otherCalendar: document.getElementById('otherCalendar').value.trim(),
    dates: collectDates().length ? collectDates() : defaultDates
  };
  return normalizePlace(draft);
}

function persistActivePlace() {
  const current = collectActivePlace();
  places = places.map(place => place.id === current.id ? current : place);
  savePlaces();
  renderPlaceList();
  renderGeneratedDescription(current);
  renderCalendarStatus(current);
  renderVerification(current);
  renderPreview();
}

function applyPlace(place) {
  document.getElementById('placeName').value = place.name || '';
  document.getElementById('city').value = place.city || '';
  document.getElementById('placeType').value = place.type || 'شاليه';
  document.getElementById('stayType').value = place.stayType || 'كاملة';
  document.getElementById('checkIn').value = place.checkIn || '';
  document.getElementById('checkOut').value = place.checkOut || '';
  document.getElementById('basePrice').value = place.basePrice || 850;
  document.getElementById('merchantWhatsapp').value = place.merchantWhatsapp || '';
  document.getElementById('nationalAddress').value = place.nationalAddress || '';
  document.getElementById('googleMapsLink').value = place.googleMapsLink || '';
  document.getElementById('extraDescription').value = place.extraDescription || '';
  document.getElementById('cancelPolicy').value = place.cancelPolicy || '';
  document.getElementById('rules').value = place.rules || '';
  document.getElementById('providerRole').value = place.providerRole || 'مالك';
  document.getElementById('legalName').value = place.legalName || '';
  document.getElementById('beneficiary').value = place.beneficiary || '';
  document.getElementById('ownerPaymentLink').value = place.ownerPaymentLink || '';
  document.getElementById('legalAck').checked = Boolean(place.legalAck);
  document.getElementById('airbnbCalendar').value = place.airbnbCalendar || '';
  document.getElementById('gathernCalendar').value = place.gathernCalendar || '';
  document.getElementById('bookingCalendar').value = place.bookingCalendar || '';
  document.getElementById('otherCalendar').value = place.otherCalendar || '';
  renderDates(place);
  renderPhotos(place);
  renderGeneratedDescription(place);
  renderCalendarStatus(place);
  renderVerification(place);
  renderPreview();
}

function renderPlaceList() {
  const list = document.getElementById('ownerPlaceList');
  list.replaceChildren();
  places.forEach((place, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'place-tab';
    button.classList.toggle('active', place.id === activePlaceId);
    button.dataset.placeId = place.id;
    button.innerHTML = `<b>${place.name || `مكان ${index + 1}`}</b><span>${place.city || 'الرياض'} · ${place.type || 'مكان'} · ${place.stayType || 'كاملة'}</span>`;
    button.addEventListener('click', () => {
      persistActivePlace();
      activePlaceId = place.id;
      applyPlace(activePlace());
      renderPlaceList();
    });
    list.append(button);
  });
}

function renderDates(place = {}) {
  const grid = document.getElementById('availabilityGrid');
  grid.replaceChildren();
  (place.dates || defaultDates).forEach(date => {
    const label = document.createElement('label');
    label.className = 'check-card';
    label.dataset.dateValue = date.value;
    label.dataset.dateLabel = date.label;
    label.dataset.datePrice = date.price;
    label.innerHTML = `<input type="checkbox" ${date.available ? 'checked' : ''}>${date.label}<br><small>${date.price} ر.س</small>`;
    label.querySelector('input').addEventListener('change', persistActivePlace);
    grid.append(label);
  });
}

function renderGeneratedDescription(place) {
  document.getElementById('autoDescription').textContent = buildDescription(place);
}

function renderPhotos(place) {
  const preview = document.getElementById('photoPreview');
  preview.replaceChildren();
  const photos = place.photos || [];
  if (!photos.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-photo';
    empty.textContent = 'الصور اختيارية في التجربة، وتقدر تضيف حتى 15 صورة';
    preview.append(empty);
  } else {
    photos.slice(0, 15).forEach(photo => {
      const img = document.createElement('img');
      img.src = photo;
      img.alt = 'صورة مرفوعة للمكان';
      preview.append(img);
    });
  }
  document.getElementById('previewImage').src = photos[0] || 'assets/chalet-hero.png';
}

function renderCalendarStatus(place) {
  const connected = [
    place.airbnbCalendar,
    place.gathernCalendar,
    place.bookingCalendar,
    place.otherCalendar
  ].filter(Boolean).length;
  const status = document.getElementById('calendarStatus');
  status.textContent = connected
    ? `تم حفظ ${connected} تقويم خارجي لهذا المكان. في المنتج الفعلي سنفحص التعارضات قبل تأكيد الحجز.`
    : 'لم يتم ربط أي تقويم خارجي بعد.';
}

function renderVerification(place) {
  const label = place.legalAck ? 'جاهز لمراجعة Linek' : 'بانتظار إقرار المالك';
  document.getElementById('lockedVerification').textContent = label;
}

function renderLinekBadge(element, statusText) {
  element.replaceChildren();
  const text = document.createElement('span');
  text.textContent = statusText;
  const word = document.createElement('span');
  word.className = 'linek-badge-word';
  const logo = document.createElement('img');
  logo.src = 'assets/linek-mark.svg';
  logo.alt = '';
  const label = document.createElement('b');
  label.textContent = 'Linek';
  word.append(logo, label);
  element.append(text, word);
}

function validateControl(control) {
  if (control.type === 'file') return true;
  if (!control.checkValidity()) {
    const label = control.closest('.field')?.querySelector('span')?.textContent || 'هذه الخانة';
    showToast(control.title || `راجع خانة ${label}`);
    control.focus();
    control.reportValidity();
    return false;
  }
  return true;
}

function validateOwnerStep(step) {
  const panel = document.querySelector(`[data-owner-panel="${step}"]`);
  if (!panel) return true;
  const controls = [...panel.querySelectorAll('input, select, textarea')];
  for (const control of controls) {
    if (!validateControl(control)) return false;
  }
  if (step === 3 && !collectDates().some(date => date.available)) {
    showToast('اختر يوماً واحداً متاحاً على الأقل');
    return false;
  }
  if (step === 4 && !document.getElementById('legalAck').checked) {
    showToast('لازم توافق على الإقرار قبل حفظ التجربة');
    document.getElementById('legalAck').focus();
    return false;
  }
  return true;
}

function validateOwnerFlowThrough(targetStep) {
  for (let step = 1; step < targetStep; step += 1) {
    if (step !== ownerStep) setOwnerStep(step, true);
    if (!validateOwnerStep(step)) {
      return false;
    }
  }
  return true;
}

function setOwnerStep(step, skipValidation = false) {
  if (!skipValidation && step > ownerStep && !validateOwnerStep(ownerStep)) return;
  persistActivePlace();
  ownerStep = Math.max(1, Math.min(5, step));
  document.querySelectorAll('[data-owner-step]').forEach(button => {
    button.classList.toggle('active', Number(button.dataset.ownerStep) === ownerStep);
  });
  document.querySelectorAll('[data-owner-panel]').forEach(panel => {
    panel.classList.toggle('active', Number(panel.dataset.ownerPanel) === ownerStep);
  });
  renderPreview();
}

function renderPreview() {
  const place = activePlace() ? collectActivePlace() : normalizePlace(defaultPlace);
  document.getElementById('previewName').textContent = place.name;
  document.getElementById('previewDescription').textContent = buildDescription(place);
  renderLinekBadge(document.getElementById('previewVerification'), place.legalAck ? 'جاهز لمراجعة' : 'بانتظار إقرار');
  document.getElementById('previewImage').src = (place.photos || [])[0] || 'assets/chalet-hero.png';
  renderDashboard();
}

function renderDashboard() {
  const bookings = refreshExpiredBookings();
  const confirmed = bookings.filter(booking => booking.status === 'مؤكد');
  const pending = bookings.filter(booking => booking.status === 'بانتظار موافقة المالك');
  const cancelled = bookings.filter(booking => String(booking.status || '').includes('ملغي'));
  const revenue = confirmed.reduce((total, booking) => total + Number(booking.amount || booking.date?.price || 0), 0);
  document.getElementById('dashboardRevenue').textContent = `${revenue.toLocaleString('ar-SA')} ر.س`;
  document.getElementById('dashboardConfirmed').textContent = confirmed.length;
  document.getElementById('dashboardPending').textContent = pending.length;
  document.getElementById('dashboardCancelled').textContent = cancelled.length;
  renderBookingRequests(bookings);
}

function renderBookingRequests(bookings) {
  const list = document.getElementById('ownerBookingList');
  const requestCount = document.getElementById('bookingRequestCount');
  list.replaceChildren();
  requestCount.textContent = `${bookings.length} طلب`;

  if (!bookings.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-request';
    empty.textContent = 'لا توجد طلبات حجز حتى الآن';
    list.append(empty);
    return;
  }

  bookings.slice(0, 6).forEach(booking => {
    const card = document.createElement('article');
    card.className = 'booking-request';
    const isPending = booking.status === 'بانتظار موافقة المالك';
    card.innerHTML = `
      <div>
        <b>${booking.guestName || 'ضيف'}</b>
        <span>${booking.placeName || '-'} · ${booking.date?.label || '-'} · ${Number(booking.amount || 0).toLocaleString('ar-SA')} ر.س</span>
        <small>${booking.status || 'بانتظار موافقة المالك'}</small>
      </div>
      <div class="request-actions">
        <button type="button" data-booking-action="accept" data-booking-id="${booking.id}" ${isPending ? '' : 'disabled'}>قبول</button>
        <button type="button" data-booking-action="reject" data-booking-id="${booking.id}" ${isPending ? '' : 'disabled'}>رفض</button>
      </div>
    `;
    list.append(card);
  });
}

function updateBookingStatus(bookingId, action) {
  const currentPlace = collectActivePlace();
  const nextStatus = action === 'accept' ? 'مؤكد' : 'ملغي من المالك';
  const nextPaymentStatus = action === 'accept'
    ? (currentPlace.ownerPaymentLink ? 'بانتظار دفع الضيف عبر رابط المالك' : 'بانتظار إرسال رابط الدفع')
    : 'ملغي';
  const updated = refreshExpiredBookings().map(booking => {
    if (booking.id !== bookingId || booking.status !== 'بانتظار موافقة المالك') return booking;
    const nextBooking = {
      ...booking,
      status: nextStatus,
      paymentStatus: nextPaymentStatus,
      ownerPaymentLink: booking.ownerPaymentLink || currentPlace.ownerPaymentLink || '',
      decidedAt: Date.now()
    };
    saveSelectedBooking(nextBooking);
    return nextBooking;
  });
  saveBookings(updated);
  renderDashboard();
  showToast(action === 'accept' ? 'تم قبول الطلب' : 'تم رفض الطلب');
}

function addPlace() {
  persistActivePlace();
  const nextNumber = places.length + 1;
  const newPlace = normalizePlace({
    ...defaultPlace,
    id: `place-${Date.now()}`,
    name: `مكان ${nextNumber}`,
    beneficiary: '',
    legalName: '',
    ownerPaymentLink: '',
    photos: [],
    legalAck: false
  }, nextNumber);
  places.push(newPlace);
  activePlaceId = newPlace.id;
  savePlaces();
  renderPlaceList();
  applyPlace(newPlace);
  showToast('تمت إضافة مكان جديد');
}

document.querySelectorAll('[data-owner-step]').forEach(button => {
  button.addEventListener('click', () => {
    const targetStep = Number(button.dataset.ownerStep);
    if (targetStep > ownerStep && !validateOwnerFlowThrough(targetStep)) return;
    setOwnerStep(targetStep, true);
  });
});
document.querySelectorAll('[data-next-owner-step]').forEach(button => button.addEventListener('click', () => setOwnerStep(ownerStep + 1)));
document.querySelectorAll('[data-prev-owner-step]').forEach(button => button.addEventListener('click', () => setOwnerStep(ownerStep - 1)));
document.getElementById('addPlace').addEventListener('click', addPlace);
document.getElementById('saveOwnerExperience').addEventListener('click', () => {
  if (!validateOwnerFlowThrough(5) || !validateOwnerStep(5)) return;
  persistActivePlace();
  showToast('تم حفظ تجربة المالك');
});
document.getElementById('ownerBookingList').addEventListener('click', event => {
  const button = event.target.closest('[data-booking-action]');
  if (!button || button.disabled) return;
  updateBookingStatus(button.dataset.bookingId, button.dataset.bookingAction);
});
document.querySelectorAll('input, select, textarea').forEach(input => {
  if (input.type === 'file') return;
  input.addEventListener('input', persistActivePlace);
  input.addEventListener('change', persistActivePlace);
});
document.getElementById('placePhotoInput').addEventListener('change', event => {
  const selectedFiles = [...event.target.files].filter(file => file.type.startsWith('image/'));
  const files = selectedFiles.slice(0, 15);
  if (!files.length) {
    showToast('ارفع صورة بصيغة صحيحة');
    return;
  }
  if (selectedFiles.length > 15) {
    showToast('تم اختيار أول 15 صورة فقط');
  }
  Promise.all(files.map(file => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  }))).then(images => {
    const current = activePlace();
    current.photos = images;
    places = places.map(place => place.id === current.id ? current : place);
    savePlaces();
    renderPhotos(current);
    renderPreview();
    showToast('تمت إضافة الصور');
  });
});

places = loadPlaces();
activePlaceId = places[0].id;
savePlaces();
renderPlaceList();
applyPlace(activePlace());
renderDashboard();
