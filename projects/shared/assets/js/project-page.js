// Keep shared project pages in sync with the current year.
const yearNode = document.querySelector('[data-year]');
if (yearNode) {
    yearNode.textContent = String(new Date().getFullYear());
}

const PROJECT_CONTRIBUTORS_PATH = '/projects/shared/data/project-contributors.json';
const CONTRIBUTORS_PATH = '/projects/shared/data/contributors.json';
const MAX_PROJECT_CONTRIBUTORS = 6;
const CONTRIBUTORS_INLINE_COLLAPSE_DELAY_MS = 500;
const CONTRIBUTORS_INLINE_REVEAL_STAGGER_MS = 90;
const CONTRIBUTORS_TOOLTIP_VIEWPORT_GUTTER_PX = 8;

function getProjectSlug() {
    const slugNode = document.body;
    return slugNode ? slugNode.getAttribute('data-project-slug') : '';
}

function getInitials(name) {
    if (!name) {
        return '?';
    }

    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
}

function createProfileUrl(projectSlug, contributorId) {
    const url = new URL(`/projects/${projectSlug}/contributers/`, window.location.origin);
    if (contributorId) {
        url.searchParams.set('member', contributorId);
    }
    return url.pathname + url.search;
}

function createContributorImage(contributor, className) {
    if (contributor.photo) {
        const image = document.createElement('img');
        image.className = className;
        image.src = contributor.photo;
        image.alt = contributor.name ? `${contributor.name} portrait` : 'Contributor portrait';
        image.width = 160;
        image.height = 160;
        // The inline strip renders only a few visible avatars, so eager loading
        // avoids delayed paints that can leave portraits blank until a later interaction.
        image.loading = 'eager';
        image.fetchPriority = 'high';
        image.decoding = 'sync';
        // Match contributor page cropping with optional face-focus coordinates from contributor data.
        image.style.objectFit = 'cover';
        const focusX = contributor.focus?.x ?? 50;
        const focusY = contributor.focus?.y ?? 50;
        image.style.objectPosition = `${focusX}% ${focusY}%`;
        // Optional zoom tightens the inline crop per contributor without changing the default rendering.
        const zoom = contributor.zoom ?? 1;
        image.style.setProperty('--contributor-zoom', String(zoom));
        image.style.setProperty('--contributor-enter-zoom', String(zoom * 0.96));
        // Anchor zoom to the same face-focus point so the subject stays visually stable.
        image.style.setProperty('--contributor-focus-x', `${focusX}%`);
        image.style.setProperty('--contributor-focus-y', `${focusY}%`);
        return image;
    }

    const fallback = document.createElement('span');
    fallback.className = `${className} contributor-photo-fallback`;
    fallback.setAttribute('aria-hidden', 'true');
    fallback.textContent = getInitials(contributor.name);
    return fallback;
}

function createContributorLink(projectSlug, contributor) {
    const link = document.createElement('a');
    link.className = 'contributors-inline-link';
    link.href = createProfileUrl(projectSlug, contributor.id);
    link.setAttribute('aria-label', `View ${contributor.name} and project contributors`);

    const media = document.createElement('span');
    media.className = 'contributors-inline-link-media';
    media.append(createContributorImage(contributor, 'contributors-inline-photo'));

    const tooltip = document.createElement('span');
    tooltip.className = 'contributors-inline-tooltip';
    tooltip.setAttribute('aria-hidden', 'true');

    const tooltipName = document.createElement('span');
    tooltipName.className = 'contributors-inline-tooltip-name';
    tooltipName.textContent = contributor.name || 'Contributor';

    const tooltipRole = document.createElement('span');
    tooltipRole.className = 'contributors-inline-tooltip-role';
    tooltipRole.textContent = contributor.designation || 'Contributor';

    tooltip.append(tooltipName, tooltipRole);
    link.append(media, tooltip);
    return link;
}

async function loadContributorData() {
    const [projectResponse, contributorsResponse] = await Promise.all([
        fetch(PROJECT_CONTRIBUTORS_PATH, { cache: 'no-store' }),
        fetch(CONTRIBUTORS_PATH, { cache: 'no-store' })
    ]);

    if (!projectResponse.ok || !contributorsResponse.ok) {
        throw new Error('Unable to load contributor data.');
    }

    const projectData = await projectResponse.json();
    const contributorsData = await contributorsResponse.json();

    return {
        projects: projectData.projects || {},
        contributors: contributorsData.contributors || {}
    };
}

function renderInlineContributors(projectSlug, project, contributorsById) {
    const host = document.querySelector('[data-contributors-inline]');
    if (!host) {
        return;
    }

    host.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'contributors-inline-label';
    label.textContent = 'Contributors';

    const cluster = document.createElement('div');
    cluster.className = 'contributors-inline-cluster';
    cluster.append(label);

    const row = document.createElement('div');
    row.className = 'contributors-inline-list';

    const contributorIds = Array.isArray(project?.contributors) ? project.contributors.slice(0, MAX_PROJECT_CONTRIBUTORS) : [];
    const totalContributors = contributorIds.length;
    row.classList.toggle('contributors-inline-list-single', totalContributors === 1);
    row.style.setProperty('--contributors-inline-max-stack-index', String(Math.max(totalContributors - 1, 0)));
    row.style.setProperty('--contributors-inline-reveal-stagger-ms', `${CONTRIBUTORS_INLINE_REVEAL_STAGGER_MS}ms`);

    contributorIds.forEach((contributorId, index) => {
        const contributor = contributorsById[contributorId];
        if (!contributor) {
            return;
        }

        const link = createContributorLink(projectSlug, contributor);
        const reverseIndex = totalContributors - index - 1;
        link.style.setProperty('--contributor-enter-delay', `calc(${index} * var(--contributors-inline-reveal-stagger-ms))`);
        link.style.setProperty('--contributor-stack-index', String(reverseIndex));
        // Keep the leftmost avatar above the overlapping stack so later avatars tuck underneath it.
        link.style.setProperty('--contributor-z-index', String(totalContributors - index));
        row.append(link);
    });

    cluster.append(row);

    host.append(cluster);
}

function initContributorsInlineReveal() {
    const inlineHost = document.querySelector('[data-contributors-inline]');
    if (!inlineHost) {
        return;
    }

    if (!('IntersectionObserver' in window)) {
        inlineHost.classList.add('contributors-inline-visible');
        return;
    }

    const observer = new IntersectionObserver(
        (entries, currentObserver) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add('contributors-inline-visible');
                currentObserver.unobserve(entry.target);
            });
        },
        {
            rootMargin: '0px 0px -10% 0px',
            threshold: 0.2
        }
    );

    observer.observe(inlineHost);
}

function initContributorsInlineHoverPersistence() {
    const inlineHost = document.querySelector('[data-contributors-inline]');
    if (!inlineHost) {
        return;
    }

    let collapseTimerId = null;

    function clearCollapseTimer() {
        if (collapseTimerId === null) {
            return;
        }

        window.clearTimeout(collapseTimerId);
        collapseTimerId = null;
    }

    function expandInlineContributors() {
        clearCollapseTimer();
        inlineHost.classList.add('is-hover-expanded');
    }

    function scheduleInlineContributorsCollapse() {
        clearCollapseTimer();
        collapseTimerId = window.setTimeout(() => {
            inlineHost.classList.remove('is-hover-expanded');
            collapseTimerId = null;
        }, CONTRIBUTORS_INLINE_COLLAPSE_DELAY_MS);
    }

    inlineHost.addEventListener('pointerenter', expandInlineContributors);
    inlineHost.addEventListener('pointerleave', scheduleInlineContributorsCollapse);
    inlineHost.addEventListener('focusin', expandInlineContributors);
    inlineHost.addEventListener('focusout', () => {
        if (inlineHost.contains(document.activeElement)) {
            return;
        }

        scheduleInlineContributorsCollapse();
    });
}

function resetTooltipAlignment(tooltip) {
    if (!tooltip) {
        return;
    }

    tooltip.classList.remove('is-aligned-left', 'is-aligned-right');
}

function updateTooltipAlignment(link) {
    if (!link || window.innerWidth > 720) {
        return;
    }

    const tooltip = link.querySelector('.contributors-inline-tooltip');
    if (!tooltip) {
        return;
    }

    resetTooltipAlignment(tooltip);

    const viewportWidth = document.documentElement.clientWidth;
    const tooltipRect = tooltip.getBoundingClientRect();
    const leftOverflow = CONTRIBUTORS_TOOLTIP_VIEWPORT_GUTTER_PX - tooltipRect.left;
    const rightOverflow = tooltipRect.right - (viewportWidth - CONTRIBUTORS_TOOLTIP_VIEWPORT_GUTTER_PX);

    if (rightOverflow > 0) {
        tooltip.classList.add('is-aligned-right');
        return;
    }

    if (leftOverflow > 0) {
        tooltip.classList.add('is-aligned-left');
    }
}

function initContributorsInlineTooltipAlignment() {
    const inlineHost = document.querySelector('[data-contributors-inline]');
    if (!inlineHost) {
        return;
    }

    const links = inlineHost.querySelectorAll('.contributors-inline-link');
    if (!links.length) {
        return;
    }

    links.forEach((link) => {
        const tooltip = link.querySelector('.contributors-inline-tooltip');
        if (!tooltip) {
            return;
        }

        const updateAlignment = () => updateTooltipAlignment(link);
        const clearAlignment = () => resetTooltipAlignment(tooltip);

        link.addEventListener('pointerenter', updateAlignment);
        link.addEventListener('focusin', updateAlignment);
        link.addEventListener('pointerleave', clearAlignment);
        link.addEventListener('focusout', clearAlignment);
    });

    window.addEventListener('resize', () => {
        links.forEach((link) => {
            if (link.matches(':hover') || link.contains(document.activeElement)) {
                updateTooltipAlignment(link);
                return;
            }

            const tooltip = link.querySelector('.contributors-inline-tooltip');
            resetTooltipAlignment(tooltip);
        });
    });
}

async function initContributors() {
    const inlineHost = document.querySelector('[data-contributors-inline]');
    if (!inlineHost) {
        return;
    }

    if (inlineHost.querySelector('.contributors-inline-link')) {
        initContributorsInlineReveal();
        initContributorsInlineHoverPersistence();
        initContributorsInlineTooltipAlignment();
        return;
    }

    try {
        const { projects, contributors } = await loadContributorData();
        const projectSlug = getProjectSlug();
        const project = projectSlug ? projects[projectSlug] : null;

        renderInlineContributors(projectSlug, project, contributors);
        initContributorsInlineReveal();
        initContributorsInlineHoverPersistence();
        initContributorsInlineTooltipAlignment();
    } catch (error) {
        inlineHost.textContent = 'Contributor profiles are unavailable right now.';
    }
}

initContributors();
