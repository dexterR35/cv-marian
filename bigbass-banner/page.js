(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The background moves behind the fixed poster; offer controls stay still.
  const heroFrame = document.querySelector('.hero-frame');
  const parallaxDesktop = matchMedia('(min-width: 761px)');
  let parallaxX = 0;
  let parallaxY = 0;
  let parallaxPending = false;
  const renderParallax = () => {
    parallaxPending = false;
    const active = !reduceMotion && parallaxDesktop.matches;
    heroFrame.style.setProperty('--parallax-x', `${active ? parallaxX : 0}px`);
    heroFrame.style.setProperty('--parallax-y', `${active ? Math.min(scrollY * .12, 80) + parallaxY : 0}px`);
  };
  const queueParallax = () => {
    if (parallaxPending) return;
    parallaxPending = true;
    requestAnimationFrame(renderParallax);
  };
  parallaxDesktop.addEventListener('change', queueParallax);
  if (!reduceMotion && matchMedia('(pointer: fine)').matches) {
    heroFrame.addEventListener('pointermove', event => {
      const rect = heroFrame.getBoundingClientRect();
      parallaxX = -20 * ((event.clientX - rect.left) / rect.width - .5);
      parallaxY = -12 * ((event.clientY - rect.top) / rect.height - .5);
      queueParallax();
    });
    heroFrame.addEventListener('pointerleave', () => {
      parallaxX = 0;
      parallaxY = 0;
      queueParallax();
    });
  }

  // ---- bats: inline the drawing so every wing can flap on its own
  // (animations inside <use> clones are not reliable across browsers).
  const batSymbol = document.getElementById('bat');
  document.querySelectorAll('svg.bat, svg.pbat').forEach(svg => {
    svg.replaceChildren(...[...batSymbol.children].map(n => n.cloneNode(true)));
  });

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
    queueParallax();
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
    [document.querySelector('.banner .cta'), false],
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
