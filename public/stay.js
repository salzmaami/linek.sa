const singlePlaceStorageKey = 'linek_demo_place';
const placesStorageKey = 'linek_demo_places';
const bookingStorageKey = 'linek_demo_bookings';
const selectedBookingKey = 'linek_demo_selected_booking';
const linekWhatsapp = '966570547475';
const LINEK_CONFIG = window.LINEK_LEADS_CONFIG || {};
const toast = document.getElementById('toast');
let places = [];
let activePlaceId = null;
let selectedDate = null;
let runtimeConfigPromise = null;

const fallbackPlace = {
  id: 'place-1',
  name: 'شاليه سُكون',
  city: 'الرياض',
  type: 'شاليه',
  stayType: 'كاملة',
  checkIn: '4:00 مساءً',
  checkOut: '12:00 ظهراً',
  basePrice: 850,
  merchantWhatsapp: '9665xxxxxxxx',
  nationalAddress: 'ABCD1234',
  googleMapsLink: 'https://maps.google.com/?q=Riyadh',
  photos: [],
  description: 'إقامة كاملة في شاليه بمدينة الرياض. الدخول 4:00 مساءً والخروج 12:00 ظهراً. جلسة خارجية، مسبح، ومساحات مناسبة للعائلة.',
  cancelPolicy: 'استرداد كامل قبل 72 ساعة من موعد الحجز.',
  rules: 'المحافظة على المكان والالتزام بعدد الضيوف المتفق عليه.',
  beneficiary: 'شاليه سُكون للتأجير اليومي',
  ownerPaymentLink: '',
  legalAck: true,
  dates: [
    {label: 'الخميس 18 يوليو', value: '2026-07-18', price: 850, available: true},
    {label: 'الجمعة 19 يوليو', value: '2026-07-19', price: 1200, available: true}
  ]
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1600);
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (_) {
    return fallback;
  }
}

function normalizePlace(place = {}, index = 0) {
  const normalized = {...fallbackPlace, ...place};
  normalized.id = place.id || `place-${index + 1}`;
  normalized.description = place.description || buildDescription(normalized);
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
  if (singlePlace && Object.keys(singlePlace).length) return [normalizePlace(singlePlace, 0)];
  return [normalizePlace(fallbackPlace, 0)];
}

function currentSlug() {
  return new URLSearchParams(window.location.search).get('slug') || '';
}

function supabaseSettings() {
  return {
    url: String(LINEK_CONFIG.supabaseUrl || '').trim().replace(/\/$/, ''),
    anonKey: String(LINEK_CONFIG.supabaseAnonKey || '').trim()
  };
}

async function loadRuntimeConfig() {
  if (runtimeConfigPromise) return runtimeConfigPromise;
  runtimeConfigPromise = (async () => {
    const configEndpoint = String(LINEK_CONFIG.configEndpoint || '').trim();
    if (!configEndpoint || (LINEK_CONFIG.supabaseUrl && LINEK_CONFIG.supabaseAnonKey)) return LINEK_CONFIG;
    try {
      const response = await fetch(configEndpoint, {headers: {Accept: 'application/json'}});
      if (!response.ok) throw new Error('Config endpoint failed');
      const data = await response.json();
      LINEK_CONFIG.supabaseUrl = data.supabaseUrl || '';
      LINEK_CONFIG.supabaseAnonKey = data.supabaseAnonKey || '';
    } catch (_) {
      LINEK_CONFIG.supabaseUrl = LINEK_CONFIG.supabaseUrl || '';
      LINEK_CONFIG.supabaseAnonKey = LINEK_CONFIG.supabaseAnonKey || '';
    }
    return LINEK_CONFIG;
  })();
  return runtimeConfigPromise;
}

async function supabaseFetch(path, options = {}) {
  await loadRuntimeConfig();
  const {url, anonKey} = supabaseSettings();
  if (!url || !anonKey) throw new Error('Supabase غير مفعّل');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || 'تعذر الاتصال بقاعدة البيانات');
  return data;
}

function normalizeDbProperty(row) {
  const photos = (row.property_photos || [])
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map(photo => photo.url)
    .filter(Boolean);
  return normalizePlace({
    id: row.id,
    propertyId: row.id,
    source: 'supabase',
    slug: row.slug,
    name: row.name,
    city: row.city,
    type: row.property_type,
    stayType: 'كاملة',
    basePrice: row.base_price,
    checkIn: row.check_in || '4:00 مساءً',
    checkOut: row.check_out || '12:00 ظهراً',
    googleMapsLink: row.map_link || fallbackPlace.googleMapsLink,
    photos,
    description: row.description,
    cancelPolicy: row.cancellation_policy || fallbackPlace.cancelPolicy,
    rules: row.rules || fallbackPlace.rules,
    beneficiary: row.name,
    ownerPaymentLink: row.payment_link || '',
    legalAck: row.verification_status !== 'rejected'
  });
}

async function loadPublishedPlaceBySlug(slug) {
  const rows = await supabaseFetch(`properties?select=*,property_photos(url,sort_order,is_cover)&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`);
  if (!rows.length) throw new Error('الرابط غير منشور أو غير موجود');
  return [normalizeDbProperty(rows[0])];
}

function loadBookings() {
  return readJson(bookingStorageKey, []);
}

function saveBookings(bookings) {
  localStorage.setItem(bookingStorageKey, JSON.stringify(bookings));
}

function activePlace() {
  return places.find(place => place.id === activePlaceId) || places[0] || fallbackPlace;
}

function whatsappHref(number, message) {
  const cleanNumber = String(number || '').replace(/[^\d]/g, '');
  if (!cleanNumber || cleanNumber.includes('xxxxxxxx')) return `https://wa.me/${linekWhatsapp}`;
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}

function renderGuestBadge(statusText) {
  const badge = document.getElementById('guestBadge');
  badge.replaceChildren();
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
  badge.append(text, word);
}

function renderPlacePicker() {
  const panel = document.getElementById('placeChooserPanel');
  const picker = document.getElementById('guestPlacePicker');
  picker.replaceChildren();
  panel.hidden = places.length <= 1;

  places.forEach(place => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'place-choice';
    button.classList.toggle('active', place.id === activePlaceId);
    button.innerHTML = `<b>${place.name}</b><span>${place.city} · ${place.type} · ${place.stayType}</span><small>من ${Number(place.basePrice || 0).toLocaleString('ar-SA')} ر.س</small>`;
    button.addEventListener('click', () => {
      activePlaceId = place.id;
      selectedDate = null;
      renderPlace();
    });
    picker.append(button);
  });
}

function renderPlace() {
  const place = activePlace();
  renderPlacePicker();
  document.getElementById('guestPlaceName').textContent = place.name || 'شاليه سُكون';
  document.getElementById('guestImage').src = (place.photos || [])[0] || 'assets/chalet-hero.png';
  document.getElementById('guestDescription').textContent = place.description || buildDescription(place);
  document.getElementById('guestCity').textContent = place.city || 'الرياض';
  document.getElementById('guestType').textContent = place.type || 'شاليه';
  document.getElementById('guestStayType').textContent = place.stayType || 'كاملة';
  document.getElementById('guestCheckIn').textContent = place.checkIn || '4:00 مساءً';
  document.getElementById('guestCheckOut').textContent = place.checkOut || '12:00 ظهراً';
  document.getElementById('guestNationalAddress').textContent = place.nationalAddress || 'ABCD1234';
  document.getElementById('guestMapLink').href = place.googleMapsLink || 'https://maps.google.com/?q=Riyadh';
  document.getElementById('guestCancelPolicy').textContent = place.cancelPolicy || fallbackPlace.cancelPolicy;
  document.getElementById('guestRules').textContent = place.rules || fallbackPlace.rules;
  renderGuestBadge(place.legalAck ? 'موثق من' : 'قيد مراجعة');
  document.getElementById('paymentTrustLine').textContent = place.ownerPaymentLink
    ? 'رابط الدفع الظاهر يخص المالك، وLinek لا يستلم مبلغ الحجز.'
    : 'سيتم إرسال وسيلة الدفع الخاصة بالمالك بعد موافقته على الطلب.';
  document.getElementById('merchantWhatsApp').href = whatsappHref(
    place.merchantWhatsapp,
    `السلام عليكم، عندي استفسار عن ${place.name} من رابط Linek`
  );

  const availableDates = (place.dates || []).filter(date => date.available);
  const dates = availableDates.length ? availableDates : [
    {label: 'الخميس 18 يوليو', value: '2026-07-18', price: place.basePrice || 850, available: true},
    {label: 'الجمعة 19 يوليو', value: '2026-07-19', price: (place.basePrice || 850) + 250, available: true}
  ];

  const grid = document.getElementById('guestDates');
  grid.replaceChildren();
  dates.forEach((date, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.date = JSON.stringify(date);
    button.innerHTML = `<b>${date.label}</b><br><small>${Number(date.price).toLocaleString('ar-SA')} ر.س</small>`;
    button.addEventListener('click', () => selectDate(button, date));
    grid.append(button);
    if (index === 0) selectDate(button, date);
  });
}

function selectDate(button, date) {
  selectedDate = date;
  document.querySelectorAll('#guestDates button').forEach(item => item.classList.toggle('active', item === button));
  document.getElementById('selectedPrice').textContent = `${Number(date.price).toLocaleString('ar-SA')} ر.س`;
}

document.getElementById('startBooking').addEventListener('click', () => {
  document.getElementById('bookingArea').scrollIntoView({behavior: 'smooth', block: 'start'});
});

async function createSupabaseBooking(place, selectedDate) {
  const expiresAt = new Date(Date.now() + (30 * 60 * 1000)).toISOString();
  const rows = await supabaseFetch('bookings', {
    method: 'POST',
    body: {
      property_id: place.propertyId,
      guest_name: document.getElementById('guestName').value.trim(),
      guest_phone: document.getElementById('guestPhone').value.trim(),
      booking_date: selectedDate.value,
      amount: Number(selectedDate.price || place.basePrice || 0),
      status: 'pending_owner_approval',
      payment_status: 'not_started',
      payment_link_snapshot: place.ownerPaymentLink || null,
      expires_at: expiresAt
    }
  });
  const row = rows[0];
  return {
    id: row.public_code,
    databaseId: row.id,
    placeId: place.id,
    placeName: place.name,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    date: selectedDate,
    amount: row.amount,
    status: 'بانتظار موافقة المالك',
    paymentStatus: 'بانتظار رابط الدفع',
    createdAt: Date.parse(row.created_at),
    expiresAt: Date.parse(row.expires_at),
    ownerPaymentLink: place.ownerPaymentLink || '',
    merchantWhatsapp: place.merchantWhatsapp || '',
    linekWhatsapp,
    beneficiary: place.beneficiary || place.name
  };
}

document.getElementById('bookingForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) {
    showToast('راجع الخانات المطلوبة قبل إرسال الطلب');
    form.reportValidity();
    return;
  }
  if (!selectedDate) {
    showToast('اختر تاريخ الحجز');
    return;
  }
  const place = activePlace();
  const createdAt = Date.now();
  let booking = {
    id: `LK-${createdAt.toString().slice(-6)}`,
    placeId: place.id,
    placeName: place.name || 'شاليه سُكون',
    guestName: document.getElementById('guestName').value.trim() || 'ضيف تجريبي',
    guestPhone: document.getElementById('guestPhone').value.trim(),
    date: selectedDate,
    amount: selectedDate.price,
    status: 'بانتظار موافقة المالك',
    paymentStatus: 'بانتظار رابط الدفع',
    createdAt,
    expiresAt: createdAt + (30 * 60 * 1000),
    ownerPaymentLink: place.ownerPaymentLink || '',
    merchantWhatsapp: place.merchantWhatsapp || '',
    linekWhatsapp,
    beneficiary: place.beneficiary || place.name
  };

  try {
    if (place.source === 'supabase') {
      booking = await createSupabaseBooking(place, selectedDate);
    } else {
      const bookings = loadBookings();
      bookings.unshift(booking);
      saveBookings(bookings);
    }
    localStorage.setItem(selectedBookingKey, JSON.stringify(booking));
    showToast('تم إرسال طلب الحجز');
    setTimeout(() => { window.location.href = 'payment.html'; }, 650);
  } catch (error) {
    showToast(error.message || 'تعذر إرسال طلب الحجز');
  }
});

async function init() {
  const slug = currentSlug();
  try {
    places = slug ? await loadPublishedPlaceBySlug(slug) : loadPlaces();
  } catch (error) {
    showToast(error.message);
    places = loadPlaces();
  }
  activePlaceId = places[0].id;
  renderPlace();
}

init();
