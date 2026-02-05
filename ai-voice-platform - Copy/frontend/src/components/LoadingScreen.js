/**
 * Loading Screen Component
 * Full-screen loading state with animation
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

const LoadingScreen = () => {
  return (
    <div className="fixed inset-0 bg-slate-950 flex items-center justify-center z-50">
      {/* Background mesh */}
      <div className="absolute inset-0 bg-mesh opacity-50" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative flex flex-col items-center"
      >
        {/* Logo with glow */}
        <div className="relative">
          <motion.div
            animate={{ 
              scale: [1, 1.1, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{ 
              duration: 2, 
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute inset-0 bg-primary-500 rounded-2xl blur-2xl"
          />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center">
            <Zap className="w-8 h-8 text-white" />
          </div>
        </div>
        
        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 text-center"
        >
          <h1 className="text-xl font-display font-bold text-white">
            VoiceAI
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Loading...
          </p>
        </motion.div>
        
        {/* Loading bar */}
        <div className="mt-8 w-48 h-1 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="h-full w-1/2 bg-gradient-to-r from-transparent via-primary-500 to-transparent"
          />
        </div>
      </motion.div>
    </div>
  );
};

export default LoadingScreen;
