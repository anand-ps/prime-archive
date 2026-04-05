const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const contributorsPath = path.join(repoRoot, 'projects', 'shared', 'data', 'contributors.json');
const projectContributorsPath = path.join(repoRoot, 'projects', 'shared', 'data', 'project-contributors.json');
const outputPath = path.join(repoRoot, 'projects', 'shared', 'data', 'github-repos.json');

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

    fs.writeFileSync(filePath, normalizedNext, 'utf8');
    return true;
}

function getGitHubUsername(url) {
    if (!url) {
        return '';
    }

    const match = String(url).trim().match(/^https?:\/\/github\.com\/([^/?#]+)\/?$/i);
    return match ? match[1] : '';
}

function getRepoNameFromUrl(url) {
    if (!url) {
        return '';
    }

    const match = String(url).trim().match(/^https?:\/\/github\.com\/[^/?#]+\/([^/?#]+)\/?$/i);
    return match ? match[1].toLowerCase() : '';
}

async function fetchReposForUser(username) {
    const collected = [];
    let page = 1;

    while (true) {
        const endpoint = `https://api.github.com/users/${encodeURIComponent(username)}/repos?type=owner&sort=updated&per_page=100&page=${page}`;
        const response = await fetch(endpoint, {
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'prime-archive-build'
            }
        });

        if (!response.ok) {
            throw new Error(`GitHub API request failed for ${username}: ${response.status}`);
        }

        const items = await response.json();
        if (!Array.isArray(items) || items.length === 0) {
            break;
        }

        collected.push(...items);

        if (items.length < 100) {
            break;
        }

        page += 1;
    }

    return collected
        .filter((repo) => repo && !repo.fork && !repo.archived && !repo.disabled)
        .map((repo) => ({
            id: Number(repo.id) || 0,
            name: repo.name || '',
            full_name: repo.full_name || '',
            html_url: repo.html_url || '',
            description: repo.description || '',
            language: repo.language || '',
            stargazers_count: Number(repo.stargazers_count) || 0,
            pushed_at: repo.pushed_at || ''
        }))
        .sort((left, right) => new Date(right.pushed_at).getTime() - new Date(left.pushed_at).getTime());
}

async function main() {
    const contributorsData = readJson(contributorsPath);
    const projectContributorsData = readJson(projectContributorsPath);
    const contributors = contributorsData.contributors || {};
    const projects = projectContributorsData.projects || {};
    const projectRepoNames = new Set(
        Object.values(projects)
            .map((project) => getRepoNameFromUrl(project.repoUrl))
            .filter(Boolean)
    );

    const result = {
        generatedAt: new Date().toISOString(),
        contributors: {}
    };

    for (const contributor of Object.values(contributors)) {
        const username = getGitHubUsername(contributor.links?.github);
        if (!username) {
            continue;
        }

        const repos = await fetchReposForUser(username);
        result.contributors[contributor.id] = {
            username,
            repos: repos.filter((repo) => !projectRepoNames.has(String(repo.name || '').toLowerCase()))
        };
    }

    if (writeFileIfChanged(outputPath, JSON.stringify(result, null, 2))) {
        console.log(`Updated ${path.relative(repoRoot, outputPath)}`);
    } else {
        console.log('GitHub repo cache already up to date.');
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
