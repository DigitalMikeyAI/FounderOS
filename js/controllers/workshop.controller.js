// =====================================================
// FOUNDEROS
// WORKSHOP CONTROLLER
// Archie Core v0.3
//
// Responsibility:
// Connect the Commander interface to the
// Workshop System.
//
// Important:
// This controller owns no workshop logic.
// It owns no AI.
// It simply translates Commander interaction
// into Workshop actions.
// =====================================================

const WorkshopController = {
  version: "0.1.0",

  // =====================================================
  // DOM
  // =====================================================

  briefingView: null,
  workshopView: null,

  beginButton: null,
  exitButton: null,

  responseInput: null,
  submitButton: null,

  missionDisplay: null,
  objectiveDisplay: null,
  messageDisplay: null,
  questionDisplay: null,
  stageDisplay: null,
  progressDisplay: null,
  feedbackDisplay: null,

  workspace: null,
  workspaceTitle: null,

  // =====================================================
  // INITIALIZE
  // =====================================================

  initialize() {
    this.briefingView = document.getElementById("archie-briefing-view");

    this.workshopView = document.getElementById("archie-workshop-view");

    this.beginButton = document.getElementById("begin-workshop");

    this.exitButton = document.getElementById("exit-workshop");

    this.responseInput = document.getElementById("commander-response");

    this.submitButton = document.getElementById("continue-workshop");

    this.missionDisplay = document.getElementById("workshop-mission");

    this.objectiveDisplay = document.getElementById("workshop-objective");

    this.messageDisplay = document.getElementById("workshop-message");

    this.questionDisplay = document.getElementById("workshop-question");

    this.stageDisplay = document.getElementById("workshop-stage");

    this.progressDisplay = document.getElementById(
      "workshop-question-progress",
    );

    this.feedbackDisplay = document.getElementById("workshop-feedback");

    this.workspace = document.getElementById("archie-workspace");

    this.workspaceTitle = document.getElementById("archie-workspace-title");

    if (this.beginButton) {
      this.beginButton.addEventListener("click", () => this.beginWorkshop());
    }

    if (this.exitButton) {
      this.exitButton.addEventListener("click", () => this.showBriefingView());
    }

    if (this.submitButton) {
      this.submitButton.addEventListener("click", () => this.submitResponse());
    }

    console.log("🎓 Workshop Controller initialized.");
  },

  // =====================================================
  // BEGIN WORKSHOP
  // =====================================================

  beginWorkshop() {
    const guidance =
      typeof ArchieCore !== "undefined" ? ArchieCore.session?.guidance : null;

    if (!guidance) {
      console.warn("⚠️ No workshop guidance is currently available.");

      return null;
    }

    const workshop = WorkshopSystem.begin(guidance);

    if (!workshop) {
      console.warn("⚠️ Workshop could not be started.");

      return null;
    }

    this.showWorkshopView();

    // Move from Introduction into Question 1.
    WorkshopSystem.nextStage();

    this.renderWorkshop();

    // Place the Commander directly into the workflow.
    requestAnimationFrame(() => {
      this.responseInput?.focus();
    });

    return workshop;
  },

  // =====================================================
  // VIEW SWITCHING
  // =====================================================

  showWorkshopView() {
    if (this.workspace) {
      this.workspace.dataset.archieMode = "workshop";
    }

    if (this.briefingView) {
      this.briefingView.hidden = true;
    }

    if (this.workshopView) {
      this.workshopView.hidden = false;
    }

    if (this.workspaceTitle) {
      this.workspaceTitle.textContent = "ARCHIE WORKSHOP";
    }
  },

  showBriefingView() {
    if (this.workspace) {
      this.workspace.dataset.archieMode = "briefing";
    }

    if (this.workshopView) {
      this.workshopView.hidden = true;
    }

    if (this.briefingView) {
      this.briefingView.hidden = false;
    }

    if (this.workspaceTitle) {
      this.workspaceTitle.textContent = "ARCHIE";
    }

    this.showFeedback("");
  },

  // =====================================================
  // RENDER
  // =====================================================

  renderWorkshop() {
    const workshop = WorkshopSystem.getCurrentWorkshop();

    if (!workshop) {
      return;
    }

    if (this.missionDisplay) {
      this.missionDisplay.textContent = workshop.mission;
    }

    if (this.objectiveDisplay) {
      this.objectiveDisplay.textContent = workshop.objective;
    }

    if (this.stageDisplay) {
      this.stageDisplay.textContent = this.formatStage(workshop.stage);
    }

    if (this.progressDisplay) {
      const questionNumber = Math.min(
        workshop.currentQuestionIndex + 1,
        workshop.questions.length,
      );

      this.progressDisplay.textContent =
        workshop.stage === "questions"
          ? `Question ${questionNumber} of ${workshop.questions.length}`
          : this.formatStage(workshop.stage);
    }

    if (this.messageDisplay) {
      this.messageDisplay.textContent =
        workshop.guidance?.explanation || "Archie is ready to guide you.";
    }

    this.showCurrentQuestion();

    const acceptingResponse = workshop.stage === "questions";

    if (this.responseInput) {
      this.responseInput.hidden = !acceptingResponse;

      this.responseInput.disabled = !acceptingResponse;
    }

    if (this.submitButton) {
      this.submitButton.hidden = !acceptingResponse;
    }
  },

  showCurrentQuestion() {
    const workshop = WorkshopSystem.getCurrentWorkshop();

    if (!workshop || !this.questionDisplay) {
      return;
    }

    if (workshop.stage === "questions") {
      this.questionDisplay.textContent =
        WorkshopSystem.getCurrentQuestion() ||
        "Archie is preparing the next question.";

      return;
    }

    if (workshop.stage === "reflection") {
      this.questionDisplay.textContent =
        "Let’s review what your answers reveal.";
      return;
    }

    if (workshop.stage === "artifact") {
      this.questionDisplay.textContent =
        "Your Strength Profile is ready to be assembled.";
      return;
    }

    if (workshop.stage === "complete") {
      this.questionDisplay.textContent = "Workshop complete, Commander.";
      return;
    }

    this.questionDisplay.textContent = "Archie is preparing your workshop.";
  },

  // =====================================================
  // SUBMIT RESPONSE
  // =====================================================

  submitResponse() {
    const answer = this.responseInput?.value.trim() || "";

    if (!answer) {
      this.showFeedback("Please enter a response before continuing.");

      return null;
    }

    const result = WorkshopSystem.answerQuestion(answer);

    if (!result) {
      this.showFeedback("Your response could not be recorded.");

      return null;
    }

    this.responseInput.value = "";

    WorkshopSystem.nextStage();

    this.showFeedback("Response recorded. Continuing workshop...");

    this.renderWorkshop();

    return result;
  },

  // =====================================================
  // HELPERS
  // =====================================================

  showFeedback(message) {
    if (this.feedbackDisplay) {
      this.feedbackDisplay.textContent = message;
    }
  },

  formatStage(stage) {
    return String(stage || "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  },
};
