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

  // Pause Archie so it doesn't operate on the page while the popup is visible
  if (typeof Archie !== "undefined") {
    Archie.paused = true;
  }

  // If Archie is available, type the notification like other Archie messages.
  if (
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

    // Resume Archie activity now that the user has acknowledged the popup
    if (typeof Archie !== "undefined" && typeof Archie.resume === "function") {
      Archie.resume().catch(() => {
        // ignore resume failures
      });
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
