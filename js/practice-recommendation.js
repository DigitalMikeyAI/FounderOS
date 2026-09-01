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
  if (
    typeof MissionIntelligenceSystem === "undefined" ||
    typeof MissionIntelligenceSystem.recommendPractice !== "function" ||
    !reportsContainer ||
    !Array.isArray(reportsContainer.reports)
  ) {
    return null;
  }

  const recommendation = MissionIntelligenceSystem.recommendPractice(
    reportsContainer.reports,
    reviewContainer || null,
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

  const selectors = {
    "practice-rapport": selectRapportMissionRequest,
    "practice-customer-discovery": selectCustomerDiscoveryMissionRequest,
    "practice-product-selection": selectProductSelectionMissionRequest,
    "practice-presentation": selectPresentationMissionRequest,
    "practice-objection-handling": selectObjectionHandlingMissionRequest,
    "practice-trial-close": selectTrialCloseMissionRequest,
  };
  const selectMission = selectors[recommendation.missionIntent];
  return typeof selectMission === "function"
    ? selectMission()
    : { success: false, reason: "invalid-practice-recommendation-intent" };
}
