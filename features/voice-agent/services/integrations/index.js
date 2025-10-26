/**
 * Integration Services
 * External service integrations and specialized handlers
 */

const { AppointmentFlowManager } = require('./AppointmentFlowManager');
const { EmergencyCallHandler } = require('./EmergencyCallHandler');

module.exports = {
  AppointmentFlowManager,
  EmergencyCallHandler
};
