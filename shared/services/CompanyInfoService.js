/**
 * Multi-Tenant Company Information Service
 * Loads company info from business configuration instead of hardcoded data
 */
class CompanyInfoService {
  constructor(companyInfo = null) {
    // Use business-specific company information if provided
    if (companyInfo) {
      this.companyInfo = companyInfo;
      console.log(`🏢 [CompanyInfoService] Configured for business: ${companyInfo.name}`);
    } else {
      // Fallback to default SherpaPrompt info (backward compatibility)
      this.companyInfo = {
        name: "SherpaPrompt",
        tagline: "Conversations into Outcomes",
        established: "2018",
        phone: "5035501817",
        email: "doug@sherpaprompt.com",
        website: "www.sherpaprompt.com",
        address: "1234 Automation Way, San Francisco, CA 94105",
        service_areas: ["Global", "Remote", "Cloud-based"],
        hours: {
          monday_friday: "7:00 AM - 6:00 PM",
          saturday: "8:00 AM - 4:00 PM",
          sunday: "Closed",
          support: "24/7 technical support available"
        }
      };
      console.log('⚠️ [CompanyInfoService] No company info provided, using default SherpaPrompt info');
    }
  }

  /**
   * Create a new CompanyInfoService instance for a specific business
   * @param {Object} companyInfo - Company information from business config
   * @returns {CompanyInfoService} New instance configured for the business
   */
  static createForBusiness(companyInfo) {
    if (!companyInfo) {
      throw new Error('Company information is required');
    }
    
    const requiredFields = ['name', 'phone', 'email'];
    for (const field of requiredFields) {
      if (!companyInfo[field]) {
        throw new Error(`Missing required company info field: ${field}`);
      }
    }
    
    return new CompanyInfoService(companyInfo);
  }

  /**
   * Get company information based on query type
   * @param {string} query - User's query about company info
   * @returns {string} Formatted response with company information
   */
  getCompanyInfo(query) {
    const queryLower = query.toLowerCase();

    try {
      // Phone/contact information
      if (this.isPhoneQuery(queryLower)) {
        return `You can reach us at ${this.companyInfo.phone}. We're available ${this.companyInfo.hours.monday_friday} Monday through Friday, and ${this.companyInfo.hours.saturday} on Saturday. We also provide ${this.companyInfo.hours.support}.`;
      }

      // Email information
      if (this.isEmailQuery(queryLower)) {
        return `Our email address is ${this.companyInfo.email}. You can also call us at ${this.companyInfo.phone} for immediate assistance.`;
      }

      // Address/location information
      if (this.isAddressQuery(queryLower)) {
        return `We're located at ${this.companyInfo.address}. We serve the ${this.companyInfo.service_areas.join(', ')} areas.`;
      }

      // Service areas
      if (this.isServiceAreaQuery(queryLower)) {
        return `We proudly serve ${this.companyInfo.service_areas.join(', ')}. Call us at ${this.companyInfo.phone} to confirm we service your specific area.`;
      }

      // Business hours
      if (this.isHoursQuery(queryLower)) {
        return `Our business hours are: Monday-Friday ${this.companyInfo.hours.monday_friday}, Saturday ${this.companyInfo.hours.saturday}, and we're ${this.companyInfo.hours.sunday} on Sunday. We also offer ${this.companyInfo.hours.support}.`;
      }

      // Website information
      if (this.isWebsiteQuery(queryLower)) {
        return `You can visit our website at ${this.companyInfo.website} for more information, or call us directly at ${this.companyInfo.phone}.`;
      }

      // Company name/general info
      if (this.isCompanyNameQuery(queryLower)) {
        return `We are ${this.companyInfo.name}, ${this.companyInfo.tagline}. Established in ${this.companyInfo.established}, we serve the Denver metro area. You can reach us at ${this.companyInfo.phone}.`;
      }

      // General company information
      if (this.isGeneralInfoQuery(queryLower)) {
        return `${this.companyInfo.name} - ${this.companyInfo.tagline}. We've been serving the Denver area since ${this.companyInfo.established}. Contact us at ${this.companyInfo.phone} or ${this.companyInfo.email}. Our office is located at ${this.companyInfo.address}.`;
      }

      // Default: provide contact information
      return `For all inquiries, you can reach ${this.companyInfo.name} at ${this.companyInfo.phone} or email us at ${this.companyInfo.email}. We're here to help with all your automation needs!`;

    } catch (error) {
      console.error('Error getting company info:', error);
      // Ultimate fallback
      return `You can reach SherpaPrompt at 5035501817 for all your automation needs.`;
    }
  }

  /**
   * Check if query is asking for phone number
   */
  isPhoneQuery(query) {
    const phoneKeywords = ['phone', 'number', 'call', 'telephone', 'contact number', 'reach you'];
    return phoneKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is asking for email
   */
  isEmailQuery(query) {
    const emailKeywords = ['email', 'mail', 'email address', 'contact email'];
    return emailKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is asking for address/location
   */
  isAddressQuery(query) {
    const addressKeywords = ['address', 'location', 'where located', 'where are you', 'office', 'building'];
    return addressKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is asking for service areas
   */
  isServiceAreaQuery(query) {
    const areaKeywords = ['service area', 'areas you serve', 'do you serve', 'work in', 'cover', 'serve my area'];
    return areaKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is asking for business hours
   */
  isHoursQuery(query) {
    const hoursKeywords = ['hours', 'open', 'closed', 'business hours', 'when open', 'operating hours', 'schedule'];
    return hoursKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is asking for website
   */
  isWebsiteQuery(query) {
    const websiteKeywords = ['website', 'site', 'web', 'online', 'url'];
    return websiteKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is asking for company name
   */
  isCompanyNameQuery(query) {
    const nameKeywords = ['company name', 'business name', 'who are you', 'your name', 'what company'];
    return nameKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Check if query is asking for general company information
   */
  isGeneralInfoQuery(query) {
    const generalKeywords = ['company info', 'about you', 'about your company', 'tell me about', 'company details'];
    return generalKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Get raw company data (for use by other services)
   */
  getRawCompanyData() {
    return { ...this.companyInfo };
  }

  /**
   * Get the business name
   * @returns {string} Business name
   */
  getBusinessName() {
    return this.companyInfo.name;
  }

  /**
   * Get the business phone number
   * @returns {string} Phone number
   */
  getPhoneNumber() {
    return this.companyInfo.phone;
  }

  /**
   * Get the business email
   * @returns {string} Email address
   */
  getEmailAddress() {
    return this.companyInfo.email;
  }

  /**
   * Check if a query is related to company information
   */
  isCompanyInfoQuery(query) {
    const queryLower = query.toLowerCase();
    return this.isPhoneQuery(queryLower) || 
           this.isEmailQuery(queryLower) || 
           this.isAddressQuery(queryLower) || 
           this.isServiceAreaQuery(queryLower) || 
           this.isHoursQuery(queryLower) || 
           this.isWebsiteQuery(queryLower) || 
           this.isCompanyNameQuery(queryLower) || 
           this.isGeneralInfoQuery(queryLower);
  }
}

module.exports = { CompanyInfoService };
