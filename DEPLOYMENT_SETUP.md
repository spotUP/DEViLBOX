# Automatic Deployment Setup

The project is configured to automatically deploy to your custom server on every push to `main`.

## Current Setup

### Custom Server (https://devilbox.uprough.net/)
- Builds with `base: '/'`
- Deploys via SSH/rsync on every push to main
- 🔧 Requires GitHub Secrets configuration (see below)

## Configure Custom Server Deployment

To enable automatic deployment to your server, add these secrets in GitHub:

1. Go to: https://github.com/spotUP/DEViLBOX/settings/secrets/actions

2. Add the following secrets:

### Required Secrets

| Secret Name | Description | Example |
|------------|-------------|---------|
| `DEPLOY_HOST` | Your server hostname or IP | `devilbox.uprough.net` |
| `DEPLOY_USER` | SSH username | `youruser` |
| `DEPLOY_PATH` | Path to web root on server | `/var/www/html/` or `/home/user/public_html/` |
| `DEPLOY_KEY` | SSH private key for authentication | Your private SSH key (see below) |

### Generate SSH Key for Deployment

On your local machine:

```bash
# Generate a new SSH key specifically for deployment
ssh-keygen -t ed25519 -C "github-deploy@devilbox" -f ~/.ssh/devilbox_deploy

# Copy the public key to your server
ssh-copy-id -i ~/.ssh/devilbox_deploy.pub youruser@devilbox.uprough.net

# Display the private key to copy to GitHub secrets
cat ~/.ssh/devilbox_deploy
```

Copy the entire private key (including `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`) and paste it as the `DEPLOY_KEY` secret in GitHub.

## How It Works

When you push to `main`, GitHub Actions automatically:

1. **Builds the app** with `/` base path for your server

2. **Deploys to your server** via rsync over SSH

3. **Builds desktop apps** (optional, already configured)

## Manual Deployment

If automatic deployment is not set up, you can deploy manually:

```bash
npm run build
rsync -avz dist/ youruser@devilbox.uprough.net:/var/www/html/
```

## Troubleshooting

**Deployment fails with "Permission denied"**
- Verify the SSH key is correctly added to GitHub secrets
- Test SSH access: `ssh -i ~/.ssh/devilbox_deploy youruser@devilbox.uprough.net`

**Files not updating on server**
- Check the `DEPLOY_PATH` is correct
- Verify the directory permissions on your server
- Check GitHub Actions logs for errors

**Wrong base path after deployment**
- Should show URLs starting with `/` (root path)
- If you see broken asset paths, rebuild with `npm run build`

## Re-enable GitHub Pages (Optional)

If you want to deploy to GitHub Pages in the future:

1. Add the GitHub Pages jobs back to `.github/workflows/deploy.yml`
2. Build with: `VITE_BASE_URL=/DEViLBOX/ npm run build`
3. Deploy with: `npm run deploy`
