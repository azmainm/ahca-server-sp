/**
 * Formatter Service for Estimator
 * 
 * Converts the final JSON estimate into a readable, well-formatted paragraph-style
 * output with proper spacing, numbering, and organization for client display.
 */

class FormatterService {
  constructor() {
    // Configuration for formatting
    this.config = {
      currency: 'USD',
      currencySymbol: '$',
      dateFormat: 'en-US'
    };
  }

  /**
   * Format currency amount
   * @param {number} amount - Amount to format
   * @returns {string} Formatted currency string
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.config.currency
    }).format(amount || 0);
  }

  /**
   * Format date string
   * @param {string} dateString - Date string to format
   * @returns {string} Formatted date
   */
  formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString(this.config.dateFormat, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  }

  /**
   * Format line item details
   * @param {Object} item - Line item object
   * @param {number} index - Item index for numbering
   * @returns {string} Formatted line item string
   */
  formatLineItem(item, index) {
    const itemNumber = index + 1;
    let formatted = `${itemNumber}. ${item.name}\n`;
    
    // Add quantity and unit
    if (item.quantity && item.unit) {
      formatted += `   Quantity: ${item.quantity} ${item.unit}\n`;
    }

    // Add labor hours if applicable
    if (item.type === 'labor' && item.labor_hours?.most_likely) {
      formatted += `   Labor Hours: ${item.labor_hours.most_likely} hours\n`;
    }

    // Add waste percentage if applicable
    if (item.waste_percent && item.waste_percent > 0) {
      const wastePercent = item.waste_percent > 1 ? item.waste_percent : item.waste_percent * 100;
      formatted += `   Waste Factor: ${wastePercent}%\n`;
    }

    // Add pricing information
    if (item.pricing) {
      if (item.pricing.unit_price) {
        formatted += `   Unit Price: ${this.formatCurrency(item.pricing.unit_price)} per ${item.unit}\n`;
      }
      if (item.pricing.hourly_rate) {
        formatted += `   Hourly Rate: ${this.formatCurrency(item.pricing.hourly_rate)} per hour\n`;
      }
      if (item.pricing.source) {
        const source = item.pricing.source === 'catalog' ? 'Catalog' : 'Estimated';
        formatted += `   Pricing Source: ${source}\n`;
      }
    }

    // Add line total
    if (item.line_total !== undefined) {
      formatted += `   Line Total: ${this.formatCurrency(item.line_total)}\n`;
    }

    // Add confidence and notes if available
    if (item.confidence?.extraction) {
      const confidence = Math.round(item.confidence.extraction * 100);
      formatted += `   Confidence: ${confidence}%\n`;
    }

    if (item.notes) {
      formatted += `   Notes: ${item.notes}\n`;
    }

    return formatted;
  }

  /**
   * Format project metadata
   * @param {Object} projectMeta - Project metadata object
   * @returns {string} Formatted project metadata
   */
  formatProjectMeta(projectMeta) {
    if (!projectMeta) return '';

    let formatted = 'PROJECT INFORMATION\n';
    formatted += '==================\n';

    if (projectMeta.region) {
      formatted += `Region: ${projectMeta.region}\n`;
    }

    if (projectMeta.currency) {
      formatted += `Currency: ${projectMeta.currency}\n`;
    }

    if (projectMeta.estimator_id) {
      formatted += `Estimator ID: ${projectMeta.estimator_id}\n`;
    }

    formatted += `Generated: ${this.formatDate(new Date().toISOString())}\n\n`;

    return formatted;
  }

  /**
   * Format totals section
   * @param {Object} totals - Totals object
   * @returns {string} Formatted totals section
   */
  formatTotals(totals) {
    if (!totals) return '';

    let formatted = '\nPROJECT TOTALS\n';
    formatted += '==============\n';

    if (totals.subtotal !== undefined) {
      formatted += `Subtotal: ${this.formatCurrency(totals.subtotal)}\n`;
    }

    if (totals.tax_total !== undefined) {
      formatted += `Tax (8.75%): ${this.formatCurrency(totals.tax_total)}\n`;
    }

    if (totals.grand_total !== undefined) {
      formatted += `GRAND TOTAL: ${this.formatCurrency(totals.grand_total)}\n`;
    }

    return formatted;
  }

  /**
   * Format line items section
   * @param {Array} lineItems - Array of line items
   * @returns {string} Formatted line items section
   */
  formatLineItems(lineItems) {
    if (!lineItems || lineItems.length === 0) {
      return '\nLINE ITEMS\n==========\nNo items found.\n';
    }

    let formatted = '\nLINE ITEMS\n==========\n';

    // Group items by type for better organization
    const groupedItems = {
      assembly: [],
      material: [],
      labor: [],
      extra: []
    };

    lineItems.forEach(item => {
      const type = item.type || 'material';
      if (groupedItems[type]) {
        groupedItems[type].push(item);
      } else {
        groupedItems.material.push(item);
      }
    });

    let itemIndex = 0;

    // Format each group
    const groupTitles = {
      assembly: 'ASSEMBLIES & SYSTEMS',
      material: 'MATERIALS',
      labor: 'LABOR',
      extra: 'ADDITIONAL SERVICES'
    };

    Object.keys(groupedItems).forEach(type => {
      const items = groupedItems[type];
      if (items.length > 0) {
        formatted += `\n${groupTitles[type]}\n`;
        formatted += '-'.repeat(groupTitles[type].length) + '\n';
        
        items.forEach(item => {
          formatted += this.formatLineItem(item, itemIndex);
          formatted += '\n';
          itemIndex++;
        });
      }
    });

    return formatted;
  }

  /**
   * Format complete estimate into readable paragraph format
   * @param {Object} estimate - Complete estimate object
   * @returns {string} Formatted estimate string
   */
  formatEstimate(estimate) {
    console.log('📝 [FORMATTER] Starting estimate formatting...');

    if (!estimate) {
      return 'Error: No estimate data provided.';
    }

    let formatted = '';

    // Header
    formatted += 'SERVICE ESTIMATE\n';
    formatted += '================\n\n';

    // Project metadata
    if (estimate.project_meta) {
      formatted += this.formatProjectMeta(estimate.project_meta);
    }

    // Line items
    if (estimate.line_items) {
      formatted += this.formatLineItems(estimate.line_items);
    }

    // Totals
    if (estimate.totals) {
      formatted += this.formatTotals(estimate.totals);
    }

    // Footer
    formatted += '\n' + '='.repeat(50) + '\n';
    formatted += 'This estimate is based on current catalog pricing and\n';
    formatted += 'may be subject to change based on actual project conditions,\n';
    formatted += 'material/service availability, and project specifications.\n';
    formatted += '\nFor questions or clarifications, please contact our\n';
    formatted += 'estimating department.\n';

    console.log('✅ [FORMATTER] Estimate formatting completed');
    console.log(`📏 [FORMATTER] Formatted length: ${formatted.length} characters`);

    return formatted;
  }

  /**
   * Format estimate with custom options
   * @param {Object} estimate - Complete estimate object
   * @param {Object} options - Formatting options
   * @returns {string} Formatted estimate string
   */
  formatEstimateWithOptions(estimate, options = {}) {
    // Update configuration with custom options
    if (options.currency) this.config.currency = options.currency;
    if (options.currencySymbol) this.config.currencySymbol = options.currencySymbol;
    if (options.dateFormat) this.config.dateFormat = options.dateFormat;

    return this.formatEstimate(estimate);
  }
}

module.exports = FormatterService;
