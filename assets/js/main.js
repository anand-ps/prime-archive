/*
File: /assets/js/main.js
Purpose: Portfolio interactivity logic.
Description: Smooth anchor scrolling, mobile nav toggle, reveal-on-scroll sections, and downloads manifest rendering.
*/

const header = document.querySelector('.header');
const navToggle = document.querySelector('.nav-toggle');
const downloadsSectionList = document.querySelector('[data-downloads-list]');
const projectThumbnailNodes = document.querySelectorAll('[data-project-thumbnail-source]');
const specializationRotator = document.querySelector('#specialization-rotator');
const rootElement = document.documentElement;
const downloadsRoot = rootElement.hasAttribute('data-downloads-root') ? rootElement.dataset.downloadsRoot : 'downloads/';
const downloadsManifestPath = rootElement.hasAttribute('data-downloads-manifest')
    ? rootElement.dataset.downloadsManifest
    : `${downloadsRoot}manifest.json`;

let activeAnimationFrame = null;

function easeInOutCubic(t) {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function animateScrollTo(targetTop) {
    if (activeAnimationFrame) {
        cancelAnimationFrame(activeAnimationFrame);
    }

    const startTop = window.scrollY;
    const distance = targetTop - startTop;
    const durationMs = Math.min(620, Math.max(320, Math.abs(distance) * 0.38));
    const startTime = performance.now();

    const step = (now) => {
        const progress = Math.min((now - startTime) / durationMs, 1);
        const easedProgress = easeInOutCubic(progress);
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

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeMobileNav();
    }
});

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
assignRevealItems('#skills .skill-matrix-row', 'up', 85);
assignRevealItems('#domains .domain-card', 'up', 90);
assignRevealItems('#projects .panel', 'up', 100);
assignRevealItems('#experience .panel', 'up', 100);
assignRevealItems('#contact .contact-panel > *', 'up', 90);
assignRevealItems('#contact .contact-list li', 'up', 70);
assignRevealItems('[data-downloads-list] .panel', 'up', 90);

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

function normalizeDownloadPath(filePath) {
    if (!filePath) {
        return '';
    }

    const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\.?\//, '');
    return normalizedPath.startsWith(downloadsRoot) ? normalizedPath : `${downloadsRoot}${normalizedPath}`;
}

async function checkDownloadAvailability(filePath) {
    try {
        let response = await fetch(filePath, { method: 'HEAD', cache: 'no-store' });

        if (response.status === 405) {
            response = await fetch(filePath, { method: 'GET', cache: 'no-store' });
        }

        return response.ok;
    } catch (error) {
        return false;
    }
}

function createDownloadCard(item) {
    const card = document.createElement('article');
    card.className = `panel download-card${item.available ? '' : ' download-card-unavailable'}`;

    const headerRow = document.createElement('div');
    headerRow.className = 'download-card-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'download-card-title-group';

    const title = document.createElement('h3');
    title.textContent = item.title;

    const description = document.createElement('p');
    description.className = 'download-description';
    description.textContent = item.description || 'Published from the repository downloads folder.';

    titleGroup.append(title, description);

    const status = document.createElement('span');
    status.className = `download-status ${item.available ? 'download-status-available' : 'download-status-unavailable'}`;
    status.textContent = item.available ? 'Available' : 'Add File';

    headerRow.append(titleGroup, status);

    const metaList = document.createElement('ul');
    metaList.className = 'download-meta-list';
    [item.type, item.file].filter(Boolean).forEach((entry) => {
        const metaItem = document.createElement('li');
        metaItem.textContent = entry;
        metaList.appendChild(metaItem);
    });

    const actions = document.createElement('div');
    actions.className = 'download-actions';

    if (item.available) {
        const downloadLink = document.createElement('a');
        downloadLink.className = 'download-link';
        downloadLink.href = item.path;
        downloadLink.setAttribute('download', '');
        downloadLink.textContent = `Download ${item.title}`;

        const pathLink = document.createElement('a');
        pathLink.className = 'download-link-secondary';
        pathLink.href = item.path;
        pathLink.textContent = item.path;

        actions.append(downloadLink, pathLink);
    } else {
        const hint = document.createElement('p');
        hint.className = 'download-hint';
        hint.textContent = `Add ${item.path} to publish this download.`;
        actions.appendChild(hint);
    }

    card.append(headerRow, metaList, actions);
    return card;
}

function renderDownloads(items, emptyMessageText = 'No download entries configured yet.') {
    if (!downloadsSectionList) {
        return;
    }

    downloadsSectionList.replaceChildren();

    if (!items.length) {
        const emptyCard = document.createElement('article');
        emptyCard.className = 'panel download-card download-card-empty';

        const message = document.createElement('p');
        message.textContent = emptyMessageText;

        emptyCard.appendChild(message);
        downloadsSectionList.appendChild(emptyCard);
        return;
    }

    items.forEach((item) => downloadsSectionList.appendChild(createDownloadCard(item)));
}

function renderDownloadsError() {
    if (window.location.protocol === 'file:') {
        renderDownloads([], 'Open this site through a local web server instead of file:// so the downloads manifest can load.');
        return;
    }

    renderDownloads([], 'Unable to load download entries right now.');
}

async function loadProjectThumbnails() {
    if (!projectThumbnailNodes.length) {
        return;
    }

    await Promise.all(
        Array.from(projectThumbnailNodes).map(async (thumbnailNode) => {
            if (thumbnailNode.querySelector('.project-media-image')) {
                thumbnailNode.classList.add('has-project-image');
                return;
            }

            const source = thumbnailNode.dataset.projectThumbnailSource;
            const base = thumbnailNode.dataset.projectThumbnailBase || '';

            if (!source) {
                return;
            }

            try {
                const response = await fetch(source, { cache: 'no-store' });

                if (!response.ok) {
                    return;
                }

                const manifestItems = await response.json();
                const firstImage = Array.isArray(manifestItems) ? manifestItems[0] : '';

                if (!firstImage) {
                    return;
                }

                const imagePath = `${base}${firstImage}`;
                thumbnailNode.style.setProperty('--project-image', `url("${imagePath}")`);
                thumbnailNode.style.setProperty('--project-image-opacity', '1');
                thumbnailNode.classList.add('has-project-image');
            } catch (error) {
                // Keep the gradient fallback when a project has no generated image manifest yet.
            }
        })
    );
}

async function loadDownloads() {
    if (!downloadsSectionList) {
        return;
    }

    try {
        const response = await fetch(downloadsManifestPath, { cache: 'no-store' });

        if (!response.ok) {
            throw new Error(`Unable to load ${downloadsManifestPath}`);
        }

        const manifestItems = await response.json();

        if (!Array.isArray(manifestItems)) {
            throw new Error('Download manifest must be an array');
        }

        const items = await Promise.all(
            manifestItems.map(async (item) => {
                const path = normalizeDownloadPath(item.file || item.path || '');
                const available = path ? await checkDownloadAvailability(path) : false;

                return {
                    title: item.title || 'Download',
                    description: item.description || '',
                    type: item.type || '',
                    file: path.replace(downloadsRoot, ''),
                    path,
                    available
                };
            })
        );

        renderDownloads(items);
    } catch (error) {
        renderDownloadsError();
    }
}

loadProjectThumbnails();
loadDownloads();
