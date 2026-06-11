'use strict';

window.PanoramaModel = {
  getCapabilityStageIds(capability, selectedDomainId = 'all') {
    const stageIds = new Set();
    BLMShared.documentQueries.capabilityProcesses(capability, S.doc)
      .filter((proc) => !selectedDomainId || selectedDomainId === 'all' || itemMatchesBusinessDomain(proc, selectedDomainId, S.doc))
      .forEach((proc) => {
        const procId = getProcessIdentity(proc);
        getProcessStageRefs(procId, S.doc).forEach((ref) => {
          if (ref.stageUid) stageIds.add(ref.stageUid);
        });
        if (proc.stageUid) stageIds.add(proc.stageUid);
      });
    return stageIds;
  },

  build(selectedDomainId = 'all') {
    const allStages = BLMShared.documentQueries.stages(S.doc).filter((stage) => !stage.virtual);
    const stages = allStages.filter((stage) => (
      !selectedDomainId || selectedDomainId === 'all' || itemMatchesBusinessDomain(stage, selectedDomainId, S.doc)
    ));
    const valueStreams = BLMShared.documentQueries.valueStreams(S.doc)
      .filter((stream) => !stages.length || stages.some((stage) => getStageValueStreamId(stage) === stream.id));
    const allDomains = BLMShared.documentQueries.businessDomains(S.doc);
    const domains = selectedDomainId && selectedDomainId !== 'all'
      ? allDomains.filter((domain) => domain.id === selectedDomainId || _domainAliases(domain).includes(selectedDomainId))
      : allDomains;
    const activeCapabilityId = String(S.ui.panoramaCapabilityId || '').trim();
    const activeCapability = activeCapabilityId
      ? BLMShared.documentQueries.capabilities(S.doc).find((capability) => (
        String(capability.id || capability.name || '') === activeCapabilityId
        || String(capability.name || '') === activeCapabilityId
      ))
      : null;
    const activeStageIds = activeCapability ? this.getCapabilityStageIds(activeCapability, selectedDomainId) : new Set();

    const capabilityItems = BLMShared.documentQueries.capabilities(S.doc);
    const capabilities = collectDomainSubDomainItems(selectedDomainId).map((summary) => {
      const source = capabilityItems.find((capability) => (
        String(capability.id || capability.name || '') === String(summary.id || summary.name || '')
        || String(capability.name || '') === String(summary.name || '')
      )) || {};
      const constructs = typeof getCapabilityConstructs === 'function' ? getCapabilityConstructs(source, S.doc) : [];
      return {
        ...summary,
        constructs: constructs.map((construct) => ({
          id: construct.uid || construct.id || construct.name || '',
          name: construct.name || construct.uid || construct.id || '',
        })).filter((construct) => construct.name),
      };
    });

    return {
      selectedDomainId,
      stages,
      valueStreams,
      domains: domains.length ? domains : [{ id: 'all', name: '全部业务域' }],
      capabilities,
      activeCapabilityId,
      activeCapability,
      activeStageIds,
    };
  },
};
