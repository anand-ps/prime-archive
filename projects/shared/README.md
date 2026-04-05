# Shared Project Features

Reusable assets for project pages live here.

## Shared Theme

Base project-page styling lives in shared assets:

- `projects/shared/assets/js/project-page.js` (utility helpers such as the footer year updater)
- `projects/shared/assets/css/project-page.css` (project detail pages and inline contributors strip)

Contributor profile pages use separate shared files:

- `projects/shared/assets/js/contributor-page.js`
- `projects/shared/assets/css/contributor-page.css`

Each project keeps its own small `assets/css/styles.css` file only for theme variables such as accent colors and hero gradients. All structural styles, including list treatments, live in the shared CSS so list content is consistently indented and spaced.

## Carousel

Shared files:

- `projects/shared/assets/css/project-page.css`
- `projects/shared/assets/css/carousel.css`
- `projects/shared/assets/js/carousel.js`
- `projects/shared/scripts/generate-project-image-manifests.js`
- `projects/shared/scripts/generate-project-image-html.js`
- `assets/icons/favicon.ico` (use this file for every `<link rel="icon">` so the browser shows a consistent tab icon)

## Contributors

Shared contributor data lives in:

- `projects/shared/data/contributors.json`
- `projects/shared/data/project-contributors.json`
- `projects/shared/assets/images/contributors/`
- `projects/shared/assets/images/contributors/inline/`

Project page renderer lives in:

- `projects/shared/assets/js/project-page.js`
- `projects/shared/assets/css/project-page.css`

Contributor page renderer lives in:

- `projects/shared/assets/js/contributor-page.js`
- `projects/shared/assets/css/contributor-page.css`
- `projects/shared/scripts/generate-contributor-sections.js`

Each project page can show a one-line contributors strip by setting `data-project-slug` on the `<body>` and adding:

```html
<section class="contributors-inline reveal" data-contributors-inline></section>
```

Each project also has its own route at:

- `projects/<project-slug>/contributers/`

The route uses shared data but renders only the contributors mapped to that project.

## How to refresh contributor HTML

1. Update:

- `projects/shared/data/contributors.json`
- `projects/shared/data/project-contributors.json`

2. Run:

```powershell
powershell -ExecutionPolicy Bypass -File projects/shared/scripts/generate-contributor-thumbnails.ps1
node projects/shared/scripts/generate-contributor-sections.js
```

This refreshes:

- contributor inline thumbnails used by project-page avatar strips
- each project page's inline contributor strip
- each contributor route's profile cards
- contributor entries inside the page JSON-LD blocks

## How to add more photos

1. Put the new images into that project's `assets/images/` folder.
2. Run:

```powershell
node projects/shared/scripts/generate-project-image-manifests.js
node projects/shared/scripts/generate-project-image-html.js
```

3. Refresh the project page.

The manifest generator creates `carousel-manifest.json` inside each project's `assets/images/` folder.
The HTML generator then refreshes:

- static carousel slide HTML on each project page
- project image entries inside each project page JSON-LD block
- homepage project-card preview images from the first image in each manifest

To customize SEO alt text per slide, add an `image-metadata.json` file inside that project's `assets/images/` folder:

```json
{
  "images": {
    "1_example.webp": {
      "alt": "Custom SEO alt text for this slide"
    }
  },
  "homepage": {
    "alt": "Custom alt text for the homepage project card image"
  }
}
```

If a file is missing from `image-metadata.json`, the generator falls back to the page's `data-carousel-alt-prefix`.
It also prints a warning so missing metadata is easy to catch during generation.

## Notes

- You do not need to rename images to any fixed pattern.
- Supported image types: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.avif`
- `npm start` already runs the manifest generator first through the `prestart` script.
