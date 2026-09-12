// =====================================================
// FOUNDEROS
// MOVE STATE SYSTEM
// Pure read-only Candidate Move operating-state derivation.
// =====================================================

const MoveStateSystem = {
  getMoveState() {
    if (typeof getFounderStorageLoadStatus !== "function") {
      return { status: "unavailable", reason: "founder-storage-unavailable" };
    }
    const storageStatus = getFounderStorageLoadStatus();
    if (storageStatus === "not-loaded") return { status: "unavailable", reason: "founder-storage-not-loaded" };
    if (storageStatus === "failed") return { status: "unavailable", reason: "founder-storage-failed" };
    if (storageStatus !== "loaded" && storageStatus !== "absent") return { status: "unavailable", reason: "founder-storage-unavailable" };
    if (typeof CandidateMoveSystem === "undefined" || typeof CandidateMoveSystem.getCandidateMove !== "function") {
      return { status: "unavailable", reason: "candidate-move-system-unavailable" };
    }

    const candidateMove = CandidateMoveSystem.getCandidateMove();
    if (candidateMove.status === "absent") return { status: "not-applicable", reason: "candidate-move-absent" };
    if (candidateMove.status !== "available") return { status: "unavailable", reason: candidateMove.reason || "candidate-move-unavailable" };
    if (candidateMove.current.status === "withdrawn") {
      return { status: "not-applicable", reason: "candidate-move-withdrawn", candidateMoveId: candidateMove.current.id };
    }
    if (typeof CandidateMoveHoldSystem === "undefined" || typeof CandidateMoveHoldSystem.getHold !== "function") {
      return { status: "unavailable", reason: "candidate-move-hold-system-unavailable" };
    }
    if (typeof CandidateMoveDependencySystem === "undefined" || typeof CandidateMoveDependencySystem.getDependency !== "function") {
      return { status: "unavailable", reason: "candidate-move-dependency-system-unavailable" };
    }

    const hold = CandidateMoveHoldSystem.getHold();
    if (!["available", "absent", "unavailable"].includes(hold.status)) {
      return { status: "unavailable", reason: "candidate-move-hold-unrecognized" };
    }
    if (hold.status === "unavailable") return { status: "unavailable", reason: hold.reason || "candidate-move-hold-unavailable" };
    const dependency = CandidateMoveDependencySystem.getDependency();
    if (!["available", "absent", "unavailable"].includes(dependency.status)) {
      return { status: "unavailable", reason: "candidate-move-dependency-unrecognized" };
    }
    if (dependency.status === "unavailable") return { status: "unavailable", reason: dependency.reason || "candidate-move-dependency-unavailable" };
    if (hold.status === "available" && (!hold.current || !["active", "released"].includes(hold.current.status))) {
      return { status: "unavailable", reason: "candidate-move-hold-unrecognized" };
    }
    if (dependency.status === "available" && (!dependency.current || !["unresolved", "resolved"].includes(dependency.current.status))) {
      return { status: "unavailable", reason: "candidate-move-dependency-unrecognized" };
    }
    if (hold.status === "available" && hold.current.status === "active") {
      return {
        status: "available", state: "hold", candidateMoveId: candidateMove.current.id,
        candidateMoveRevision: candidateMove.current.revision,
        basis: { kind: "hold", references: [{ type: "candidate-move-hold", id: hold.current.id, revision: hold.current.revision }] },
      };
    }
    if (dependency.status === "available" && dependency.current.status === "unresolved") {
      return {
        status: "available", state: "waiting", candidateMoveId: candidateMove.current.id,
        candidateMoveRevision: candidateMove.current.revision,
        basis: { kind: "dependency", references: [{ type: "candidate-move-dependency", id: dependency.current.id, revision: dependency.current.revision }] },
      };
    }
    return {
      status: "available", state: "clarify", candidateMoveId: candidateMove.current.id,
      candidateMoveRevision: candidateMove.current.revision,
      basis: { kind: "insufficient-operating-truth", references: [] },
    };
  },
};
