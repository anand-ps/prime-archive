# Shared Project Features

Reusable assets for project pages live here.

## Shared Theme

Base project-page styling lives in shared assets:

- `projects/shared/assets/js/project-page.js` (utility helpers such as the footer year updater)

Each project keeps its own small `assets/css/styles.css` file only for theme variables such as accent colors and hero gradients. All structural styles, including list treatments, live in the shared CSS so list content is consistently indented and spaced.

## Carousel

Shared files:

- `projects/shared/assets/css/project-page.css`
- `projects/shared/assets/css/carousel.css`
- `projects/shared/assets/js/carousel.js`
- `projects/shared/scripts/generate-project-image-manifests.js`
- `projects/shared/assets/icons/favicon.ico` (use this file for every `<link rel="icon">` so the browser shows a consistent tab icon)

## How to add more photos

1. Put the new images into that project's `assets/images/` folder.
2. Run:

```powershell
node projects/shared/scripts/generate-project-image-manifests.js
```

3. Refresh the project page.

The script generates `carousel-manifest.json` inside each project's `assets/images/` folder, and the shared carousel reads from that manifest.

## Notes

- You do not need to rename images to any fixed pattern.
- Supported image types: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.avif`
- `npm start` already runs the manifest generator first through the `prestart` script.
