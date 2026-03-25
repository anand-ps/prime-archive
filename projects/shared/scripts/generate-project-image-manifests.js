const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const projectsRoot = path.join(repoRoot, 'projects');
const supportedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);
const manifestFileName = 'carousel-manifest.json';

function isDirectory(filePath) {
    try {
        return fs.statSync(filePath).isDirectory();
    } catch {
        return false;
    }
}

function getProjectDirectories() {
    if (!isDirectory(projectsRoot)) {
        return [];
    }

    return fs.readdirSync(projectsRoot)
        .map((entry) => path.join(projectsRoot, entry))
        .filter((entryPath) => isDirectory(entryPath) && path.basename(entryPath) !== 'shared');
}

function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function buildManifestForProject(projectPath) {
    const imagesPath = path.join(projectPath, 'assets', 'images');
    if (!isDirectory(imagesPath)) {
        return;
    }

    const imageFiles = fs.readdirSync(imagesPath)
        .filter((fileName) => supportedExtensions.has(path.extname(fileName).toLowerCase()))
        .sort(naturalSort);

    const manifestPath = path.join(imagesPath, manifestFileName);
    fs.writeFileSync(manifestPath, `${JSON.stringify(imageFiles, null, 2)}\n`, 'utf8');
    console.log(`Updated ${path.relative(repoRoot, manifestPath)}`);
}

getProjectDirectories().forEach(buildManifestForProject);
