---
"@pietgk/devac-core": minor
"@pietgk/devac-cli": minor
---

Add multi-package analysis with `--all` flag

- New `--all` flag for `devac analyze` discovers and analyzes all packages in a repository
- Package manager detection for pnpm, npm, and yarn workspaces
- Multi-language support: TypeScript, Python (pyproject.toml), and C# (.csproj)
- Continues on error, logging failures while analyzing remaining packages
- New exports: `detectPackageManager()`, `discoverJSPackages()`, `discoverPythonPackages()`, `discoverCSharpPackages()`, `discoverAllPackages()`
