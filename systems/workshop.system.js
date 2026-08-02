// =====================================================
// FOUNDEROS
// WORKSHOP SYSTEM
// Archie Core v0.3
//
// Responsibility:
// Execute a prepared Guidance plan and track the
// Commander's progress through an active workshop.
//
// Important:
// This system does not create guidance.
// It does not decide priorities.
// It does not directly update the interface.
// It does not deliver messages.
// =====================================================

const WorkshopSystem = {
  version: "0.1.0",

  currentWorkshop: null,

  // =====================================================
  // BEGIN
  // Starts a new workshop from prepared Guidance.
  // =====================================================

  begin(guidance = null) {
    if (!guidance) {
      console.warn("⚠️ Workshop System cannot begin without guidance.");

      return null;
    }

    const questions = Array.isArray(guidance.questions)
      ? [...guidance.questions]
      : [];

    this.currentWorkshop = {
      id: this.createWorkshopId(),

      mission: guidance.mission || "",
      objective: guidance.objective || "",
      mode: guidance.mode || "instruction",

      stage: "introduction",
      currentQuestionIndex: 0,

      questions,
      answers: [],

      artifact: {
        ...(guidance.artifact || {}),
      },

      completionCriteria: Array.isArray(guidance.completionCriteria)
        ? [...guidance.completionCriteria]
        : [],

      guidance: {
        ...guidance,
        steps: Array.isArray(guidance.steps) ? [...guidance.steps] : [],
        questions,
      },

      completed: false,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    console.log("🧭 Workshop System started:", this.currentWorkshop);

    return this.currentWorkshop;
  },

  // =====================================================
  // NEXT STAGE
  // Advances through the workshop lifecycle.
  // =====================================================

  nextStage() {
    const workshop = this.currentWorkshop;

    if (!workshop || workshop.completed) {
      return null;
    }

    if (workshop.stage === "introduction") {
      workshop.stage = workshop.questions.length ? "questions" : "reflection";

      return workshop;
    }

    if (workshop.stage === "questions") {
      const hasMoreQuestions =
        workshop.currentQuestionIndex < workshop.questions.length - 1;

      if (hasMoreQuestions) {
        workshop.currentQuestionIndex += 1;
      } else {
        workshop.stage = "reflection";
      }

      return workshop;
    }

    if (workshop.stage === "reflection") {
      workshop.stage = "artifact";

      return workshop;
    }

    if (workshop.stage === "artifact") {
      return this.complete();
    }

    return workshop;
  },

  // =====================================================
  // PREVIOUS STAGE
  // Allows controlled backward navigation.
  // =====================================================

  previousStage() {
    const workshop = this.currentWorkshop;

    if (!workshop || workshop.completed) {
      return null;
    }

    if (workshop.stage === "questions" && workshop.currentQuestionIndex > 0) {
      workshop.currentQuestionIndex -= 1;

      return workshop;
    }

    if (workshop.stage === "questions") {
      workshop.stage = "introduction";

      return workshop;
    }

    if (workshop.stage === "reflection") {
      workshop.stage = workshop.questions.length ? "questions" : "introduction";

      workshop.currentQuestionIndex = Math.max(
        workshop.questions.length - 1,
        0,
      );

      return workshop;
    }

    if (workshop.stage === "artifact") {
      workshop.stage = "reflection";
    }

    return workshop;
  },

  // =====================================================
  // ANSWER QUESTION
  // Records or updates the current question's answer.
  // =====================================================

  answerQuestion(answer) {
    const workshop = this.currentWorkshop;

    if (!workshop || workshop.stage !== "questions") {
      console.warn("⚠️ Workshop System is not currently asking a question.");

      return null;
    }

    const text = String(answer || "").trim();

    if (!text) {
      console.warn("⚠️ Workshop System rejected an empty answer.");

      return null;
    }

    const question = workshop.questions[workshop.currentQuestionIndex];

    workshop.answers[workshop.currentQuestionIndex] = {
      question,
      answer: text,
      answeredAt: new Date().toISOString(),
    };

    console.log(
      "📝 Workshop answer recorded:",
      workshop.answers[workshop.currentQuestionIndex],
    );

    return workshop.answers[workshop.currentQuestionIndex];
  },

  // =====================================================
  // COMPLETE
  // Marks the active workshop as complete.
  // =====================================================

  complete() {
    const workshop = this.currentWorkshop;

    if (!workshop) {
      return null;
    }

    workshop.stage = "complete";
    workshop.completed = true;
    workshop.completedAt = new Date().toISOString();

    if (workshop.artifact) {
      workshop.artifact.status = "ready";
    }

    console.log("✅ Workshop System completed:", workshop);

    return workshop;
  },

  // =====================================================
  // READ HELPERS
  // =====================================================

  getCurrentQuestion() {
    const workshop = this.currentWorkshop;

    if (!workshop || workshop.stage !== "questions") {
      return null;
    }

    return workshop.questions[workshop.currentQuestionIndex] || null;
  },

  getCurrentWorkshop() {
    return this.currentWorkshop;
  },

  // =====================================================
  // UTILITIES
  // =====================================================

  createWorkshopId() {
    return `workshop-${Date.now()}`;
  },
};
