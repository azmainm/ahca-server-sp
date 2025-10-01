/**
 * Calculator Service for Estimator
 * 
 * Handles all pricing calculations, catalog lookups, and total computations
 * for any type of service company (construction, plumbing, electrical, etc.).
 * This service takes the raw extracted data from LLM and applies:
 * - Catalog pricing lookup
 * - Waste percentage calculations
 * - Labor hour calculations
 * - Tax calculations
 * - Final totals
 */

const fs = require('fs');
const path = require('path');

class CalculatorService {
  constructor() {
    this.taxRate = 0.0875; // 8.75% tax rate
  }

  /**
   * Load catalog data from file or use custom catalog
   * @param {Object|null} customCatalogData - Custom catalog data if provided
   * @returns {Object|null} Catalog data
   */
  loadCatalog(customCatalogData = null) {
    try {
      if (customCatalogData) {
        console.log('🗂️ [CALCULATOR] Using custom catalog data');
        return customCatalogData;
      }
      
      const catalogPath = path.join(__dirname, '../../../data/catalog.json');
      const catalogData = fs.readFileSync(catalogPath, 'utf8');
      console.log('🗂️ [CALCULATOR] Using default catalog.json');
      return JSON.parse(catalogData);
    } catch (error) {
      console.error('❌ [CALCULATOR] Error loading catalog:', error);
      return null;
    }
  }

  /**
   * Find catalog item by key across all categories
   * @param {Object} catalog - Catalog data
   * @param {string} key - Catalog key to find
   * @returns {Object|null} Catalog item or null if not found
   */
  findCatalogItem(catalog, key) {
    if (!catalog || !key) return null;

    // Search through all categories: materials, labor, assemblies, extras
    const categories = ['materials', 'labor', 'assemblies', 'extras'];
    
    for (const category of categories) {
      if (catalog[category] && catalog[category][key]) {
        const item = { ...catalog[category][key] };
        item.category = category; // Add category info for reference
        return item;
      }
    }
    
    console.warn(`⚠️ [CALCULATOR] Catalog item not found: ${key}`);
    return null;
  }

  /**
   * Apply catalog pricing to a line item
   * @param {Object} lineItem - Line item from estimate
   * @param {Object} catalog - Catalog data
   * @returns {Object} Line item with pricing applied
   */
  applyCatalogPricing(lineItem, catalog) {
    const item = { ...lineItem };
    
    if (!item.catalog_key || !catalog) {
      console.warn('⚠️ [CALCULATOR] No catalog key or catalog data available');
      item.pricing = {
        source: 'llm_average',
        unit_price: 0,
        hourly_rate: 0
      };
      return item;
    }

    const catalogItem = this.findCatalogItem(catalog, item.catalog_key);
    
    if (catalogItem) {
      console.log(`💰 [CALCULATOR] Found catalog item: ${item.catalog_key}`);
      
      item.pricing = {
        source: 'catalog',
        unit_price_effective_date: catalog.metadata?.last_updated || new Date().toISOString().split('T')[0]
      };

      // Apply appropriate pricing based on catalog item type
      if (catalogItem.unit_price !== undefined) {
        item.pricing.unit_price = catalogItem.unit_price;
      }
      
      if (catalogItem.hourly_rate !== undefined) {
        item.pricing.hourly_rate = catalogItem.hourly_rate;
      }

      // Ensure we have the correct name and unit from catalog
      item.name = catalogItem.name;
      item.unit = catalogItem.unit;
      
    } else {
      console.warn(`⚠️ [CALCULATOR] Catalog item not found: ${item.catalog_key}`);
      item.pricing = {
        source: 'llm_average',
        unit_price: 0,
        hourly_rate: 0
      };
    }

    return item;
  }

  /**
   * Calculate line total for a single line item
   * @param {Object} lineItem - Line item with pricing applied
   * @returns {number} Calculated line total
   */
  calculateLineTotal(lineItem) {
    let lineTotal = 0;

    // Normalize waste_percent to decimal if it's a percentage
    let wastePercent = lineItem.waste_percent || 0;
    if (wastePercent > 1) {
      wastePercent = wastePercent / 100;
    }

    const wasteMultiplier = 1 + wastePercent;

    if (lineItem.type === 'labor' && lineItem.labor_hours && lineItem.pricing?.hourly_rate) {
      // Labor calculation: hours * hourly_rate
      const hours = lineItem.labor_hours.most_likely || lineItem.quantity || 0;
      lineTotal = hours * lineItem.pricing.hourly_rate;
      console.log(`🔢 [CALCULATOR] Labor: ${hours} hrs × $${lineItem.pricing.hourly_rate}/hr = $${lineTotal}`);
      
    } else if (lineItem.pricing?.unit_price) {
      // Material/Assembly calculation: quantity * unit_price * (1 + waste)
      lineTotal = lineItem.quantity * lineItem.pricing.unit_price * wasteMultiplier;
      console.log(`🔢 [CALCULATOR] Material/Assembly: ${lineItem.quantity} ${lineItem.unit} × $${lineItem.pricing.unit_price} × ${wasteMultiplier} = $${lineTotal}`);
      
    } else if (lineItem.pricing?.hourly_rate && lineItem.quantity) {
      // Fallback: quantity * hourly_rate (for labor without specific hours)
      lineTotal = lineItem.quantity * lineItem.pricing.hourly_rate;
      console.log(`🔢 [CALCULATOR] Fallback labor: ${lineItem.quantity} × $${lineItem.pricing.hourly_rate} = $${lineTotal}`);
      
    } else {
      console.warn(`⚠️ [CALCULATOR] Cannot calculate total for item: ${lineItem.name} - missing pricing data`);
    }

    return Math.round(lineTotal * 100) / 100; // Round to 2 decimals
  }

  /**
   * Calculate totals for the entire estimate
   * @param {number} subtotal - Subtotal amount
   * @returns {Object} Totals object with subtotal, tax, and grand total
   */
  calculateTotals(subtotal) {
    const taxTotal = subtotal * this.taxRate;
    const grandTotal = subtotal + taxTotal;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax_total: Math.round(taxTotal * 100) / 100,
      grand_total: Math.round(grandTotal * 100) / 100
    };
  }

  /**
   * Process entire estimate: apply pricing and calculate all totals
   * @param {Object} estimate - Raw estimate from LLM
   * @param {Object|null} customCatalogData - Custom catalog data if provided
   * @returns {Object} Processed estimate with pricing and totals
   */
  processEstimate(estimate, customCatalogData = null) {
    console.log('💰 [CALCULATOR] Starting estimate processing...');
    
    const catalog = this.loadCatalog(customCatalogData);
    const processedEstimate = { ...estimate };
    let subtotal = 0;

    // Process each line item
    processedEstimate.line_items = estimate.line_items.map((item, index) => {
      console.log(`🔍 [CALCULATOR] Processing item ${index + 1}: ${item.name}`);
      
      // Apply catalog pricing
      const itemWithPricing = this.applyCatalogPricing(item, catalog);
      
      // Calculate line total
      const lineTotal = this.calculateLineTotal(itemWithPricing);
      itemWithPricing.line_total = lineTotal;
      
      // Add to subtotal
      subtotal += lineTotal;
      
      console.log(`✅ [CALCULATOR] Item ${index + 1} processed: $${lineTotal}`);
      return itemWithPricing;
    });

    // Calculate final totals
    processedEstimate.totals = this.calculateTotals(subtotal);
    
    console.log('💵 [CALCULATOR] Final totals calculated:', {
      subtotal: processedEstimate.totals.subtotal,
      tax: processedEstimate.totals.tax_total,
      grand_total: processedEstimate.totals.grand_total
    });

    console.log('✅ [CALCULATOR] Estimate processing completed');
    return processedEstimate;
  }
}

module.exports = CalculatorService;
