const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSource(relativePath, context) {
  const file = path.join(root, relativePath);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

function createElement(textContent = "") {
  return {
    textContent,
    style: {},
    classList: { add() {}, remove() {} },
    handlers: {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    querySelector() {
      return null;
    },
    appendChild() {},
  };
}

function loadOnboarding() {
  const storage = new Map();
  const elements = new Map();
  const missionChoices = [createElement("Build a Business")];
  const experienceChoices = [createElement("Beginner")];
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, createElement());
    return elements.get(id);
  };
  const context = vm.createContext({
    console: { log() {}, info() {}, warn() {}, error() {} },
    Date,
    Math,
    JSON,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
    document: {
      body: { classList: { add() {}, remove() {} } },
      getElementById: getElement,
      createElement() {
        return createElement();
      },
      querySelectorAll(selector) {
        if (selector === ".mission-choice") return missionChoices;
        if (selector === ".experience-choice") return experienceChoices;
        if (selector === ".mission-task") return [];
        return [];
      },
      querySelector() {
        return null;
      },
    },
    window: {},
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    MissionSystem: {
      normalizeMissionObjective(objective) {
        return typeof objective === "string" ? { text: objective } : objective;
      },
    },
    CommanderSystem: {
      save() {
        context.saveFounder();
        return true;
      },
    },
    ArchieCore: {
      async beginSession() {},
      async refreshSession() {},
      getSnapshot() {
        return {};
      },
    },
    Archie: {
      getMissionWorkspaceProjection() {
        return null;
      },
      speak() {},
    },
    WorkshopController: { initialize() {} },
    updateFounderLevel() {},
    updateFounderDisplay() {},
    showNotification() {},
  });

  loadSource("js/storage.js", context);
  loadSource("js/missions.js", context);
  loadSource("js/main.js", context);
  vm.runInContext(
    ";globalThis.__api = { founder, generateMission, saveFounder, loadFounder };",
    context,
  );

  return { context, elements, storage, api: context.__api };
}

function loadMissionPipeline() {
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date,
    Math,
  });
  for (const relativePath of [
    "systems/domain-competency.contract.js",
    "systems/mission.system.js",
    "systems/guidance.system.js",
    "systems/mission-intelligence.system.js",
    "systems/briefing.system.js",
  ]) {
    loadSource(relativePath, context);
  }
  vm.runInContext(
    ";globalThis.__api = { GuidanceSystem, MissionIntelligenceSystem, BriefingSystem };",
    context,
  );
  return context.__api;
}

const branches = [
  {
    goal: "Learn AI",
    title: "Your First AI Workflow",
    description:
      "Choose an AI tool, test its abilities, and create your first repeatable system.",
    objectives: [
      "Choose your first AI tool",
      "Complete your first AI experiment",
      "Create your first repeatable workflow",
      "Document what you learned",
    ],
  },
  {
    goal: "Build a Business",
    title: "Build Your Foundation",
    description:
      "Define your idea, identify your audience, and create the first version of your roadmap.",
    objectives: [
      "Define your business idea",
      "Identify your target audience",
      "Research your first opportunity",
      "Create your first action plan",
    ],
  },
  {
    goal: "Grow an Audience",
    title: "Launch Your Content Engine",
    description:
      "Create your first content system and publish your first piece of valuable content.",
    objectives: [
      "Choose your content topic",
      "Create your first script",
      "Record your first piece of content",
      "Publish your first post",
    ],
  },
  {
    goal: "Improve a Workflow",
    title: "Design Your First System",
    description: "Find a repetitive task and improve it with automation.",
    objectives: [
      "Identify a repetitive task",
      "Choose an improvement tool",
      "Build your first automation",
      "Review your results",
    ],
  },
  {
    goal: "I am not sure yet",
    title: "Discover Your Direction",
    description: "Explore your strengths and identify your first opportunity.",
    objectives: [
      "Explore your interests",
      "Identify your strengths",
      "Choose your first direction",
    ],
  },
];

for (const expected of branches) {
  test(`${expected.title} preview is the mission acceptance activates`, async () => {
    const { context, elements, api } = loadOnboarding();
    api.founder.missionGoal = expected.goal;
    const preview = api.generateMission();

    assert.deepEqual(clone(preview), {
      title: expected.title,
      description: expected.description,
      reward: 100,
      objectives: expected.objectives,
    });
    assert.equal(elements.get("mission-title").textContent, "");
    assert.deepEqual(clone(api.founder.missionObjectives), expected.objectives);

    await elements.get("accept-mission").handlers.click();

    assert.equal(api.founder.currentMission, preview.title);
    assert.equal(api.founder.missionDescription, preview.description);
    assert.equal(api.founder.missionReward, preview.reward);
    assert.deepEqual(
      clone(api.founder.missionObjectives),
      clone(preview.objectives),
    );
    assert.equal(api.founder.missionStatus, "active");
    assert.equal(api.founder.onboardingComplete, true);
    assert.equal(elements.get("active-mission-title").textContent, preview.title);
    assert.equal(
      elements.get("active-mission-description").textContent,
      preview.description,
    );
  });
}

test("acceptance contains lifecycle writes but no mission-definition authorship", () => {
  const source = fs.readFileSync(path.join(root, "js/main.js"), "utf8");
  const handler = source.match(
    /acceptMission\.addEventListener\("click", async \(\) => \{([\s\S]*?)\n\}\);/,
  );
  assert.ok(handler);
  assert.match(handler[1], /founder\.onboardingComplete = true/);
  assert.match(handler[1], /founder\.missionStatus = "active"/);
  assert.doesNotMatch(
    handler[1],
    /founder\.(currentMission|missionDescription|missionReward|missionObjectives)\s*=/,
  );
  assert.doesNotMatch(handler[1], /Discover Your Direction|generateObjectives/);
});

test("the latest generated mission is accepted instead of stale mission data", async () => {
  const { elements, api } = loadOnboarding();
  api.founder.missionGoal = "Learn AI";
  api.generateMission();
  api.founder.missionGoal = "Grow an Audience";
  const latest = api.generateMission();

  await elements.get("accept-mission").handlers.click();

  assert.equal(api.founder.currentMission, latest.title);
  assert.deepEqual(
    clone(api.founder.missionObjectives),
    clone(latest.objectives),
  );
});

test("accepted mission survives storage reload with objective shapes unchanged", async () => {
  const { context, elements, api } = loadOnboarding();
  api.founder.missionGoal = "Learn AI";
  const preview = api.generateMission();
  const structuredObjectives = [
    preview.objectives[0],
    { text: preview.objectives[1], customFutureMetadata: { preserved: true } },
  ];
  api.founder.missionObjectives = structuredObjectives;

  await elements.get("accept-mission").handlers.click();
  const persisted = clone(api.founder);
  vm.runInContext("founder.currentMission = ''; founder.missionObjectives = [];", context);
  api.loadFounder();

  assert.equal(api.founder.currentMission, persisted.currentMission);
  assert.equal(api.founder.missionDescription, persisted.missionDescription);
  assert.equal(api.founder.missionReward, persisted.missionReward);
  assert.equal(api.founder.missionStatus, "active");
  assert.deepEqual(clone(api.founder.missionObjectives), structuredObjectives);
});

test("Direction guidance remains supported while non-Direction uses MI fallback", () => {
  const { GuidanceSystem, MissionIntelligenceSystem, BriefingSystem } =
    loadMissionPipeline();
  const direction = branches[4];
  const directionMission = {
    title: direction.title,
    description: direction.description,
    status: "active",
    objectives: direction.objectives,
  };
  const directionGuidance = GuidanceSystem.build({ mission: directionMission });
  assert.equal(directionGuidance.mission, direction.title);
  assert.equal(directionGuidance.objective, "Identify your strengths");

  const ai = branches[0];
  const aiMission = {
    title: ai.title,
    description: ai.description,
    status: "active",
    objectives: ai.objectives,
  };
  const guidance = GuidanceSystem.build({ mission: aiMission });
  assert.equal(guidance, null);
  const recommendation =
    MissionIntelligenceSystem.buildActiveMissionRecommendation(aiMission, guidance);
  assert.equal(recommendation.nextAction, ai.objectives[0]);
  assert.equal(typeof recommendation.nextAction, "string");

  const briefing = BriefingSystem.appendRecommendation(
    BriefingSystem.build({
      type: "mission",
      context: { title: ai.title, description: ai.description },
    }),
    recommendation,
  );
  assert.match(briefing.text, new RegExp(ai.title));
  assert.match(briefing.text, new RegExp(ai.objectives[0]));
});
