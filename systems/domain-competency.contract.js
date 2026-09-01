// =====================================================
// FOUNDEROS
// DOMAIN COMPETENCY CONTRACT v1
//
// Responsibility:
// Own exact domain-specific competency keys and display labels.
// This contract validates references; it never infers them from prose.
// =====================================================

const DomainCompetencyContract = {
  version: "1.0.0",

  CAMPING_SALES_DOMAIN: "camping.sales",

  campingSalesCompetencies: Object.freeze([
    Object.freeze({ key: "rapport", label: "Rapport" }),
    Object.freeze({ key: "discovery", label: "Discovery" }),
    Object.freeze({ key: "product-selection", label: "Product Selection" }),
    Object.freeze({ key: "presentation", label: "Presentation" }),
    Object.freeze({ key: "objection-handling", label: "Objection Handling" }),
    Object.freeze({ key: "trial-close", label: "Trial Close" }),
  ]),

  getDomainCompetencies(domain = null) {
    if (domain !== this.CAMPING_SALES_DOMAIN) return [];
    return this.campingSalesCompetencies.map((entry) => ({ ...entry }));
  },

  isCanonicalDomainCompetency(domain = null, competency = null) {
    return (
      domain === this.CAMPING_SALES_DOMAIN &&
      typeof competency === "string" &&
      this.campingSalesCompetencies.some((entry) => entry.key === competency)
    );
  },

  getDomainCompetencyLabel(domain = null, competency = null) {
    if (domain !== this.CAMPING_SALES_DOMAIN) return null;
    const match = this.campingSalesCompetencies.find(
      (entry) => entry.key === competency,
    );
    return match ? match.label : null;
  },

  validateDomainCompetencyReference(reference = null) {
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
      return { valid: false, reason: "invalid-domain-competency-reference" };
    }
    if (reference.domain !== this.CAMPING_SALES_DOMAIN) {
      return { valid: false, reason: "unknown-competency-domain" };
    }
    if (!this.isCanonicalDomainCompetency(reference.domain, reference.competency)) {
      return { valid: false, reason: "invalid-domain-competency" };
    }
    return {
      valid: true,
      reference: {
        domain: reference.domain,
        competency: reference.competency,
      },
    };
  },
};

Object.freeze(DomainCompetencyContract);
