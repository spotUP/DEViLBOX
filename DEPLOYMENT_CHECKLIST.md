# Server Deployment Checklist - Modland Hash Integration

## Quick Deploy

```bash
# Set your server IP
export DEVILBOX_SERVER_IP="your.server.ip"

# Run automated deployment script
./deploy-server.sh
```

## Manual Deployment Steps

### 1. Build Server Locally
```bash
cd server
npm run build
cd ..
```

### 2. Upload Server Code
```bash
# Sync server code (excludes node_modules and large DB)
rsync -avz --exclude='node_modules' --exclude='data/modland_hash.db' \
    server/ root@server-ip:/var/www/devilbox/server/
```

### 3. Upload Modland Hash Database (First Time or Update)
```bash
# Upload the 865MB database file
scp server/data/modland_hash.db root@server-ip:/var/www/devilbox/server/data/

# Verify on server
ssh root@server-ip
ls -lh /var/www/devilbox/server/data/modland_hash.db
# Should show ~865MB
```

### 4. Install Dependencies on Server
```bash
ssh root@server-ip
cd /var/www/devilbox/server
npm install --production
```

### 5. Restart Service
```bash
systemctl restart devilbox-api
systemctl status devilbox-api
```

### 6. Test Endpoints
```bash
# Test health
curl https://devilbox.uprough.net/api/health

# Test Modland hash stats
curl https://devilbox.uprough.net/api/modland/hash-stats

# Test hash lookup
curl -X POST https://devilbox.uprough.net/api/modland/lookup-hash \
  -H "Content-Type: application/json" \
  -d '{"hash":"0000000000000000000000000000000000000000000000000000000000000000"}'

# Test samples endpoint
curl https://devilbox.uprough.net/api/modland/samples/1
```

## Post-Deployment Verification

### Check Server Logs
```bash
ssh root@server-ip
journalctl -u devilbox-api -f
```

Look for:
- `[ModlandHash] Loading hash database: /var/www/devilbox/server/data/modland_hash.db`
- `[ModlandHash] Database loaded successfully`
- No errors about missing database file

### Test from Client
1. Open DEViLBOX in browser
2. Import any tracker file (MOD, XM, IT, etc.)
3. Watch browser console for:
   - `✅ Modland file verified:` (if file is in database)
   - Hash computation time (~50-200ms)
   - API call to lookup-hash
4. Check for notification: "✓ Verified Modland File: [title] by [artist]"

## Troubleshooting

### Database Not Found
**Error:** `Modland hash database not found: /var/www/devilbox/server/data/modland_hash.db`

**Fix:**
```bash
# Upload database
scp server/data/modland_hash.db root@server-ip:/var/www/devilbox/server/data/
systemctl restart devilbox-api
```

### Permission Errors
**Error:** `EACCES: permission denied`

**Fix:**
```bash
ssh root@server-ip
chown www-data:www-data /var/www/devilbox/server/data/modland_hash.db
chmod 644 /var/www/devilbox/server/data/modland_hash.db
```

### API Returns 500 Error
**Check logs:**
```bash
journalctl -u devilbox-api -n 50
```

**Common causes:**
- Database file missing
- Database file corrupted
- Wrong file permissions
- TypeScript not compiled (`npm run build`)

## Database Updates

The Modland hash database is updated daily. To update:

```bash
ssh root@server-ip
cd /var/www/devilbox/server/data

# Download latest
wget -O modland_hash.db.7z "https://www.dropbox.com/scl/fi/gtk2yri6iizlaeb6b0j0j/modland_hash.db.7z?rlkey=axcrqv54eg2c1yju6vf043ly1&dl=1"

# Extract
7z x -y modland_hash.db.7z

# Cleanup
rm modland_hash.db.7z

# Restart service
systemctl restart devilbox-api
```

## Files Changed in This Deployment

**Server-Side:**
- `server/src/services/modlandHash.ts` (NEW - hash DB service)
- `server/src/routes/modland.ts` (MODIFIED - added 4 hash endpoints)
- `server/data/modland_hash.db` (NEW - 865MB database)

**Client-Side:**
- `src/lib/modlandApi.ts` (MODIFIED - added hash API methods)
- `src/lib/modland/ModlandDetector.ts` (MODIFIED - uses server API)
- `src/lib/modland/ModlandHasher.ts` (MODIFIED - fixed types)
- `src/lib/modland/ModlandMetadata.ts` (MODIFIED - updated types)

**Deployment:**
- `DEPLOYMENT.md` (UPDATED - added Modland database section)
- `deploy-server.sh` (NEW - automated deployment script)

## Success Criteria

✅ Server builds without errors  
✅ Database uploaded and accessible  
✅ Service starts without errors  
✅ `/api/health` returns 200  
✅ `/api/modland/hash-stats` returns JSON with file counts  
✅ Client hash verification shows notifications  
✅ No TypeScript errors  
✅ Server logs show database loaded successfully  

## Monitoring

Watch for:
- Database load time on startup (~1-2 seconds for 865MB)
- API response times (<100ms for hash lookups)
- Memory usage (database uses mmap, minimal RAM impact)
- Disk space (ensure 1GB+ free for database)

---

**Last Updated:** 2026-03-02  
**Database Version:** Daily updated from Modland  
**API Version:** 1.0.0 (hash endpoints)
