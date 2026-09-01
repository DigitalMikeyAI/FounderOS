const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(relativePath, name) {
  const file = path.resolve(__dirname, "..", relativePath);
  const source = fs.readFileSync(file, "utf8");
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(`${source}\n;globalThis.__api = ${name};`, context, {
    filename: file,
  });
  return context.__api;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makePattern() {
  return {
    patternId: "behavioral_pattern_objection-handling",
    patternVersionIdentity: "behavioral_pattern_version_v1_exact",
    competency: "objection-handling",
    insight: "Exact recurring-pattern interpretation.",
    contributors: [
      { activeIdentity: "active-a" },
      { activeIdentity: "active-b" },
      { activeIdentity: "active-c" },
    ],
  };
}

function makeTarget(pattern, overrides = {}) {
  return {
    patternId: pattern.patternId,
    patternVersionIdentity: pattern.patternVersionIdentity,
    contributorIdentities: pattern.contributors
      .map((contributor) => contributor.activeIdentity)
      .sort(),
    status: "confirmed-as-pattern",
    correctedInterpretation: null,
    note: null,
    ...overrides,
  };
}

function createHarness({ saveSucceeds = true } = {}) {
  const system = load(
    "systems/mission-intelligence.system.js",
    "MissionIntelligenceSystem",
  );
  const core = load("js/core/archie-core.js", "ArchieCore");
  const pattern = makePattern();
  const artifacts = {
    "camping.fieldReports": { reports: [{ id: "report" }] },
    "camping.behavioralEvidenceReviews": { reviews: [{ id: "e3-review" }] },
  };
  let saveCount = 0;
  core.systems = {
    memory: {
      getArtifact(type) {
        return artifacts[type] || null;
      },
      saveArtifact(artifact) {
        saveCount += 1;
        if (!saveSucceeds) return null;
        artifacts[artifact.type] = clone(artifact);
        return artifacts[artifact.type];
      },
    },
    missionIntelligence: {
      validateBehavioralPatternReviewTarget(reports, reviews, input) {
        if (
          input.patternId !== pattern.patternId ||
          input.patternVersionIdentity !== pattern.patternVersionIdentity
        ) {
          return {
            valid: false,
            reason: "behavioral-pattern-target-not-current",
          };
        }
        assert.equal(reports, artifacts["camping.fieldReports"].reports);
        assert.equal(
          reviews,
          artifacts["camping.behavioralEvidenceReviews"],
        );
        return {
          valid: true,
          pattern: clone(pattern),
          contributorIdentities: input.contributorIdentities.slice(),
        };
      },
      buildBehavioralPatternReviewRecord:
        system.buildBehavioralPatternReviewRecord.bind(system),
      identifyBehavioralPatternReviews:
        system.identifyBehavioralPatternReviews.bind(system),
      identifyLatestBehavioralPatternReview:
        system.identifyLatestBehavioralPatternReview.bind(system),
    },
  };
  return {
    core,
    pattern,
    artifacts,
    getSaveCount() {
      return saveCount;
    },
  };
}

test("ArchieCore creates the exact E4 artifact through MemorySystem", async () => {
  const harness = createHarness();
  const beforeReports = clone(harness.artifacts["camping.fieldReports"]);
  const beforeE3 = clone(
    harness.artifacts["camping.behavioralEvidenceReviews"],
  );
  const result = await harness.core.reviewBehavioralPattern(
    makeTarget(harness.pattern),
  );
  const artifact =
    harness.artifacts["camping.behavioralPatternReviews"];

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assert.equal(harness.getSaveCount(), 1);
  assert.equal(artifact.type, "camping.behavioralPatternReviews");
  assert.equal(
    artifact.schemaVersion,
    "BEHAVIORAL_PATTERN_REVIEW_SCHEMA_v1",
  );
  assert.equal(artifact.reviews.length, 1);
  assert.equal(artifact.reviews[0].status, "confirmed-as-pattern");
  assert.ok(artifact.createdAt);
  assert.ok(artifact.updatedAt);
  assert.deepEqual(
    harness.artifacts["camping.fieldReports"],
    beforeReports,
  );
  assert.deepEqual(
    harness.artifacts["camping.behavioralEvidenceReviews"],
    beforeE3,
  );
});

test("ArchieCore is append-only, supersedes, and avoids duplicate saves", async () => {
  const harness = createHarness();
  const target = makeTarget(harness.pattern);
  const first = await harness.core.reviewBehavioralPattern(target);
  const duplicate = await harness.core.reviewBehavioralPattern(target);
  const changed = await harness.core.reviewBehavioralPattern({
    ...target,
    status: "corrected",
    correctedInterpretation: "A narrower interpretation.",
  });
  const reviews =
    harness.artifacts["camping.behavioralPatternReviews"].reviews;

  assert.equal(first.changed, true);
  assert.equal(duplicate.changed, false);
  assert.equal(changed.changed, true);
  assert.equal(harness.getSaveCount(), 2);
  assert.equal(reviews.length, 2);
  assert.equal(reviews[1].supersedesReviewId, reviews[0].id);
});

test("ArchieCore rejects stale targets and reports failed persistence truthfully", async () => {
  const staleHarness = createHarness();
  const stale = await staleHarness.core.reviewBehavioralPattern(
    makeTarget(staleHarness.pattern, {
      patternVersionIdentity: "stale-version",
    }),
  );
  assert.equal(stale.success, false);
  assert.equal(stale.reason, "behavioral-pattern-target-not-current");
  assert.equal(staleHarness.getSaveCount(), 0);

  const failingHarness = createHarness({ saveSucceeds: false });
  const failed = await failingHarness.core.reviewBehavioralPattern(
    makeTarget(failingHarness.pattern),
  );
  assert.equal(failed.success, false);
  assert.equal(
    failed.reason,
    "behavioral-pattern-review-persistence-failed",
  );
  assert.equal(failingHarness.getSaveCount(), 1);
  assert.equal(
    failingHarness.artifacts["camping.behavioralPatternReviews"],
    undefined,
  );
});
