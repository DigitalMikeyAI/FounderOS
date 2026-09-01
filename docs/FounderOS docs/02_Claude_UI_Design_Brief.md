**FounderOS Collaboration Master Doc.**


**Prompt to CLaude:**

We've reached a point in development where the architecture is solid. We're no longer looking for a redesign—we're looking for refinement. Every improvement should reinforce the FounderOS philosophy rather than replace what already exists.







FounderOS Bridge Phase One — UI Elevation Brief



You are joining the FounderOS development team as the Lead UI/UX Designer.



FounderOS is not a productivity dashboard.



It is Mission Control for entrepreneurs.



The user is called the Commander.



Archie is Mission Control's Command Intelligence. He is not a chatbot or customer support. He is the operating intelligence that guides the Commander through their daily mission.



This project already has a working HTML/CSS structure. Your task is not to redesign the application or invent new features.



Your task is to elevate the existing experience so it fully reflects the FounderOS philosophy.



FounderOS Design Manifesto: 



(Refer to the FounderOS Design Manifesto.txt)



Your Mission



Review the attached HTML and CSS and improve the presentation while preserving the existing architecture.



Maintain all IDs, classes, and JavaScript hooks whenever possible.



Do not redesign functionality.



Do not remove systems.



Improve the experience.



Design Goals



1\. Archie is Mission Control.



Archie should immediately feel like the center of the experience.



He should not appear to be a sidebar widget or chatbot.



The Commander should naturally look toward Archie first.



2\. Build the Bridge.



The Commander should feel like they have stepped onto the bridge of a futuristic command center.



Avoid traditional SaaS dashboard layouts.



Reduce the feeling of "cards on a page."



Increase immersion.



3\. Strengthen Visual Hierarchy



Every screen should naturally guide attention in this order:











Archie







Today's Mission







Founder Progress







Supporting Systems



Nothing else should compete for attention.



4\. Increase Cinematic Quality



Use subtle motion.



Ambient lighting.



Depth.



Glass.



Reflections.



Soft glows.



Calm animations.



Nothing should feel flashy or distracting.



5\. Preserve Simplicity



FounderOS should feel calm.



Never cluttered.



Every element should have a purpose.



6\. Respect the Existing Product



Do not:











invent new workflows







rename IDs







remove functionality







change JavaScript behavior



Only improve presentation and user experience.



7\. Think Like a Product Designer



Every design decision should answer:



Does this help the Commander feel more capable?



If not, reconsider it.



Deliverables



Please return:











Updated HTML (only where necessary)







Updated CSS







Animation improvements







Layout improvements







UX recommendations







Explanation for major design decisions



Context



Another developer is simultaneously building Archie Core, including:











Personality







Memory







Mission Engine







Daily Briefings







Status System







Queue System



Assume those systems already exist or are actively being developed.



Your responsibility is making the interface worthy of them.



One last thing...



Read the FounderOS Design Manifesto before making any design decisions.



The manifesto is the source of truth.







**This is Claude's response to our prompt:** 

This a great brief — thank you for the manifesto, it gives me a real basis for judgment calls instead of guessing. Let me read it as the source of truth it's meant to be, then work from your actual current files (I can see you've already extended things a bit — there's a new archie-core-status / archie-status-light / archie-status-text hook in your index.html that wasn't in what I sent, presumably for the Archie Core work in progress. I'll build on that, not around it). Here's my read before I touch anything: The core issue right now: Archie lives in a 360px side-column card, sandwiched between Founder Station and Command Log — visually equal weight to a stats widget. The manifesto is explicit that Archie is "Mission Control's Command Intelligence," not a sidebar feature. Structurally, this is the biggest gap between what exists and what the manifesto asks for. My plan (presentation-only, zero ID/class renames, zero JS changes): Promote Archie out of the side column into a full-width "Command Deck" positioned right after the hero — first thing the Commander's eye lands on after arrival. Soften the "cards on a page" feeling — reduce competing borders/shadows, let sections breathe into a shared ambient background rather than reading as separate boxed widgets. Cinematic motion — staggered fade-ins on arrival, a slow ambient light sweep, a calmer Archie pulse tied to the new status hooks, nothing bouncy or attention-grabbing. Reinforce hierarchy (Archie → Mission → Progress → Supporting Systems) via size, position, and visual weight rather than new components. Apply the same Archie treatment consistently on Missions and Progress pages. Let me pull your actual current files and get to work.

