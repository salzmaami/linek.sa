const OwnerTools = (() => {
  const nav = [
    ['dashboard.html', 'الملخص'],
    ['properties.html', 'العقارات'],
    ['calendar.html', 'التقويم'],
    ['calendar-sync.html', 'مزامنة التقويم'],
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

  function propertyLimit(profile) {
    const explicitLimit = Number(profile?.property_limit || 0);
    if (explicitLimit > 0) return explicitLimit;
    return ['multi', 'professional'].includes(profile?.requested_plan) ? 5 : 1;
  }

  function planLabel(profile) {
    return propertyLimit(profile) > 1 ? 'باقة النمو - حتى 5 عقارات' : 'الباقة الأساسية - عقار واحد';
  }

  async function properties(profileId) {
    if (!profileId) return [];
    return Linek.db(`properties?select=*,property_photos(url,sort_order,is_cover)&owner_profile_id=eq.${encodeURIComponent(profileId)}&order=created_at.desc`);
  }

  async function bookings(profileId) {
    if (!profileId) return [];
    return Linek.db(`bookings?select=*,properties(title,name,slug)&owner_profile_id=eq.${encodeURIComponent(profileId)}&order=created_at.desc`);
  }

  async function pageVisits(propertiesList) {
    const ids = (propertiesList || []).map(property => property.id).filter(Boolean);
    if (!ids.length) return [];
    return Linek.db(`booking_page_visits?select=id,property_id,visited_at&property_id=in.(${ids.map(encodeURIComponent).join(',')})`);
  }

  function propertyOptions(list, selected = '') {
    return list.map(property => `<option value="${property.id}" ${property.id === selected ? 'selected' : ''}>${escapeHtml(property.title || property.name)}</option>`).join('');
  }

  return {money, dateText, escapeHtml, slugify, publicLink, sidebar, guard, propertyLimit, planLabel, properties, bookings, pageVisits, propertyOptions};
})();
