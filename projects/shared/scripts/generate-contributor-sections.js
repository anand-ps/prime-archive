const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const contributorsPath = path.join(repoRoot, 'projects', 'shared', 'data', 'contributors.json');
const projectContributorsPath = path.join(repoRoot, 'projects', 'shared', 'data', 'project-contributors.json');
const maxInlineContributors = 6;
const maxContributorPageMembers = 6;
const revealStaggerMs = 90;
const siteOrigin = 'https://anandps.in';

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeFileIfChanged(filePath, content) {
    const nextContent = `${content.replace(/\r?\n/g, '\n').replace(/\n+$/, '')}\n`;
    const currentContent = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, 'utf8').replace(/\r?\n/g, '\n')
        : '';

    if (currentContent === nextContent) {
        return false;
    }

    fs.writeFileSync(filePath, nextContent, 'utf8');
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

function escapeJsonString(value) {
    return JSON.stringify(String(value ?? ''));
}

function getProjectPath(projectSlug) {
    return `/projects/${projectSlug}/`;
}

function getProjectUrl(projectSlug) {
    return `${siteOrigin}${getProjectPath(projectSlug)}`;
}

function getContributorPath(projectSlug) {
    return `/projects/${projectSlug}/contributors/`;
}

function getContributorUrl(projectSlug) {
    return `${siteOrigin}${getContributorPath(projectSlug)}`;
}

function getPersonPath(contributorId) {
    return `/contributors/${contributorId}/`;
}

function getPersonUrl(contributorId) {
    return `${siteOrigin}${getPersonPath(contributorId)}`;
}

function formatNumber(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return '0';
    }

    return numericValue.toFixed(3).replace(/\.?0+$/, '');
}

function getInitials(name) {
    return String(name || '?')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || '?';
}

function createVersionToken(value) {
    let hash = 5381;
    const text = String(value ?? '');

    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) + hash) + text.charCodeAt(index);
        hash >>>= 0;
    }

    return hash.toString(36);
}

function getInlinePhotoUrl(contributor) {
    const baseInlinePhoto = contributor.photo
        .replace('/contributors/', '/contributors/inline/')
        .replace(/\.[^.]+$/, '.jpg');
    const focusX = contributor.focus?.x ?? 50;
    const focusY = contributor.focus?.y ?? 50;
    const zoom = contributor.zoom ?? 1;
    const versionToken = createVersionToken([
        contributor.id || '',
        contributor.photo || '',
        formatNumber(focusX),
        formatNumber(focusY),
        formatNumber(zoom)
    ].join('|'));

    return `${baseInlinePhoto}?v=${versionToken}`;
}

function buildInlineMedia(contributor) {
    if (contributor.photo) {
        const inlinePhoto = getInlinePhotoUrl(contributor);

        return [
            '<span class="contributors-inline-link-media">',
            `    <img class="contributors-inline-photo" src="${escapeHtml(inlinePhoto)}" alt="" aria-hidden="true" width="160" height="160" loading="eager" fetchpriority="high" decoding="async" />`,
            '</span>'
        ].join('\n');
    }

    return [
        '<span class="contributors-inline-link-media">',
        `    <span class="contributors-inline-photo contributor-photo-fallback" aria-hidden="true">${escapeHtml(getInitials(contributor.name))}</span>`,
        '</span>'
    ].join('\n');
}

function buildInlineContributorLink(projectSlug, contributor, index, totalContributors) {
    const reverseIndex = totalContributors - index - 1;

    return [
        `<a class="contributors-inline-link" href="${escapeHtml(`${getContributorPath(projectSlug)}?member=${contributor.id}`)}" aria-label="${escapeHtml(`View ${contributor.name} and project contributors`)}" style="--contributor-enter-delay: calc(${index} * var(--contributors-inline-reveal-stagger-ms)); --contributor-stack-index: ${reverseIndex}; --contributor-z-index: ${totalContributors - index};">`,
        indentBlock(buildInlineMedia(contributor), 1),
        '    <span class="contributors-inline-tooltip" aria-hidden="true">',
        `        <span class="contributors-inline-tooltip-name">${escapeHtml(contributor.name || 'Contributor')}</span>`,
        `        <span class="contributors-inline-tooltip-role">${escapeHtml(contributor.designation || 'Contributor')}</span>`,
        '    </span>',
        '</a>'
    ].join('\n');
}

function buildInlineSection(projectSlug, contributorIds, contributorsById) {
    const contributors = contributorIds
        .slice(0, maxInlineContributors)
        .map((id) => contributorsById[id])
        .filter(Boolean);

    const listClass = contributors.length === 1
        ? 'contributors-inline-list contributors-inline-list-single'
        : 'contributors-inline-list';

    const linksMarkup = contributors
        .map((contributor, index) => indentBlock(buildInlineContributorLink(projectSlug, contributor, index, contributors.length), 3))
        .join('\n');

    return [
        '<section class="contributors-inline reveal" data-contributors-inline>',
        '    <div class="contributors-inline-cluster">',
        '        <span class="contributors-inline-label">Contributors</span>',
        `        <div class="${listClass}" style="--contributors-inline-max-stack-index: ${Math.max(contributors.length - 1, 0)}; --contributors-inline-reveal-stagger-ms: ${revealStaggerMs}ms;">`,
        linksMarkup,
        '        </div>',
        '    </div>',
        '</section>'
    ].join('\n');
}

function getContributorPhotoPreloadLinks(contributorIds, contributorsById, limit) {
    return contributorIds
        .slice(0, limit)
        .map((id) => contributorsById[id])
        .filter((contributor) => contributor && contributor.photo)
        .map((contributor) => {
            const inlinePhoto = getInlinePhotoUrl(contributor);
            return `    <link rel="preload" as="image" href="${escapeHtml(inlinePhoto)}" imagesrcset="${escapeHtml(inlinePhoto)}" fetchpriority="high" />`;
        })
        .join('\n');
}

function buildGeneratedHeadBlock(preloadLinks) {
    return [
        '    <!-- GENERATED CONTRIBUTOR PRELOADS START -->',
        preloadLinks,
        '    <!-- GENERATED CONTRIBUTOR PRELOADS END -->'
    ].join('\n');
}

function upsertGeneratedHeadBlock(content, headBlock, filePath, description) {
    const withoutBlocks = content.replace(/[ \t]*<!-- GENERATED CONTRIBUTOR PRELOADS START -->[\s\S]*?<!-- GENERATED CONTRIBUTOR PRELOADS END -->\n*/g, '');

    return replaceOrThrow(
        withoutBlocks,
        /([ \t]*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>)[ \t\r\n]*([ \t]*<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Lora[\s\S]*?rel="stylesheet" \/>)/,
        `$1\n${headBlock}\n$2`,
        filePath,
        description
    );
}

function buildProfileMedia(contributor) {
    if (contributor.photo) {
        const focusX = contributor.focus?.x ?? 50;
        const focusY = contributor.focus?.y ?? 50;
        const zoom = contributor.zoom ?? 1;

        return [
            '<div class="contributor-profile-media">',
            `    <img class="contributor-profile-photo" src="${escapeHtml(contributor.photo)}" alt="${escapeHtml(`${contributor.name} portrait`)}" width="160" height="160" loading="eager" fetchpriority="high" decoding="async" style="object-fit: cover; object-position: ${formatNumber(focusX)}% ${formatNumber(focusY)}%; --contributor-profile-photo-zoom: ${formatNumber(zoom)}; --contributor-profile-photo-focus-x: ${formatNumber(focusX)}%; --contributor-profile-photo-focus-y: ${formatNumber(focusY)}%;" />`,
            '</div>'
        ].join('\n');
    }

    return [
        '<div class="contributor-profile-media">',
        `    <span class="contributor-profile-photo contributor-photo-fallback" aria-hidden="true">${escapeHtml(getInitials(contributor.name))}</span>`,
        '</div>'
    ].join('\n');
}

function buildProfileLinks(contributor) {
    const links = [
        ['LinkedIn', contributor.links?.linkedin, 'icon-linkedin'],
        ['GitHub', contributor.links?.github, 'icon-github'],
        ['Email', contributor.links?.email, contributor.links?.emailIcon || 'icon-google']
    ].filter(([, href]) => href);

    if (links.length === 0) {
        return '';
    }

    const anchors = links.map(([label, href, iconClass]) => {
        const external = /^https?:/i.test(href);
        const targetAttributes = external ? ' target="_blank" rel="noreferrer"' : '';
        return `        <a class="contributor-profile-action-link" href="${escapeHtml(href)}" aria-label="${escapeHtml(`${contributor.name} ${label}`)}"${targetAttributes}>\n            <span class="contributor-profile-action-icon ${iconClass}" aria-hidden="true"></span>\n        </a>`;
    }).join('\n');

    return [
        '<div class="contributor-profile-links">',
        anchors,
        '</div>'
    ].join('\n');
}

function buildContributorCard(contributor) {
    const profileHref = getPersonPath(contributor.id);
    const sections = [
        `<article class="contributor-profile-card" id="member-${escapeHtml(contributor.id)}">`,
        '    <div class="contributor-profile-content">',
        '        <div class="contributor-profile-top">',
        `            <a class="contributor-profile-primary-link" href="${escapeHtml(profileHref)}" aria-label="${escapeHtml(`View profile for ${contributor.name || 'Contributor'}`)}">`,
        indentBlock(buildProfileMedia(contributor), 4),
        '            </a>',
        '            <div class="contributor-profile-identity">',
        `                <h2><a class="contributor-profile-heading-link" href="${escapeHtml(profileHref)}">${escapeHtml(contributor.name || 'Contributor')}</a></h2>`,
        `                <p class="contributor-profile-role">${escapeHtml(contributor.designation || 'Project Contributor')}</p>`,
        '            </div>',
        '        </div>',
        `        <p class="contributor-profile-bio">${escapeHtml(contributor.bio || '')}</p>`
    ];

    sections.push('        <div class="contributor-profile-actions">');
    sections.push(`            <a class="contributor-profile-cta" href="${escapeHtml(profileHref)}">View Profile</a>`);

    sections.push('        </div>');
    sections.push('    </div>');
    sections.push('</article>');

    return sections.join('\n');
}

function buildContributorDirectory(contributorIds, contributorsById) {
    const cardsMarkup = contributorIds
        .slice(0, maxContributorPageMembers)
        .map((id) => contributorsById[id])
        .filter(Boolean)
        .map((contributor) => indentBlock(buildContributorCard(contributor), 1))
        .join('\n');

    return [
        '<div class="contributors-directory" data-contributors-page-list>',
        cardsMarkup,
        '</div>'
    ].join('\n');
}

function buildContributorDirectorySection(contributorIds, contributorsById) {
    return [
        '<section class="section-card reveal">',
        indentBlock(buildContributorDirectory(contributorIds, contributorsById), 1),
        '</section>'
    ].join('\n');
}

function buildProjectSchemaContributors(contributorIds, contributorsById) {
    const contributors = contributorIds
        .map((id) => contributorsById[id])
        .filter(Boolean);

    if (contributors.length === 0) {
        return '';
    }

    const items = contributors.map((contributor) => {
        const parts = [
            '    {',
            '      "@type": "Person",',
            `      "name": ${escapeJsonString(contributor.name || 'Contributor')},`,
            `      "url": ${escapeJsonString(getPersonUrl(contributor.id))}`
        ];

        parts.push('    }');
        return parts.join('\n');
    }).join(',\n');

    return `  "contributor": [\n${items}\n  ],\n`;
}

function buildCollectionItemList(contributorIds, contributorsById) {
    const contributors = contributorIds
        .slice(0, maxContributorPageMembers)
        .map((id) => contributorsById[id])
        .filter(Boolean);

    return contributors.map((contributor, index) => {
        const parts = [
            '      {',
            '        "@type": "Person",',
            `        "position": ${index + 1},`,
            `        "name": ${escapeJsonString(contributor.name || 'Contributor')},`,
            `        "url": ${escapeJsonString(getPersonUrl(contributor.id))}`
        ];

        parts.push('      }');
        return parts.join('\n');
    }).join(',\n');
}

function indentBlock(block, level) {
    const indentation = '    '.repeat(level);
    return block
        .split('\n')
        .map((line) => `${indentation}${line}`)
        .join('\n');
}

function replaceOrThrow(content, pattern, replacement, filePath, description) {
    if (!pattern.test(content)) {
        throw new Error(`Unable to update ${description} in ${path.relative(repoRoot, filePath)}`);
    }

    return content.replace(pattern, replacement);
}

function updateProjectPage(filePath, projectSlug, contributorIds, contributorsById) {
    let content = fs.readFileSync(filePath, 'utf8').replace(/\r?\n/g, '\n');
    const preloadLinks = getContributorPhotoPreloadLinks(contributorIds, contributorsById, maxInlineContributors);
    const headBlock = buildGeneratedHeadBlock(preloadLinks);

    content = upsertGeneratedHeadBlock(content, headBlock, filePath, 'project contributor preload links');

    content = replaceOrThrow(
        content,
        /<section class="contributors-inline reveal" data-contributors-inline>[\s\S]*?<\/section>/,
        buildInlineSection(projectSlug, contributorIds, contributorsById),
        filePath,
        'project contributor strip'
    );

    const contributorBlock = buildProjectSchemaContributors(contributorIds, contributorsById);
    content = replaceOrThrow(
        content,
        /  "contributor": \[[\s\S]*?\n  \],\n|(?=  "keywords": )/,
        (match) => (match.startsWith('  "contributor":') ? contributorBlock : contributorBlock + match),
        filePath,
        'project contributor schema'
    );

    return writeFileIfChanged(filePath, content);
}

function updateContributorPage(filePath, projectTitle, contributorIds, contributorsById) {
    const projectSlug = path.basename(path.dirname(path.dirname(filePath)));
    let content = fs.readFileSync(filePath, 'utf8').replace(/\r?\n/g, '\n');
    const preloadLinks = getContributorPhotoPreloadLinks(contributorIds, contributorsById, maxContributorPageMembers);
    const headBlock = buildGeneratedHeadBlock(preloadLinks);
    const contributorPageTitle = `Contributors | ${projectTitle}`;
    const contributorPageDescription = `Meet the contributors behind the ${projectTitle} project.`;

    content = upsertGeneratedHeadBlock(content, headBlock, filePath, 'contributor page preload links');

    content = replaceOrThrow(
        content,
        /<title>[\s\S]*?<\/title>/,
        `<title>${escapeHtml(contributorPageTitle)}</title>`,
        filePath,
        'contributor page title'
    );

    content = replaceOrThrow(
        content,
        /<meta name="description" content="[^"]*" \/>/,
        `<meta name="description" content="${escapeHtml(`Contributors for the ${projectTitle} project.`)}" />`,
        filePath,
        'contributor page description'
    );

    content = replaceOrThrow(
        content,
        /<meta name="robots" content="[^"]*" \/>/,
        '<meta name="robots" content="noindex, follow" />',
        filePath,
        'contributor page robots metadata'
    );

    content = replaceOrThrow(
        content,
        /<link rel="canonical" href="[^"]*" \/>/,
        `<link rel="canonical" href="${getContributorUrl(projectSlug)}" />`,
        filePath,
        'contributor page canonical metadata'
    );

    content = replaceOrThrow(
        content,
        /<meta property="og:type" content="[^"]*" \/>/,
        '<meta property="og:type" content="website" />',
        filePath,
        'contributor page og:type metadata'
    );

    content = replaceOrThrow(
        content,
        /<meta property="og:url" content="[^"]*" \/>/,
        `<meta property="og:url" content="${getContributorUrl(projectSlug)}" />`,
        filePath,
        'contributor page og:url metadata'
    );

    content = replaceOrThrow(
        content,
        /<meta property="og:title" content="[^"]*" \/>/,
        `<meta property="og:title" content="${escapeHtml(contributorPageTitle)}" />`,
        filePath,
        'contributor page og:title metadata'
    );

    content = replaceOrThrow(
        content,
        /<meta property="og:description" content="[^"]*" \/>/,
        `<meta property="og:description" content="${escapeHtml(contributorPageDescription)}" />`,
        filePath,
        'contributor page og:description metadata'
    );

    content = replaceOrThrow(
        content,
        /<meta name="twitter:title" content="[^"]*" \/>/,
        `<meta name="twitter:title" content="${escapeHtml(contributorPageTitle)}" />`,
        filePath,
        'contributor page twitter:title metadata'
    );

    content = replaceOrThrow(
        content,
        /<meta name="twitter:description" content="[^"]*" \/>/,
        `<meta name="twitter:description" content="${escapeHtml(contributorPageDescription)}" />`,
        filePath,
        'contributor page twitter:description metadata'
    );

    content = replaceOrThrow(
        content,
        /<a class="back-link" href="[^"]*">Back to Project<\/a>/,
        `<a class="back-link" href="${getProjectPath(projectSlug)}">Back to Project</a>`,
        filePath,
        'contributor page back link'
    );

    content = replaceOrThrow(
        content,
        /(<span class="meta-text" data-contributors-project-title>)[\s\S]*?(<\/span>)/,
        `$1${escapeHtml(projectTitle)}$2`,
        filePath,
        'contributor page project title'
    );

    content = replaceOrThrow(
        content,
        /<h1>[\s\S]*?<\/h1>/,
        `<h1>Contributors for ${escapeHtml(projectTitle)}</h1>`,
        filePath,
        'contributor page heading'
    );

    content = replaceOrThrow(
        content,
        /<section class="section-card reveal">\s*<div class="contributors-directory" data-contributors-page-list>[\s\S]*?<\/div>\s*<\/section>/,
        buildContributorDirectorySection(contributorIds, contributorsById),
        filePath,
        'contributor directory'
    );

    const itemListMarkup = buildCollectionItemList(contributorIds, contributorsById);
    content = replaceOrThrow(
        content,
        /"url": "https:\/\/anandps\.in\/projects\/[^"]+"/,
        `"url": "${getContributorUrl(projectSlug)}"`,
        filePath,
        'contributor page schema url'
    );

    content = replaceOrThrow(
        content,
        /("itemListElement": \[)[\s\S]*?(\n    \])/,
        `$1\n${itemListMarkup}$2`,
        filePath,
        'collection item list schema'
    );

    return writeFileIfChanged(filePath, content);
}

function main() {
    const contributorsData = readJson(contributorsPath);
    const projectContributorsData = readJson(projectContributorsPath);
    const contributorsById = contributorsData.contributors || {};
    const projects = projectContributorsData.projects || {};

    let updatedCount = 0;

    Object.entries(projects).forEach(([projectSlug, project]) => {
        const contributorIds = Array.isArray(project.contributors) ? project.contributors : [];
        const projectPagePath = path.join(repoRoot, 'projects', projectSlug, 'index.html');
        const contributorPagePath = path.join(repoRoot, 'projects', projectSlug, 'contributors', 'index.html');

        if (fs.existsSync(projectPagePath) && updateProjectPage(projectPagePath, projectSlug, contributorIds, contributorsById)) {
            console.log(`Updated ${path.relative(repoRoot, projectPagePath)}`);
            updatedCount += 1;
        }

        if (fs.existsSync(contributorPagePath) && updateContributorPage(contributorPagePath, project.title || 'Current Project', contributorIds, contributorsById)) {
            console.log(`Updated ${path.relative(repoRoot, contributorPagePath)}`);
            updatedCount += 1;
        }
    });

    if (updatedCount === 0) {
        console.log('Contributor sections already up to date.');
    }
}

main();
