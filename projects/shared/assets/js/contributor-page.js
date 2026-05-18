/*
File: /projects/shared/assets/js/contributor-page.js
Purpose: Shared interactivity for project contributor pages, including directory rendering and backend-powered visitor features.
*/

// Section: Shared footer year sync.
const contributorYearNode = document.querySelector('[data-year]');
if (contributorYearNode) {
    contributorYearNode.textContent = String(new Date().getFullYear());
}

// Section: Contributor directory configuration.
const CONTRIBUTOR_PROJECTS_PATH = '/projects/shared/data/project-contributors.json';
const CONTRIBUTOR_DIRECTORY_PATH = '/projects/shared/data/contributors.json';
const MAX_CONTRIBUTOR_PAGE_MEMBERS = 6;
function createContributorProfileUrl(contributorId) {
    return `/contributors/${contributorId}/`;
}

function getContributorProjectSlug() {
    const slugNode = document.body;
    return slugNode ? slugNode.getAttribute('data-project-slug') : '';
}

function getContributorInitials(name) {
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

function createContributorPageImage(contributor, className) {
    if (contributor.photo) {
        const image = document.createElement('img');
        image.className = className;
        image.src = contributor.photo;
        image.alt = contributor.name ? `${contributor.name} portrait` : 'Contributor portrait';
        image.width = 160;
        image.height = 160;
        // This page renders only a small fixed set of avatars, so eager loading
        // avoids browser lazy-loading delays that can leave visible portraits blank
        // until the next interaction or repaint.
        image.loading = 'eager';
        image.fetchPriority = 'high';
        image.decoding = 'sync';
        // Keep photo crops consistent while allowing optional face-focused positioning from contributor data.
        image.style.objectFit = 'cover';
        const focusX = contributor.focus?.x ?? 50;
        const focusY = contributor.focus?.y ?? 50;
        image.style.objectPosition = `${focusX}% ${focusY}%`;
        // Optional zoom tightens the crop per contributor without changing the default rendering.
        const zoom = contributor.zoom ?? 1;
        image.style.setProperty('--contributor-profile-photo-zoom', String(zoom));
        // Anchor zoom to the same face-focus point so the subject stays visually stable.
        image.style.setProperty('--contributor-profile-photo-focus-x', `${focusX}%`);
        image.style.setProperty('--contributor-profile-photo-focus-y', `${focusY}%`);
        return image;
    }

    const fallback = document.createElement('span');
    fallback.className = `${className} contributor-photo-fallback`;
    fallback.setAttribute('aria-hidden', 'true');
    fallback.textContent = getContributorInitials(contributor.name);
    return fallback;
}

function createContributorPageActionIcon(label, contributor) {
    const iconClassName = label === 'Email'
        ? contributor?.links?.emailIcon || 'icon-google'
        : label === 'LinkedIn'
            ? 'icon-linkedin'
            : label === 'GitHub'
                ? 'icon-github'
                : '';
    if (!iconClassName) {
        return null;
    }

    const icon = document.createElement('span');
    icon.className = `contributor-profile-action-icon ${iconClassName}`;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}

function createContributorPageCard(contributor, activeMemberId) {
    const card = document.createElement('article');
    card.className = 'contributor-profile-card';
    card.id = `member-${contributor.id}`;
    const profileUrl = createContributorProfileUrl(contributor.id);

    if (contributor.id === activeMemberId) {
        card.classList.add('is-active');
    }

    const media = document.createElement('div');
    media.className = 'contributor-profile-media';
    media.append(createContributorPageImage(contributor, 'contributor-profile-photo'));

    const mediaLink = document.createElement('a');
    mediaLink.className = 'contributor-profile-primary-link';
    mediaLink.href = profileUrl;
    mediaLink.setAttribute('aria-label', `View profile for ${contributor.name || 'Contributor'}`);
    mediaLink.append(media);

    const content = document.createElement('div');
    content.className = 'contributor-profile-content';

    const identity = document.createElement('div');
    identity.className = 'contributor-profile-identity';

    const topRow = document.createElement('div');
    topRow.className = 'contributor-profile-top';

    const name = document.createElement('h2');
    const nameLink = document.createElement('a');
    nameLink.className = 'contributor-profile-heading-link';
    nameLink.href = profileUrl;
    nameLink.textContent = contributor.name || 'Contributor';
    name.append(nameLink);

    const designation = document.createElement('p');
    designation.className = 'contributor-profile-role';
    designation.textContent = contributor.designation || 'Project Contributor';

    identity.append(name, designation);
    topRow.append(mediaLink, identity);
    content.append(topRow);

    if (contributor.bio) {
        const bio = document.createElement('p');
        bio.className = 'contributor-profile-bio';
        bio.textContent = contributor.bio;
        content.append(bio);
    }

    const links = contributor.links || {};
    const linksRow = document.createElement('div');
    linksRow.className = 'contributor-profile-links';

    [
        ['LinkedIn', links.linkedin],
        ['GitHub', links.github],
        ['Email', links.email]
    ].forEach(([label, href]) => {
        if (!href) {
            return;
        }

        const anchor = document.createElement('a');
        anchor.className = 'contributor-profile-action-link';
        anchor.href = href;
        anchor.setAttribute('aria-label', `${contributor.name || 'Contributor'} ${label}`);
        anchor.title = '';

        const icon = createContributorPageActionIcon(label, contributor);
        if (icon) {
            anchor.append(icon);
        } else {
            anchor.textContent = label;
        }

        if (/^https?:/i.test(href)) {
            anchor.target = '_blank';
            anchor.rel = 'noreferrer';
        }

        linksRow.append(anchor);
    });

    if (linksRow.childElementCount > 0) {
        const actions = document.createElement('div');
        actions.className = 'contributor-profile-actions';
        const profileLink = document.createElement('a');
        profileLink.className = 'contributor-profile-cta';
        profileLink.href = profileUrl;
        profileLink.textContent = 'View Profile';
        actions.append(profileLink);
        content.append(actions);
    } else {
        const actions = document.createElement('div');
        actions.className = 'contributor-profile-actions';
        const profileLink = document.createElement('a');
        profileLink.className = 'contributor-profile-cta';
        profileLink.href = profileUrl;
        profileLink.textContent = 'View Profile';
        actions.append(profileLink);
        content.append(actions);
    }

    card.append(content);
    return card;
}

async function loadContributorPageData() {
    const [projectResponse, contributorsResponse] = await Promise.all([
        fetch(CONTRIBUTOR_PROJECTS_PATH, { cache: 'no-store' }),
        fetch(CONTRIBUTOR_DIRECTORY_PATH, { cache: 'no-store' })
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

function renderContributorPage(projectSlug, project, contributorsById) {
    const host = document.querySelector('[data-contributors-page-list]');
    if (!host) {
        return;
    }

    host.innerHTML = '';

    const titleNode = document.querySelector('[data-contributors-project-title]');
    if (titleNode && project?.title) {
        titleNode.textContent = project.title;
    }

    const activeMemberId = new URLSearchParams(window.location.search).get('member');
    const contributorIds = Array.isArray(project?.contributors) ? project.contributors.slice(0, MAX_CONTRIBUTOR_PAGE_MEMBERS) : [];

    contributorIds.forEach((contributorId) => {
        const contributor = contributorsById[contributorId];
        if (!contributor) {
            return;
        }

        host.append(createContributorPageCard(contributor, activeMemberId));
    });

    if (activeMemberId) {
        const activeCard = document.getElementById(`member-${activeMemberId}`);
        if (activeCard) {
            activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

function activateContributorCardFromQuery(host) {
    if (!host) {
        return;
    }

    const activeMemberId = new URLSearchParams(window.location.search).get('member');
    const cards = host.querySelectorAll('.contributor-profile-card');

    cards.forEach((card) => {
        card.classList.remove('is-active');
    });

    if (!activeMemberId) {
        return;
    }

    const activeCard = document.getElementById(`member-${activeMemberId}`);
    if (!activeCard) {
        return;
    }

    activeCard.classList.add('is-active');
    activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function initContributorPage() {
    const host = document.querySelector('[data-contributors-page-list]');
    if (!host) {
        return;
    }

    if (host.querySelector('.contributor-profile-card')) {
        activateContributorCardFromQuery(host);
        return;
    }

    try {
        const { projects, contributors } = await loadContributorPageData();
        const projectSlug = getContributorProjectSlug();
        const project = projectSlug ? projects[projectSlug] : null;
        renderContributorPage(projectSlug, project, contributors);
        activateContributorCardFromQuery(host);
    } catch (error) {
        host.textContent = 'Contributor profiles are unavailable right now.';
    }
}

initContributorPage();

// Section: Backend-backed page utilities.
(async () => {
    try {
        const backendModule = await import('/assets/js/backend/bootstrap.js');
        await backendModule.initBackend();
    } catch (error) {
        console.error('Unable to initialize shared backend features on contributor pages.', error);
    }
})();
