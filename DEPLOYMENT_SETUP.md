# Automatic Deployment Setup

The project is configured to automatically deploy to your custom server on every push to `main`.

## Current Setup

### Custom Server (https://devilbox.uprough.net/)
- Builds with `base: '/'`
- Deploys via SSH/rsync on every push to main
- 🔧 Requires GitHub Secrets configuration (see below)

## Configure Custom Server Deployment

The deployment reuses existing Hetzner secrets from other projects. You only need to add ONE new secret:

1. Go to: https://github.com/spotUP/DEViLBOX/settings/secrets/actions

2. Add the deployment path secret:

### Required Secrets

| Secret Name | Description | Example | Status |
|------------|-------------|---------|--------|
| `HETZNER_HOST` | Your Hetzner server hostname | `devilbox.uprough.net` | ✅ Already exists |
| `HETZNER_SSH_KEY` | SSH private key for authentication | (existing key) | ✅ Already exists |
| `DEVILBOX_DEPLOY_PATH` | Path to web root on server | `/var/www/devilbox/` or `/app/devilbox/` | ⚠️ **ADD THIS** |

### Add the Deploy Path Secret

The only new secret needed is `DEVILBOX_DEPLOY_PATH`. This should be the absolute path where the built files will be copied on your server.

**Common paths:**
- `/var/www/devilbox/` (if using traditional web root)
- `/app/devilbox/` (following amiexpress pattern)
- `/home/root/public_html/devilbox/` (if using home directory)

The directory must exist and be writable by the `root` user.

## How It Works

When you push to `main`, GitHub Actions automatically:

1. **Builds the app** with `/` base path for your server

2. **Deploys to your server** via rsync over SSH

3. **Builds desktop apps** (optional, already configured)

## Manual Deployment

If automatic deployment is not set up, you can deploy manually:

```bash
npm run build
rsync -avz dist/ root@devilbox.uprough.net:/var/www/devilbox/
```

(Replace `/var/www/devilbox/` with your actual `DEVILBOX_DEPLOY_PATH`)

## Troubleshooting

**Deployment fails with "Permission denied"**
- Verify `HETZNER_SSH_KEY` is correctly configured in GitHub secrets (should already exist from other projects)
- Test SSH access: `ssh root@devilbox.uprough.net`

**Files not updating on server**
- Verify `DEVILBOX_DEPLOY_PATH` exists on the server
- Ensure the directory is writable by the `root` user
- Check GitHub Actions logs for errors

**Wrong base path after deployment**
- Should show URLs starting with `/` (root path)
- If you see broken asset paths, rebuild with `npm run build`

## Re-enable GitHub Pages (Optional)

If you want to deploy to GitHub Pages in the future:

1. Add the GitHub Pages jobs back to `.github/workflows/deploy.yml`
2. Build with: `VITE_BASE_URL=/DEViLBOX/ npm run build`
3. Deploy with: `npm run deploy`
