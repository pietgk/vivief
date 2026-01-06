---
"@pietgk/devac-core": patch
"@pietgk/devac-cli": patch
---

fix(likec4): generate unified .c4 files with relative link paths

- Fixed LikeC4 link syntax to use unquoted URIs (required by LikeC4 parser)
- Changed from absolute paths to relative paths for source file links
- Added `computeRelativeLinkPath()` helper to compute paths relative to docs/c4 directory
- Generated files now pass `likec4 validate` without errors
