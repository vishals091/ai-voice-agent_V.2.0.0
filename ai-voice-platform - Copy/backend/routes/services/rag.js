/**
 * RAG (Retrieval-Augmented Generation) Service
 * Uses pgvector with Neon PostgreSQL for semantic search
 */

const { getPool } = require('./database');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000) // Limit input size
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding generation error:', error);
    throw error;
  }
}

/**
 * Search knowledge base using semantic similarity
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Array} Matching knowledge entries
 */
async function searchKnowledge(query, options = {}) {
  const {
    limit = 5,
    threshold = 0.7,
    category = null
  } = options;
  
  const pool = getPool();
  
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    
    // Format embedding for PostgreSQL
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    
    // Build query with optional category filter
    let sql = `
      SELECT 
        id,
        title,
        content,
        category,
        metadata,
        1 - (embedding <=> $1::vector) as similarity
      FROM knowledge_base
      WHERE 1 - (embedding <=> $1::vector) > $2
    `;
    
    const params = [embeddingStr, threshold];
    
    if (category) {
      sql += ` AND category = $3`;
      params.push(category);
    }
    
    sql += `
      ORDER BY embedding <=> $1::vector
      LIMIT $${params.length + 1}
    `;
    params.push(limit);
    
    const result = await pool.query(sql, params);
    
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      category: row.category,
      metadata: row.metadata,
      similarity: parseFloat(row.similarity).toFixed(4)
    }));
    
  } catch (error) {
    console.error('Knowledge search error:', error);
    return [];
  }
}

/**
 * Add entry to knowledge base
 */
async function addKnowledge(entry) {
  const {
    title,
    content,
    category = 'general',
    metadata = {}
  } = entry;
  
  const pool = getPool();
  
  try {
    // Generate embedding
    const embedding = await generateEmbedding(`${title}\n\n${content}`);
    const embeddingStr = `[${embedding.join(',')}]`;
    
    const result = await pool.query(`
      INSERT INTO knowledge_base (title, content, category, metadata, embedding)
      VALUES ($1, $2, $3, $4, $5::vector)
      RETURNING id, title, content, category, metadata, created_at
    `, [title, content, category, JSON.stringify(metadata), embeddingStr]);
    
    return result.rows[0];
  } catch (error) {
    console.error('Add knowledge error:', error);
    throw error;
  }
}

/**
 * Update knowledge base entry
 */
async function updateKnowledge(id, updates) {
  const {
    title,
    content,
    category,
    metadata
  } = updates;
  
  const pool = getPool();
  
  try {
    // Regenerate embedding if content changed
    let embeddingUpdate = '';
    const params = [id];
    let paramIndex = 2;
    
    const setClauses = [];
    
    if (title !== undefined) {
      setClauses.push(`title = $${paramIndex}`);
      params.push(title);
      paramIndex++;
    }
    
    if (content !== undefined) {
      setClauses.push(`content = $${paramIndex}`);
      params.push(content);
      paramIndex++;
      
      // Regenerate embedding
      const embedding = await generateEmbedding(`${title || ''}\n\n${content}`);
      const embeddingStr = `[${embedding.join(',')}]`;
      setClauses.push(`embedding = $${paramIndex}::vector`);
      params.push(embeddingStr);
      paramIndex++;
    }
    
    if (category !== undefined) {
      setClauses.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }
    
    if (metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex}`);
      params.push(JSON.stringify(metadata));
      paramIndex++;
    }
    
    setClauses.push('updated_at = NOW()');
    
    const result = await pool.query(`
      UPDATE knowledge_base
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING id, title, content, category, metadata, updated_at
    `, params);
    
    return result.rows[0];
  } catch (error) {
    console.error('Update knowledge error:', error);
    throw error;
  }
}

/**
 * Delete knowledge base entry
 */
async function deleteKnowledge(id) {
  const pool = getPool();
  
  try {
    const result = await pool.query(`
      DELETE FROM knowledge_base
      WHERE id = $1
      RETURNING id
    `, [id]);
    
    return result.rowCount > 0;
  } catch (error) {
    console.error('Delete knowledge error:', error);
    throw error;
  }
}

/**
 * Get all knowledge entries
 */
async function getAllKnowledge({ page = 1, limit = 20, search = '', category = '' } = {}) {
  try {
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM knowledge_base WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as count FROM knowledge_base WHERE 1=1';
    const params = [];
    const countParams = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (title ILIKE $${paramIndex} OR content ILIKE $${paramIndex})`;
      countQuery += ` AND (title ILIKE $${paramIndex} OR content ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      countParams.push(`%${search}%`);
      paramIndex++;
    }

    if (category) {
      query += ` AND category = $${paramIndex}`;
      countQuery += ` AND category = $${paramIndex}`;
      params.push(category);
      countParams.push(category);
      paramIndex++;
    }

    query += ` ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const [itemsResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
    ]);

    // FIX: Add null checks
    const items = itemsResult?.rows || [];
    const total = parseInt(countResult?.rows?.[0]?.count || '0');

    return { items, total };
  } catch (error) {
    console.error('Get all knowledge error:', error);
    // Return empty result instead of throwing
    return { items: [], total: 0 };
  }
}
/**
 * Bulk import knowledge entries
 */
async function bulkImportKnowledge(entries) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  for (const entry of entries) {
    try {
      await addKnowledge(entry);
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        entry: entry.title,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Get knowledge categories
 */
async function getCategories() {
  const pool = getPool();
  
  try {
    const result = await pool.query(`
      SELECT DISTINCT category, COUNT(*) as count
      FROM knowledge_base
      GROUP BY category
      ORDER BY count DESC
    `);
    
    return result.rows;
  } catch (error) {
    console.error('Get categories error:', error);
    return [];
  }
}

/**
 * Reindex all knowledge entries (regenerate embeddings)
 */
async function reindexKnowledge() {
  const pool = getPool();
  
  try {
    const entries = await pool.query('SELECT id, title, content FROM knowledge_base');
    
    let updated = 0;
    for (const entry of entries.rows) {
      const embedding = await generateEmbedding(`${entry.title}\n\n${entry.content}`);
      const embeddingStr = `[${embedding.join(',')}]`;
      
      await pool.query(`
        UPDATE knowledge_base
        SET embedding = $1::vector
        WHERE id = $2
      `, [embeddingStr, entry.id]);
      
      updated++;
    }
    
    return { updated, total: entries.rows.length };
  } catch (error) {
    console.error('Reindex error:', error);
    throw error;
  }
}

module.exports = {
  searchKnowledge,
  addKnowledge,
  updateKnowledge,
  deleteKnowledge,
  getAllKnowledge,
  bulkImportKnowledge,
  getCategories,
  reindexKnowledge,
  generateEmbedding
};
