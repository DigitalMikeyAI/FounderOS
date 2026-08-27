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
    return s.split(',').map(x=>x.trim()).filter(Boolean);
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
    const outcomeCapture = wrap.querySelector('.fr-objection-outcome-capture');
    const performedInput = wrap.querySelector('.fr-objection-handling-performed');
    const resultField = wrap.querySelector('.fr-objection-result-field');

    function syncObjectionOutcomeCapture() {
      const hasObjections = csvToArray(objectionsInput.value || '').length > 0;
      outcomeCapture.hidden = !hasObjections;
      resultField.hidden = !hasObjections || !performedInput.checked;
    }

    objectionsInput.addEventListener('input', syncObjectionOutcomeCapture);
    performedInput.addEventListener('change', syncObjectionOutcomeCapture);

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
            buttonLabel: 'Done',
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
          buttonLabel: 'Done',
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
      const salesStepOutcomes =
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

      // collect explicitly selected strengths (machine values only)
      const selectedStrengths = Array.from(
        n.querySelectorAll('.fr-explicit-strength:checked')
      ).map((checkbox) => checkbox.value);

      const hasExplicitStrength = selectedStrengths.length > 0;

      // if entirely blank, filter out later
      const allBlank = !buyerContext && !customerGoal && keyNeeds.length===0 && hotButtons.length===0 && objections.length===0 && !notableMoment && !hasExplicitStrength;

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
