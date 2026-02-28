/*
File: /assets/js/main.js
Purpose: Portfolio interactivity logic.
Description: Handles smooth anchor scrolling for in-page navigation links.
*/

const header = document.querySelector('.header');
let activeAnimationFrame = null;

function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function animateScrollTo(targetTop, durationMs = 500) {
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

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
        const targetId = anchor.getAttribute('href');

        if (!targetId || targetId === '#') {
            return;
        }

        const target = document.querySelector(targetId);

        if (!target) {
            return;
        }

        e.preventDefault();

        const headerOffset = header ? header.offsetHeight : 0;
        const targetTop = target.getBoundingClientRect().top + window.scrollY - headerOffset - 12;

        animateScrollTo(targetTop);

        history.replaceState(null, '', targetId);
    });
});
