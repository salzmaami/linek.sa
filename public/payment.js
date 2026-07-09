const selectedBookingKey = 'linek_demo_selected_booking';
const bookingStorageKey = 'linek_demo_bookings';
const linekWhatsapp = '966570547475';
let booking = loadBooking() || {
  id: 'LK-DEMO',
  placeName: 'شاليه سُكون',
  guestName: 'ضيف تجريبي',
  date: {label: 'الخميس 18 يوليو'},
  amount: 850,
  status: 'بانتظار موافقة المالك',
  expiresAt: Date.now() + (30 * 60 * 1000),
  ownerPaymentLink: '',
  merchantWhatsapp: '9665xxxxxxxx'
};

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (_) {
    return fallback;
  }
}

function loadBooking() {
  return readJson(selectedBookingKey, null);
}

function loadBookings() {
  return readJson(bookingStorageKey, []);
}

function saveBookingStatus(nextStatus) {
  booking = {...booking, status: nextStatus, paymentStatus: nextStatus.includes('ملغي') ? 'ملغي' : booking.paymentStatus};
  localStorage.setItem(selectedBookingKey, JSON.stringify(booking));
  const bookings = loadBookings().map(item => item.id === booking.id ? booking : item);
  localStorage.setItem(bookingStorageKey, JSON.stringify(bookings));
}

function whatsappHref(number, message) {
  const cleanNumber = String(number || '').replace(/[^\d]/g, '');
  if (!cleanNumber || cleanNumber.includes('xxxxxxxx')) return `https://wa.me/${linekWhatsapp}`;
  return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
}

function renderSummary() {
  document.getElementById('bookingId').textContent = booking.id;
  document.getElementById('bookingPlace').textContent = booking.placeName;
  document.getElementById('bookingGuest').textContent = booking.guestName;
  document.getElementById('bookingDate').textContent = booking.date?.label || '-';
  document.getElementById('bookingAmount').textContent = `${Number(booking.amount || booking.date?.price || 0).toLocaleString('ar-SA')} ر.س`;
  document.getElementById('bookingStatus').textContent = booking.status || 'بانتظار موافقة المالك';

  const ownerPayLink = document.getElementById('ownerPayLink');
  if (booking.ownerPaymentLink) {
    ownerPayLink.href = booking.ownerPaymentLink;
    ownerPayLink.classList.remove('disabled-link');
    ownerPayLink.textContent = 'فتح رابط دفع المالك';
  } else {
    ownerPayLink.removeAttribute('href');
    ownerPayLink.classList.add('disabled-link');
    ownerPayLink.textContent = 'رابط الدفع لم يضفه المالك بعد';
  }

  document.getElementById('paymentMerchantWhatsApp').href = whatsappHref(
    booking.merchantWhatsapp,
    `السلام عليكم، عندي طلب حجز رقم ${booking.id} عبر لاينك بوكنق`
  );
  document.getElementById('paymentLinekWhatsApp').href = `https://wa.me/${linekWhatsapp}?text=${encodeURIComponent(`عندي استفسار عن طلب ${booking.id} في لاينك بوكنق`)}`;
}

function renderTimer() {
  const timer = document.getElementById('approvalTimer');
  const status = document.getElementById('approvalStatus');
  const isPending = booking.status === 'بانتظار موافقة المالك';

  if (!isPending) {
    timer.textContent = booking.status === 'مؤكد' ? 'مقبول' : '00:00';
    status.textContent = booking.status || 'تم تحديث حالة الطلب';
    document.getElementById('bookingStatus').textContent = booking.status;
    return;
  }

  const remainingMs = Number(booking.expiresAt || 0) - Date.now();

  if (remainingMs <= 0) {
    saveBookingStatus('ملغي لانتهاء مهلة 30 دقيقة');
    timer.textContent = '00:00';
    status.textContent = 'تم إلغاء الطلب لانتهاء المهلة';
    document.getElementById('bookingStatus').textContent = booking.status;
    return;
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  timer.textContent = `${minutes}:${seconds}`;
  status.textContent = 'بانتظار موافقة المالك';
}

renderSummary();
renderTimer();
setInterval(renderTimer, 1000);
