# Release Process

This document explains how to create a new release with Electron desktop app binaries.

## Automatic Release Workflow

The repository is configured to automatically build and publish Electron apps when you push a version tag.

### Step-by-Step Release Process

1. **Update version in package.json**
   ```bash
   # Update the version field in package.json
   # Example: "version": "1.0.0" -> "version": "1.0.1"
   ```

2. **Commit your changes**
   ```bash
   git add .
   git commit -m "chore: Release v1.0.1"
   ```

3. **Create and push a version tag**
   ```bash
   # Create a tag (must start with 'v')
   git tag v1.0.1

   # Push the tag to GitHub
   git push origin v1.0.1
   ```

4. **Wait for the build**
   - GitHub Actions will automatically detect the tag
   - Three parallel jobs will build for macOS, Linux, and Windows
   - Build takes approximately 10-15 minutes
   - Progress: https://github.com/spotUP/DEViLBOX/actions

5. **Release is published**
   - Binaries are automatically uploaded to: https://github.com/spotUP/DEViLBOX/releases
   - The Download Modal in the app will link to this release

## What Gets Built

### macOS
- **DEViLBOX.dmg** - Disk image installer
- **DEViLBOX-mac.zip** - Portable zip archive

### Windows
- **DEViLBOX-Setup.exe** - NSIS installer
- **DEViLBOX-win.zip** - Portable zip archive

### Linux
- **DEViLBOX.AppImage** - Universal Linux executable
- **DEViLBOX.deb** - Debian/Ubuntu package
- **DEViLBOX.tar.gz** - Tarball archive

## Release Notes

When creating a release, GitHub will prompt you to add release notes. Include:
- New features
- Bug fixes
- Breaking changes
- Known issues

## Troubleshooting

### Build fails with "No GitHub token"
The workflow uses `GITHUB_TOKEN` which is automatically provided by GitHub Actions. No additional setup needed.

### Tag already exists
Delete the tag locally and remotely:
```bash
git tag -d v1.0.1
git push origin :refs/tags/v1.0.1
```

Then recreate it with the correct commit.

### Build succeeds but release not created
Check the Actions logs for errors. Ensure:
- Repository permissions are set correctly
- Tag name starts with 'v'
- No other release with the same tag exists

## Manual Release (if needed)

If automatic release fails, you can build manually:

```bash
# Build all platforms (requires macOS for complete build)
npm run electron:build:all

# Or build current platform only
npm run electron:build
```

Binaries will be in `dist_electron/` directory.
