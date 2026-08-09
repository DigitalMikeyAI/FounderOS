// =====================================================
// ARCHIE NOTIFICATION SYSTEM
// =====================================================

let notificationTimer = null;

function showNotification(message) {
  const notification = document.getElementById("system-notification");
  const notificationMessage = document.getElementById("notification-message");
  const closeButton = document.getElementById("system-close");

  briefingHasStarted = false;

  if (!notification || !notificationMessage) {
    console.log(`ARCHIE: ${message}`);
    return;
  }

  notification.classList.remove("is-closing");
  notification.style.display = "flex";

  clearTimeout(notificationTimer);

  if (closeButton) {
    closeButton.onclick = beginBriefing;
  }

  // Pause both communication pipelines so the authoritative queue (CommunicationSystem)
  // and the fallback Archie queue are frozen together while the blocking popup is visible.
  // Guarded additive sync — preserves fallback if either system is unavailable.
  if (
    typeof CommunicationSystem !== "undefined" &&
    typeof CommunicationSystem.pause === "function"
  ) {
    CommunicationSystem.pause();
  }

  if (typeof Archie !== "undefined") {
    Archie.paused = true;
  }

  // Prefer routing notification typing through CommunicationSystem so
  // this message shares the same delivery pipeline/queue as other
  // transmissions (per ADR-003). Falls back to Archie's direct typing
  // if CommunicationSystem is unavailable. `target: "notification-message"`
  // is distinct from the default "notification" target (which would
  // re-trigger showNotification() itself via Archie.deliver() and cause
  // infinite recursion) — it means "type into the already-open popup".
  if (
    typeof CommunicationSystem !== "undefined" &&
    typeof CommunicationSystem.send === "function"
  ) {
    console.log("WELCOME NOTIFICATION SEND:", message);

    CommunicationSystem.send({
      text: message,
      target: "notification-message",
      force: true,
    });

    // Do not auto-begin briefing; keep the popup until the user clicks the button.
    // The close button is wired to `beginBriefing` above.
  } else if (
    typeof Archie !== "undefined" &&
    typeof Archie.typeMessage === "function"
  ) {
    // Use Archie typing for letter-by-letter effect, force typing even while paused.
    Archie.typeMessage(notificationMessage, message, { force: true }).catch(
      () => {
        // Fallback to instant text if typing fails
        notificationMessage.textContent = message;
      },
    );

    // Do not auto-begin briefing; keep the popup until the user clicks the button.
    // The close button is wired to `beginBriefing` above.
  } else {
    // fallback: instant message; user must click the button to proceed
    notificationMessage.textContent = message;
  }
}

let briefingHasStarted = false;

function beginBriefing() {
  // Prevent the button and timer from starting Archie twice
  if (briefingHasStarted) return;

  briefingHasStarted = true;

  clearTimeout(notificationTimer);

  const notification = document.getElementById("system-notification");

  if (!notification) {
    startArchieBriefing();
    return;
  }

  // Begin the fade-out animation
  notification.classList.add("is-closing");

  // Wait for the fade to finish before fully hiding it
  setTimeout(() => {
    notification.style.display = "none";
    notification.classList.remove("is-closing");

    // Resume both pipelines together — authoritative queue is CommunicationSystem,
    // fallback Archie queue is resumed alongside for compatibility.
    if (typeof Archie !== "undefined" && typeof Archie.resume === "function") {
      Archie.resume().catch(() => {
        // ignore resume failures
      });
    }

    if (
      typeof CommunicationSystem !== "undefined" &&
      typeof CommunicationSystem.resume === "function"
    ) {
      try {
        CommunicationSystem.resume();
      } catch (e) {
        // ignore resume failures
      }
    }

    startArchieBriefing();
  }, 300);
}

async function startArchieBriefing() {
  // Small pause so the notification can fully close first.
  if (typeof Archie !== "undefined" && typeof Archie.wait === "function") {
    await Archie.wait(500);
  }

  // New canonical briefing route.
  if (
    typeof ArchieCore !== "undefined" &&
    typeof ArchieCore.beginBriefing === "function"
  ) {
    await ArchieCore.beginBriefing();
    return;
  }

  // Temporary compatibility fallback.
  if (
    typeof Archie !== "undefined" &&
    typeof Archie.beginDailyBriefing === "function"
  ) {
    await Archie.beginDailyBriefing();
  }
}
