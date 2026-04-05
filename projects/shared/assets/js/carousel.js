const carouselNodes = document.querySelectorAll('[data-carousel]');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const carouselLightbox = document.createElement('div');
const carouselLightboxImage = document.createElement('img');
carouselLightbox.className = 'project-carousel-lightbox';
carouselLightboxImage.className = 'project-carousel-lightbox-image';
carouselLightbox.appendChild(carouselLightboxImage);
carouselLightbox.tabIndex = -1;
document.body.appendChild(carouselLightbox);

let currentLightboxController = null;
let currentLightboxIndex = 0;
let lightboxTouchStartX = 0;
let lightboxTouchStartY = 0;
let lightboxTouchStartTime = 0;

function updateLightboxImage(index) {
    if (!currentLightboxController) {
        return;
    }
    const imageNode = currentLightboxController.imageNodes[index];
    if (!imageNode) {
        return;
    }
    carouselLightboxImage.src = imageNode.src;
    carouselLightboxImage.alt = imageNode.alt || '';
}

function showCarouselLightbox(controller, index) {
    if (!controller) {
        return;
    }
    currentLightboxController = controller;
    currentLightboxController.goToSlide(index);
    currentLightboxIndex = currentLightboxController.getActiveIndex();
    updateLightboxImage(currentLightboxIndex);
    carouselLightbox.classList.add('is-visible');
    document.body.style.overflow = 'hidden';
    carouselLightbox.focus();
}

function hideCarouselLightbox() {
    carouselLightbox.classList.remove('is-visible');
    document.body.style.overflow = '';
    currentLightboxController = null;
}

function navigateLightbox(delta) {
    if (!currentLightboxController) {
        return;
    }
    const nextIndex = currentLightboxController.getActiveIndex() + delta;
    currentLightboxController.goToSlide(nextIndex);
    currentLightboxIndex = currentLightboxController.getActiveIndex();
    updateLightboxImage(currentLightboxIndex);
}

carouselLightbox.addEventListener('click', (event) => {
    if (event.target === carouselLightbox) {
        hideCarouselLightbox();
    }
});

carouselLightbox.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        hideCarouselLightbox();
    } else if (event.key === 'ArrowRight') {
        navigateLightbox(1);
    } else if (event.key === 'ArrowLeft') {
        navigateLightbox(-1);
    }
});

carouselLightbox.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    lightboxTouchStartX = touch.clientX;
    lightboxTouchStartY = touch.clientY;
    lightboxTouchStartTime = event.timeStamp;
});

carouselLightbox.addEventListener('touchend', (event) => {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - lightboxTouchStartX;
    const deltaY = touch.clientY - lightboxTouchStartY;
    const deltaTime = event.timeStamp - lightboxTouchStartTime;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40 && deltaTime < 500) {
        if (deltaX < 0) {
            navigateLightbox(1);
        } else {
            navigateLightbox(-1);
        }
    }
});

async function loadSlidesFromManifest(carouselNode) {
    const existingSlides = Array.from(carouselNode.querySelectorAll('.project-carousel-slide'));
    if (existingSlides.length > 0) {
        return existingSlides;
    }

    const source = carouselNode.dataset.carouselSource;
    if (!source) {
        return [];
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

    const imageNodes = slideNodes.map((slideNode) => slideNode.querySelector('img'));
    const autoplayIntervalMs = Number.parseInt(carouselNode.dataset.carouselInterval || '4200', 10);
    const autoplayEnabled = slideNodes.length > 1 && !prefersReducedMotion;
    const carouselId = carouselNode.id || `project-carousel-${carouselIndex + 1}`;
    let activeIndex = 0;
    let autoplayHandle = null;
    let dotButtons = [];
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    const carouselController = {
        goToSlide: null,
        getActiveIndex: () => activeIndex,
        imageNodes,
        slideCount: slideNodes.length,
    };

    carouselNode.id = carouselId;
    const interactiveNode = carouselNode.querySelector('.project-carousel-viewport') || carouselNode;
    interactiveNode.tabIndex = interactiveNode.tabIndex >= 0 ? interactiveNode.tabIndex : 0;


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

    carouselController.goToSlide = goToSlide;
    carouselNode._carouselController = carouselController;

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

    imageNodes.forEach((imageNode, index) => {
        if (!imageNode) {
            return;
        }
        imageNode.addEventListener('click', () => {
            showCarouselLightbox(carouselNode._carouselController, index);
        });
    });

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

    interactiveNode.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            goToSlide(activeIndex + 1);
            stopAutoplay();
            startAutoplay();
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goToSlide(activeIndex - 1);
            stopAutoplay();
            startAutoplay();
        }
    });

    interactiveNode.addEventListener('touchstart', (event) => {
        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = event.timeStamp;
    });

    interactiveNode.addEventListener('touchend', (event) => {
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        const deltaTime = event.timeStamp - touchStartTime;

        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40 && deltaTime < 500) {
            if (deltaX < 0) {
                goToSlide(activeIndex + 1);
            } else {
                goToSlide(activeIndex - 1);
            }
            stopAutoplay();
            startAutoplay();
        }
    });

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
