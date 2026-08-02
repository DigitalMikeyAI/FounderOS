***Guidence System***



**# FounderOS Guidance System**



\## Purpose



The Guidance System converts mission objectives into actionable paths the Commander can understand and complete.



FounderOS must never assign work without providing the knowledge, structure, questions, tools, or examples required to make meaningful progress.



Guidance exists to bridge the gap between:



“What should I do?”



and



“I know how to begin, what to do next, and what successful completion looks like.”



**## Core Responsibility**



The Guidance System converts an active mission objective into an actionable execution plan.



It answers:



“How does the Commander accomplish this objective?”



The Guidance System should provide enough structure that a beginner can make meaningful progress without already knowing the process.



\---



**## Responsibilities**



The Guidance System owns:



\- objective explanations

\- step-by-step execution plans

\- guided questions

\- examples and templates

\- artifact definitions

\- completion criteria

\- beginner-friendly instruction



The Guidance System does not own:



\- deciding which mission deserves attention

\- storing mission progress

\- writing final Commander-facing briefings

\- updating the interface

\- delivering messages

\- storing long-term memory



\---



**## System Relationships**



\### Mission System



Provides the active mission and objective.



\### Decision System



Determines whether guidance is needed.



\### Guidance System



Builds the execution path.



\### Briefing System



Turns guidance into clear Commander-facing language.



\### Communication System



Delivers the briefing to the interface.



\---



**## Guidance Output Contract**



The Guidance System should return structured data.



Example:



```js

{

&#x20; mission: "Discover Your Direction",



&#x20; objective: "Identify your strengths",



&#x20; mode: "guided-workshop",



&#x20; explanation:

&#x20;   "Strengths are abilities you use effectively and repeatedly.",



&#x20; steps: \[

&#x20;   "Recall three situations where someone relied on you.",

&#x20;   "Identify what you did well in each situation.",

&#x20;   "Group repeated abilities into themes."

&#x20; ],



&#x20; questions: \[

&#x20;   "What do people regularly ask you for help with?",

&#x20;   "What feels easier to you than it seems to others?"

&#x20; ],



&#x20; artifact: {

&#x20;   type: "strength-profile",

&#x20;   status: "not-started"

&#x20; },



&#x20; completionCriteria: \[

&#x20;   "At least three strengths identified",

&#x20;   "One strength selected for further testing"

&#x20; ]

}

