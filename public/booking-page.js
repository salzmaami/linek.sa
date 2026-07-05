const BookingPage = (() => {
  const fallbackImage = 'assets/chalet-hero.png';
  let property = null;

  function params() {
    return new URLSearchParams(location.search);
  }

  function money(value) {
    return `${Number(value || 0).toLocaleString('ar-SA')} ر.س`;
  }

  function dateLabel(value) {
    return new Intl.DateTimeFormat('ar-SA', {dateStyle: 'medium'}).format(new Date(value));
  }

  function tomorrow(value) {
    const next = new Date(`${value}T00:00:00`);
    next.setDate(next.getDate() + 1);
    return next.toISOString().slice(0, 10);
  }

  function nights(checkIn, checkOut) {
    return Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
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
    const rows = await Linek.db(`properties?select=*,property_photos(url,sort_order,is_cover)&slug=eq.${encodeURIComponent(slug)}&status=in.(published,active)&limit=1`);
    if (!rows.length) throw new Error('العقار غير موجود أو غير منشور');
    property = rows[0];
    try {
      await Linek.db('booking_page_visits', {method: 'POST', prefer: 'return=minimal', body: {property_id: property.id, visitor_identifier: localStorage.getItem('linek_visitor_id') || crypto.randomUUID(), user_agent: navigator.userAgent, referrer: document.referrer || null}});
    } catch (_) {}
    return property;
  }

  function render() {
    const photos = (property.property_photos || []).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    document.getElementById('guestImage').src = photos[0]?.url || fallbackImage;
    setText('guestPlaceName', property.title || property.name);
    setText('guestDescription', property.description || 'صفحة حجز موثقة من Linek.');
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
    document.getElementById('merchantWhatsApp').href = whatsappHref('', `السلام عليكم، لدي استفسار بخصوص الحجز عبر Linek: ${location.href}`);
    document.getElementById('guestCount').max = property.guests || 1;
    document.getElementById('calendarFreshness').textContent = property.calendar_last_synced_at ? `تم تحديث التقويم ${dateLabel(property.calendar_last_synced_at)}` : 'التقويم بانتظار أول مزامنة';
  }

  function renderReview() {
    const checkIn = document.getElementById('checkIn').value;
    const checkOut = document.getElementById('checkOut').value;
    const count = document.getElementById('guestCount').value || 1;
    const total = checkIn && checkOut ? (nights(checkIn, checkOut) * Number(property.base_price || 0)) + Number(property.cleaning_fee || 0) : 0;
    document.getElementById('bookingReview').innerHTML = checkIn && checkOut
      ? `<b>ملخص الطلب</b><br>${dateLabel(checkIn)} إلى ${dateLabel(checkOut)} · ${count} ضيف · ${money(total)}`
      : 'اختر التواريخ لعرض ملخص الطلب.';
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
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
      document.getElementById('checkIn').min = today.toISOString().slice(0, 10);
      document.getElementById('checkIn').addEventListener('change', event => {
        document.getElementById('checkOut').min = tomorrow(event.target.value);
        if (!document.getElementById('checkOut').value) document.getElementById('checkOut').value = tomorrow(event.target.value);
        renderReview();
      });
      document.getElementById('checkOut').addEventListener('change', renderReview);
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

BookingPage.init();
