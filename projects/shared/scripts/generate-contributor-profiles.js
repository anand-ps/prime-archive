const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const contributorsPath = path.join(repoRoot, 'projects', 'shared', 'data', 'contributors.json');
const projectContributorsPath = path.join(repoRoot, 'projects', 'shared', 'data', 'project-contributors.json');
const githubReposPath = path.join(repoRoot, 'projects', 'shared', 'data', 'github-repos.json');
const contributorsRoot = path.join(repoRoot, 'contributors');
const sitemapPath = path.join(repoRoot, 'sitemap.xml');
const siteOrigin = 'https://anandps.in';

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeFileIfChanged(filePath, content) {
    const normalizedNext = `${content.replace(/\r?\n/g, '\n').replace(/\n+$/, '')}\n`;
    const current = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, 'utf8').replace(/\r?\n/g, '\n')
        : '';

    if (current === normalizedNext) {
        return false;
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, normalizedNext, 'utf8');
    return true;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeJson(value) {
    return JSON.stringify(String(value ?? ''));
}

function formatNumber(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return '0';
    }

    return numericValue.toFixed(3).replace(/\.?0+$/, '');
}

function getPersonPath(contributorId) {
    return `/contributors/${contributorId}/`;
}

function getPersonUrl(contributorId) {
    return `${siteOrigin}${getPersonPath(contributorId)}`;
}

function getProjectPath(projectSlug) {
    return `/projects/${projectSlug}/`;
}

function getProjectUrl(projectSlug) {
    return `${siteOrigin}${getProjectPath(projectSlug)}`;
}

function getProjectContributorDirectoryPath(projectSlug) {
    return `/projects/${projectSlug}/contributors/`;
}

function getRepoNameFromUrl(url) {
    if (!url) {
        return '';
    }

    const match = String(url).trim().match(/^https?:\/\/github\.com\/[^/?#]+\/([^/?#]+)\/?$/i);
    return match ? match[1].toLowerCase() : '';
}

function buildMetaLinks(contributor) {
    const links = contributor.links || {};
    const items = [
        ['Email', links.email, 'icon-google'],
        ['LinkedIn', links.linkedin, 'icon-linkedin'],
        ['GitHub', links.github, 'icon-github']
    ].filter(([, href]) => href);

    if (items.length === 0) {
        return '';
    }

    const anchors = items.map(([label, href, iconClass]) => {
        const externalAttrs = /^https?:/i.test(href) ? ' target="_blank" rel="noreferrer"' : '';
        return [
            `            <a class="contributor-profile-action-link" href="${escapeHtml(href)}" aria-label="${escapeHtml(`${contributor.name} ${label}`)}"${externalAttrs}>`,
            `                <span class="contributor-profile-action-icon ${iconClass}" aria-hidden="true"></span>`,
            '            </a>'
        ].join('\n');
    }).join('\n');

    return [
        '<div class="contributor-profile-links contributor-profile-links-large">',
        anchors,
        '</div>'
    ].join('\n');
}

function buildProfileImage(contributor) {
    if (!contributor.photo) {
        const initials = String(contributor.name || '?')
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join('') || '?';

        return [
            '<div class="contributor-profile-media">',
            `    <span class="contributor-profile-photo contributor-photo-fallback" aria-hidden="true">${escapeHtml(initials)}</span>`,
            '</div>'
        ].join('\n');
    }

    const focusX = contributor.focus?.x ?? 50;
    const focusY = contributor.focus?.y ?? 50;
    const zoom = contributor.zoom ?? 1;

    return [
        '<div class="contributor-profile-media">',
        `    <img class="contributor-profile-photo" src="${escapeHtml(contributor.photo)}" alt="${escapeHtml(`${contributor.name} portrait`)}" width="220" height="220" loading="eager" fetchpriority="high" decoding="async" style="object-fit: cover; object-position: ${formatNumber(focusX)}% ${formatNumber(focusY)}%; --contributor-profile-photo-zoom: ${formatNumber(zoom)}; --contributor-profile-photo-focus-x: ${formatNumber(focusX)}%; --contributor-profile-photo-focus-y: ${formatNumber(focusY)}%;" />`,
        '</div>'
    ].join('\n');
}

function buildProjectCards(projects) {
    if (projects.length === 0) {
        return [
            '<div class="contributor-project-list">',
            '    <article class="contributor-project-card">',
            '        <p class="contributor-project-meta">Project links will appear here when this contributor is assigned to a project entry.</p>',
            '    </article>',
            '</div>'
        ].join('\n');
    }

    const cards = projects.map((project) => {
        const isGithubRepo = project.type === 'github-repo';
        const title = project.title || project.name || 'Repository';
        const detailLine = isGithubRepo
            ? (project.description || 'Public GitHub repository.')
            : `${project.contributionLabel} on ${title}.`;
        const secondaryAction = isGithubRepo
            ? `            <button class="contributor-project-link contributor-project-link-copy" type="button" data-copy-url="${escapeHtml(project.repoUrl || '')}" aria-label="${escapeHtml(`Copy GitHub URL for ${title}`)}"><span class="contributor-project-link-icon icon-github" aria-hidden="true"></span><span>Copy URL</span></button>`
            : `            <a class="contributor-project-link" href="${escapeHtml(getProjectContributorDirectoryPath(project.slug))}">Project Team</a>`;
        const primaryHref = isGithubRepo
            ? project.repoUrl
            : getProjectPath(project.slug);

        return [
            '    <article class="contributor-project-card">',
            `        <h3>${escapeHtml(title)}</h3>`,
            `        <p class="contributor-project-meta">${escapeHtml(detailLine)}<br>${isGithubRepo ? 'Visit the repository for the full context.' : 'Visit the project page for the full context.'}</p>`,
            '        <div class="contributor-project-actions">',
            `            <a class="contributor-profile-cta" href="${escapeHtml(primaryHref)}"${isGithubRepo ? ' target="_blank" rel="noreferrer"' : ''}>View Project</a>`,
            secondaryAction,
            '        </div>',
            '    </article>'
        ].join('\n');
    }).join('\n');

    return [
        '<div class="contributor-project-list">',
        cards,
        '</div>'
    ].join('\n');
}

function buildSameAs(contributor) {
    const links = contributor.links || {};
    const urls = [links.linkedin, links.github].filter((entry) => /^https?:/i.test(entry || ''));

    if (urls.length === 0) {
        return '';
    }

    return [
        '  "sameAs": [',
        urls.map((entry) => `    ${escapeJson(entry)}`).join(',\n'),
        '  ],'
    ].join('\n');
}

function buildSubjectOf(projects) {
    if (projects.length === 0) {
        return '';
    }

    return [
        '  "subjectOf": [',
        projects.map((project) => {
            const targetUrl = project.type === 'github-repo'
                ? project.repoUrl
                : getProjectUrl(project.slug);
            return [
                '    {',
                '      "@type": "CreativeWork",',
                `      "name": ${escapeJson(project.title || project.name || 'Repository')},`,
                `      "url": ${escapeJson(targetUrl || '')}`,
                '    }'
            ].join('\n');
        }).join(',\n'),
        '  ],'
    ].join('\n');
}

function buildProfilePage(contributor, projects) {
    const pageTitle = `${contributor.name} | ${contributor.designation || 'Contributor'}`;
    const pageDescription = contributor.bio
        ? `${contributor.bio} Explore contributed projects, profile links, and portfolio context for ${contributor.name}.`
        : `${contributor.name} is a contributor featured in Anand P S project portfolio. Explore contributed projects and profile links.`;
    const profileImageUrl = contributor.photo ? `${siteOrigin}${contributor.photo}` : '';
    const projectCountLabel = `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`;
    const sameAsBlock = buildSameAs(contributor);
    const subjectOfBlock = buildSubjectOf(projects);

    const schemaLines = [
        '{',
        '  "@context": "https://schema.org",',
        '  "@type": "Person",',
        `  "name": ${escapeJson(contributor.name)},`,
        `  "jobTitle": ${escapeJson(contributor.designation || 'Contributor')},`,
        `  "description": ${escapeJson(contributor.bio || `${contributor.name} contributor profile`)},`,
        `  "url": ${escapeJson(getPersonUrl(contributor.id))},`
    ];

    if (profileImageUrl) {
        schemaLines.push(`  "image": ${escapeJson(profileImageUrl)},`);
    }

    if (sameAsBlock) {
        schemaLines.push(sameAsBlock);
    }

    if (subjectOfBlock) {
        schemaLines.push(subjectOfBlock);
    }

    schemaLines.push(`  "mainEntityOfPage": ${escapeJson(getPersonUrl(contributor.id))}`);
    schemaLines.push('}');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(pageDescription)}" />
    <meta name="author" content="Anand P S" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${getPersonUrl(contributor.id)}" />
    <meta property="og:type" content="profile" />
    <meta property="og:url" content="${getPersonUrl(contributor.id)}" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(pageDescription)}" />
    <meta property="og:image" content="${escapeHtml(profileImageUrl || `${siteOrigin}/assets/images/anand_light_theme.webp`)}" />
    <meta property="og:image:alt" content="${escapeHtml(`${contributor.name} portrait`)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(pageDescription)}" />
    <meta name="twitter:image" content="${escapeHtml(profileImageUrl || `${siteOrigin}/assets/images/anand_light_theme.webp`)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(`${contributor.name} portrait`)}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Manrope:wght@500;600;700&family=Sora:wght@500;600;700;800&display=swap" rel="stylesheet" />
    <link rel="icon" href="/assets/icons/favicon.ico?v=20260330" sizes="any" type="image/x-icon" />
    <link rel="shortcut icon" href="/assets/icons/favicon.ico?v=20260330" type="image/x-icon" />
    <link rel="stylesheet" href="/projects/shared/assets/css/contributor-page.css" />
</head>
<body class="contributor-profile-page">
<div class="page-bg" aria-hidden="true"></div>

<header class="project-header">
    <div class="container">
        <a class="back-link" href="/">Back to Home</a>
    </div>
</header>

<main class="container project-main">
<article class="post-shell">
<header class="hero-card reveal contributors-page-hero">
    <p class="eyebrow">CONTRIBUTOR PROFILE</p>
    <div class="post-meta">
        <span class="meta-pill">Contributor</span>
    </div>
    <h1>${escapeHtml(contributor.name)}</h1>
</header>

<section class="section-card reveal">
    <div class="contributor-profile-layout">
        <aside class="contributor-profile-visual">
${indentBlock(buildProfileImage(contributor), 3)}
        </aside>
        <div class="contributor-profile-summary">
            <p class="contributor-profile-role contributor-profile-role-prominent">${escapeHtml(contributor.designation || 'Contributor')}</p>
            <p class="contributor-profile-bio">${escapeHtml(contributor.bio || `${contributor.name} is featured as a contributor in this portfolio.`)}</p>
${indentBlock(buildMetaLinks(contributor) || '', 3)}
        </div>
    </div>
</section>

<section class="section-card reveal">
    <h2>Project Contributions</h2>
${indentBlock(buildProjectCards(projects), 1)}
</section>
</article>
</main>

<footer class="project-footer">
    <div class="container">
        <p>&copy; ${new Date().getFullYear()} Anand P S</p>
    </div>
</footer>

<script>
document.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-copy-url]');
    if (!trigger) {
        return;
    }

    const url = trigger.getAttribute('data-copy-url');
    if (!url) {
        return;
    }

    const originalLabel = trigger.querySelector('span:last-child');

    try {
        await navigator.clipboard.writeText(url);
        if (originalLabel) {
            originalLabel.textContent = 'Copied';
        } else {
            trigger.textContent = 'Copied';
        }
    } catch (error) {
        if (originalLabel) {
            originalLabel.textContent = 'Copy failed';
        } else {
            trigger.textContent = 'Copy failed';
        }
    }

    window.setTimeout(() => {
        if (originalLabel) {
            originalLabel.textContent = 'Copy URL';
        } else {
            trigger.textContent = 'Copy URL';
        }
    }, 1400);
});
</script>

<script type="application/ld+json">
${schemaLines.join('\n')}
</script>
</body>
</html>`;
}

function indentBlock(block, level) {
    const indentation = '    '.repeat(level);
    return block
        .split('\n')
        .map((line) => `${indentation}${line}`)
        .join('\n');
}

function buildContributorProjectMap(projects) {
    const map = new Map();

    Object.entries(projects).forEach(([projectSlug, project]) => {
        const contributorIds = Array.isArray(project.contributors) ? project.contributors : [];
        contributorIds.forEach((contributorId) => {
            if (!map.has(contributorId)) {
                map.set(contributorId, []);
            }

            map.get(contributorId).push({
                type: 'portfolio-project',
                slug: projectSlug,
                title: project.title || projectSlug.replace(/-/g, ' '),
                repoUrl: project.repoUrl || '',
                contributionLabel: 'Contributor'
            });
        });
    });

    return map;
}

function mergeContributorProjects(portfolioProjects, githubReposByContributor, contributorId) {
    const merged = [...portfolioProjects];
    const seenRepoNames = new Set(
        portfolioProjects
            .map((project) => getRepoNameFromUrl(project.repoUrl))
            .filter(Boolean)
    );
    const githubRepos = githubReposByContributor[contributorId]?.repos || [];

    githubRepos.forEach((repo) => {
        const repoName = String(repo.name || '').toLowerCase();
        if (!repoName || seenRepoNames.has(repoName)) {
            return;
        }

        merged.push({
            type: 'github-repo',
            name: repo.name || repo.full_name || 'Repository',
            title: repo.name || repo.full_name || 'Repository',
            repoUrl: repo.html_url || '',
            description: repo.description || `${repo.full_name || repo.name || 'Repository'} public GitHub repository.`
        });
    });

    return merged;
}

function generateSitemap(projects, contributorsById) {
    const today = new Date().toISOString().slice(0, 10);
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url>',
        '    <loc>https://anandps.in/</loc>',
        `    <lastmod>${today}</lastmod>`,
        '    <priority>1.0</priority>',
        '  </url>',
        '  <url>',
        '    <loc>https://anandps.in/downloads/</loc>',
        `    <lastmod>${today}</lastmod>`,
        '    <priority>0.8</priority>',
        '  </url>'
    ];

    Object.keys(projects).forEach((projectSlug) => {
        lines.push('  <url>');
        lines.push(`    <loc>${getProjectUrl(projectSlug)}</loc>`);
        lines.push(`    <lastmod>${today}</lastmod>`);
        lines.push('    <priority>0.9</priority>');
        lines.push('  </url>');
    });

    Object.keys(contributorsById).forEach((contributorId) => {
        lines.push('  <url>');
        lines.push(`    <loc>${getPersonUrl(contributorId)}</loc>`);
        lines.push(`    <lastmod>${today}</lastmod>`);
        lines.push('    <priority>0.7</priority>');
        lines.push('  </url>');
    });

    lines.push('</urlset>');
    return writeFileIfChanged(sitemapPath, lines.join('\n'));
}

function main() {
    const contributorsData = readJson(contributorsPath);
    const projectContributorsData = readJson(projectContributorsPath);
    const githubReposData = fs.existsSync(githubReposPath)
        ? readJson(githubReposPath)
        : { contributors: {} };
    const contributorsById = contributorsData.contributors || {};
    const projects = projectContributorsData.projects || {};
    const projectsByContributor = buildContributorProjectMap(projects);
    const githubReposByContributor = githubReposData.contributors || {};
    let updatedCount = 0;

    Object.values(contributorsById).forEach((contributor) => {
        const contributorProjects = mergeContributorProjects(
            projectsByContributor.get(contributor.id) || [],
            githubReposByContributor,
            contributor.id
        );
        const filePath = path.join(contributorsRoot, contributor.id, 'index.html');
        if (writeFileIfChanged(filePath, buildProfilePage(contributor, contributorProjects))) {
            console.log(`Updated ${path.relative(repoRoot, filePath)}`);
            updatedCount += 1;
        }
    });

    if (generateSitemap(projects, contributorsById)) {
        console.log(`Updated ${path.relative(repoRoot, sitemapPath)}`);
        updatedCount += 1;
    }

    if (updatedCount === 0) {
        console.log('Contributor profiles and sitemap already up to date.');
    }
}

main();
