/**
 * RAG 2.0 Service
 * 
 * Hybrid Search combining:
 * - Semantic search (pgvector cosine similarity)
 * - Keyword search (trigram fuzzy matching)
 * 
 * Features:
 * - Variable injection support
 * - Semantic caching for common queries
 * - Multi-tenant scoping
 */

const { createHash } = require('crypto');
const { pool, scopedQuery, rawQuery } = require('./database');
const RedisService = require('./redis');

class RAGService {
  constructor() {
    this.embeddingModel = 'text-embedding-3-small';
    this.embeddingDimension = 1536;
    
    // Hybrid search weights
    this.semanticWeight = 0.7;
    this.keywordWeight = 0.3;
  }

  /**
   * Generate embedding using OpenAI
   */
  async generateEmbedding(text) {
    const apiKey = process.env.OPENAI_API_KEY;
    
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text.slice(0, 8000) // Max input limit
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Embedding API error: ${error.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    return data.data[0].embedding;
  }

  /**
   * Hybrid search: Semantic + Keyword
   */
  async search(orgId, query, limit = 5, options = {}) {
    const { 
      minScore = 0.3,
      category = null,
      includeInactive = false 
    } = options;
    
    // Check cache first
    const cacheKey = this.getCacheKey(orgId, query);
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      console.log('📦 RAG cache hit');
      return cached;
    }
    
    // Generate embedding for query
    const embedding = await this.generateEmbedding(query);
    const embeddingStr = `[${embedding.join(',')}]`;
    
    // Build the hybrid search query
    let whereClause = 'WHERE org_id = $1 AND embedding IS NOT NULL';
    const params = [orgId];
    let paramCount = 2;
    
    if (!includeInactive) {
      whereClause += ' AND is_active = true';
    }
    
    if (category) {
      whereClause += ` AND category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }
    
    // Hybrid search query combining semantic and keyword scores
    const searchQuery = `
      WITH semantic_search AS (
        SELECT 
          id,
          title,
          content,
          category,
          tags,
          1 - (embedding <=> $${paramCount}::vector) as semantic_score
        FROM knowledge_base
        ${whereClause}
        ORDER BY embedding <=> $${paramCount}::vector
        LIMIT ${limit * 2}
      ),
      keyword_search AS (
        SELECT 
          id,
          title,
          content,
          category,
          tags,
          GREATEST(
            similarity(content, $${paramCount + 1}),
            similarity(title, $${paramCount + 1})
          ) as keyword_score
        FROM knowledge_base
        ${whereClause}
        WHERE content % $${paramCount + 1} OR title % $${paramCount + 1}
        ORDER BY keyword_score DESC
        LIMIT ${limit * 2}
      )
      SELECT 
        COALESCE(s.id, k.id) as id,
        COALESCE(s.title, k.title) as title,
        COALESCE(s.content, k.content) as content,
        COALESCE(s.category, k.category) as category,
        COALESCE(s.tags, k.tags) as tags,
        COALESCE(s.semantic_score, 0) as semantic_score,
        COALESCE(k.keyword_score, 0) as keyword_score,
        (COALESCE(s.semantic_score, 0) * ${this.semanticWeight} + 
         COALESCE(k.keyword_score, 0) * ${this.keywordWeight}) as combined_score
      FROM semantic_search s
      FULL OUTER JOIN keyword_search k ON s.id = k.id
      WHERE (COALESCE(s.semantic_score, 0) * ${this.semanticWeight} + 
             COALESCE(k.keyword_score, 0) * ${this.keywordWeight}) >= $${paramCount + 2}
      ORDER BY combined_score DESC
      LIMIT $${paramCount + 3}
    `;
    
    params.push(embeddingStr, query, minScore, limit);
    
    try {
      const result = await rawQuery(searchQuery, params);
      
      // Cache the results
      if (result.rows.length > 0) {
        await this.setCache(cacheKey, result.rows);
      }
      
      return result.rows;
    } catch (error) {
      console.error('RAG search error:', error);
      
      // Fallback to simple semantic search if hybrid fails
      return this.semanticSearchFallback(orgId, embedding, limit, minScore);
    }
  }

  /**
   * Simple semantic search fallback
   */
  async semanticSearchFallback(orgId, embedding, limit, minScore) {
    const embeddingStr = `[${embedding.join(',')}]`;
    
    const result = await rawQuery(`
      SELECT 
        id, title, content, category, tags,
        1 - (embedding <=> $1::vector) as score
      FROM knowledge_base
      WHERE org_id = $2 
        AND is_active = true 
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> $1::vector) >= $3
      ORDER BY embedding <=> $1::vector
      LIMIT $4
    `, [embeddingStr, orgId, minScore, limit]);
    
    return result.rows;
  }

  /**
   * Add knowledge entry with embedding
   */
  async addKnowledge(orgId, entry) {
    const { title, content, category, tags, source, priority } = entry;
    
    // Generate embedding
    const textToEmbed = `${title}\n\n${content}`;
    const embedding = await this.generateEmbedding(textToEmbed);
    const embeddingStr = `[${embedding.join(',')}]`;
    
    const result = await rawQuery(`
      INSERT INTO knowledge_base 
        (org_id, title, content, category, tags, source, priority, embedding)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8::vector)
      RETURNING id, title, category
    `, [orgId, title, content, category, tags || [], source, priority || 0, embeddingStr]);
    
    // Invalidate cache for this org
    await this.invalidateOrgCache(orgId);
    
    return result.rows[0];
  }

  /**
   * Update knowledge entry
   */
  async updateKnowledge(orgId, id, updates) {
    const { title, content, category, tags, priority, is_active } = updates;
    
    // If content changed, regenerate embedding
    let embeddingStr = null;
    if (content || title) {
      const current = await rawQuery(
        'SELECT title, content FROM knowledge_base WHERE id = $1 AND org_id = $2',
        [id, orgId]
      );
      
      if (current.rows.length > 0) {
        const newTitle = title || current.rows[0].title;
        const newContent = content || current.rows[0].content;
        const textToEmbed = `${newTitle}\n\n${newContent}`;
        const embedding = await this.generateEmbedding(textToEmbed);
        embeddingStr = `[${embedding.join(',')}]`;
      }
    }
    
    // Build update query
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    if (title !== undefined) { fields.push(`title = $${paramCount++}`); values.push(title); }
    if (content !== undefined) { fields.push(`content = $${paramCount++}`); values.push(content); }
    if (category !== undefined) { fields.push(`category = $${paramCount++}`); values.push(category); }
    if (tags !== undefined) { fields.push(`tags = $${paramCount++}`); values.push(tags); }
    if (priority !== undefined) { fields.push(`priority = $${paramCount++}`); values.push(priority); }
    if (is_active !== undefined) { fields.push(`is_active = $${paramCount++}`); values.push(is_active); }
    if (embeddingStr) { fields.push(`embedding = $${paramCount++}::vector`); values.push(embeddingStr); }
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    
    values.push(id, orgId);
    
    const result = await rawQuery(`
      UPDATE knowledge_base 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount++} AND org_id = $${paramCount}
      RETURNING id, title, category
    `, values);
    
    // Invalidate cache
    await this.invalidateOrgCache(orgId);
    
    return result.rows[0];
  }

  /**
   * Delete knowledge entry
   */
  async deleteKnowledge(orgId, id) {
    const result = await rawQuery(
      'DELETE FROM knowledge_base WHERE id = $1 AND org_id = $2 RETURNING id',
      [id, orgId]
    );
    
    await this.invalidateOrgCache(orgId);
    
    return result.rowCount > 0;
  }

  /**
   * Get all knowledge for an org
   */
  async getAll(orgId, options = {}) {
    const { category, includeInactive, page = 1, limit = 50 } = options;
    
    let query = 'SELECT id, title, content, category, tags, source, priority, is_active, created_at, updated_at FROM knowledge_base WHERE org_id = $1';
    const params = [orgId];
    let paramCount = 2;
    
    if (!includeInactive) {
      query += ' AND is_active = true';
    }
    
    if (category) {
      query += ` AND category = $${paramCount++}`;
      params.push(category);
    }
    
    query += ' ORDER BY priority DESC, created_at DESC';
    query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(limit, (page - 1) * limit);
    
    const result = await rawQuery(query, params);
    return result.rows;
  }

  /**
   * Get knowledge statistics
   */
  async getStats(orgId) {
    const result = await rawQuery(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(DISTINCT category) as categories,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embeddings
      FROM knowledge_base
      WHERE org_id = $1
    `, [orgId]);
    
    return result.rows[0];
  }

  /**
   * Bulk import knowledge
   */
  async bulkImport(orgId, entries) {
    const results = [];
    
    for (const entry of entries) {
      try {
        const result = await this.addKnowledge(orgId, entry);
        results.push({ success: true, id: result.id, title: result.title });
      } catch (error) {
        results.push({ success: false, title: entry.title, error: error.message });
      }
    }
    
    return results;
  }

  // ============================================
  // CACHING
  // ============================================

  getCacheKey(orgId, query) {
    const hash = createHash('sha256')
      .update(`${orgId}:${query.toLowerCase().trim()}`)
      .digest('hex')
      .slice(0, 16);
    return `rag:${hash}`;
  }

  async getFromCache(key) {
    try {
      const cached = await global.redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      // Cache miss or error
    }
    return null;
  }

  async setCache(key, data) {
    try {
      await global.redis.setex(key, 3600, JSON.stringify(data)); // 1 hour TTL
    } catch (e) {
      // Cache write error
    }
  }

  async invalidateOrgCache(orgId) {
    try {
      // Delete all RAG cache keys for this org
      // Note: In production, use Redis SCAN for better performance
      const keys = await global.redis.keys(`voiceai:rag:*`);
      if (keys.length > 0) {
        await global.redis.del(...keys);
      }
    } catch (e) {
      // Cache invalidation error
    }
  }
}

module.exports = new RAGService();
