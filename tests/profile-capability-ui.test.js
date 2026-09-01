const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const progressSource = fs.readFileSync(
  path.resolve(__dirname, "..", "progress.html"),
  "utf8",
);
const archieSource = fs.readFileSync(
  path.resolve(__dirname, "..", "js", "archie.js"),
  "utf8",
);
const coreSource = fs.readFileSync(
  path.resolve(__dirname, "..", "js", "core", "archie-core.js"),
  "utf8",
);

function loadUi() {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date,
  });
  vm.runInContext(
    `${archieSource}\n;globalThis.__ui = { getProfileCapabilitySupportCopy, submitProfileCapabilityDecision, submitProfileCapabilityWithdrawal };`,
    context,
  );
  return context.__ui;
}

function loadCore() {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(
    `${coreSource}\n;globalThis.__core = ArchieCore;`,
    context,
  );
  return context.__core;
}

function makeCandidate(version = "candidate-version-a") {
  return {
    candidateId: "profile_candidate_behavioral_capability_objection-handling",
    candidateVersionIdentity: version,
    competency: "objection-handling",
    label: "Objection Handling",
    recommendation:
      "Your reviewed interaction records suggest that Objection Handling may be a developing capability.",
    interactionCount: 3,
    reportCount: 3,
  };
}

test("Profile lifecycle sections live after reviewed recurring patterns", () => {
  const e4 = progressSource.indexOf(">Recurring Behavioral Patterns<");
  const suggestions = progressSource.indexOf(">Developing Capability Suggestions<");
  const capabilities = progressSource.indexOf(">Developing Capabilities<");
  assert.ok(e4 >= 0);
  assert.ok(suggestions > e4);
  assert.ok(capabilities > suggestions);
  assert.match(progressSource, /Previously Recognized Capabilities/);
});

test("candidate copy is recommendation-scoped and never claims strength", () => {
  assert.match(archieSource, /PROFILE SUGGESTION/);
  assert.match(
    progressSource,
    /FounderOS can suggest capabilities based on reviewed patterns\. You decide what belongs in your Profile\./,
  );
  const method =
    archieSource.match(
      /function renderProfileCapabilitySuggestions[\s\S]*?\r?\n}\r?\n\r?\nfunction renderProfileCapabilities/,
    )?.[0] || "";
  assert.match(method, /candidate\.recommendation/);
  assert.doesNotMatch(
    method,
    /You are good at|You have proven|Verified skill|Confirmed strength|FounderOS determined you are/i,
  );
  assert.doesNotMatch(method, /candidateId|candidateVersionIdentity/);
});

test("all candidate controls map to exact canonical decisions", async () => {
  const { submitProfileCapabilityDecision } = loadUi();
  const candidate = makeCandidate();
  for (const decision of ["adopt", "defer", "reject", "suppress"]) {
    let received = null;
    const result = await submitProfileCapabilityDecision(candidate, decision, {
      async decideProfileCapabilityCandidate(input) {
        received = input;
        return { success: true, changed: true };
      },
    });
    assert.equal(result.success, true);
    assert.equal(received.candidateId, candidate.candidateId);
    assert.equal(
      received.candidateVersionIdentity,
      candidate.candidateVersionIdentity,
    );
    assert.equal(received.decision, decision);
  }
  assert.match(archieSource, /Add as developing capability/);
  assert.match(archieSource, />Not now</);
  assert.match(archieSource, /Reject suggestion/);
  assert.match(archieSource, /Don't suggest again/);
});

test("successful decisions rerender and failed decisions do not", async () => {
  const { submitProfileCapabilityDecision } = loadUi();
  const candidate = makeCandidate();
  let rerenders = 0;
  await submitProfileCapabilityDecision(
    candidate,
    "adopt",
    {
      async decideProfileCapabilityCandidate() {
        return { success: true, changed: true };
      },
    },
    async () => { rerenders += 1; },
  );
  await submitProfileCapabilityDecision(
    candidate,
    "reject",
    {
      async decideProfileCapabilityCandidate() {
        return { success: false, reason: "save-failed" };
      },
    },
    async () => { rerenders += 1; },
  );
  assert.equal(rerenders, 1);
});

test("actionability hides acted versions and consumes stable suppression", () => {
  const cases = [
    ["adopt", "candidate-version-a", 0],
    ["defer", "candidate-version-a", 0],
    ["reject", "candidate-version-a", 0],
    ["defer", "candidate-version-old", 1],
    ["reject", "candidate-version-old", 1],
    ["suppress", "candidate-version-old", 0],
  ];
  for (const [decision, version, expected] of cases) {
    const core = loadCore();
    const candidate = makeCandidate();
    const artifacts = {
      "camping.fieldReports": { reports: [{}] },
      "camping.profileCapabilityDecisions": {
        decisions: [
          {
            candidateId: candidate.candidateId,
            candidateVersionIdentity: version,
            decision,
          },
        ],
      },
    };
    core.systems = {
      memory: { getArtifact(type) { return artifacts[type] || null; } },
      missionIntelligence: {
        identifyProfileCapabilityCandidates() { return [candidate]; },
      },
    };
    assert.equal(core.getActionableProfileCapabilityCandidates().length, expected);
  }
});

test("support-state copy is exact and authority-safe", () => {
  const { getProfileCapabilitySupportCopy } = loadUi();
  assert.equal(
    getProfileCapabilitySupportCopy("current"),
    "Current reviewed evidence matches the version you adopted.",
  );
  assert.equal(
    getProfileCapabilitySupportCopy("support-changed"),
    "Your Profile choice remains active, but the reviewed evidence supporting it has changed since adoption.",
  );
  assert.equal(
    getProfileCapabilitySupportCopy("insufficient-current-support"),
    "Your Profile choice remains active, but there is not currently enough reviewed evidence to reproduce the original recommendation.",
  );
});

test("withdrawal requires confirmation and calls only the canonical operation", async () => {
  const { submitProfileCapabilityWithdrawal } = loadUi();
  const capability = { id: "profile_capability_objection-handling" };
  let calls = 0;
  const cancelled = await submitProfileCapabilityWithdrawal(
    capability,
    { async withdrawProfileCapability() { calls += 1; } },
    () => false,
  );
  assert.equal(cancelled.reason, "withdrawal-cancelled");
  assert.equal(calls, 0);

  let received = null;
  const accepted = await submitProfileCapabilityWithdrawal(
    capability,
    {
      async withdrawProfileCapability(input) {
        calls += 1;
        received = input;
        return { success: true, changed: true };
      },
    },
    () => true,
  );
  assert.equal(accepted.success, true);
  assert.equal(calls, 1);
  assert.equal(received.capabilityId, capability.id);
  assert.match(
    archieSource,
    /Withdrawing removes this from your current Profile identity\. FounderOS will preserve the adoption, withdrawal, and supporting evidence history\./,
  );
});

test("active and withdrawn displays keep current identity separate from history", () => {
  assert.match(archieSource, /DEVELOPING CAPABILITY/);
  assert.match(archieSource, /Withdraw from Profile/);
  assert.match(archieSource, /WITHDRAWN/);
  assert.match(archieSource, /capability\.status === "active"/);
  assert.match(archieSource, /capability\.status === "withdrawn"/);
  assert.doesNotMatch(archieSource, /profile_capability_\$\{.*textContent/);
});

test("UI performs no direct Profile, artifact, or browser-storage writes", () => {
  const start = archieSource.indexOf("// PROFILE CAPABILITY UI (v0.1)");
  const end = archieSource.indexOf("// ARCHIE MEMORY HELPERS", start);
  const surface = archieSource.slice(start, end);
  assert.doesNotMatch(
    surface,
    /localStorage\.setItem|sessionStorage\.setItem|founder\.profile\s*=|profile\.capabilities\s*=|memory\.artifacts\[/,
  );
  assert.match(surface, /decideProfileCapabilityCandidate/);
  assert.match(surface, /withdrawProfileCapability/);
});

test("existing E1 E2 E3 and E4 surfaces remain present", () => {
  assert.match(progressSource, /Coaching History/);
  assert.match(progressSource, /Patterns You've Reported/);
  assert.match(progressSource, />Behavioral Evidence</);
  assert.match(progressSource, />Recurring Behavioral Patterns</);
  const start = archieSource.indexOf("// PROFILE CAPABILITY UI (v0.1)");
  const end = archieSource.indexOf("// ARCHIE MEMORY HELPERS", start);
  assert.doesNotMatch(
    archieSource.slice(start, end),
    /BriefingSystem|CommunicationSystem|GuidanceSystem|ReflectionSystem/,
  );
});
