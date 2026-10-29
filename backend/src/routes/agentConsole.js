// Agent console (item 2): lists registered agents and their metadata.
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'developer'));

const AGENTS_DIR = path.resolve(process.cwd(), '..', '.opencode', 'agents');

router.get('/', asyncHandler(async (req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
  } catch {
    return res.json([]);
  }
  const agents = files.map((file) => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
    // Parse frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const fm = {};
    if (fmMatch) {
      fmMatch[1].split('\n').forEach((line) => {
        const [key, ...rest] = line.split(':');
        if (key && rest.length) fm[key.trim()] = rest.join(':').trim();
      });
    }
    const body = fmMatch ? content.slice(fmMatch[0].length).trim() : content;
    return {
      id: file.replace('.md', ''),
      file,
      description: fm.description || '',
      mode: fm.mode || 'primary',
      model: fm.model || null,
      tools: fm.tools || null,
      bodyPreview: body.slice(0, 200),
      bodyLength: body.length,
    };
  });
  res.json(agents);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(AGENTS_DIR, `${id}.md`);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ id, content });
  } catch {
    res.status(404).json({ error: 'Agent not found', code: 'not_found' });
  }
}));

export default router;
