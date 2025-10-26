/**
 * TenantContextManager - Manages tenant context per session
 * 
 * This service handles:
 * - Storing business ID per session
 * - Retrieving tenant context for requests
 * - Session cleanup and management
 * - Thread-safe context operations
 */

class TenantContextManager {
  constructor() {
    // Map sessionId -> { businessId, createdAt, lastAccessed }
    this.sessionContexts = new Map();
    
    // Cleanup old sessions every 30 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldSessions();
    }, 30 * 60 * 1000); // 30 minutes
    
    console.log('✅ [TenantContextManager] Initialized with automatic session cleanup');
  }

  /**
   * Set tenant context for a session
   * @param {string} sessionId - Session identifier
   * @param {string} businessId - Business identifier
   */
  setTenantContext(sessionId, businessId) {
    if (!sessionId || !businessId) {
      throw new Error('SessionId and businessId are required');
    }
    
    const context = {
      businessId,
      createdAt: new Date(),
      lastAccessed: new Date()
    };
    
    this.sessionContexts.set(sessionId, context);
    
    console.log(`🏢 [TenantContextManager] Set context: session ${sessionId} -> business ${businessId}`);
  }

  /**
   * Get tenant context for a session
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} Context object with businessId or null if not found
   */
  getTenantContext(sessionId) {
    if (!sessionId) {
      console.warn('⚠️ [TenantContextManager] No sessionId provided to getTenantContext');
      return null;
    }
    
    const context = this.sessionContexts.get(sessionId);
    
    if (context) {
      // Update last accessed time
      context.lastAccessed = new Date();
      
      console.log(`🔍 [TenantContextManager] Retrieved context: session ${sessionId} -> business ${context.businessId}`);
      return {
        businessId: context.businessId,
        createdAt: context.createdAt,
        lastAccessed: context.lastAccessed
      };
    } else {
      console.warn(`⚠️ [TenantContextManager] No context found for session: ${sessionId}`);
      return null;
    }
  }

  /**
   * Get business ID for a session (convenience method)
   * @param {string} sessionId - Session identifier
   * @returns {string|null} Business ID or null if not found
   */
  getBusinessId(sessionId) {
    const context = this.getTenantContext(sessionId);
    return context ? context.businessId : null;
  }

  /**
   * Check if session has tenant context
   * @param {string} sessionId - Session identifier
   * @returns {boolean} True if session has context
   */
  hasContext(sessionId) {
    return this.sessionContexts.has(sessionId);
  }

  /**
   * Remove tenant context for a session
   * @param {string} sessionId - Session identifier
   * @returns {boolean} True if context was removed
   */
  removeTenantContext(sessionId) {
    const removed = this.sessionContexts.delete(sessionId);
    
    if (removed) {
      console.log(`🗑️ [TenantContextManager] Removed context for session: ${sessionId}`);
    } else {
      console.warn(`⚠️ [TenantContextManager] No context to remove for session: ${sessionId}`);
    }
    
    return removed;
  }

  /**
   * Get all active sessions for a business
   * @param {string} businessId - Business identifier
   * @returns {Array<string>} Array of session IDs
   */
  getSessionsForBusiness(businessId) {
    const sessions = [];
    
    for (const [sessionId, context] of this.sessionContexts.entries()) {
      if (context.businessId === businessId) {
        sessions.push(sessionId);
      }
    }
    
    return sessions;
  }

  /**
   * Get statistics about active sessions
   * @returns {Object} Statistics object
   */
  getSessionStats() {
    const stats = {
      totalSessions: this.sessionContexts.size,
      businessBreakdown: {},
      oldestSession: null,
      newestSession: null
    };
    
    let oldestTime = null;
    let newestTime = null;
    
    for (const [sessionId, context] of this.sessionContexts.entries()) {
      // Count sessions per business
      if (!stats.businessBreakdown[context.businessId]) {
        stats.businessBreakdown[context.businessId] = 0;
      }
      stats.businessBreakdown[context.businessId]++;
      
      // Track oldest and newest sessions
      if (!oldestTime || context.createdAt < oldestTime) {
        oldestTime = context.createdAt;
        stats.oldestSession = {
          sessionId,
          businessId: context.businessId,
          createdAt: context.createdAt
        };
      }
      
      if (!newestTime || context.createdAt > newestTime) {
        newestTime = context.createdAt;
        stats.newestSession = {
          sessionId,
          businessId: context.businessId,
          createdAt: context.createdAt
        };
      }
    }
    
    return stats;
  }

  /**
   * Clean up old sessions (older than maxAge)
   * @param {number} maxAge - Maximum age in milliseconds (default: 2 hours)
   * @returns {number} Number of sessions cleaned up
   */
  cleanupOldSessions(maxAge = 2 * 60 * 60 * 1000) { // 2 hours default
    const now = new Date();
    const sessionsToRemove = [];
    
    for (const [sessionId, context] of this.sessionContexts.entries()) {
      const age = now - context.lastAccessed;
      
      if (age > maxAge) {
        sessionsToRemove.push(sessionId);
      }
    }
    
    // Remove old sessions
    for (const sessionId of sessionsToRemove) {
      this.sessionContexts.delete(sessionId);
    }
    
    if (sessionsToRemove.length > 0) {
      console.log(`🧹 [TenantContextManager] Cleaned up ${sessionsToRemove.length} old sessions`);
    }
    
    return sessionsToRemove.length;
  }

  /**
   * Clear all session contexts (useful for testing or reset)
   */
  clearAllContexts() {
    const count = this.sessionContexts.size;
    this.sessionContexts.clear();
    
    console.log(`🗑️ [TenantContextManager] Cleared all ${count} session contexts`);
  }

  /**
   * Update last accessed time for a session
   * @param {string} sessionId - Session identifier
   */
  touchSession(sessionId) {
    const context = this.sessionContexts.get(sessionId);
    
    if (context) {
      context.lastAccessed = new Date();
    }
  }

  /**
   * Get session age in milliseconds
   * @param {string} sessionId - Session identifier
   * @returns {number|null} Age in milliseconds or null if session not found
   */
  getSessionAge(sessionId) {
    const context = this.sessionContexts.get(sessionId);
    
    if (context) {
      return new Date() - context.createdAt;
    }
    
    return null;
  }

  /**
   * Get time since last access in milliseconds
   * @param {string} sessionId - Session identifier
   * @returns {number|null} Time since last access or null if session not found
   */
  getTimeSinceLastAccess(sessionId) {
    const context = this.sessionContexts.get(sessionId);
    
    if (context) {
      return new Date() - context.lastAccessed;
    }
    
    return null;
  }

  /**
   * Shutdown the context manager and cleanup resources
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.clearAllContexts();
    console.log('🛑 [TenantContextManager] Shutdown complete');
  }
}

module.exports = { TenantContextManager };
