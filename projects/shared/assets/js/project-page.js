// Keep shared project pages in sync with the current year.
const yearNode = document.querySelector('[data-year]');
if (yearNode) {
    yearNode.textContent = String(new Date().getFullYear());
}

const PROJECT_CONTRIBUTORS_PATH = '/projects/shared/data/project-contributors.json';
const CONTRIBUTORS_PATH = '/projects/shared/data/contributors.json';
const MAX_PROJECT_CONTRIBUTORS = 6;

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
        image.loading = 'lazy';
        image.decoding = 'async';
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
    link.title = `${contributor.name} - ${contributor.designation || 'Contributor'}`;
    link.append(createContributorImage(contributor, 'contributors-inline-photo'));
    return link;
}

function createContributorCard(projectSlug, contributor, activeMemberId) {
    const card = document.createElement('article');
    card.className = 'contributor-profile-card';
    card.id = `member-${contributor.id}`;

    if (contributor.id === activeMemberId) {
        card.classList.add('is-active');
    }

    const media = document.createElement('div');
    media.className = 'contributor-profile-media';
    media.append(createContributorImage(contributor, 'contributor-profile-photo'));

    const content = document.createElement('div');
    content.className = 'contributor-profile-content';

    const name = document.createElement('h2');
    name.textContent = contributor.name || 'Contributor';

    const designation = document.createElement('p');
    designation.className = 'contributor-profile-role';
    designation.textContent = contributor.designation || 'Project Contributor';

    content.append(name, designation);

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
        ['Email', links.email],
        ['LinkedIn', links.linkedin],
        ['GitHub', links.github]
    ].forEach(([label, href]) => {
        if (!href) {
            return;
        }

        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.textContent = label;
        if (/^https?:/i.test(href)) {
            anchor.target = '_blank';
            anchor.rel = 'noreferrer';
        }
        linksRow.append(anchor);
    });

    if (linksRow.childElementCount > 0) {
        content.append(linksRow);
    }

    const projectLink = document.createElement('a');
    projectLink.className = 'contributor-profile-project-link';
    projectLink.href = `/projects/${projectSlug}/index.html`;
    projectLink.textContent = 'Back to project';
    content.append(projectLink);

    card.append(media, content);
    return card;
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
    host.append(label);

    const row = document.createElement('div');
    row.className = 'contributors-inline-list';

    const contributorIds = Array.isArray(project?.contributors) ? project.contributors.slice(0, MAX_PROJECT_CONTRIBUTORS) : [];
    contributorIds.forEach((contributorId) => {
        const contributor = contributorsById[contributorId];
        if (!contributor) {
            return;
        }
        row.append(createContributorLink(projectSlug, contributor));
    });

    host.append(row);
}

function renderContributorsPage(projectSlug, project, contributorsById) {
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
    const contributorIds = Array.isArray(project?.contributors) ? project.contributors.slice(0, MAX_PROJECT_CONTRIBUTORS) : [];

    contributorIds.forEach((contributorId) => {
        const contributor = contributorsById[contributorId];
        if (!contributor) {
            return;
        }

        host.append(createContributorCard(projectSlug, contributor, activeMemberId));
    });

    if (activeMemberId) {
        const activeCard = document.getElementById(`member-${activeMemberId}`);
        if (activeCard) {
            activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

async function initContributors() {
    const inlineHost = document.querySelector('[data-contributors-inline]');
    const pageHost = document.querySelector('[data-contributors-page-list]');
    if (!inlineHost && !pageHost) {
        return;
    }

    try {
        const { projects, contributors } = await loadContributorData();
        const projectSlug = getProjectSlug();
        const project = projectSlug ? projects[projectSlug] : null;

        renderInlineContributors(projectSlug, project, contributors);
        renderContributorsPage(projectSlug, project, contributors);
    } catch (error) {
        [inlineHost, pageHost].filter(Boolean).forEach((host) => {
            host.textContent = 'Contributor profiles are unavailable right now.';
        });
    }
}

initContributors();
