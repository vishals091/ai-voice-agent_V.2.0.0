/**
 * Team Page - Organization & Team Management
 * Invite members, manage roles, API keys
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  Key,
  Copy,
  Trash2,
  MoreVertical,
  Check,
  X,
  Loader2,
  Building2,
  Crown,
  AlertTriangle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { organizationAPI } from '../services/api';
import useAuthStore from '../stores/authStore';
import toast from 'react-hot-toast';

// Role badges
const roleBadges = {
  owner: { label: 'Owner', class: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  admin: { label: 'Admin', class: 'bg-primary-500/20 text-primary-400 border-primary-500/30' },
  member: { label: 'Member', class: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  viewer: { label: 'Viewer', class: 'bg-slate-500/20 text-slate-500 border-slate-500/30' },
};

// Team Member Row
const TeamMemberRow = ({ member, currentUserId, isAdmin, onUpdateRole, onRemove }) => {
  const [showMenu, setShowMenu] = useState(false);
  const isCurrentUser = member.id === currentUserId;
  const isOwner = member.role === 'owner';
  
  return (
    <div className="flex items-center justify-between p-4 hover:bg-white/5 rounded-xl transition-colors">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white font-semibold">
          {member.name?.[0] || member.email[0].toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-white">
              {member.name || 'Unnamed'}
              {isCurrentUser && <span className="text-slate-500 text-sm ml-1">(you)</span>}
            </p>
            {isOwner && <Crown className="w-4 h-4 text-amber-400" />}
          </div>
          <p className="text-sm text-slate-500">{member.email}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <span className={`badge ${roleBadges[member.role]?.class}`}>
          {roleBadges[member.role]?.label || member.role}
        </span>
        
        {isAdmin && !isOwner && !isCurrentUser && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-lg hover:bg-white/10 text-slate-400"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute right-0 mt-2 w-48 glass-card py-2 z-10"
                >
                  <button
                    onClick={() => { onUpdateRole(member.id, 'admin'); setShowMenu(false); }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-white/10 text-slate-300"
                  >
                    Make Admin
                  </button>
                  <button
                    onClick={() => { onUpdateRole(member.id, 'member'); setShowMenu(false); }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-white/10 text-slate-300"
                  >
                    Make Member
                  </button>
                  <button
                    onClick={() => { onUpdateRole(member.id, 'viewer'); setShowMenu(false); }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-white/10 text-slate-300"
                  >
                    Make Viewer
                  </button>
                  <hr className="my-2 border-white/10" />
                  <button
                    onClick={() => { onRemove(member.id); setShowMenu(false); }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-rose-500/20 text-rose-400"
                  >
                    Remove from team
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

// API Key Row
const ApiKeyRow = ({ apiKey, onRevoke }) => {
  const [showKey, setShowKey] = useState(false);
  
  return (
    <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center">
          <Key className="w-5 h-5 text-primary-400" />
        </div>
        <div>
          <p className="font-medium text-white">{apiKey.name || 'API Key'}</p>
          <p className="text-sm text-slate-500 font-mono">
            {apiKey.key_prefix}...
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">
          Created {new Date(apiKey.created_at).toLocaleDateString()}
        </span>
        <button
          onClick={() => onRevoke(apiKey.id)}
          className="p-2 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// Invite Modal
const InviteModal = ({ onInvite, onClose }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('member');
  const [sending, setSending] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    
    setSending(true);
    await onInvite(email, role, name);
    setSending(false);
  };
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card w-full max-w-md"
      >
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-bold text-white">Invite Team Member</h2>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="colleague@company.com"
              required
            />
          </div>
          
          <div>
            <label className="label">Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="John Doe"
            />
          </div>
          
          <div>
            <label className="label">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="select-field"
            >
              <option value="admin">Admin - Full access</option>
              <option value="member">Member - Manage content</option>
              <option value="viewer">Viewer - Read only</option>
            </select>
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={sending} className="btn-primary">
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Mail className="w-5 h-5 mr-2" />
                  Send Invite
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

// Create API Key Modal
const CreateKeyModal = ({ onCreate, onClose }) => {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState(false);
  
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name) return;
    
    setCreating(true);
    const key = await onCreate(name);
    setNewKey(key);
    setCreating(false);
  };
  
  const handleCopy = () => {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('API key copied');
  };
  
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card w-full max-w-md"
      >
        <div className="p-6 border-b border-white/10">
          <h2 className="text-xl font-display font-bold text-white">Create API Key</h2>
        </div>
        
        {newKey ? (
          <div className="p-6 space-y-4">
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-300 font-medium">Save your API key now</p>
                  <p className="text-xs text-amber-400/70 mt-1">
                    You won't be able to see this key again after closing this dialog.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 p-3 bg-white/5 rounded-xl">
              <code className="flex-1 text-sm text-slate-300 font-mono break-all">{newKey}</code>
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg hover:bg-white/10 text-slate-400"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            
            <button onClick={onClose} className="btn-primary w-full">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="p-6 space-y-4">
            <div>
              <label className="label">Key Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder="e.g., Production API Key"
                required
              />
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Create Key'
                )}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
};

const Team = () => {
  const { user, organization, isAdmin } = useAuthStore();
  
  const [team, setTeam] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  
  useEffect(() => {
    fetchData();
  }, []);
  
  const fetchData = async () => {
    setLoading(true);
    try {
      const [teamRes, keysRes] = await Promise.all([
        organizationAPI.getTeam(),
        organizationAPI.getApiKeys(),
      ]);
      setTeam(teamRes.data.members || []);
      setApiKeys(keysRes.data.keys || []);
    } catch (error) {
      toast.error('Failed to load team data');
    } finally {
      setLoading(false);
    }
  };
  
  const handleInvite = async (email, role, name) => {
    try {
      await organizationAPI.inviteMember(email, role, name);
      toast.success('Invitation sent');
      setShowInviteModal(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to send invite');
    }
  };
  
  const handleUpdateRole = async (userId, role) => {
    try {
      await organizationAPI.updateMemberRole(userId, role);
      toast.success('Role updated');
      fetchData();
    } catch (error) {
      toast.error('Failed to update role');
    }
  };
  
  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this team member?')) return;
    
    try {
      await organizationAPI.removeMember(userId);
      toast.success('Member removed');
      fetchData();
    } catch (error) {
      toast.error('Failed to remove member');
    }
  };
  
  const handleCreateKey = async (name) => {
    try {
      const { data } = await organizationAPI.createApiKey(name);
      fetchData();
      return data.key;
    } catch (error) {
      toast.error('Failed to create API key');
      return null;
    }
  };
  
  const handleRevokeKey = async (keyId) => {
    if (!window.confirm('Revoke this API key? This action cannot be undone.')) return;
    
    try {
      await organizationAPI.revokeApiKey(keyId);
      toast.success('API key revoked');
      fetchData();
    } catch (error) {
      toast.error('Failed to revoke key');
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Team</h1>
          <p className="text-slate-400 mt-1">Manage your organization and team members</p>
        </div>
        
        {isAdmin() && (
          <button onClick={() => setShowInviteModal(true)} className="btn-primary">
            <UserPlus className="w-5 h-5 mr-2" />
            Invite Member
          </button>
        )}
      </div>
      
      {/* Organization Info */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-white">
              {organization?.name || 'Organization'}
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="badge-primary capitalize">{organization?.plan || 'starter'} plan</span>
              <span className="text-sm text-slate-500">
                {team.length} team member{team.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Team Members */}
      <div className="glass-card">
        <div className="p-6 border-b border-white/10">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-400" />
            Team Members
          </h3>
        </div>
        
        <div className="p-4 space-y-2">
          {team.map((member) => (
            <TeamMemberRow
              key={member.id}
              member={member}
              currentUserId={user?.id}
              isAdmin={isAdmin()}
              onUpdateRole={handleUpdateRole}
              onRemove={handleRemoveMember}
            />
          ))}
        </div>
      </div>
      
      {/* API Keys */}
      <div className="glass-card">
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-slate-400" />
            API Keys
          </h3>
          
          {isAdmin() && (
            <button
              onClick={() => setShowKeyModal(true)}
              className="btn-secondary text-sm"
            >
              Create Key
            </button>
          )}
        </div>
        
        <div className="p-4 space-y-3">
          {apiKeys.length === 0 ? (
            <div className="text-center py-8">
              <Key className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No API keys yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Create an API key to integrate with external services
              </p>
            </div>
          ) : (
            apiKeys.map((key) => (
              <ApiKeyRow key={key.id} apiKey={key} onRevoke={handleRevokeKey} />
            ))
          )}
        </div>
      </div>
      
      {/* Modals */}
      <AnimatePresence>
        {showInviteModal && (
          <InviteModal onInvite={handleInvite} onClose={() => setShowInviteModal(false)} />
        )}
        {showKeyModal && (
          <CreateKeyModal onCreate={handleCreateKey} onClose={() => setShowKeyModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Team;
