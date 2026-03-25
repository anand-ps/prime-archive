const carouselNodes = document.querySelectorAll('[data-carousel]');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function loadSlidesFromManifest(carouselNode) {
    const source = carouselNode.dataset.carouselSource;
    if (!source) {
        return Array.from(carouselNode.querySelectorAll('.project-carousel-slide'));
    }

    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Unable to load carousel manifest: ${source}`);
    }

    const fileNames = await response.json();
    if (!Array.isArray(fileNames)) {
        throw new Error('Carousel manifest must be an array of image filenames.');
    }

    const imageBase = carouselNode.dataset.carouselImageBase || '';
    const altPrefix = carouselNode.dataset.carouselAltPrefix || 'Project image';
    const trackNode = carouselNode.querySelector('.project-carousel-track');

    trackNode.replaceChildren();

    fileNames.forEach((fileName, index) => {
        const slideNode = document.createElement('figure');
        slideNode.className = 'project-carousel-slide';

        const imageNode = document.createElement('img');
        imageNode.className = 'project-carousel-image';
        imageNode.src = `${imageBase}${fileName}`;
        imageNode.alt = `${altPrefix} ${index + 1}`;
        imageNode.loading = index === 0 ? 'eager' : 'lazy';

        slideNode.appendChild(imageNode);
        trackNode.appendChild(slideNode);
    });

    return Array.from(trackNode.querySelectorAll('.project-carousel-slide'));
}

function renderCarouselEmptyState(carouselNode, message) {
    const viewportNode = carouselNode.querySelector('.project-carousel-viewport');
    if (!viewportNode) {
        return;
    }

    viewportNode.replaceChildren();

    const emptyNode = document.createElement('div');
    emptyNode.className = 'project-carousel-empty';
    emptyNode.textContent = message;
    viewportNode.appendChild(emptyNode);
}

function initializeCarousel(carouselNode, slideNodes, carouselIndex) {
    const trackNode = carouselNode.querySelector('.project-carousel-track');
    const prevButton = carouselNode.querySelector('[data-carousel-prev]');
    const nextButton = carouselNode.querySelector('[data-carousel-next]');
    const dotsNode = carouselNode.querySelector('[data-carousel-dots]');

    if (!trackNode || slideNodes.length === 0) {
        renderCarouselEmptyState(carouselNode, 'No project images available yet.');
        return;
    }

    const autoplayIntervalMs = Number.parseInt(carouselNode.dataset.carouselInterval || '4200', 10);
    const autoplayEnabled = slideNodes.length > 1 && !prefersReducedMotion;
    const carouselId = carouselNode.id || `project-carousel-${carouselIndex + 1}`;
    let activeIndex = 0;
    let autoplayHandle = null;
    let dotButtons = [];

    carouselNode.id = carouselId;

    function renderSlides() {
        trackNode.style.transform = `translateX(-${activeIndex * 100}%)`;

        slideNodes.forEach((slideNode, index) => {
            const isActive = index === activeIndex;
            slideNode.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });

        dotButtons.forEach((dotButton, index) => {
            const isActive = index === activeIndex;
            dotButton.classList.toggle('is-active', isActive);
            dotButton.setAttribute('aria-current', isActive ? 'true' : 'false');
        });
    }

    function goToSlide(nextIndex) {
        activeIndex = (nextIndex + slideNodes.length) % slideNodes.length;
        renderSlides();
    }

    function stopAutoplay() {
        if (!autoplayHandle) {
            return;
        }

        window.clearInterval(autoplayHandle);
        autoplayHandle = null;
    }

    function startAutoplay() {
        if (!autoplayEnabled || autoplayHandle) {
            return;
        }

        autoplayHandle = window.setInterval(() => {
            goToSlide(activeIndex + 1);
        }, autoplayIntervalMs);
    }

    if (dotsNode) {
        dotsNode.replaceChildren();
        dotButtons = slideNodes.map((_, index) => {
            const dotButton = document.createElement('button');
            dotButton.className = 'project-carousel-dot';
            dotButton.type = 'button';
            dotButton.setAttribute('aria-label', `Show project image ${index + 1}`);
            dotButton.addEventListener('click', () => {
                goToSlide(index);
                stopAutoplay();
                startAutoplay();
            });
            dotsNode.appendChild(dotButton);
            return dotButton;
        });
    }

    if (prevButton) {
        prevButton.hidden = slideNodes.length < 2;
        prevButton.addEventListener('click', () => {
            goToSlide(activeIndex - 1);
            stopAutoplay();
            startAutoplay();
        });
    }

    if (nextButton) {
        nextButton.hidden = slideNodes.length < 2;
        nextButton.addEventListener('click', () => {
            goToSlide(activeIndex + 1);
            stopAutoplay();
            startAutoplay();
        });
    }

    if (dotsNode) {
        dotsNode.hidden = slideNodes.length < 2;
    }

    carouselNode.addEventListener('mouseenter', stopAutoplay);
    carouselNode.addEventListener('mouseleave', startAutoplay);
    carouselNode.addEventListener('focusin', stopAutoplay);
    carouselNode.addEventListener('focusout', (event) => {
        if (!carouselNode.contains(event.relatedTarget)) {
            startAutoplay();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopAutoplay();
        } else {
            startAutoplay();
        }
    });

    renderSlides();
    startAutoplay();
}

async function setupCarousels() {
    await Promise.all(
        Array.from(carouselNodes).map(async (carouselNode, carouselIndex) => {
            try {
                const slideNodes = await loadSlidesFromManifest(carouselNode);
                initializeCarousel(carouselNode, slideNodes, carouselIndex);
            } catch (error) {
                renderCarouselEmptyState(carouselNode, 'Unable to load project images right now.');
            }
        })
    );
}

setupCarousels();
