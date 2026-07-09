const BookingPage = (() => {
  const fallbackImage = 'assets/chalet-hero.png';
  let property = null;
  let calendarMonth = new Date();
  let availabilityByDate = {};

  function params() {
    return new URLSearchParams(location.search);
  }

  function money(value) {
    return `${Number(value || 0).toLocaleString('ar-SA')} ر.س`;
  }

  function dateLabel(value) {
    return new Intl.DateTimeFormat('ar-SA', {dateStyle: 'medium'}).format(new Date(value));
  }

  function addDays(value, amount) {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + amount);
    return iso(date);
  }

  function nights(checkIn, checkOut) {
    return Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
  }

  function iso(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function todayIso() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return iso(today);
  }

  function monthBounds(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return {start, end};
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function whatsappHref(number, message) {
    const clean = String(number || '').replace(/[^\d]/g, '');
    return clean ? `https://wa.me/${clean}?text=${encodeURIComponent(message)}` : `https://wa.me/966570547475`;
  }

  async function loadProperty() {
    const slug = params().get('slug') || '';
    if (!slug) throw new Error('رابط العقار غير مكتمل');
    const rows = await Linek.db(`properties?select=*,property_photos(url,sort_order,is_cover)&slug=eq.${encodeURIComponent(slug)}&status=in.(published,active)&limit=1`, {public: true});
    if (!rows.length) throw new Error('العقار غير موجود أو غير منشور');
    property = rows[0];
    try {
      await Linek.db('booking_page_visits', {public: true, method: 'POST', prefer: 'return=minimal', body: {property_id: property.id, visitor_identifier: localStorage.getItem('linek_visitor_id') || crypto.randomUUID(), user_agent: navigator.userAgent, referrer: document.referrer || null}});
    } catch (_) {}
    return property;
  }

  function render() {
    const photos = (property.property_photos || []).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    document.getElementById('guestImage').src = photos[0]?.url || fallbackImage;
    setText('guestPlaceName', property.title || property.name);
    setText('guestDescription', property.description || 'صفحة حجز موثقة من لاينك بوكنق.');
    setText('guestCity', property.city || '-');
    setText('guestType', property.property_type || 'شاليه');
    setText('guestStayType', `${property.guests || 1} ضيف`);
    setText('guestCheckIn', property.check_in || '-');
    setText('guestCheckOut', property.check_out || '-');
    setText('guestNationalAddress', property.district || property.address || '-');
    setText('guestCancelPolicy', property.cancellation_policy || 'تحدد حسب سياسة المالك.');
    setText('guestRules', property.rules || 'تحدد حسب تعليمات المالك.');
    setText('selectedPrice', money(property.base_price));
    document.getElementById('guestMapLink').href = property.map_link || '#';
    document.getElementById('merchantWhatsApp').href = whatsappHref('', `السلام عليكم، لدي استفسار بخصوص الحجز عبر لاينك بوكنق: ${location.href}`);
    document.getElementById('guestCount').max = property.guests || 1;
    document.getElementById('calendarFreshness').textContent = property.calendar_last_synced_at ? `تم تحديث التقويم ${dateLabel(property.calendar_last_synced_at)}` : 'التقويم بانتظار أول مزامنة';
    renderReview();
  }

  async function loadAvailabilityForMonth() {
    if (!property?.id) return {};
    const {start, end} = monthBounds(calendarMonth);
    try {
      const rows = await Linek.db(`availability?select=date,status&property_id=eq.${encodeURIComponent(property.id)}&date=gte.${iso(start)}&date=lt.${iso(end)}`, {public: true});
      availabilityByDate = Object.fromEntries((rows || []).map(row => [row.date, row.status]));
    } catch (_) {
      availabilityByDate = {};
    }
    return availabilityByDate;
  }

  function statusForDate(value) {
    if (value < todayIso()) return 'past';
    return availabilityByDate[value] || 'available';
  }

  function isBlockedStatus(status) {
    return ['past', 'blocked', 'reserved', 'pending', 'external'].includes(status);
  }

  function statusLabel(status) {
    return {
      past: 'منتهي',
      available: 'متاح',
      blocked: 'مغلق',
      reserved: 'محجوز',
      pending: 'بانتظار',
      external: 'من منصة ثانية'
    }[status] || status;
  }

  function rangeState(value, checkIn, checkOut) {
    if (!checkIn) return '';
    if (value === checkIn) return 'start';
    if (checkOut && value === checkOut) return 'end';
    if (checkOut && value > checkIn && value < checkOut) return 'between';
    return '';
  }

  function rangeHasBlockedNight(checkIn, checkOut) {
    for (let value = checkIn; value < checkOut; value = addDays(value, 1)) {
      if (isBlockedStatus(statusForDate(value))) return true;
    }
    return false;
  }

  async function renderCalendar() {
    const grid = document.getElementById('guestCalendarGrid');
    const title = document.getElementById('guestCalendarTitle');
    if (!grid || !title) return;
    await loadAvailabilityForMonth();
    const {start, end} = monthBounds(calendarMonth);
    const checkIn = document.getElementById('checkIn').value;
    const checkOut = document.getElementById('checkOut').value;
    title.textContent = new Intl.DateTimeFormat('ar-SA', {month: 'long', year: 'numeric'}).format(start);
    const weekdays = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
    const cells = weekdays.map(day => `<span class="weekday">${day}</span>`);
    for (let index = 0; index < start.getDay(); index += 1) cells.push('<span class="guest-day empty"></span>');
    for (let date = new Date(start); date < end; date.setDate(date.getDate() + 1)) {
      const value = iso(date);
      const status = statusForDate(value);
      const blocked = isBlockedStatus(status);
      cells.push(`
        <button class="guest-day ${rangeState(value, checkIn, checkOut)}" data-date="${value}" data-status="${status}" ${blocked ? 'disabled' : ''} type="button">
          <b>${date.getDate()}</b>
          <small>${statusLabel(status)}</small>
        </button>
      `);
    }
    grid.innerHTML = cells.join('');
    grid.querySelectorAll('.guest-day[data-date]').forEach(button => button.addEventListener('click', () => selectDate(button.dataset.date)));
  }

  function selectDate(value) {
    const checkIn = document.getElementById('checkIn');
    const checkOut = document.getElementById('checkOut');
    if (!checkIn.value || checkOut.value || value <= checkIn.value) {
      checkIn.value = value;
      checkOut.value = '';
    } else {
      if (rangeHasBlockedNight(checkIn.value, value)) {
        Linek.toast('المدة المختارة فيها أيام غير متاحة. اختر مدة ثانية.');
        checkIn.value = value;
        checkOut.value = '';
        renderReview();
        renderCalendar();
        return;
      }
      checkOut.value = value;
    }
    renderReview();
    renderCalendar();
  }

  function renderReview() {
    const checkIn = document.getElementById('checkIn').value;
    const checkOut = document.getElementById('checkOut').value;
    const count = document.getElementById('guestCount').value || 1;
    const selectedNights = checkIn && checkOut ? nights(checkIn, checkOut) : 0;
    const nightlyPrice = Number(property?.base_price || 0);
    const cleaningFee = Number(property?.cleaning_fee || 0);
    const total = selectedNights ? (selectedNights * nightlyPrice) + cleaningFee : 0;
    setText('selectedPrice', money(nightlyPrice));
    setText('nightsCount', selectedNights ? `${selectedNights.toLocaleString('ar-SA')} ${selectedNights === 1 ? 'ليلة' : 'ليالي'}` : '-');
    setText('cleaningFee', cleaningFee ? money(cleaningFee) : 'لا يوجد');
    setText('totalPrice', selectedNights ? money(total) : '-');
    setText('checkInLabel', checkIn ? dateLabel(checkIn) : 'اختر يوم الدخول');
    setText('checkOutLabel', checkOut ? dateLabel(checkOut) : 'اختر يوم الخروج');
    document.getElementById('bookingReview').innerHTML = checkIn && checkOut
      ? `<b>ملخص الطلب</b><br>${dateLabel(checkIn)} إلى ${dateLabel(checkOut)} · ${count} ضيف · ${selectedNights} ${selectedNights === 1 ? 'ليلة' : 'ليالي'} · ${money(total)}`
      : 'اختر التواريخ لعرض ملخص الطلب.';
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.elements.check_in.value || !form.elements.check_out.value) {
      Linek.toast('اختر تاريخ الدخول والخروج من التقويم');
      return;
    }
    if (!form.checkValidity()) return form.reportValidity();
    const button = form.querySelector('button[type="submit"]');
    const payload = {
      property_id: property.id,
      guest_name: form.elements.guest_name.value.trim(),
      guest_mobile: form.elements.guest_mobile.value.trim(),
      guests_count: Number(form.elements.guests_count.value || 1),
      check_in: form.elements.check_in.value,
      check_out: form.elements.check_out.value,
      notes: form.elements.notes.value.trim()
    };
    Linek.setLoading(button, true, 'جار إرسال الطلب...');
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر إرسال طلب الحجز');
      window.location.href = data.status_url;
    } catch (error) {
      Linek.toast(error.message);
    } finally {
      Linek.setLoading(button, false);
    }
  }

  async function init() {
    try {
      await loadProperty();
      render();
      const today = new Date();
      today.setDate(today.getDate() + 1);
      calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      await renderCalendar();
      document.getElementById('prevGuestMonth').addEventListener('click', async () => {
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
        await renderCalendar();
      });
      document.getElementById('nextGuestMonth').addEventListener('click', async () => {
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
        await renderCalendar();
      });
      document.getElementById('guestCount').addEventListener('input', renderReview);
      document.getElementById('bookingForm').addEventListener('submit', submit);
    } catch (error) {
      Linek.toast(error.message);
      document.getElementById('bookingArea').innerHTML = `<div class="panel"><h1>الرابط غير متاح</h1><p>${error.message}</p><a class="pill" href="index.html">العودة للرئيسية</a></div>`;
    }
  }

  return {init};
})();

document.getElementById('startBooking').addEventListener('click', () => {
  document.getElementById('bookingArea').scrollIntoView({behavior: 'smooth', block: 'start'});
});

const topBookingButton = document.getElementById('startBookingTop');
if (topBookingButton) {
  topBookingButton.addEventListener('click', () => {
    document.getElementById('bookingArea').scrollIntoView({behavior: 'smooth', block: 'start'});
  });
}

BookingPage.init();
