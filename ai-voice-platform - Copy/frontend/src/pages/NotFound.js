/**
 * 404 Not Found Page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, ArrowLeft, Search } from 'lucide-react';

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-slate-950">
      <div className="absolute inset-0 bg-mesh opacity-50" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative text-center max-w-md"
      >
        {/* 404 */}
        <div className="mb-8">
          <h1 className="text-8xl font-display font-bold text-gradient">404</h1>
        </div>
        
        {/* Message */}
        <h2 className="text-2xl font-display font-bold text-white mb-4">
          Page Not Found
        </h2>
        <p className="text-slate-400 mb-8">
          The page you're looking for doesn't exist or has been moved. 
          Let's get you back on track.
        </p>
        
        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/" className="btn-primary">
            <Home className="w-5 h-5 mr-2" />
            Go to Dashboard
          </Link>
          <button 
            onClick={() => window.history.back()} 
            className="btn-secondary"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Go Back
          </button>
        </div>
        
        {/* Decorative elements */}
        <div className="mt-12 flex justify-center gap-4">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              animate={{
                y: [0, -10, 0],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.3,
              }}
              className="w-2 h-2 rounded-full bg-primary-500"
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
