/*
File: /assets/js/main.js
Purpose: Portfolio interactivity logic.
Description: Smooth anchor scrolling, mobile nav toggle, and reveal-on-scroll sections.
*/

const header = document.querySelector('.header');
const navToggle = document.querySelector('.nav-toggle');
const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let activeAnimationFrame = null;

function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function animateScrollTo(targetTop, durationMs = 520) {

    if (activeAnimationFrame) {
        cancelAnimationFrame(activeAnimationFrame);
    }

    const startTop = window.scrollY;
    const distance = targetTop - startTop;
    const startTime = performance.now();

    const step = (now) => {
        const progress = Math.min((now - startTime) / durationMs, 1);
        const easedProgress = easeInOutQuad(progress);
        window.scrollTo(0, startTop + distance * easedProgress);

        if (progress < 1) {
            activeAnimationFrame = requestAnimationFrame(step);
        } else {
            activeAnimationFrame = null;
        }
    };

    activeAnimationFrame = requestAnimationFrame(step);
}

function closeMobileNav() {
    if (!header || !navToggle) {
        return;
    }

    header.classList.remove('nav-open');
    navToggle.setAttribute('aria-expanded', 'false');
}

if (navToggle && header) {
    navToggle.addEventListener('click', () => {
        const isOpen = header.classList.toggle('nav-open');
        navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 860) {
            closeMobileNav();
        }
    });
}

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
        const targetId = anchor.getAttribute('href');

        if (!targetId || targetId === '#') {
            return;
        }

        const target = document.querySelector(targetId);

        if (!target) {
            return;
        }

        event.preventDefault();

        const headerOffset = header ? header.offsetHeight : 0;
        const targetTop = target.getBoundingClientRect().top + window.scrollY - headerOffset - 10;

        animateScrollTo(targetTop);
        history.replaceState(null, '', targetId);
        closeMobileNav();
    });
});

const revealElements = document.querySelectorAll('.reveal');

if (!motionReduced && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        },
        {
            rootMargin: '0px 0px -10% 0px',
            threshold: 0.18
        }
    );

    revealElements.forEach((element) => revealObserver.observe(element));
} else {
    revealElements.forEach((element) => element.classList.add('visible'));
}
