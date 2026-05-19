/**
 * Stoodio MD — Landing Page Scripts
 */

document.addEventListener('DOMContentLoaded', () => {
  initThemeSwitcher();
  initSmoothScroll();
  initNavScroll();
  initKeyboardAnimation();
});

/**
 * Theme Switcher for the theme preview section
 */
function initThemeSwitcher() {
  const buttons = document.querySelectorAll('.theme-btn');
  const preview = document.getElementById('theme-preview');

  if (!buttons.length || !preview) return;

  // Set initial theme
  preview.setAttribute('data-theme', 'github');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;

      // Update active button
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update preview theme with fade effect
      preview.style.opacity = '0';
      setTimeout(() => {
        preview.setAttribute('data-theme', theme);
        preview.style.opacity = '1';
      }, 150);
    });
  });
}

/**
 * Smooth scrolling for anchor links
 */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#') return;

      e.preventDefault();
      const target = document.querySelector(href);

      if (target) {
        const navHeight = document.querySelector('.nav').offsetHeight;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

/**
 * Navigation background on scroll
 */
function initNavScroll() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  const updateNav = () => {
    if (window.scrollY > 50) {
      nav.style.borderBottomColor = 'rgba(39, 39, 42, 0.8)';
      nav.style.background = 'rgba(10, 10, 11, 0.95)';
    } else {
      nav.style.borderBottomColor = 'rgba(39, 39, 42, 0.5)';
      nav.style.background = 'rgba(10, 10, 11, 0.8)';
    }
  };

  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();
}

/**
 * Keyboard animation - cycle through different keys
 */
function initKeyboardAnimation() {
  const keyLetter = document.querySelector('.key-letter');
  const textBold = document.querySelector('.text-bold');

  if (!keyLetter || !textBold) return;

  const shortcuts = [
    { key: 'B', text: '**markdown**' },
    { key: 'I', text: '*markdown*' },
    { key: 'K', text: '[markdown](url)' },
    { key: '1', text: '# markdown' },
    { key: '`', text: '`markdown`' },
  ];

  let currentIndex = 0;

  setInterval(() => {
    currentIndex = (currentIndex + 1) % shortcuts.length;
    const { key, text } = shortcuts[currentIndex];

    // Fade out
    keyLetter.style.opacity = '0';
    textBold.style.opacity = '0';

    setTimeout(() => {
      keyLetter.textContent = key;
      textBold.textContent = text;

      // Fade in
      keyLetter.style.opacity = '1';
      textBold.style.opacity = '1';
    }, 200);
  }, 3000);
}

/**
 * Intersection Observer for fade-in animations
 */
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    }
  );

  document.querySelectorAll('.feature-card, .section-header').forEach(el => {
    el.classList.add('animate-on-scroll');
    observer.observe(el);
  });
}

// Call scroll animations after DOM is ready
document.addEventListener('DOMContentLoaded', initScrollAnimations);
