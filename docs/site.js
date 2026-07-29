/* ClipForge site animations — GSAP + ScrollTrigger + Lenis (CDN).
   The page is fully readable with no JS: initial hidden states are
   set HERE, not in CSS, so a failed CDN load degrades gracefully. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- sound toggle on demo videos (independent of GSAP) --- */
  document.querySelectorAll('.ph').forEach(function (ph) {
    var v = ph.querySelector('video');
    var btn = ph.querySelector('.snd');
    if (!v || !btn) return;
    btn.addEventListener('click', function () {
      // unmute this one, mute the others (one voice at a time)
      document.querySelectorAll('.ph video').forEach(function (o) { if (o !== v) { o.muted = true; } });
      document.querySelectorAll('.ph .snd').forEach(function (o) { if (o !== btn) { o.textContent = '🔇'; } });
      v.muted = !v.muted;
      btn.textContent = v.muted ? '🔇' : '🔊';
    });
  });

  if (reduce || !window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  /* --- Lenis smooth scrolling, driven by the GSAP ticker --- */
  if (window.Lenis) {
    var lenis = new Lenis({ lerp: 0.115 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    // anchor links go through Lenis
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var el = document.querySelector(a.getAttribute('href'));
        if (el) { e.preventDefault(); lenis.scrollTo(el, { offset: -70 }); }
      });
    });
  }

  /* --- split headline into per-character spans (gsap.com-style type entrance) --- */
  document.querySelectorAll('.hero h1 .line > span').forEach(function (span) {
    var out = [];
    span.childNodes.forEach(function (node) {
      if (node.nodeType === 3) {
        node.textContent.split('').forEach(function (ch) {
          out.push(ch === ' ' ? ' ' : '<i class="ch">' + ch + '</i>');
        });
      } else if (node.nodeType === 1) {
        // keep the highlight block whole, split its text inside
        var inner = node.textContent.split('').map(function (ch) { return '<i class="ch">' + ch + '</i>'; }).join('');
        node.innerHTML = inner;
        out.push(node.outerHTML);
      }
    });
    span.innerHTML = out.join('');
    span.style.animation = 'none';
  });
  var chStyle = document.createElement('style');
  chStyle.textContent = '.hero h1 .ch{display:inline-block;font-style:normal;}';
  document.head.appendChild(chStyle);

  /* --- hero entrance timeline: characters drop in with a bounce --- */
  var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('.kicker', { y: 18, opacity: 0, duration: 0.6 })
    .from('.hero h1 .ch', {
      yPercent: -130, opacity: 0, duration: 0.9, ease: 'bounce.out',
      stagger: { each: 0.035, from: 'start' }
    }, '-=0.25')
    .from('.hero h1 .hl', { rotate: 6, duration: 0.7, ease: 'elastic.out(1, 0.5)' }, '-=0.5')
    .from('.hero .sub', { y: 16, opacity: 0, duration: 0.6 }, '-=0.5')
    .from('.hero .cta', { y: 16, opacity: 0, duration: 0.6 }, '-=0.42')
    .from('.hero .trust', { y: 12, opacity: 0, duration: 0.5 }, '-=0.42')
    .from('.ph', { y: 60, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power4.out', clearProps: 'opacity' }, '-=0.35')
    .from('.fbadge', { scale: 0.6, opacity: 0, duration: 0.5, stagger: 0.08, ease: 'back.out(1.8)', clearProps: 'opacity' }, '-=0.5');

  /* --- giant ticker band scrubs slightly with scroll on top of its CSS loop --- */
  gsap.to('.marquee .track', {
    xPercent: -6, ease: 'none',
    scrollTrigger: { trigger: '.marquee', start: 'top bottom', end: 'bottom top', scrub: true }
  });

  /* --- oversized chapter numbers drift past their titles --- */
  gsap.utils.toArray('.sec-head .no').forEach(function (el) {
    gsap.fromTo(el, { y: 46 }, {
      y: -46, ease: 'none',
      scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true }
    });
  });

  /* --- app window unfolds as it scrolls into view --- */
  gsap.utils.toArray('.stage .window').forEach(function (w) {
    gsap.fromTo(w, { rotateX: 10, scale: 0.96 }, {
      rotateX: 0, scale: 1, ease: 'none',
      scrollTrigger: { trigger: w, start: 'top 92%', end: 'top 40%', scrub: true }
    });
  });

  /* --- section reveals with stagger --- */
  gsap.utils.toArray('.reveal').forEach(function (el) {
    var head = el.querySelector('.sec-head');
    if (head) {
      gsap.from(head.children, {
        y: 26, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 80%' }
      });
    }
    var group = el.querySelector('.stagger');
    if (group) {
      gsap.from(group.children, {
        y: 30, opacity: 0, duration: 0.7, stagger: 0.09, ease: 'power3.out',
        scrollTrigger: { trigger: group, start: 'top 82%' }
      });
    } else if (!head) {
      gsap.from(el, {
        y: 26, opacity: 0, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 82%' }
      });
    }
    // non-stagger content blocks inside a headed section
    el.querySelectorAll('.tablewrap, .faq-list, .filmreel').forEach(function (blk) {
      gsap.from(blk, {
        y: 30, opacity: 0, duration: 0.75, ease: 'power3.out',
        scrollTrigger: { trigger: blk, start: 'top 85%' }
      });
    });
  });

  /* --- stats count up --- */
  gsap.utils.toArray('.stat b').forEach(function (el) {
    var m = el.textContent.match(/^(\d+)([\s\S]*)$/);
    if (!m || +m[1] === 0) return;
    var target = +m[1], suffix = m[2] || '';
    var obj = { v: 0 };
    gsap.to(obj, {
      v: target, duration: 1.3, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 86%' },
      onUpdate: function () { el.textContent = Math.round(obj.v) + suffix; }
    });
  });

  /* --- film strip drifts sideways with scroll --- */
  gsap.fromTo('.filmstrip', { x: 46 }, {
    x: -26, ease: 'none',
    scrollTrigger: { trigger: '.filmreel', start: 'top bottom', end: 'bottom top', scrub: true }
  });
})();
