/**
 * Knowledge Store - Knowledge Base State Management
 */

import { create } from 'zustand';
import { knowledgeAPI } from '../services/api';

const useKnowledgeStore = create((set, get) => ({
  // State
  entries: [],
  categories: [],
  isLoading: false,
  searchResults: null,
  selectedEntry: null,
  
  // Filters
  selectedCategory: 'all',
  searchQuery: '',
  
  // Fetch all entries
  fetchEntries: async (params = {}) => {
    set({ isLoading: true });
    
    try {
      const { data } = await knowledgeAPI.list(params);
      set({ 
        entries: data.entries || [],
        isLoading: false,
      });
      return data.entries;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  
  // Fetch categories
  fetchCategories: async () => {
    try {
      const { data } = await knowledgeAPI.getCategories();
      set({ categories: data.categories || [] });
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  },
  
  // Create entry
  createEntry: async (entryData) => {
    try {
      const { data } = await knowledgeAPI.create(entryData);
      
      set((state) => ({
        entries: [data.entry, ...state.entries],
      }));
      
      return { success: true, entry: data.entry };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  },
  
  // Update entry
  updateEntry: async (id, updates) => {
    try {
      const { data } = await knowledgeAPI.update(id, updates);
      
      set((state) => ({
        entries: state.entries.map(e => e.id === id ? data.entry : e),
      }));
      
      return { success: true, entry: data.entry };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  },
  
  // Delete entry
  deleteEntry: async (id) => {
    try {
      await knowledgeAPI.delete(id);
      
      set((state) => ({
        entries: state.entries.filter(e => e.id !== id),
      }));
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  },
  
  // Search knowledge base
  searchKnowledge: async (query, options = {}) => {
    try {
      const { data } = await knowledgeAPI.search(query, options);
      set({ searchResults: data });
      return data;
    } catch (error) {
      throw error;
    }
  },
  
  // Clear search results
  clearSearchResults: () => set({ searchResults: null }),
  
  // Set selected entry
  setSelectedEntry: (entry) => set({ selectedEntry: entry }),
  
  // Set filters
  setCategory: (category) => set({ selectedCategory: category }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  // Get filtered entries
  getFilteredEntries: () => {
    const { entries, selectedCategory, searchQuery } = get();
    
    return entries.filter(entry => {
      const matchesCategory = selectedCategory === 'all' || entry.category === selectedCategory;
      const matchesSearch = !searchQuery || 
        entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.content.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesCategory && matchesSearch;
    });
  },
}));

export default useKnowledgeStore;
