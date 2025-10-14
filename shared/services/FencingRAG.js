const { SherpaPromptRAG } = require('./SherpaPromptRAG');

console.warn('⚠️ FencingRAG is deprecated. Use SherpaPromptRAG instead.');

/**
 * Backward compatibility wrapper for FencingRAG
 * @deprecated Use SherpaPromptRAG instead
 */
class FencingRAG extends SherpaPromptRAG {
  constructor() {
    super();
    console.warn('⚠️ Please update imports to use SherpaPromptRAG');
  }
}

module.exports = { FencingRAG, SherpaPromptRAG };
