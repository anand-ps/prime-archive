/*
File: /assets/js/main.js
Purpose: Portfolio interactivity logic.
Description: Smooth anchor scrolling, mobile nav toggle, and reveal-on-scroll sections.
*/

const header = document.querySelector('.header');
const navToggle = document.querySelector('.nav-toggle');
const specializationRotator = document.querySelector('#specialization-rotator');
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

const specializationItems = [
    'System Design',
    'Embedded Systems',
    'Distributed Backend Systems',
    'Reliability Engineering',
    'Cloud-Native Architecture',
    'Edge Computing Systems'
];

let specializationIndex = 0;
let typedLength = 0;
let isDeletingSpecialization = false;

const TYPE_SPEED_MS = 26;
const BACKSPACE_SPEED_MS = 24;
const HOLD_FULL_TEXT_MS = 1500;
const NEXT_WORD_DELAY_MS = 120;

function runTypewriterCycle() {
    if (!specializationRotator || specializationItems.length < 2) {
        return;
    }

    const activeLabel = specializationItems[specializationIndex];
    let delay;

    if (isDeletingSpecialization) {
        typedLength = Math.max(0, typedLength - 1);
    } else {
        typedLength = Math.min(activeLabel.length, typedLength + 1);
    }

    specializationRotator.textContent = activeLabel.slice(0, typedLength);
    const isHoldingWord = !isDeletingSpecialization && typedLength === activeLabel.length;
    specializationRotator.classList.toggle('is-holding', isHoldingWord);

    if (isHoldingWord) {
        isDeletingSpecialization = true;
        delay = HOLD_FULL_TEXT_MS;
    } else if (isDeletingSpecialization && typedLength === 0) {
        isDeletingSpecialization = false;
        specializationIndex = (specializationIndex + 1) % specializationItems.length;
        delay = NEXT_WORD_DELAY_MS;
    } else {
        delay = isDeletingSpecialization ? BACKSPACE_SPEED_MS : TYPE_SPEED_MS;
    }

    window.setTimeout(runTypewriterCycle, delay);
}

if (specializationRotator) {
    specializationRotator.textContent = '';
    specializationRotator.classList.remove('is-holding');
    runTypewriterCycle();
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

function assignRevealItems(selector, direction, staggerMs = 70) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((element, index) => {
        element.classList.add('reveal-item');
        if (direction) {
            element.classList.add(`reveal-${direction}`);
        }
        element.style.setProperty('--reveal-delay', `${index * staggerMs}ms`);
    });
}

assignRevealItems('.hero-copy > *:not(.hero-specialization-role)', 'up', 70);
assignRevealItems('.hero-visual .image-frame', 'right', 80);
assignRevealItems('.hero-metrics .metric', 'zoom', 85);
assignRevealItems('.section-head', 'up', 40);
assignRevealItems('#about .about-card > *', 'up', 90);
assignRevealItems('#domains .domain-card', 'up', 90);
assignRevealItems('#work .panel', 'up', 100);
assignRevealItems('#experience .panel', 'up', 100);
assignRevealItems('#contact .contact-panel > *', 'up', 90);
assignRevealItems('#contact .contact-list li', 'up', 70);

const revealElements = document.querySelectorAll('.reveal, .reveal-item');

if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            });
        },
        {
            rootMargin: '0px 0px -8% 0px',
            threshold: 0.14
        }
    );

    revealElements.forEach((element) => revealObserver.observe(element));
} else {
    revealElements.forEach((element) => element.classList.add('visible'));
}
