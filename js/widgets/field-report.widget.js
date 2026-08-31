// Minimal Field Report widget (v0)
(function () {
  // Respect global objects: MemorySystem, showNotification
  if (typeof window === 'undefined') return;

  const KEY = 'camping.fieldReports';

  function $(id) { return document.getElementById(id); }

  // Simple unique id generator for system ids
  function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random()*10000)}`;
  }

  function isoDateToday() {
    const d = new Date();
    // Use the local calendar date (YYYY-MM-DD) per FIELD_REPORT_SCHEMA_v1
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // PII redaction (emails, phones, VINs)
  function redact(text) {
    if (typeof text !== 'string') return text;
    let out = text;
    // email
    out = out.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\.[a-zA-Z]{2,}/g, '[redacted-email]');
    // phone simple patterns
    out = out.replace(/(?:(?:\+?\d{1,3}[\s-]?)?(?:\(\d{3}\)|\d{3})[\s-]?\d{3}[\s-]?\d{4})/g, '[redacted-phone]');
    // VIN-like 17 char (basic)
    out = out.replace(/\b([A-HJ-NPR-Z0-9]{17})\b/g, '[redacted-vehicle-id]');
    return out;
  }

  // convert comma-separated input to trimmed array, ignoring empty
  function csvToArray(s) {
    if (!s) return [];
    return s.split(',').map(x=>redact(x).trim()).filter(Boolean);
  }

  function safeUnitReference(value) {
    const sanitized = redact(typeof value === 'string' ? value : '').trim();
    if (!sanitized || /\[redacted-(?:email|phone|vehicle-id)\]/.test(sanitized)) {
      return '';
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._\/-]{0,63}$/.test(sanitized)) return '';
    return sanitized;
  }

  function safePresentationReference(value) {
    return safeUnitReference(value);
  }

  // Create a compact interaction block DOM
  function createInteractionNode(idx) {
    const wrap = document.createElement('div');
    wrap.className = 'fr-interaction-block';
    wrap.style.border = '1px solid #eee';
    wrap.style.padding = '8px';
    wrap.style.marginTop = '6px';
    wrap.dataset.index = idx;

    wrap.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
        <strong>Interaction ${idx+1}</strong>
        <button type="button" class="fr-remove-interaction" style="font-size:12px;">Remove</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
        <input class="fr-buyerContext" type="text" placeholder="Buyer Context (e.g. First-time family with toddler)" />
        <input class="fr-customerGoal" type="text" placeholder="Customer Goal" />
        <input class="fr-keyNeeds" type="text" placeholder="Key Needs (comma-separated)" />
        <input class="fr-hotButtons" type="text" placeholder="Hot Buttons (comma-separated)" />
        <input class="fr-objections" type="text" placeholder="Objections (comma-separated)" />
        <input class="fr-notableMoment" type="text" placeholder="Notable Moment" />
      </div>
      <div class="fr-rapport-outcome-capture" style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
        <label><input class="fr-rapport-referenced-back" type="checkbox" /> Did you reference customer-provided context back during this interaction?</label>
        <label class="fr-rapport-context-field" hidden>
          Non-sensitive context the customer provided
          <select class="fr-rapport-context-category">
            <option value="">Select a category</option>
            <option value="travel-companions">Travel companions</option>
            <option value="pets">Pets</option>
            <option value="destination">Destination</option>
            <option value="hobby">Hobby</option>
            <option value="prior-rv-experience">Prior RV experience</option>
            <option value="trip-style">Trip style</option>
            <option value="non-sensitive-preference">Non-sensitive preference</option>
          </select>
        </label>
      </div>
      <div class="fr-objection-outcome-capture" style="display:flex;flex-direction:column;gap:6px;margin-top:6px;" hidden>
        <label><input class="fr-objection-handling-performed" type="checkbox" /> Did you handle the objection?</label>
        <label class="fr-objection-result-field" hidden>
          What happened with the customer's concern?
          <select class="fr-objection-handling-result">
            <option value="">Select a result</option>
            <option value="customer-concern-resolved">Resolved</option>
            <option value="customer-concern-partially-resolved">Partially resolved</option>
            <option value="customer-concern-unresolved">Unresolved</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
      </div>
      <div class="fr-trial-close-outcome-capture" style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
        <label><input class="fr-trial-close-performed" type="checkbox" /> Did you perform a Trial Close?</label>
        <label class="fr-trial-close-result-field" hidden>
          What did the customer indicate?
          <select class="fr-trial-close-result">
            <option value="">Select a response</option>
            <option value="customer-expressed-readiness-to-proceed">Ready to proceed</option>
            <option value="customer-expressed-not-ready-to-proceed">Not ready to proceed</option>
            <option value="customer-declined-to-proceed">Declined to proceed</option>
            <option value="customer-response-unclear">Response unclear</option>
          </select>
        </label>
      </div>
      <div class="fr-discovery-outcome-capture" style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
        <label><input class="fr-discovery-performed" type="checkbox" /> Did you ask purposeful Discovery questions?</label>
        <label class="fr-discovery-result-field" hidden>
          What did the customer share?
          <select class="fr-discovery-result">
            <option value="">Select a response</option>
            <option value="customer-shared-needs-goals">Shared needs and goals</option>
            <option value="customer-shared-limited-information">Shared limited information</option>
            <option value="customer-declined-to-share">Declined to share</option>
            <option value="customer-response-unclear">Response unclear</option>
          </select>
        </label>
      </div>
      <div class="fr-product-selection-outcome-capture" style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
        <label><input class="fr-product-selection-performed" type="checkbox" /> Did you select or recommend an RV based on a recorded customer need?</label>
        <label class="fr-product-selection-need-field" hidden>
          Which recorded need influenced the selection?
          <select class="fr-product-selection-need-ref"><option value="">Select a recorded need</option></select>
        </label>
        <label class="fr-product-selection-unit-field" hidden>
          Selected/recommended RV reference (no VIN or customer information)
          <input class="fr-product-selection-unit-ref" type="text" placeholder="Model or safe unit reference" />
        </label>
        <label class="fr-product-selection-result-field" hidden>
          What happened next?
          <select class="fr-product-selection-result">
            <option value="">Select a response</option>
            <option value="customer-considered-selected-unit">Customer considered the selected unit</option>
            <option value="customer-requested-different-option">Customer requested a different option</option>
            <option value="selected-unit-unavailable">Selected unit unavailable</option>
            <option value="customer-response-unclear">Response unclear</option>
          </select>
        </label>
      </div>
      <div class="fr-presentation-outcome-capture" style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
        <label><input class="fr-presentation-performed" type="checkbox" /> Did you connect an RV feature or benefit to this recorded customer need?</label>
        <label class="fr-presentation-need-field" hidden>
          Which recorded need did you connect it to?
          <select class="fr-presentation-need-ref"><option value="">Select a recorded need</option></select>
        </label>
        <label class="fr-presentation-unit-field" hidden>
          Presented RV reference (no VIN or customer information)
          <input class="fr-presentation-unit-ref" type="text" placeholder="Model or safe unit reference" />
        </label>
        <label class="fr-presentation-reference-field" hidden>
          Feature or benefit presented
          <input class="fr-presentation-reference" type="text" placeholder="Bounded feature or benefit label" />
        </label>
        <label class="fr-presentation-result-field" hidden>
          How did the customer respond?
          <select class="fr-presentation-result">
            <option value="">Select a response</option>
            <option value="customer-considered-presented-feature-benefit">Customer considered the presented feature or benefit</option>
            <option value="customer-requested-more-detail">Customer requested more detail</option>
            <option value="customer-preferred-different-feature-benefit">Customer preferred a different feature or benefit</option>
            <option value="customer-response-unclear">Response unclear</option>
          </select>
        </label>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">
        <label style="font-size:12px;font-weight:bold;">Explicit Strengths:</label>
        <label><input class="fr-explicit-strength" type="checkbox" value="rapport" /> Rapport</label>
        <label><input class="fr-explicit-strength" type="checkbox" value="discovery" /> Discovery</label>
        <label><input class="fr-explicit-strength" type="checkbox" value="product-selection" /> Product Selection</label>
        <label><input class="fr-explicit-strength" type="checkbox" value="presentation" /> Presentation</label>
        <label><input class="fr-explicit-strength" type="checkbox" value="objection-handling" /> Objection Handling</label>
        <label><input class="fr-explicit-strength" type="checkbox" value="trial-close" /> Trial Close</label>
      </div>
    `;

    wrap.querySelector('.fr-remove-interaction').addEventListener('click', ()=>{
      wrap.remove();
    });

    const objectionsInput = wrap.querySelector('.fr-objections');
    const rapportReferencedBackInput = wrap.querySelector('.fr-rapport-referenced-back');
    const rapportContextField = wrap.querySelector('.fr-rapport-context-field');
    const outcomeCapture = wrap.querySelector('.fr-objection-outcome-capture');
    const performedInput = wrap.querySelector('.fr-objection-handling-performed');
    const resultField = wrap.querySelector('.fr-objection-result-field');
    const trialClosePerformedInput = wrap.querySelector('.fr-trial-close-performed');
    const trialCloseResultField = wrap.querySelector('.fr-trial-close-result-field');
    const discoveryPerformedInput = wrap.querySelector('.fr-discovery-performed');
    const discoveryResultField = wrap.querySelector('.fr-discovery-result-field');
    const productSelectionPerformedInput = wrap.querySelector('.fr-product-selection-performed');
    const productSelectionNeedField = wrap.querySelector('.fr-product-selection-need-field');
    const productSelectionNeedRef = wrap.querySelector('.fr-product-selection-need-ref');
    const productSelectionUnitField = wrap.querySelector('.fr-product-selection-unit-field');
    const productSelectionResultField = wrap.querySelector('.fr-product-selection-result-field');
    const presentationPerformedInput = wrap.querySelector('.fr-presentation-performed');
    const presentationNeedField = wrap.querySelector('.fr-presentation-need-field');
    const presentationNeedRef = wrap.querySelector('.fr-presentation-need-ref');
    const presentationUnitField = wrap.querySelector('.fr-presentation-unit-field');
    const presentationReferenceField = wrap.querySelector('.fr-presentation-reference-field');
    const presentationResultField = wrap.querySelector('.fr-presentation-result-field');

    function syncRapportCapture() {
      rapportContextField.hidden = !rapportReferencedBackInput.checked;
    }

    rapportReferencedBackInput.addEventListener('change', syncRapportCapture);
    syncRapportCapture();

    function syncObjectionOutcomeCapture() {
      const hasObjections = csvToArray(objectionsInput.value || '').length > 0;
      outcomeCapture.hidden = !hasObjections;
      resultField.hidden = !hasObjections || !performedInput.checked;
    }

    objectionsInput.addEventListener('input', syncObjectionOutcomeCapture);
    performedInput.addEventListener('change', syncObjectionOutcomeCapture);
    trialClosePerformedInput.addEventListener('change', () => {
      trialCloseResultField.hidden = !trialClosePerformedInput.checked;
    });
    discoveryPerformedInput.addEventListener('change', () => {
      discoveryResultField.hidden = !discoveryPerformedInput.checked;
    });
    function syncProductSelectionCapture() {
      const needs = csvToArray(wrap.querySelector('.fr-keyNeeds').value || '');
      productSelectionNeedRef.innerHTML = '<option value="">Select a recorded need</option>' +
        needs.map((need, index) => `<option value="key-needs-${index}">${need}</option>`).join('');
      const visible = productSelectionPerformedInput.checked;
      productSelectionNeedField.hidden = !visible;
      productSelectionUnitField.hidden = !visible;
      productSelectionResultField.hidden = !visible;
    }
    wrap.querySelector('.fr-keyNeeds').addEventListener('input', syncProductSelectionCapture);
    productSelectionPerformedInput.addEventListener('change', syncProductSelectionCapture);
    syncProductSelectionCapture();
    function syncPresentationCapture() {
      const needs = csvToArray(wrap.querySelector('.fr-keyNeeds').value || '');
      presentationNeedRef.innerHTML = '<option value="">Select a recorded need</option>' +
        needs.map((need, index) => `<option value="key-needs-${index}">${need}</option>`).join('');
      const visible = presentationPerformedInput.checked;
      presentationNeedField.hidden = !visible;
      presentationUnitField.hidden = !visible;
      presentationReferenceField.hidden = !visible;
      presentationResultField.hidden = !visible;
    }
    wrap.querySelector('.fr-keyNeeds').addEventListener('input', syncPresentationCapture);
    presentationPerformedInput.addEventListener('change', syncPresentationCapture);
    syncPresentationCapture();

    return wrap;
  }

  function init() {
    const enter = $('field-report-enter');
    const expanded = document.querySelector('.field-report-expanded');
    const collapsed = document.querySelector('.field-report-collapsed');
    const addBtn = $('fr-add-interaction');
    const interContainer = $('fr-interactions-container');
    const saveBtn = $('fr-save');
    const cancelBtn = $('fr-cancel');
    const feedback = $('fr-feedback');
    const dateEl = $('fr-date');

    if (!enter || !expanded || !collapsed || !addBtn || !saveBtn) return;

    dateEl.value = isoDateToday();

    enter.addEventListener('click', ()=>{
      collapsed.style.display = 'none';
      expanded.style.display = 'block';
    });

    cancelBtn.addEventListener('click', ()=>{
      expanded.style.display = 'none';
      collapsed.style.display = 'block';
      feedback.textContent = '';
    });

    addBtn.addEventListener('click', ()=>{
      const idx = interContainer.children.length;
      interContainer.appendChild(createInteractionNode(idx));
    });

    saveBtn.addEventListener('click', async ()=>{
      feedback.textContent = '';
      try {
        const newReport = buildReport();
        if (!newReport) return;

        // persistence: strictly follow approved container shape
        if (typeof MemorySystem === 'undefined' || typeof MemorySystem.getArtifact !== 'function' || typeof MemorySystem.saveArtifact !== 'function') {
          feedback.textContent = 'MemorySystem unavailable';
          return;
        }

        const container = MemorySystem.getArtifact(KEY);

        const now = new Date().toISOString();

        if (container === null) {
          // create new container
          const artifact = {
            type: KEY,
            reports: [ newReport ],
            createdAt: now,
            updatedAt: now
          };

          MemorySystem.saveArtifact(artifact);
          showNotification && typeof showNotification === 'function' && showNotification('Field Report saved', {
            buttonLabel: 'Confirm',
            beginBriefing: false
          });
          // reset
          $('field-report-form').reset();
          interContainer.innerHTML = '';
          expanded.style.display = 'none';
          collapsed.style.display = 'block';
          return;
        }

        // If container exists, it MUST be the approved shape
        if (!Array.isArray(container.reports)) {
          feedback.textContent = 'Existing camping.fieldReports artifact has invalid shape (missing reports[]). Save aborted.';
          return;
        }

        const updated = {
          ...container,
          reports: container.reports.concat([newReport]),
          updatedAt: now
        };

        MemorySystem.saveArtifact(updated);
        showNotification && typeof showNotification === 'function' && showNotification('Field Report saved', {
          buttonLabel: 'Confirm',
          beginBriefing: false
        });

        // reset
        $('field-report-form').reset();
        interContainer.innerHTML = '';
        expanded.style.display = 'none';
        collapsed.style.display = 'block';
      } catch (e) {
        feedback.textContent = 'Save failed';
        console.error('Field Report save error', e);
      }
    });
  }

  function buildReport() {
    // gather values
    const date = $('fr-date').value || isoDateToday();
    const dailyWin = redact($('fr-dailyWin').value || '').trim();
    const keyLearning = redact($('fr-keyLearning').value || '').trim();
    const biggestChallenge = redact($('fr-biggestChallenge').value || '').trim();
    const nextFocus = redact($('fr-nextFocus').value || '').trim();
    const notes = redact($('fr-notes').value || '').trim();
    const captureBayText = redact($('fr-capturebay').value || '').trim();

    // interactions
    const interNodes = Array.from(document.querySelectorAll('.fr-interaction-block'));
    const interactions = interNodes.map((n)=>{
      const buyerContext = redact(n.querySelector('.fr-buyerContext').value || '').trim();
      const customerGoal = redact(n.querySelector('.fr-customerGoal').value || '').trim();
      const keyNeeds = csvToArray(n.querySelector('.fr-keyNeeds').value || '');
      const hotButtons = csvToArray(n.querySelector('.fr-hotButtons').value || '');
      const objections = csvToArray(n.querySelector('.fr-objections').value || '');
      const notableMoment = redact(n.querySelector('.fr-notableMoment').value || '').trim();
      const selectedRapportContextCategory =
        n.querySelector('.fr-rapport-context-category')?.value || '';
      const referencedRapportContext = Boolean(
        n.querySelector('.fr-rapport-referenced-back')?.checked
      );
      const canonicalRapportContextCategories = new Set([
        'travel-companions',
        'pets',
        'destination',
        'hobby',
        'prior-rv-experience',
        'trip-style',
        'non-sensitive-preference'
      ]);
      const rapportOutcomes =
        referencedRapportContext &&
        canonicalRapportContextCategories.has(selectedRapportContextCategory)
          ? [{
              id: makeId('sales_step_outcome'),
              step: 'rapport',
              performedBy: 'commander',
              action: 'referenced-back-to-customer-context',
              customerContextRef: {
                type: 'customer-context-category',
                category: selectedRapportContextCategory
              }
            }]
          : [];
      const performedObjectionHandling = Boolean(
        n.querySelector('.fr-objection-handling-performed')?.checked
      );
      const selectedObjectionResult =
        n.querySelector('.fr-objection-handling-result')?.value || '';
      const canonicalObjectionResults = new Set([
        'customer-concern-resolved',
        'customer-concern-partially-resolved',
        'customer-concern-unresolved',
        'unknown'
      ]);
      const objectionHandlingOutcomes =
        objections.length > 0 &&
        performedObjectionHandling &&
        canonicalObjectionResults.has(selectedObjectionResult)
          ? [{
              id: makeId('sales_step_outcome'),
              step: 'objection-handling',
              performedBy: 'commander',
              result: selectedObjectionResult
            }]
          : [];
      const performedTrialClose = Boolean(
        n.querySelector('.fr-trial-close-performed')?.checked
      );
      const selectedTrialCloseResult =
        n.querySelector('.fr-trial-close-result')?.value || '';
      const canonicalTrialCloseResults = new Set([
        'customer-expressed-readiness-to-proceed',
        'customer-expressed-not-ready-to-proceed',
        'customer-declined-to-proceed',
        'customer-response-unclear'
      ]);
      const trialCloseOutcomes =
        performedTrialClose &&
        canonicalTrialCloseResults.has(selectedTrialCloseResult)
          ? [{
              id: makeId('sales_step_outcome'),
              step: 'trial-close',
              performedBy: 'commander',
              result: selectedTrialCloseResult
            }]
          : [];
      const performedDiscovery = Boolean(
        n.querySelector('.fr-discovery-performed')?.checked
      );
      const selectedDiscoveryResult =
        n.querySelector('.fr-discovery-result')?.value || '';
      const canonicalDiscoveryResults = new Set([
        'customer-shared-needs-goals',
        'customer-shared-limited-information',
        'customer-declined-to-share',
        'customer-response-unclear'
      ]);
      const discoveryOutcomes =
        performedDiscovery &&
        canonicalDiscoveryResults.has(selectedDiscoveryResult)
          ? [{
              id: makeId('sales_step_outcome'),
              step: 'discovery',
              performedBy: 'commander',
              result: selectedDiscoveryResult
            }]
          : [];
      const performedProductSelection = Boolean(
        n.querySelector('.fr-product-selection-performed')?.checked
      );
      const selectedNeedRef =
        n.querySelector('.fr-product-selection-need-ref')?.value || '';
      const selectedUnitReference = safeUnitReference(
        n.querySelector('.fr-product-selection-unit-ref')?.value || ''
      );
      const selectedProductSelectionResult =
        n.querySelector('.fr-product-selection-result')?.value || '';
      const canonicalProductSelectionResults = new Set([
        'customer-considered-selected-unit',
        'customer-requested-different-option',
        'selected-unit-unavailable',
        'customer-response-unclear'
      ]);
      const needIndexMatch = /^key-needs-(\d+)$/.exec(selectedNeedRef);
      const needIndex = needIndexMatch ? Number(needIndexMatch[1]) : -1;
      const productSelectionOutcomes =
        performedProductSelection &&
        needIndex >= 0 &&
        needIndex < keyNeeds.length &&
        selectedUnitReference &&
        canonicalProductSelectionResults.has(selectedProductSelectionResult)
          ? [{
              id: makeId('sales_step_outcome'),
              step: 'product-selection',
              performedBy: 'commander',
              needRef: { field: 'keyNeeds', index: needIndex },
              selectedUnitRef: { type: 'unit-reference', value: selectedUnitReference },
              result: selectedProductSelectionResult
            }]
          : [];
      const performedPresentation = Boolean(
        n.querySelector('.fr-presentation-performed')?.checked
      );
      const selectedPresentationNeedRef =
        n.querySelector('.fr-presentation-need-ref')?.value || '';
      const presentationUnitReference = safeUnitReference(
        n.querySelector('.fr-presentation-unit-ref')?.value || ''
      );
      const presentationReference = safePresentationReference(
        n.querySelector('.fr-presentation-reference')?.value || ''
      );
      const selectedPresentationResult =
        n.querySelector('.fr-presentation-result')?.value || '';
      const canonicalPresentationResults = new Set([
        'customer-considered-presented-feature-benefit',
        'customer-requested-more-detail',
        'customer-preferred-different-feature-benefit',
        'customer-response-unclear'
      ]);
      const presentationNeedIndexMatch =
        /^key-needs-(\d+)$/.exec(selectedPresentationNeedRef);
      const presentationNeedIndex = presentationNeedIndexMatch
        ? Number(presentationNeedIndexMatch[1])
        : -1;
      const presentationOutcomes =
        performedPresentation &&
        presentationNeedIndex >= 0 &&
        presentationNeedIndex < keyNeeds.length &&
        presentationUnitReference &&
        presentationReference &&
        canonicalPresentationResults.has(selectedPresentationResult)
          ? [{
              id: makeId('sales_step_outcome'),
              step: 'presentation',
              performedBy: 'commander',
              needRef: { field: 'keyNeeds', index: presentationNeedIndex },
              selectedUnitRef: { type: 'unit-reference', value: presentationUnitReference },
              presentationRef: { type: 'feature-benefit-reference', value: presentationReference },
              result: selectedPresentationResult
            }]
          : [];
      const salesStepOutcomes = [
        ...rapportOutcomes,
        ...objectionHandlingOutcomes,
        ...trialCloseOutcomes,
        ...discoveryOutcomes,
        ...productSelectionOutcomes,
        ...presentationOutcomes
      ];

      // collect explicitly selected strengths (machine values only)
      const selectedStrengths = Array.from(
        n.querySelectorAll('.fr-explicit-strength:checked')
      ).map((checkbox) => checkbox.value);

      const hasExplicitStrength = selectedStrengths.length > 0;

      // if entirely blank, filter out later
      const allBlank = !buyerContext && !customerGoal && keyNeeds.length===0 && hotButtons.length===0 && objections.length===0 && !notableMoment && !hasExplicitStrength && salesStepOutcomes.length===0;

      return allBlank ? null : {
        id: makeId('interaction'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        buyerContext: buyerContext || undefined,
        customerGoal: customerGoal || undefined,
        keyNeeds: keyNeeds.length? keyNeeds : undefined,
        hotButtons: hotButtons.length? hotButtons : undefined,
        objections: objections.length? objections : undefined,
        notableMoment: notableMoment || undefined,
        explicitStrengths: hasExplicitStrength ? selectedStrengths : undefined,
        ...(salesStepOutcomes.length ? { salesStepOutcomes } : {})
      };
    }).filter(Boolean);

    const now = new Date().toISOString();

    const fr = {
      id: makeId('fieldreport'),
      date: date,
      reportType: 'quick-capture',
      createdAt: now,
      dailyCore: {
        dailyWin: dailyWin || undefined,
        keyLearning: keyLearning || undefined,
        biggestChallenge: biggestChallenge || undefined,
        nextFocus: nextFocus || undefined,
        notes: notes || undefined
      },
      customerInteractions: interactions.length? interactions : undefined,
      captureBay: captureBayText? [{ id: makeId('capture'), content: captureBayText, createdAt: now, updatedAt: now }] : undefined,
      learningSignals: [],
      coachingSignals: [],
      systemMetadata: {
        schemaVersion: 'FIELD_REPORT_SCHEMA_v1',
        updatedAt: now,
        processingStatus: 'raw'
      }
    };

    return fr;
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
