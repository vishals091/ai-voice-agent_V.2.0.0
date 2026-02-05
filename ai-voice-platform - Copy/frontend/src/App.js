/**
 * App.js - Enterprise SaaS Voice Platform
 * Main application with routing and authentication
 */

import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';

// Stores
import useAuthStore from './stores/authStore';

// Layout
import Layout from './components/Layout';
import LoadingScreen from './components/LoadingScreen';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import VoiceChat from './pages/VoiceChat';
import Analytics from './pages/Analytics';
import KnowledgeBase from './pages/KnowledgeBase';
import Settings from './pages/Settings';
import Team from './pages/Team';
import NotFound from './pages/NotFound';

// Styles
import './styles/globals.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (!isAuthenticated) {
    // Redirect to login, save intended destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return children;
};

// Public Route (redirect to dashboard if authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (isAuthenticated) {
    // Redirect to intended destination or dashboard
    const from = location.state?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }
  
  return children;
};

// Main App Component
function App() {
  const { initialize, isLoading } = useAuthStore();
  const [initialized, setInitialized] = useState(false);
  
  useEffect(() => {
    const init = async () => {
      await initialize();
      setInitialized(true);
    };
    init();
  }, [initialize]);
  
  if (!initialized || isLoading) {
    return <LoadingScreen />;
  }
  
  return (
    <BrowserRouter>
      {/* Toast Notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1E1B4B',
            color: '#fff',
            borderRadius: '12px',
            border: '1px solid rgba(99, 102, 241, 0.2)',
          },
          success: {
            iconTheme: {
              primary: '#10B981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#F43F5E',
              secondary: '#fff',
            },
          },
        }}
      />
      
      <AnimatePresence mode="wait">
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } />
          
          <Route path="/register" element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          } />
          
          <Route path="/forgot-password" element={
            <PublicRoute>
              <ForgotPassword />
            </PublicRoute>
          } />
          
          <Route path="/reset-password" element={
            <PublicRoute>
              <ResetPassword />
            </PublicRoute>
          } />
          
          {/* Protected Routes with Layout */}
          <Route element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="voice" element={<VoiceChat />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="knowledge" element={<KnowledgeBase />} />
            <Route path="settings" element={<Settings />} />
            <Route path="team" element={<Team />} />
          </Route>
          
          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AnimatePresence>
    </BrowserRouter>
  );
}

export default App;
