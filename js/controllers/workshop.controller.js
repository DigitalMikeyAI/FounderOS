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
  responseLabel: null,

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

    this.responseLabel = document.getElementById("workshop-response-label");

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

  async beginWorkshop(contextualReflection = null) {
    let guidance =
      typeof ArchieCore !== "undefined" ? ArchieCore.session?.guidance : null;

    // A new Commander may receive their mission after Archie Core's
    // original startup snapshot. Refresh before giving up.
    if (!guidance && typeof ArchieCore?.refreshSession === "function") {
      const refreshed = await ArchieCore.refreshSession();

      guidance = refreshed?.guidance || ArchieCore.session?.guidance || null;
    }

    if (!guidance) {
      console.warn("⚠️ No workshop guidance is currently available.");

      return null;
    }

    // Prevent restarting a completed workshop if its artifact already exists
    // in MemorySystem. This avoids reopening a workshop that has already
    // produced a saved artifact (e.g., Strength Profile).
    try {
      if (
        guidance &&
        guidance.artifact &&
        guidance.artifact.type &&
        typeof MemorySystem !== "undefined" &&
        typeof MemorySystem.getArtifact === "function"
      ) {
        const existing = MemorySystem.getArtifact(guidance.artifact.type);

        if (existing && existing.status && String(existing.status).toLowerCase() !== "not-started") {
          console.info("⚠️ Workshop artifact already present in Memory; skipping restart.");

          // Show the briefing/workspace instead of restarting the workshop.
          this.showBriefingView();

          return null;
        }
      }
    } catch (e) {
      // Defensive: do not let MemorySystem checks block workshop startup.
    }

    const workshop = WorkshopSystem.begin(guidance, contextualReflection);

    if (!workshop) {
      console.warn("⚠️ Workshop could not be started.");

      return null;
    }

    this.showWorkshopView();

    // Move from Introduction to Question 1.
    WorkshopSystem.nextStage();

    this.renderWorkshop();

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
      const explanation =
        workshop.guidance?.explanation || "Archie is ready to guide you.";
      const profileCapabilityContext =
        typeof workshop.guidance?.profileCapabilityContext === "string"
          ? workshop.guidance.profileCapabilityContext.trim()
          : "";
      this.messageDisplay.textContent = profileCapabilityContext
        ? `${explanation} ${profileCapabilityContext}`
        : explanation;
    }

    this.showCurrentQuestion();

    const acceptingResponse =
      workshop.stage === "questions" ||
      workshop.stage === "contextual-reflection";

    if (this.responseLabel) {
      this.responseLabel.hidden = !acceptingResponse;
    }

    if (this.responseInput) {
      this.responseInput.hidden = !acceptingResponse;

      this.responseInput.disabled = !acceptingResponse;
    }

    if (this.submitButton) {
      this.submitButton.hidden = false;
      this.submitButton.disabled = false;

      if (workshop.stage === "questions") {
        this.submitButton.textContent = "Continue Workshop →";
      } else if (workshop.stage === "contextual-reflection") {
        this.submitButton.textContent = "Continue Reflection →";
      } else if (workshop.stage === "reflection") {
        this.submitButton.textContent = "Build Strength Profile →";
      } else if (workshop.stage === "artifact") {
        this.submitButton.textContent = "Complete Workshop →";
      } else if (workshop.stage === "complete") {
        this.submitButton.textContent = "Return to Mission Control";
      }
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

    if (workshop.stage === "contextual-reflection") {
      this.questionDisplay.textContent =
        WorkshopSystem.getCurrentContextualReflectionPrompt()?.question ||
        "Archie is preparing a reflection question.";
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
  // CONTINUE WORKSHOP
  // Handles Commander answers during questions and lets
  // Archie control reflection, artifact, and completion.
  // =====================================================

  submitResponse() {
    const workshop = WorkshopSystem.getCurrentWorkshop();

    if (!workshop) {
      this.showFeedback("No active workshop is available.");

      return null;
    }

    // =====================================================
    // COMMANDER TURN
    // Only questions require a written response.
    // =====================================================

    if (workshop.stage === "questions") {
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

      this.showFeedback("");

      this.renderWorkshop();

      if (WorkshopSystem.getCurrentWorkshop()?.stage === "questions") {
        requestAnimationFrame(() => {
          this.responseInput?.focus();
        });
      }

      return result;
    }

    if (workshop.stage === "contextual-reflection") {
      const answer = this.responseInput?.value.trim() || "";
      const prompt = WorkshopSystem.getCurrentContextualReflectionPrompt();
      if (!answer || !prompt) {
        this.showFeedback("Please enter a response before continuing.");
        return null;
      }

      const result = WorkshopSystem.recordContextualReflection({
        question: prompt.question,
        answer,
        purpose: prompt.purpose,
      });
      if (!result) {
        this.showFeedback("Your reflection could not be recorded.");
        return null;
      }

      this.responseInput.value = "";
      WorkshopSystem.nextStage();
      this.showFeedback("");
      this.renderWorkshop();
      return result;
    }

    // =====================================================
    // ARCHIE TURN
    // No Commander response is required after questions.
    // =====================================================

    if (workshop.stage === "reflection" || workshop.stage === "artifact") {
      WorkshopSystem.nextStage();

      this.showFeedback("");

      this.renderWorkshop();

      return WorkshopSystem.getCurrentWorkshop();
    }

    if (workshop.stage === "complete") {
      this.showBriefingView();

      return workshop;
    }

    return null;
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
