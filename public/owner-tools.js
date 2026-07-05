const OwnerTools = (() => {
  const nav = [
    ['dashboard.html', 'الملخص'],
    ['properties.html', 'العقارات'],
    ['calendar.html', 'التقويم'],
    ['calendar-sync.html', 'مزامنة iCal'],
    ['booking-requests.html', 'طلبات الحجز'],
    ['payment-settings.html', 'إعدادات الدفع']
  ];

  function money(value) {
    return `${Number(value || 0).toLocaleString('ar-SA')} ر.س`;
  }

  function dateText(value) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('ar-SA', {dateStyle: 'medium'}).format(new Date(value));
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

  function slugify(value) {
    const map = {
      'شاليه': 'chalet',
      'شقة': 'apartment',
      'استراحة': 'retreat',
      'الرياض': 'riyadh',
      'جدة': 'jeddah',
      'الخبر': 'khobar',
      'الدمام': 'dammam',
      'سكون': 'sukoon',
      'سُكون': 'sukoon'
    };
    return String(value || '')
      .trim()
      .split(/\s+/)
      .map(word => map[word] || word)
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `property-${Date.now().toString().slice(-6)}`;
  }

  function publicLink(property) {
    return `${location.origin}/stay.html?slug=${encodeURIComponent(property.slug)}`;
  }

  function sidebar(active) {
    return nav.map(([href, label]) => `<a href="${href}" class="${href === active ? 'active' : ''}">${label}</a>`).join('');
  }

  async function guard() {
    const user = await Linek.requireOwner();
    if (!user) return null;
    const profile = await Linek.ensureOwnerProfile();
    if (!profile || profile.verification_status !== 'approved') {
      window.location.href = profile?.verification_status === 'rejected' ? 'verification-status.html' : 'waiting-approval.html';
      return null;
    }
    return {user, profile};
  }

  async function properties() {
    return Linek.db('properties?select=*,property_photos(url,sort_order,is_cover)&order=created_at.desc');
  }

  async function bookings() {
    return Linek.db('bookings?select=*,properties(title,name,slug)&order=created_at.desc');
  }

  function propertyOptions(list, selected = '') {
    return list.map(property => `<option value="${property.id}" ${property.id === selected ? 'selected' : ''}>${escapeHtml(property.title || property.name)}</option>`).join('');
  }

  return {money, dateText, escapeHtml, slugify, publicLink, sidebar, guard, properties, bookings, propertyOptions};
})();
