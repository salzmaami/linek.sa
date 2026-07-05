const form = document.getElementById('ownerApplyForm');
const toast = document.getElementById('toast');
const statusLine = document.getElementById('applyStatus');
const result = document.getElementById('applyResult');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function applyPlanFromUrl() {
  const plan = new URLSearchParams(location.search).get('plan');
  if (['single', 'multi', 'custom'].includes(plan)) {
    form.elements.plan_code.value = plan;
    form.elements.place_count.value = plan === 'multi' ? 2 : 1;
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const button = document.getElementById('submitOwnerApply');
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.verification_ack = form.elements.verification_ack.checked;
  button.disabled = true;
  statusLine.textContent = 'جار إرسال الطلب...';

  try {
    const response = await fetch('/api/owner-application', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر إرسال الطلب');
    form.reset();
    result.hidden = false;
    result.scrollIntoView({behavior: 'smooth', block: 'start'});
    statusLine.textContent = 'تم إرسال الطلب للمراجعة';
    showToast('وصل طلبك، بانتظار مراجعة Linek');
  } catch (error) {
    statusLine.textContent = '';
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

applyPlanFromUrl();
