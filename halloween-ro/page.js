(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- header: compact after scrolling, hide on the way down, progress bar
  const header = document.getElementById('siteHeader');
  let lastY = scrollY;
  let ticking = false;
  const onScroll = () => {
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    header.classList.toggle('scrolled', y > 40);
    header.classList.toggle('hide', y > 400 && y > lastY + 4);
    if (y < lastY - 4) header.classList.remove('hide');
    header.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
    lastY = y;
    ticking = false;
  };
  addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  // ---- scroll reveal
  const revealer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      revealer.unobserve(e.target);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('[data-reveal]').forEach(el => revealer.observe(el));

  // ---- terms & conditions collapse
  const toggle = document.getElementById('tncToggle');
  const box = toggle.closest('.tnc-box');
  const hint = toggle.querySelector('.tnc-hint');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', open);
    box.classList.toggle('open', open);
    hint.textContent = open ? hint.dataset.open : hint.dataset.closed;
  });

  // ---- sticky CTA: follows once the hero offer is off-screen, steps aside for the steps CTA and footer
  const sticky = document.getElementById('stickyCta');
  const stickyLink = sticky.querySelector('a');
  const watched = new Map([
    [document.querySelector('.hero .cta'), false],
    [document.getElementById('stepsCta'), false],
    [document.querySelector('.site-footer'), false],
  ]);
  const stickyObserver = new IntersectionObserver(entries => {
    entries.forEach(e => watched.set(e.target, e.isIntersecting));
    const show = scrollY > 200 && ![...watched.values()].some(Boolean);
    sticky.classList.toggle('show', show);
    sticky.setAttribute('aria-hidden', !show);
    stickyLink.tabIndex = show ? 0 : -1;
  });
  watched.forEach((_, el) => stickyObserver.observe(el));

  // ---- step cards: 3D tilt toward the pointer
  if (!reduceMotion && matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.step').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--ry', `${x * 14}deg`);
        card.style.setProperty('--rx', `${-y * 14}deg`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--rx', '0deg');
      });
    });
  }
})();
