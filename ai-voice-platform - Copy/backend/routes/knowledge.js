/**
 * Knowledge Base Routes
 * Manage RAG knowledge base documents for the organization
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { pool, scopedQuery } = require('../services/database');
const { RAGService } = require('../services/rag');
const { tenantResolver, requireRole, apiRateLimiter } = require('../middleware');

// Configure file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/plain',
      'text/csv',
      'application/json',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  }
});

// Apply tenant resolver to all routes
router.use(tenantResolver);

/**
 * GET /api/knowledge
 * List all knowledge base entries for organization
 */
router.get('/', async (req, res) => {
  try {
    const { 
      category, 
      search, 
      page = 1, 
      limit = 20,
      sort = 'created_at',
      order = 'desc'
    } = req.query;

    const offset = (page - 1) * limit;
    const params = [req.orgId];
    let whereClause = 'WHERE org_id = $1';
    let paramIndex = 2;

    if (category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (title ILIKE $${paramIndex} OR content ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Validate sort column
    const validSorts = ['created_at', 'updated_at', 'title', 'priority', 'category'];
    const sortColumn = validSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM knowledge_base ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT id, title, content, category, tags, priority, 
              metadata, created_at, updated_at
       FROM knowledge_base 
       ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    res.json({
      items: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('List knowledge error:', error);
    res.status(500).json({ error: 'Failed to list knowledge base' });
  }
});

/**
 * GET /api/knowledge/categories
 * Get all categories with counts
 */
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT category, COUNT(*) as count
       FROM knowledge_base
       WHERE org_id = $1 AND category IS NOT NULL
       GROUP BY category
       ORDER BY count DESC`,
      [req.orgId]
    );

    res.json({ categories: result.rows });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

/**
 * GET /api/knowledge/:id
 * Get single knowledge entry
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, content, category, tags, priority, 
              metadata, created_at, updated_at
       FROM knowledge_base 
       WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Knowledge entry not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Get knowledge error:', error);
    res.status(500).json({ error: 'Failed to get knowledge entry' });
  }
});

/**
 * POST /api/knowledge
 * Create new knowledge entry
 */
router.post('/', 
  requireRole('owner', 'admin', 'member'),
  apiRateLimiter('knowledge_upload'),
  async (req, res) => {
    try {
      const { title, content, category, tags, priority, metadata } = req.body;

      if (!title || !content) {
        return res.status(400).json({
          error: 'Title and content are required'
        });
      }

      const rag = new RAGService(req.orgId);
      const entry = await rag.addKnowledge({
        title,
        content,
        category,
        tags: tags || [],
        priority: priority || 0,
        metadata: metadata || {}
      });

      res.status(201).json(entry);

    } catch (error) {
      console.error('Create knowledge error:', error);
      res.status(500).json({ error: 'Failed to create knowledge entry' });
    }
  }
);

/**
 * PUT /api/knowledge/:id
 * Update knowledge entry
 */
router.put('/:id',
  requireRole('owner', 'admin', 'member'),
  async (req, res) => {
    try {
      const { title, content, category, tags, priority, metadata } = req.body;

      // Verify entry exists and belongs to org
      const existing = await pool.query(
        'SELECT id FROM knowledge_base WHERE id = $1 AND org_id = $2',
        [req.params.id, req.orgId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Knowledge entry not found' });
      }

      const rag = new RAGService(req.orgId);
      const entry = await rag.updateKnowledge(req.params.id, {
        title,
        content,
        category,
        tags,
        priority,
        metadata
      });

      res.json(entry);

    } catch (error) {
      console.error('Update knowledge error:', error);
      res.status(500).json({ error: 'Failed to update knowledge entry' });
    }
  }
);

/**
 * DELETE /api/knowledge/:id
 * Delete knowledge entry
 */
router.delete('/:id',
  requireRole('owner', 'admin'),
  async (req, res) => {
    try {
      const result = await pool.query(
        'DELETE FROM knowledge_base WHERE id = $1 AND org_id = $2 RETURNING id',
        [req.params.id, req.orgId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Knowledge entry not found' });
      }

      res.json({ message: 'Knowledge entry deleted', id: req.params.id });

    } catch (error) {
      console.error('Delete knowledge error:', error);
      res.status(500).json({ error: 'Failed to delete knowledge entry' });
    }
  }
);

/**
 * POST /api/knowledge/search
 * Search knowledge base (hybrid search)
 */
router.post('/search', async (req, res) => {
  try {
    const { query, limit = 5, category } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const rag = new RAGService(req.orgId);
    const results = await rag.search(query, {
      limit,
      category,
      includeScores: true
    });

    res.json({ results });

  } catch (error) {
    console.error('Search knowledge error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * POST /api/knowledge/bulk
 * Bulk import knowledge entries
 */
router.post('/bulk',
  requireRole('owner', 'admin'),
  apiRateLimiter('bulk_import'),
  async (req, res) => {
    try {
      const { entries } = req.body;

      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({
          error: 'Entries array required'
        });
      }

      if (entries.length > 100) {
        return res.status(400).json({
          error: 'Maximum 100 entries per bulk import'
        });
      }

      const rag = new RAGService(req.orgId);
      const results = await rag.bulkImport(entries);

      res.status(201).json(results);

    } catch (error) {
      console.error('Bulk import error:', error);
      res.status(500).json({ error: 'Bulk import failed' });
    }
  }
);

/**
 * POST /api/knowledge/upload
 * Upload file and extract content
 */
router.post('/upload',
  requireRole('owner', 'admin', 'member'),
  apiRateLimiter('knowledge_upload'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { category, priority } = req.body;
      const content = req.file.buffer.toString('utf-8');
      const title = req.file.originalname.replace(/\.[^/.]+$/, '');

      // Parse content based on file type
      let entries = [];
      
      if (req.file.mimetype === 'application/json') {
        const json = JSON.parse(content);
        if (Array.isArray(json)) {
          entries = json.map(item => ({
            title: item.title || item.question || title,
            content: item.content || item.answer || JSON.stringify(item),
            category: item.category || category,
            tags: item.tags || [],
            priority: item.priority || priority || 0
          }));
        } else {
          entries = [{
            title,
            content: JSON.stringify(json, null, 2),
            category,
            priority: priority || 0
          }];
        }
      } else if (req.file.mimetype === 'text/csv') {
        // Parse CSV
        const lines = content.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          if (values.length >= 2) {
            const entry = {};
            headers.forEach((header, idx) => {
              entry[header] = values[idx]?.trim();
            });
            entries.push({
              title: entry.title || entry.question || `Entry ${i}`,
              content: entry.content || entry.answer || values.join(', '),
              category: entry.category || category,
              priority: parseInt(entry.priority) || priority || 0
            });
          }
        }
      } else {
        // Plain text - split by double newlines for separate entries
        const sections = content.split(/\n\n+/);
        if (sections.length > 1) {
          entries = sections.map((section, idx) => ({
            title: `${title} - Part ${idx + 1}`,
            content: section.trim(),
            category,
            priority: priority || 0
          }));
        } else {
          entries = [{
            title,
            content: content.trim(),
            category,
            priority: priority || 0
          }];
        }
      }

      // Import entries
      const rag = new RAGService(req.orgId);
      const results = await rag.bulkImport(entries);

      res.status(201).json({
        message: `Imported ${results.successful} entries`,
        ...results
      });

    } catch (error) {
      console.error('File upload error:', error);
      res.status(500).json({ error: 'File processing failed' });
    }
  }
);

/**
 * GET /api/knowledge/export
 * Export knowledge base as JSON
 */
router.get('/export',
  requireRole('owner', 'admin'),
  apiRateLimiter('export'),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT title, content, category, tags, priority, metadata
         FROM knowledge_base
         WHERE org_id = $1
         ORDER BY category, title`,
        [req.orgId]
      );

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition', 
        `attachment; filename="knowledge-base-${Date.now()}.json"`
      );

      res.json({
        exportedAt: new Date().toISOString(),
        count: result.rows.length,
        entries: result.rows
      });

    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ error: 'Export failed' });
    }
  }
);

/**
 * DELETE /api/knowledge/bulk
 * Bulk delete entries
 */
router.delete('/bulk',
  requireRole('owner', 'admin'),
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'IDs array required' });
      }

      const result = await pool.query(
        `DELETE FROM knowledge_base 
         WHERE id = ANY($1) AND org_id = $2
         RETURNING id`,
        [ids, req.orgId]
      );

      res.json({
        message: `Deleted ${result.rows.length} entries`,
        deleted: result.rows.map(r => r.id)
      });

    } catch (error) {
      console.error('Bulk delete error:', error);
      res.status(500).json({ error: 'Bulk delete failed' });
    }
  }
);

/**
 * POST /api/knowledge/:id/test
 * Test knowledge entry retrieval
 */
router.post('/:id/test', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Test query required' });
    }

    const rag = new RAGService(req.orgId);
    const results = await rag.search(query, {
      limit: 10,
      includeScores: true
    });

    // Check if this entry appears in results
    const entry = results.find(r => r.id === req.params.id);
    
    res.json({
      query,
      entryFound: !!entry,
      entryRank: entry ? results.indexOf(entry) + 1 : null,
      entryScore: entry?.score || null,
      topResults: results.slice(0, 5).map(r => ({
        id: r.id,
        title: r.title,
        score: r.score
      }))
    });

  } catch (error) {
    console.error('Test search error:', error);
    res.status(500).json({ error: 'Test failed' });
  }
});

module.exports = router;
