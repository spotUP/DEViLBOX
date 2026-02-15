# Automatic Deployment Setup

The project is configured to automatically deploy to both GitHub Pages and your custom server on every push to `main`.

## Current Setup

### GitHub Pages (https://spotup.github.io/DEViLBOX/)
- ✅ Configured and working
- Builds with `base: '/DEViLBOX/'`
- No additional setup required

### Custom Server (https://devilbox.uprough.net/)
- 🔧 Requires GitHub Secrets configuration
- Builds with `base: '/'`
- Deploys via SSH/rsync

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

1. **Builds two versions:**
   - GitHub Pages version with `/DEViLBOX/` base path
   - Server version with `/` base path

2. **Deploys to both locations:**
   - GitHub Pages: Uses GitHub's built-in Pages deployment
   - Custom Server: Uses rsync over SSH to sync files

3. **Builds desktop apps** (optional, already configured)

## Manual Deployment

If automatic deployment is not set up, you can deploy manually:

### To GitHub Pages:
```bash
VITE_BASE_URL=/DEViLBOX/ npm run build
npm run deploy
```

### To Custom Server:
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
- GitHub Pages: Should show URLs starting with `/DEViLBOX/`
- Custom Server: Should show URLs starting with `/`
- Check the workflow built with the correct `VITE_BASE_URL`

## Disable Automatic Deployment

To disable deployment to your custom server while keeping GitHub Pages:

1. Remove the `deploy-server` job from `.github/workflows/deploy.yml`
2. Or remove the GitHub secrets to prevent the deployment step from running
