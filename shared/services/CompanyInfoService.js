/**
 * Company Information Service with hardcoded fallback data
 * Ensures company info is always available even if knowledge base fails
 */
class CompanyInfoService {
  constructor() {
    // Hardcoded company information as fallback
    this.fallbackCompanyInfo = {
      name: "SherpaPrompt",
      tagline: "Conversations into Outcomes",
      established: "2018",
      phone: "(555) 123-4567",
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
        return `You can reach us at ${this.fallbackCompanyInfo.phone}. We're available ${this.fallbackCompanyInfo.hours.monday_friday} Monday through Friday, and ${this.fallbackCompanyInfo.hours.saturday} on Saturday. We also provide ${this.fallbackCompanyInfo.hours.emergency}.`;
      }

      // Email information
      if (this.isEmailQuery(queryLower)) {
        return `Our email address is ${this.fallbackCompanyInfo.email}. You can also call us at ${this.fallbackCompanyInfo.phone} for immediate assistance.`;
      }

      // Address/location information
      if (this.isAddressQuery(queryLower)) {
        return `We're located at ${this.fallbackCompanyInfo.address}. We serve the ${this.fallbackCompanyInfo.service_areas.join(', ')} areas.`;
      }

      // Service areas
      if (this.isServiceAreaQuery(queryLower)) {
        return `We proudly serve ${this.fallbackCompanyInfo.service_areas.join(', ')}. Call us at ${this.fallbackCompanyInfo.phone} to confirm we service your specific area.`;
      }

      // Business hours
      if (this.isHoursQuery(queryLower)) {
        return `Our business hours are: Monday-Friday ${this.fallbackCompanyInfo.hours.monday_friday}, Saturday ${this.fallbackCompanyInfo.hours.saturday}, and we're ${this.fallbackCompanyInfo.hours.sunday} on Sunday. We also offer ${this.fallbackCompanyInfo.hours.emergency}.`;
      }

      // Website information
      if (this.isWebsiteQuery(queryLower)) {
        return `You can visit our website at ${this.fallbackCompanyInfo.website} for more information, or call us directly at ${this.fallbackCompanyInfo.phone}.`;
      }

      // Company name/general info
      if (this.isCompanyNameQuery(queryLower)) {
        return `We are ${this.fallbackCompanyInfo.name}, ${this.fallbackCompanyInfo.tagline}. Established in ${this.fallbackCompanyInfo.established}, we serve the Denver metro area. You can reach us at ${this.fallbackCompanyInfo.phone}.`;
      }

      // General company information
      if (this.isGeneralInfoQuery(queryLower)) {
        return `${this.fallbackCompanyInfo.name} - ${this.fallbackCompanyInfo.tagline}. We've been serving the Denver area since ${this.fallbackCompanyInfo.established}. Contact us at ${this.fallbackCompanyInfo.phone} or ${this.fallbackCompanyInfo.email}. Our office is located at ${this.fallbackCompanyInfo.address}.`;
      }

      // Default: provide contact information
      return `For all inquiries, you can reach ${this.fallbackCompanyInfo.name} at ${this.fallbackCompanyInfo.phone} or email us at ${this.fallbackCompanyInfo.email}. We're here to help with all your automation needs!`;

    } catch (error) {
      console.error('Error getting company info:', error);
      // Ultimate fallback
      return `You can reach SherpaPrompt at (555) 123-4567 for all your automation needs.`;
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
    return { ...this.fallbackCompanyInfo };
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
