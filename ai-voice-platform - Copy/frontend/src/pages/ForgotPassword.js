/**
 * Forgot Password Page
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, ArrowLeft, Loader2, Mail, CheckCircle } from 'lucide-react';
import useAuthStore from '../stores/authStore';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { forgotPassword, isLoading, error, clearError } = useAuthStore();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    
    const result = await forgotPassword(email);
    if (result.success) {
      setSubmitted(true);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-slate-950">
      <div className="absolute inset-0 bg-mesh opacity-50" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-display font-bold text-white">VoiceAI</h1>
        </div>
        
        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-8 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-display font-bold text-white mb-2">
              Check your email
            </h2>
            <p className="text-slate-400 mb-6">
              We've sent a password reset link to <span className="text-white">{email}</span>
            </p>
            <Link to="/login" className="btn-secondary inline-flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </motion.div>
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-display font-bold text-white mb-2">
                Forgot password?
              </h2>
              <p className="text-slate-400">
                No worries, we'll send you reset instructions.
              </p>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl"
                >
                  <p className="text-sm text-rose-400">{error}</p>
                </motion.div>
              )}
              
              <div>
                <label className="label">Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field pl-12"
                    placeholder="you@company.com"
                    required
                  />
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                </div>
              </div>
              
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
            
            <Link 
              to="/login" 
              className="mt-8 flex items-center justify-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
