let renderedPracticeRecommendation = null;

function renderPracticeRecommendation() {
  const container = document.getElementById("practice-recommendation");
  const competency = document.getElementById(
    "practice-recommendation-competency",
  );
  const reason = document.getElementById("practice-recommendation-reason");
  if (!container || !competency || !reason) return null;

  renderedPracticeRecommendation = null;
  container.hidden = true;
  competency.textContent = "";
  reason.textContent = "";

  const artifacts = founder?.memory?.artifacts;
  const reportsContainer = artifacts?.["camping.fieldReports"];
  const reviewContainer = artifacts?.["camping.behavioralEvidenceReviews"];
  const patternReviewContainer =
    artifacts?.["camping.behavioralPatternReviews"] || null;
  if (
    typeof MissionIntelligenceSystem === "undefined" ||
    typeof MissionIntelligenceSystem.buildPracticeCandidates !== "function" ||
    typeof MissionIntelligenceSystem.rotatePracticeCandidate !== "function" ||
    typeof MissionIntelligenceSystem.formatPracticeRecommendation !==
      "function" ||
    !reportsContainer ||
    !Array.isArray(reportsContainer.reports)
  ) {
    return null;
  }

  const candidates = MissionIntelligenceSystem.buildPracticeCandidates(
    reportsContainer.reports,
    reviewContainer || null,
  );
  const selected = MissionIntelligenceSystem.rotatePracticeCandidate(
    candidates,
    founder.commandLog,
  );

  const optionalContext =
    selected &&
    typeof MissionIntelligenceSystem.findConfirmedPracticePatternContext ===
      "function"
      ? MissionIntelligenceSystem.findConfirmedPracticePatternContext(
          selected,
          reportsContainer.reports,
          reviewContainer || null,
          patternReviewContainer,
        )
      : null;

  const recommendation =
    MissionIntelligenceSystem.formatPracticeRecommendation(
      selected,
      optionalContext,
    );
  if (!recommendation) return null;

  const labels = {
    rapport: "Rapport",
    discovery: "Discovery",
    "product-selection": "Product Selection",
    presentation: "Presentation",
    "objection-handling": "Objection Handling",
    "trial-close": "Trial Close",
  };
  const label = labels[recommendation.recommendedCompetency];
  if (!label) return null;

  renderedPracticeRecommendation = recommendation;
  competency.textContent = label;
  reason.textContent = recommendation.reasonText;
  container.hidden = false;
  return recommendation;
}

function previewPracticeRecommendation() {
  const recommendation = renderedPracticeRecommendation;
  if (!recommendation || recommendation.domain !== "camping.sales") {
    return { success: false, reason: "no-practice-recommendation" };
  }

  return typeof selectPracticeMissionRequestByIntent === "function"
    ? selectPracticeMissionRequestByIntent(recommendation.missionIntent)
    : { success: false, reason: "invalid-practice-recommendation-intent" };
}
