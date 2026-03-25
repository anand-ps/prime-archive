# Downloads

Keep downloadable files for the portfolio in this folder.

## How to add a new file

1. Place the file inside `downloads/`.
2. Add an entry in `downloads/manifest.json`.
3. Use the exact same filename in the `file` field.

## Example

```json
{
  "title": "Resume",
  "file": "resume.pdf",
  "type": "PDF",
  "description": "Latest professional resume and role summary."
}
```

If a file is listed in the manifest but not present in this folder yet, the site will show it as unavailable until the file is added.
