/**
 * Tests for Package Manager Detection and Discovery
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectPackageManager,
  discoverAllPackages,
  discoverCSharpPackages,
  discoverJSPackages,
  discoverPythonPackages,
} from "../../src/workspace/package-manager.js";

describe("Package Manager Detection", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-pm-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("detectPackageManager", () => {
    it("should detect pnpm workspace", async () => {
      await fs.writeFile(path.join(tempDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'");
      expect(await detectPackageManager(tempDir)).toBe("pnpm");
    });

    it("should detect yarn workspace", async () => {
      await fs.writeFile(path.join(tempDir, "yarn.lock"), "");
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ workspaces: ["packages/*"] })
      );
      expect(await detectPackageManager(tempDir)).toBe("yarn");
    });

    it("should detect npm workspace", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ workspaces: ["packages/*"] })
      );
      expect(await detectPackageManager(tempDir)).toBe("npm");
    });

    it("should detect npm workspace with object format", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ workspaces: { packages: ["packages/*"] } })
      );
      expect(await detectPackageManager(tempDir)).toBe("npm");
    });

    it("should return null for non-workspace", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "single-package" })
      );
      expect(await detectPackageManager(tempDir)).toBeNull();
    });

    it("should return null for empty directory", async () => {
      expect(await detectPackageManager(tempDir)).toBeNull();
    });
  });
});

describe("JS/TS Package Discovery", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-js-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("discoverJSPackages", () => {
    it("should discover pnpm workspace packages", async () => {
      // Create pnpm workspace structure
      await fs.writeFile(path.join(tempDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'");
      await fs.mkdir(path.join(tempDir, "packages", "pkg1"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "packages", "pkg1", "package.json"),
        JSON.stringify({ name: "@test/pkg1" })
      );
      await fs.mkdir(path.join(tempDir, "packages", "pkg2"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "packages", "pkg2", "package.json"),
        JSON.stringify({ name: "@test/pkg2" })
      );

      const packages = await discoverJSPackages(tempDir);

      expect(packages).toHaveLength(2);
      expect(packages.map((p) => p.name).sort()).toEqual(["@test/pkg1", "@test/pkg2"]);
      expect(packages[0]?.language).toBe("typescript");
      expect(packages[0]?.packageManager).toBe("pnpm");
    });

    it("should discover npm workspace packages", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ workspaces: ["packages/*"] })
      );
      await fs.mkdir(path.join(tempDir, "packages", "core"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "packages", "core", "package.json"),
        JSON.stringify({ name: "core" })
      );

      const packages = await discoverJSPackages(tempDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.name).toBe("core");
      expect(packages[0]?.packageManager).toBe("npm");
    });

    it("should return single package for non-workspace", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "single-pkg" })
      );

      const packages = await discoverJSPackages(tempDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.name).toBe("single-pkg");
      expect(packages[0]?.packageManager).toBeUndefined();
    });

    it("should return empty for non-js directory", async () => {
      const packages = await discoverJSPackages(tempDir);
      expect(packages).toHaveLength(0);
    });

    it("should discover packages/* without workspace config (fallback patterns)", async () => {
      // This tests repos like npm-private-packages that have packages/* but no workspace config
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "root-pkg" }) // No workspaces field
      );
      await fs.mkdir(path.join(tempDir, "packages", "pkg-a"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "packages", "pkg-a", "package.json"),
        JSON.stringify({ name: "@test/pkg-a" })
      );
      await fs.mkdir(path.join(tempDir, "packages", "pkg-b"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "packages", "pkg-b", "package.json"),
        JSON.stringify({ name: "@test/pkg-b" })
      );

      const packages = await discoverJSPackages(tempDir);

      expect(packages).toHaveLength(2);
      expect(packages.map((p) => p.name).sort()).toEqual(["@test/pkg-a", "@test/pkg-b"]);
      expect(packages[0]?.packageManager).toBeUndefined();
    });

    it("should discover apps/* and libs/* without workspace config", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "root" }));
      await fs.mkdir(path.join(tempDir, "apps", "web"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "apps", "web", "package.json"),
        JSON.stringify({ name: "web-app" })
      );
      await fs.mkdir(path.join(tempDir, "libs", "shared"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "libs", "shared", "package.json"),
        JSON.stringify({ name: "shared-lib" })
      );

      const packages = await discoverJSPackages(tempDir);

      expect(packages).toHaveLength(2);
      expect(packages.map((p) => p.name).sort()).toEqual(["shared-lib", "web-app"]);
    });

    it("should fall back to single package when no fallback patterns match", async () => {
      // No packages/*, apps/*, libs/*, or services/* - just a root package
      await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "just-root" }));
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "index.ts"), "");

      const packages = await discoverJSPackages(tempDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.name).toBe("just-root");
    });
  });
});

describe("Python Package Discovery", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-py-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("discoverPythonPackages", () => {
    it("should discover Python projects with pyproject.toml", async () => {
      await fs.mkdir(path.join(tempDir, "pkg1"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "pkg1", "pyproject.toml"),
        '[project]\nname = "my-package"'
      );

      const packages = await discoverPythonPackages(tempDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.name).toBe("my-package");
      expect(packages[0]?.language).toBe("python");
    });

    it("should discover Poetry projects", async () => {
      await fs.mkdir(path.join(tempDir, "poetry-pkg"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "poetry-pkg", "pyproject.toml"),
        '[tool.poetry]\nname = "poetry-package"'
      );

      const packages = await discoverPythonPackages(tempDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.name).toBe("poetry-package");
    });

    it("should exclude virtual environments", async () => {
      await fs.mkdir(path.join(tempDir, ".venv", "lib"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, ".venv", "pyproject.toml"),
        '[project]\nname = "venv-pkg"'
      );
      await fs.mkdir(path.join(tempDir, "real-pkg"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "real-pkg", "pyproject.toml"),
        '[project]\nname = "real-package"'
      );

      const packages = await discoverPythonPackages(tempDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.name).toBe("real-package");
    });

    it("should return empty for non-python directory", async () => {
      const packages = await discoverPythonPackages(tempDir);
      expect(packages).toHaveLength(0);
    });

    it("should discover Python projects with requirements.txt (fallback)", async () => {
      // This tests simple Python repos like aws_infra_map_neo4j that use requirements.txt
      await fs.writeFile(path.join(tempDir, "requirements.txt"), "neo4j==5.0.0\nrequests==2.28.0");
      await fs.writeFile(path.join(tempDir, "app.py"), 'print("hello")');
      await fs.writeFile(path.join(tempDir, "utils.py"), "def helper(): pass");

      const packages = await discoverPythonPackages(tempDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.language).toBe("python");
      expect(packages[0]?.name).toBe(path.basename(tempDir));
    });

    it("should not discover requirements.txt without .py files", async () => {
      // Requirements.txt alone is not enough - need actual Python files
      await fs.writeFile(path.join(tempDir, "requirements.txt"), "requests==2.28.0");

      const packages = await discoverPythonPackages(tempDir);

      expect(packages).toHaveLength(0);
    });

    it("should prefer pyproject.toml over requirements.txt", async () => {
      // If there's a pyproject.toml in a subdirectory, don't fallback to requirements.txt
      await fs.writeFile(path.join(tempDir, "requirements.txt"), "requests==2.28.0");
      await fs.mkdir(path.join(tempDir, "lib"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "lib", "pyproject.toml"),
        '[project]\nname = "proper-pkg"'
      );

      const packages = await discoverPythonPackages(tempDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.name).toBe("proper-pkg");
    });
  });
});

describe("C# Package Discovery", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-cs-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("discoverCSharpPackages", () => {
    it("should discover C# projects", async () => {
      await fs.mkdir(path.join(tempDir, "MyProject"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "MyProject", "MyProject.csproj"),
        '<Project Sdk="Microsoft.NET.Sdk"></Project>'
      );

      const packages = await discoverCSharpPackages(tempDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.name).toBe("MyProject");
      expect(packages[0]?.language).toBe("csharp");
    });

    it("should discover multiple C# projects", async () => {
      await fs.mkdir(path.join(tempDir, "Project1"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "Project1", "Project1.csproj"), "<Project></Project>");
      await fs.mkdir(path.join(tempDir, "Project2"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "Project2", "Project2.csproj"), "<Project></Project>");

      const packages = await discoverCSharpPackages(tempDir);

      expect(packages).toHaveLength(2);
      expect(packages.map((p) => p.name).sort()).toEqual(["Project1", "Project2"]);
    });

    it("should exclude bin and obj directories", async () => {
      await fs.mkdir(path.join(tempDir, "bin", "Debug"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "bin", "Debug", "Test.csproj"), "<Project></Project>");
      await fs.mkdir(path.join(tempDir, "obj"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "obj", "Temp.csproj"), "<Project></Project>");
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "src", "Real.csproj"), "<Project></Project>");

      const packages = await discoverCSharpPackages(tempDir);

      expect(packages).toHaveLength(1);
      expect(packages[0]?.name).toBe("Real");
    });

    it("should return empty for non-csharp directory", async () => {
      const packages = await discoverCSharpPackages(tempDir);
      expect(packages).toHaveLength(0);
    });
  });
});

describe("Unified Package Discovery", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "devac-all-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("discoverAllPackages", () => {
    it("should discover packages across multiple languages", async () => {
      // JS package
      await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "js-root" }));

      // Python package
      await fs.mkdir(path.join(tempDir, "python-lib"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "python-lib", "pyproject.toml"),
        '[project]\nname = "py-lib"'
      );

      // C# package
      await fs.mkdir(path.join(tempDir, "dotnet-app"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "dotnet-app", "DotnetApp.csproj"),
        "<Project></Project>"
      );

      const result = await discoverAllPackages(tempDir);

      expect(result.packages).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(result.rootPath).toBe(tempDir);

      const languages = result.packages.map((p) => p.language).sort();
      expect(languages).toEqual(["csharp", "python", "typescript"]);
    });

    it("should deduplicate packages by path", async () => {
      // Create a directory that has both package.json and pyproject.toml
      await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "dual-pkg" }));
      await fs.writeFile(path.join(tempDir, "pyproject.toml"), '[project]\nname = "dual-pkg"');

      const result = await discoverAllPackages(tempDir);

      // Should only have one package (deduped by path)
      expect(result.packages).toHaveLength(1);
    });

    it("should return empty for empty directory", async () => {
      const result = await discoverAllPackages(tempDir);

      expect(result.packages).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.detectedPackageManager).toBeUndefined();
    });

    it("should detect package manager when present", async () => {
      await fs.writeFile(path.join(tempDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'");
      await fs.mkdir(path.join(tempDir, "packages", "lib"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "packages", "lib", "package.json"),
        JSON.stringify({ name: "lib" })
      );

      const result = await discoverAllPackages(tempDir);

      expect(result.detectedPackageManager).toBe("pnpm");
    });
  });
});
