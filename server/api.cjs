/**
 * DEViLBOX File API Server
 * Provides file system access for web users, jailed to public/data/ directory
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Jail all file operations to this directory
const JAIL_DIR = path.resolve(__dirname, '../public/data');

app.use(cors());
app.use(express.json({ limit: '50mb' }));

/**
 * Validate and resolve a path, ensuring it stays within JAIL_DIR
 */
function validatePath(requestedPath) {
  // Remove any leading slashes
  const cleanPath = requestedPath.replace(/^\/+/, '');
  
  // Resolve the full path
  const fullPath = path.resolve(JAIL_DIR, cleanPath);
  
  // Ensure the resolved path is still within JAIL_DIR
  if (!fullPath.startsWith(JAIL_DIR)) {
    throw new Error('Path escape attempt detected');
  }
  
  return fullPath;
}

/**
 * GET /api/files/:path
 * List directory contents or read file
 */
app.get('/api/files/*', async (req, res) => {
  try {
    const requestedPath = req.params[0] || '';
    const fullPath = validatePath(requestedPath);
    
    const stats = await fs.stat(fullPath);
    
    if (stats.isDirectory()) {
      // List directory contents
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const items = await Promise.all(
        entries.map(async (entry) => {
          const entryPath = path.join(fullPath, entry.name);
          const entryStats = await fs.stat(entryPath);
          
          return {
            name: entry.name,
            path: path.relative(JAIL_DIR, entryPath),
            isDirectory: entry.isDirectory(),
            size: entryStats.size,
            modifiedAt: entryStats.mtime.toISOString(),
          };
        })
      );
      
      res.json({ items });
    } else {
      // Read file
      const content = await fs.readFile(fullPath);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(content);
    }
  } catch (error) {
    console.error('Error reading path:', error);
    res.status(404).json({ error: error.message });
  }
});

/**
 * POST /api/files/:path
 * Create or update a file
 */
app.post('/api/files/*', async (req, res) => {
  try {
    const requestedPath = req.params[0];
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path required' });
    }
    
    const fullPath = validatePath(requestedPath);
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    
    // Write file (content should be base64 encoded for binary files)
    const buffer = Buffer.from(content, 'base64');
    await fs.writeFile(fullPath, buffer);
    
    res.json({ success: true, path: path.relative(JAIL_DIR, fullPath) });
  } catch (error) {
    console.error('Error writing file:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/files/:path
 * Delete a file
 */
app.delete('/api/files/*', async (req, res) => {
  try {
    const requestedPath = req.params[0];
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path required' });
    }
    
    const fullPath = validatePath(requestedPath);
    await fs.unlink(fullPath);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`📁 DEViLBOX File API running on http://localhost:${PORT}`);
  console.log(`🔒 Jailed to: ${JAIL_DIR}`);
});
