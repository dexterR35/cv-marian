/* Countdown to the end of the offer + the email sign-up form. */
(() => {
  /* ---------- 3D countdown ---------- */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cd = document.querySelector('.countdown');
  if (cd) {
    const deadline = new Date(cd.dataset.deadline).getTime();
    const cells = Object.fromEntries([...cd.querySelectorAll('.cd-num')].map(el => [el.dataset.k, el]));
    const set = (k, v) => {
      const el = cells[k];
      const txt = String(v).padStart(2, '0');
      if (el.textContent === txt) return;
      el.textContent = txt;
      el.dataset.text = txt;                     // the 3D face (::after) reads data-text
      if (reduce) return;
      el.classList.remove('cd-in');              // simple, quick fade-in on change
      void el.offsetWidth;
      el.classList.add('cd-in');
    };
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      const s = Math.floor(left / 1000);
      set('d', Math.floor(s / 86400));
      set('h', Math.floor(s / 3600) % 24);
      set('m', Math.floor(s / 60) % 60);
      set('s', s % 60);
      if (left === 0) cd.classList.add('ended');
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- sign-up form (front-end only: wire the submit to your backend / CRM) ---------- */
  const form = document.getElementById('offerForm');
  if (form) {
    const email = form.querySelector('input[type="email"]');
    const consent = form.querySelector('input[name="consent"]');
    const msg = form.querySelector('.form-msg');
    const say = (text, isError) => { msg.textContent = text; msg.classList.toggle('error', !!isError); };

    email.addEventListener('input', () => email.removeAttribute('aria-invalid'));
    consent.addEventListener('change', () => consent.closest('.consent').classList.remove('invalid'));

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!email.checkValidity() || !email.value.trim()) {
        email.setAttribute('aria-invalid', 'true');
        email.focus();
        return say('Introdu o adresă de email validă.', true);
      }
      if (!consent.checked) {
        consent.closest('.consent').classList.add('invalid');
        return say('Bifează acordul pentru Termeni și Condiții.', true);
      }
      say('Bu! Te-am înregistrat. Verifică-ți emailul pentru rotirile bântuite. 👻');
      form.querySelector('.cta').disabled = true;
    });
  }
})();
