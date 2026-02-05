/**
 * Knowledge Base Page - Enterprise Knowledge Management
 * Hybrid search, document chunks, and test query feature
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Search,
  Plus,
  Edit2,
  Trash2,
  FileText,
  Tag,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  Sparkles,
  Target,
  Lightbulb,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { knowledgeAPI } from '../services/api';
import toast from 'react-hot-toast';

// Priority badges
const priorityColors = {
  high: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

// Knowledge Entry Card
const KnowledgeCard = ({ entry, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card overflow-hidden"
    >
      <div 
        className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-white truncate">{entry.title}</h3>
              <span className={`badge text-xs ${priorityColors[entry.priority] || priorityColors.medium}`}>
                {entry.priority || 'medium'}
              </span>
            </div>
            <p className="text-sm text-slate-400 line-clamp-2">{entry.content}</p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
              className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
              className="p-2 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-slate-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-500" />
            )}
          </div>
        </div>
        
        {entry.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {entry.tags.map((tag) => (
              <span 
                key={tag} 
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-500/10 text-primary-400 rounded text-xs"
              >
                <Tag className="w-3 h-3" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-white/10">
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{entry.content}</p>
              
              <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                <span>Category: {entry.category || 'General'}</span>
                <span>Updated: {new Date(entry.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Test Query Result Component
const TestQueryResult = ({ result, onClose }) => {
  if (!result) return null;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="glass-card p-6 border border-primary-500/30"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary-400" />
          <h3 className="font-semibold text-white">Search Results</h3>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>
      
      <div className="space-y-4">
        {result.chunks?.length > 0 ? (
          result.chunks.map((chunk, index) => (
            <div 
              key={index}
              className="p-4 bg-white/5 rounded-xl border border-white/10"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">
                  Relevance: {Math.round(chunk.similarity * 100)}%
                </span>
                <span className="badge-primary text-xs">
                  {chunk.search_type === 'semantic' ? '🧠 Semantic' : '🔤 Keyword'}
                </span>
              </div>
              <h4 className="font-medium text-white mb-1">{chunk.title}</h4>
              <p className="text-sm text-slate-400">{chunk.content}</p>
              
              {chunk.tags?.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {chunk.tags.map((tag) => (
                    <span key={tag} className="text-xs text-primary-400">#{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No matching documents found</p>
            <p className="text-sm text-slate-500 mt-1">Try different keywords or add more knowledge</p>
          </div>
        )}
      </div>
      
      {result.chunks?.length > 0 && (
        <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <div className="flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-emerald-400 mt-0.5" />
            <div>
              <p className="text-sm text-emerald-300">
                These are the document chunks your AI will use to answer this question.
              </p>
              <p className="text-xs text-emerald-400/70 mt-1">
                Hybrid search combines semantic (meaning) and keyword matching for best results.
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

// Add/Edit Modal
const EntryModal = ({ entry, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    title: entry?.title || '',
    content: entry?.content || '',
    category: entry?.category || 'general',
    priority: entry?.priority || 'medium',
    tags: entry?.tags?.join(', ') || '',
  });
  const [saving, setSaving] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.content) {
      toast.error('Title and content are required');
      return;
    }
    
    setSaving(true);
    await onSave({
      ...formData,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
    });
    setSaving(false);
  };
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-bold text-white">
              {entry ? 'Edit Entry' : 'Add Knowledge'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="input-field"
              placeholder="e.g., Return Policy"
              required
            />
          </div>
          
          <div>
            <label className="label">Content</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={6}
              className="input-field resize-none"
              placeholder="Enter the knowledge content that the AI will use to answer questions..."
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="select-field"
              >
                <option value="general">General</option>
                <option value="product">Product</option>
                <option value="pricing">Pricing</option>
                <option value="support">Support</option>
                <option value="policy">Policy</option>
                <option value="faq">FAQ</option>
              </select>
            </div>
            
            <div>
              <label className="label">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="select-field"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="label">Tags (comma-separated)</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="input-field"
              placeholder="e.g., refund, policy, returns"
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                entry ? 'Save Changes' : 'Add Entry'
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

// Empty State
const EmptyState = ({ onAdd }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="glass-card p-12 text-center"
  >
    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4">
      <BookOpen className="w-10 h-10 text-primary-400" />
    </div>
    <h3 className="text-xl font-display font-bold text-white mb-2">
      Build Your Knowledge Base
    </h3>
    <p className="text-slate-400 mb-6 max-w-md mx-auto">
      Add information about your products, services, policies, and FAQs. 
      Your AI agent will use this to answer customer questions accurately.
    </p>
    <button onClick={onAdd} className="btn-primary">
      <Plus className="w-5 h-5 mr-2" />
      Add First Entry
    </button>
  </motion.div>
);

const KnowledgeBase = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  
  // Test Query state
  const [testQuery, setTestQuery] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  
  // Fetch entries
  useEffect(() => {
    fetchEntries();
  }, [selectedCategory]);
  
  const fetchEntries = async () => {
    setLoading(true);
    try {
      const params = selectedCategory !== 'all' ? { category: selectedCategory } : {};
      const { data } = await knowledgeAPI.list(params);
      setEntries(data.entries || []);
    } catch (error) {
      toast.error('Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  };
  
  // Test query handler
  const handleTestQuery = async (e) => {
    e.preventDefault();
    if (!testQuery.trim()) return;
    
    setTesting(true);
    setTestResult(null);
    
    try {
      const { data } = await knowledgeAPI.search(testQuery, {
        limit: 5,
        include_semantic: true,
        include_keyword: true,
      });
      setTestResult(data);
    } catch (error) {
      toast.error('Search failed');
    } finally {
      setTesting(false);
    }
  };
  
  // Save entry
  const handleSave = async (data) => {
    try {
      if (editingEntry) {
        await knowledgeAPI.update(editingEntry.id, data);
        toast.success('Entry updated');
      } else {
        await knowledgeAPI.create(data);
        toast.success('Entry added');
      }
      setShowModal(false);
      setEditingEntry(null);
      fetchEntries();
    } catch (error) {
      toast.error('Failed to save');
    }
  };
  
  // Delete entry
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    
    try {
      await knowledgeAPI.delete(id);
      setEntries(entries.filter(e => e.id !== id));
      toast.success('Entry deleted');
    } catch (error) {
      toast.error('Failed to delete');
    }
  };
  
  // Filter entries by search
  const filteredEntries = entries.filter(entry =>
    entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.content.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Categories
  const categories = ['all', 'general', 'product', 'pricing', 'support', 'policy', 'faq'];
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Knowledge Base</h1>
          <p className="text-slate-400 mt-1">Train your AI with your business information</p>
        </div>
        
        <button
          onClick={() => { setEditingEntry(null); setShowModal(true); }}
          className="btn-primary"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Entry
        </button>
      </div>
      
      {/* Test Query Section */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-semibold text-white">Test Your Knowledge Base</h2>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          See exactly which documents your AI will use to answer a question.
        </p>
        
        <form onSubmit={handleTestQuery} className="flex gap-3">
          <input
            type="text"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder="e.g., What is your return policy?"
            className="input-field flex-1"
          />
          <button
            type="submit"
            disabled={testing || !testQuery.trim()}
            className="btn-primary px-6"
          >
            {testing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Search className="w-5 h-5 mr-2" />
                Test
              </>
            )}
          </button>
        </form>
        
        <AnimatePresence>
          {testResult && (
            <div className="mt-4">
              <TestQueryResult result={testResult} onClose={() => setTestResult(null)} />
            </div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries..."
            className="input-field pl-12"
          />
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-primary-500 text-white'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      ) : filteredEntries.length === 0 && entries.length === 0 ? (
        <EmptyState onAdd={() => setShowModal(true)} />
      ) : filteredEntries.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-slate-400">No entries match your search</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredEntries.map((entry) => (
            <KnowledgeCard
              key={entry.id}
              entry={entry}
              onEdit={(e) => { setEditingEntry(e); setShowModal(true); }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
      
      {/* Stats */}
      {entries.length > 0 && (
        <div className="glass-card p-4 flex items-center justify-between text-sm">
          <span className="text-slate-400">
            {entries.length} total entries
          </span>
          <span className="text-slate-500">
            Last updated: {entries[0]?.updated_at 
              ? new Date(entries[0].updated_at).toLocaleDateString() 
              : 'N/A'}
          </span>
        </div>
      )}
      
      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <EntryModal
            entry={editingEntry}
            onSave={handleSave}
            onClose={() => { setShowModal(false); setEditingEntry(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default KnowledgeBase;
