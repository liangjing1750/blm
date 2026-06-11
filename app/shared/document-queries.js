'use strict';

window.BLMShared = window.BLMShared || {};

window.BLMShared.documentQueries = {
  valueStreams(doc = S.doc) {
    return typeof getValueStreamItems === 'function' ? getValueStreamItems(doc) : [];
  },

  businessDomains(doc = S.doc) {
    return typeof getBusinessDomainItems === 'function' ? getBusinessDomainItems(doc) : [];
  },

  stages(doc = S.doc) {
    return typeof getStageItems === 'function' ? getStageItems(doc) : [];
  },

  capabilities(doc = S.doc) {
    return typeof getCapabilityItems === 'function' ? getCapabilityItems(doc) : [];
  },

  capabilityProcesses(capability, doc = S.doc) {
    return typeof getCapabilityProcesses === 'function' ? getCapabilityProcesses(capability, doc) : [];
  },
};
