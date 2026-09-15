export function toast(msg, kind = 'info', ms = 3800) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = msg;
  box.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s, transform .3s';
    t.style.opacity = '0';
    t.style.transform = 'translateY(6px)';
    setTimeout(() => t.remove(), 320);
  }, ms);
}
