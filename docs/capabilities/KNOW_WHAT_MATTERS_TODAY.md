# Capability 4A-1 — Know What Matters Today

## Capability Statement

FounderOS reviews relevant current context and recommends the single highest-value mission for today. This recommendation is designed to cut through the noise, providing clear direction when the Commander needs it most. The recommendation must explicitly include:

- **What to focus on:** The primary mission or task that demands attention.
- **Why it matters:** The rationale and impact of focusing on this particular mission.
- **The smallest meaningful next step:** A clear, actionable step to initiate progress.
- **What can safely wait:** Identification of tasks or concerns that can be deferred without immediate negative consequences.

## Commander Problem

The modern Commander operates in an environment of constant information overload and competing demands. They often possess numerous goals, tasks, projects, and responsibilities, but lack a clear, objective understanding of which one deserves their immediate attention. This abundance of choice, rather than fostering productivity, frequently leads to overwhelm, decision paralysis, and a feeling of being constantly behind. The problem is not a lack of ambition or capability, but a lack of clarity in prioritizing the multitude of valuable endeavors.

## Desired Commander Experience

Upon engaging with this capability, the Commander should feel:

- **Clear:** A profound sense of understanding regarding their immediate priorities.
- **Supported:** Confident that FounderOS has thoughtfully considered their context.
- **Confident:** Assured in their decision to focus on the recommended mission.
- **Focused:** Able to direct their attention and energy effectively, free from distractions.
- **Free from unnecessary urgency:** A reduction in the pervasive feeling that "everything is urgent," allowing for deliberate action.

## Inputs

This capability may consider the following types of existing information within FounderOS:

- **Active missions:** Currently ongoing projects or objectives.
- **Unfinished missions:** Missions that have been started but not yet completed.
- **Commander-stated goals:** Explicitly defined long-term and short-term objectives.
- **Deadlines or commitments:** Known external or internal time-bound obligations.
- **Recent mission history:** Patterns of past activity, progress, and challenges.
- **Blockers:** Identified impediments preventing progress on missions.
- **Progress and momentum:** Current status and velocity of various initiatives.
- **Explicitly marked priorities:** Any tasks or goals the Commander has manually flagged as high priority.
- **Available time or energy when known:** Commander-provided input on their current capacity.
- **Relevant knowledge or project context:** Associated notes, research, or project documentation.

## Recommendation Output

The recommendation output will be structured concisely and be easily understandable, even to a beginner Commander:

1.  **Recommended Mission:** A clear, singular mission or task to focus on.
2.  **Why it matters today:** A brief explanation of the significance and impact of this mission now.
3.  **Smallest meaningful next action:** A concrete, actionable first step to begin the mission.
4.  **What can wait:** A concise list or statement of tasks/concerns that can be safely deferred.
5.  **Confidence or uncertainty note:** When appropriate, a brief note indicating the level of confidence in the recommendation or acknowledging areas of uncertainty due to limited context.

## Judgment Principles

This capability operates under strict judgment principles to ensure trust and effectiveness:

-   **Prioritize Commander-stated goals:** The Commander's explicit objectives always take precedence.
-   **Favor meaningful leverage over task quantity:** Focus on actions that yield the greatest impact, not just completing many small tasks.
-   **Consider urgency without fabricating urgency:** Acknowledge genuine deadlines but avoid creating artificial pressure.
-   **Prefer one clear recommendation over a long list:** Reduce cognitive load by providing a singular, focused direction.
-   **Explain reasoning:** Always provide a clear "why" behind the recommendation.
-   **Acknowledge uncertainty:** Be transparent when context is limited or the recommendation is not absolute.
-   **Never shame the Commander:** Recommendations are supportive, never critical or guilt-inducing.
-   **Allow the Commander to reject or change the recommendation:** The Commander's autonomy is paramount; they retain full control.

## Decision Boundaries

-   **Mission Intelligence recommends; the Commander decides.** This capability provides guidance, not commands.
-   It may prioritize among known goals, but it **may not invent goals** or tasks that do not originate from the Commander's input.
-   It **may not silently alter missions or commitments** without explicit Commander approval.
-   It **may not claim certainty unsupported by available context**.
-   It may ask for clarification when context is insufficient to provide a confident recommendation.

## Example Scenarios

These examples illustrate the capability's application without detailing implementation:

-   **One urgent deadline versus several optional tasks:** The system recommends focusing on the urgent deadline, explaining the potential negative consequences of delay, and lists the optional tasks as deferrable.
-   **A high-leverage project blocked by a small prerequisite:** The system identifies the prerequisite as the highest-value mission, explaining that completing it unlocks significant progress on a larger goal.
-   **A Commander returning after several inactive days:** The system recommends a small, easy-to-complete task to rebuild momentum, acknowledging the break and avoiding overwhelming them with a backlog.
-   **Several equally valid priorities with insufficient context:** The system presents one recommendation with a low confidence note and asks a clarifying question to help the Commander provide more context for a better future recommendation.
-   **A day where recovery or preparation is more valuable than output:** Based on known energy levels or upcoming demanding missions, the system recommends rest, learning, or planning as the highest-value activity for the day.

## Non-Goals

This capability is explicitly NOT:

-   A generic to-do list sorter that simply reorders tasks based on arbitrary metrics.
-   An autonomous decision-maker that acts without Commander oversight.
-   A guilt or pressure mechanism designed to force productivity.
-   A notification spam system that constantly demands attention.
-   A promise that one recommendation is objectively perfect or the only correct path.
-   A replacement for Commander judgment; it is an augmentation.

## Success Criteria

This capability succeeds when:

-   The Commander clearly understands what to do next.
-   The reasoning behind the recommendation is transparent and logical.
-   The recommendation demonstrably aligns with the Commander's known goals and context.
-   The Commander reports feeling less overwhelmed and more focused after using it.
-   The Commander can easily accept, reject, or adjust the recommendation.
-   No data or priority is fabricated; all recommendations are based on existing, verifiable inputs.

**North Star:** "The Commander should leave the briefing knowing what matters today and why."

## Open Product Questions

-   How much context is sufficient before Archie should attempt a recommendation versus asking a clarifying question?
-   When should Archie explicitly ask a clarifying question to gather more input from the Commander?
-   Should the Commander be able to "lock" a priority, preventing Archie from recommending against it for a period?
-   How should different factors (time, energy, deadlines, impact, personal interest) be weighted when conflicting goals are present?
-   What mechanisms are needed to help the Commander resolve conflicting goals or priorities?
-   How should the quality and helpfulness of recommendations be evaluated over time?

## Initial Scope

The first version of this capability will be deliberately small and focused:

-   It will use only context FounderOS already stores (e.g., active missions, stated goals, recent history).
-   It will recommend one primary mission.
-   It will provide one clear reason why it matters.
-   It will suggest one smallest meaningful next action.
-   It will identify what can safely wait.
-   There will be no calendar integration.
-   There will be no external data inputs.
-   There will be no autonomous changes to missions or goals.
-   There will be no background monitoring or proactive nudges.

## Future Evolution

Future iterations of this capability may include:

-   **Calendar context:** Integration with Commander's schedule to inform recommendations based on availability.
-   **Long-term pattern recognition:** Identifying recurring challenges or opportunities across extended periods.
-   **Energy and availability awareness:** More sophisticated understanding of Commander's capacity.
-   **Knowledge connections:** Proactively linking relevant knowledge base articles or past lessons to current missions.
-   **Proactive preparation:** Suggesting preparatory steps for upcoming missions or challenges.
-   **AI teammate coordination:** Recommendations that involve delegating tasks or collaborating with other AI systems within FounderOS.