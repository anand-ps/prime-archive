const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const projectsRoot = path.join(repoRoot, 'projects');
const homepagePath = path.join(repoRoot, 'index.html');
const projectLinkLabelPrefix = 'View project: ';
const manifestFileName = 'carousel-manifest.json';
const imageMetadataFileName = 'image-metadata.json';
const warningPrefix = '[warn]';

function getProjectDirectories() {
    return fs.readdirSync(projectsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
        .map((entry) => entry.name);
}

function readFileNormalized(filePath) {
    return fs.readFileSync(filePath, 'utf8').replace(/\r?\n/g, '\n');
}

function writeFileIfChanged(filePath, content) {
    const normalizedNext = `${content.replace(/\r?\n/g, '\n').replace(/\n+$/, '')}\n`;
    const current = fs.existsSync(filePath) ? readFileNormalized(filePath) : '';

    if (current === normalizedNext) {
        return false;
    }

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

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toWebPath(...segments) {
    return `/${segments.map((segment) => encodeURIComponent(String(segment))).join('/')}`;
}

function toAbsoluteImageUrl(projectSlug, fileName) {
    return `https://anandps.in${toWebPath('projects', projectSlug, 'assets', 'images', fileName)}`;
}

function getManifestImages(projectSlug) {
    const manifestPath = path.join(projectsRoot, projectSlug, 'assets', 'images', manifestFileName);
    if (!fs.existsSync(manifestPath)) {
        return [];
    }

    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
}

function getImageMetadata(projectSlug) {
    const metadataPath = path.join(projectsRoot, projectSlug, 'assets', 'images', imageMetadataFileName);
    if (!fs.existsSync(metadataPath)) {
        return { images: {}, homepage: {} };
    }

    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    return {
        images: parsed && typeof parsed.images === 'object' && parsed.images ? parsed.images : {},
        homepage: parsed && typeof parsed.homepage === 'object' && parsed.homepage ? parsed.homepage : {}
    };
}

function collectMetadataWarnings(projectSlug, images, metadata) {
    const warnings = [];

    images.forEach((fileName) => {
        const altText = metadata.images[fileName]?.alt;
        if (!altText || !String(altText).trim()) {
            warnings.push(`${warningPrefix} projects/${projectSlug}/assets/images/${imageMetadataFileName}: missing alt metadata for "${fileName}"`);
        }
    });

    if (images.length > 0) {
        const homepageAlt = metadata.homepage?.alt;
        if (!homepageAlt || !String(homepageAlt).trim()) {
            warnings.push(`${warningPrefix} projects/${projectSlug}/assets/images/${imageMetadataFileName}: missing homepage.alt metadata`);
        }
    }

    return warnings;
}

function extractCarouselAltPrefix(content, projectSlug) {
    const match = content.match(/data-carousel-alt-prefix="([^"]+)"/);
    if (match) {
        return match[1];
    }

    const headingMatch = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (!headingMatch) {
        return projectSlug.replace(/-/g, ' ');
    }

    return headingMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildCarouselTrack(projectSlug, images, altPrefix, imageMetadata) {
    const slides = images.map((fileName, index) => {
        const imagePath = toWebPath('projects', projectSlug, 'assets', 'images', fileName);
        const loading = index === 0 ? 'eager' : 'lazy';
        const fetchPriority = index === 0 ? ' fetchpriority="high"' : '';
        const alt = imageMetadata[fileName]?.alt || `${altPrefix} ${index + 1}`;

        return [
            '                    <figure class="project-carousel-slide">',
            `                        <img class="project-carousel-image" src="${imagePath}" alt="${escapeHtml(alt)}" width="1600" height="900" loading="${loading}"${fetchPriority} decoding="async" />`,
            '                    </figure>'
        ].join('\n');
    }).join('\n');

    return [
        '                    <div class="project-carousel-track">',
        slides,
        '                    </div>'
    ].join('\n');
}

function buildSchemaImageBlock(projectSlug, images) {
    const selectedImages = images.slice(0, 2);
    const lines = selectedImages.map((fileName) => `    "${toAbsoluteImageUrl(projectSlug, fileName)}"`);
    return `  "image": [\n${lines.join(',\n')}\n  ],`;
}

function updateProjectPage(projectSlug) {
    const filePath = path.join(projectsRoot, projectSlug, 'index.html');
    if (!fs.existsSync(filePath)) {
        return false;
    }

    const images = getManifestImages(projectSlug);
    if (images.length === 0) {
        return false;
    }

    let content = readFileNormalized(filePath);
    const altPrefix = extractCarouselAltPrefix(content, projectSlug);
    const metadata = getImageMetadata(projectSlug);
    const trackMarkup = buildCarouselTrack(projectSlug, images, altPrefix, metadata.images);

    const trackPattern = / {20}<div class="project-carousel-track">[\s\S]*? {20}<\/div>(\n\s*<div class="project-carousel-overlay">)/;
    if (!trackPattern.test(content)) {
        throw new Error(`Unable to find carousel track in projects/${projectSlug}/index.html`);
    }

    content = content.replace(trackPattern, `${trackMarkup}$1`);

    const imageBlockPattern = /  "image": \[[\s\S]*?\n  \],/;
    if (imageBlockPattern.test(content)) {
        content = content.replace(imageBlockPattern, buildSchemaImageBlock(projectSlug, images));
    }

    return writeFileIfChanged(filePath, content);
}

function buildHomepageProjectImage(slug, title, fileName, homepageAlt) {
    const imagePath = toWebPath('projects', slug, 'assets', 'images', fileName);
    const alt = homepageAlt || `Project preview for ${title}`;
    return `                    <img class="project-media-image" src="${imagePath}" alt="${escapeHtml(alt)}" width="1200" height="675" loading="lazy" decoding="async" />`;
}

function updateHomepage() {
    let content = readFileNormalized(homepagePath);

    const projectCardPattern = /(<a class="project-card-link" href="projects\/([^/]+)\/index\.html"[^>]*aria-label="([^"]+)"[\s\S]*?<div class="project-media has-project-image">\n)([\s\S]*?)(\n\s*<\/div>\n\s*<div class="project-body">)/g;

    let replacedAny = false;
    content = content.replace(projectCardPattern, (fullMatch, start, slug, ariaLabel, inner, end) => {
        const images = getManifestImages(slug);
        if (images.length === 0) {
            return fullMatch;
        }
        const metadata = getImageMetadata(slug);

        const normalizedLabel = String(ariaLabel || '').trim();
        const title = normalizedLabel.startsWith(projectLinkLabelPrefix)
            ? normalizedLabel.slice(projectLinkLabelPrefix.length).trim()
            : slug.replace(/-/g, ' ');
        const existingWithoutImage = inner
            .replace(/\s*<img class="project-media-image"[\s\S]*?\/>\n?/g, '')
            .replace(/^\n+/, '')
            .replace(/\n+$/, '');

        replacedAny = true;
        return `${start}${buildHomepageProjectImage(slug, title, images[0], metadata.homepage.alt)}\n${existingWithoutImage}${end}`;
    });

    return replacedAny ? writeFileIfChanged(homepagePath, content) : false;
}

function main() {
    let updatedCount = 0;
    const warnings = [];

    getProjectDirectories().forEach((projectSlug) => {
        const images = getManifestImages(projectSlug);
        if (images.length > 0) {
            warnings.push(...collectMetadataWarnings(projectSlug, images, getImageMetadata(projectSlug)));
        }

        if (updateProjectPage(projectSlug)) {
            console.log(`Updated projects/${projectSlug}/index.html`);
            updatedCount += 1;
        }
    });

    if (updateHomepage()) {
        console.log('Updated index.html');
        updatedCount += 1;
    }

    if (updatedCount === 0) {
        console.log('Project image HTML already up to date.');
    }

    warnings.forEach((warning) => {
        console.warn(warning);
    });
}

main();
