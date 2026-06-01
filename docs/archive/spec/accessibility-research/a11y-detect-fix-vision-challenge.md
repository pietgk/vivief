# A11y Vision vs. Practitioner Reality: Capability Assessment

> Created: 2026-02-09
> Status: Analysis Document
> Purpose: Cross-reference our a11y automation vision with practitioner critique to calibrate expectations

**Sources:**

- [DevAC A11y Detect-Fix Vision](./a11y-detect-fix-vision.md) — research-backed capability model for automated WCAG testing
- [AI Will Not Eliminate the Need for Accessibility Professionals](./ai-will%20not%20eleminate-the-need-for-accessibility-professionals.md) — Sheri Byrne-Haber (CPACC), practitioner critique

---

## 1. Executive Summary

Our vision document claims LLMs can address 20-27% of what was previously "human-only" accessibility testing, leaving only 5-10% genuinely human-required (Tier C). Byrne-Haber argues AI cannot replace accessibility professionals — her central thesis is that "context" is what AI cannot do. She categorizes 11 accessibility task domains into 4 buckets and concludes no tasks can be fully replaced by AI.

Both perspectives have merit. The truth lies in the intersection.

| Domain | Byrne-Haber | Our Vision | Honest Assessment |
|--------|-------------|------------|-------------------|
| Automated testing | Already exists (non-AI) | Agree, axe-core is pre-AI | **Agreement.** LLM adds marginal value (false positive filtering) |
| Screen reader testing | Can't help | Tier B: Guidepup + LLM | **Partially right.** Desktop SR automation is viable but immature; mobile gestures remain beyond automation |
| Keyboard navigation | Can't help / already exists | Tier B: Playwright focus trace + LLM | **Partially right.** Mechanical capture works; contextual "right place" judgment is lower confidence |
| Visual/display testing | Can't help (sighted human) | Tier A: Multimodal LLM | **Contested.** Multimodal models are a real capability shift she doesn't account for, but reliability is unproven at scale |
| Content & semantics | Can't help / already exists | Tier A: 85-87% accuracy | **Evidence favors our vision** for simple cases; complex/contextual content remains hard |
| Form testing | Can't help / already exists | Tier A/B: automation triggers + LLM evaluates | **Both partially right.** She's correct that triggering errors requires runtime; our Tier B addresses this |
| Test plans | AI can help | Agree: LLM drafts, human reviews | **Agreement** |
| Developer collaboration | Limited help | Tier A: Code review pattern matching | **Moderate agreement.** Both say AI helps; we may overestimate accuracy |
| Design collaboration | Help with mechanical, not strategic | Tier A: Mechanical checks | **Agreement on limits** |
| Reporting | Help + already exists | Agree: LLM drafts ACR/VPAT | **Agreement** |
| User research | Help with mechanics, not judgment | Tier C: Human-only | **Full agreement** |

**Bottom line:** Of 11 domains, we have full agreement on 4, moderate agreement on 3, and genuine tension on 4. The contested domains (screen reader, keyboard, visual, content) are precisely where our Tier A/B claims need the most rigorous validation before shipping.

---

## 2. Domain-by-Domain Cross-Reference

### 2.1 Automated Testing

| Aspect | Assessment |
|--------|------------|
| **Byrne-Haber** | Category 3+4: Triggering automated tests is pre-AI technology. Interpreting false positives requires context AI cannot provide. |
| **Our vision** | Agrees axe-core is pre-AI tech. Claims LLM adds value for false positive filtering and interpreting results in component context. |
| **Agreement** | Both acknowledge automated scanning (axe-core, Lighthouse) is established, non-AI technology. Neither claims this is novel. |
| **Tension** | Minor. She says false positive interpretation requires context; we claim LLM can help filter but don't claim full replacement. |
| **Honest assessment** | Automated scanning is our strongest foundation precisely because it doesn't depend on LLMs. LLM-based false positive filtering is a nice-to-have, not a core capability claim. |
| **Confidence** | **Very High** for scanning. **Medium** for LLM-assisted interpretation. |

### 2.2 Screen Reader Testing

| Aspect | Assessment |
|--------|------------|
| **Byrne-Haber** | Category 3: AI can't trigger mobile gestures, can't judge whether announcements are adequate, can't determine if described audio is "good enough." |
| **Our vision** | Tier B: Guidepup + LLM can automate desktop screen reader interaction and evaluate announcements. Mobile SR testing acknowledged as Tier C. |
| **Agreement** | Both agree mobile screen reader gesture testing (VoiceOver swipes, TalkBack) is beyond current automation. |
| **Tension** | **Major.** She treats all screen reader testing as impossible for AI. We distinguish desktop (automatable via Guidepup on macOS VoiceOver) from mobile (genuinely human-required). |
| **Honest assessment** | Desktop VoiceOver automation via Guidepup is real but immature technology. It can capture announcement sequences. Whether an LLM can evaluate announcement *adequacy* ("is this announcement helpful?") is lower confidence — this is where her "context" argument has teeth. Mobile SR testing remains firmly human-territory. |
| **Confidence** | **Medium-Low.** Desktop automation is technically possible but unproven at scale. Mobile is **None.** |

### 2.3 Keyboard Navigation

| Aspect | Assessment |
|--------|------------|
| **Byrne-Haber** | Category 3+4: Keyboard testing is doable with non-AI automation. But verifying *logical* tab order requires contextual judgment — "the right place" is a human concept. |
| **Our vision** | Tier B: Playwright captures focus trace (Tab sequence), LLM evaluates whether the order is logical given the DOM structure and visual layout. |
| **Agreement** | Both agree mechanical keyboard testing (can you Tab to every interactive element?) is automatable without AI. |
| **Tension** | **Major.** She says determining whether focus order is *logical* requires human contextual judgment. We claim an LLM can evaluate this given DOM + visual context. |
| **Honest assessment** | She's partially right. Mechanical keyboard testing (trap detection, focus visibility) is deterministic and doesn't need LLMs. But logical focus order evaluation is genuinely hard — "logical" depends on the page's purpose, the user's task, and visual layout conventions. An LLM with DOM + screenshot can likely catch *obvious* violations (e.g., focus jumps from header to footer) but may miss subtle ones (e.g., focus order that's technically valid but confusing given the visual hierarchy). |
| **Confidence** | **High** for trap detection and focus visibility. **Low-Medium** for logical order evaluation. |

### 2.4 Visual/Display Testing

| Aspect | Assessment |
|--------|------------|
| **Byrne-Haber** | Category 3: Requires a sighted human to review responsive breakpoints, text overlap, zoom behavior. |
| **Our vision** | Tier A: Multimodal LLMs analyze screenshots for text overlap, content truncation, zoom reflow issues. Cross-reference with DOM for comprehensive assessment. |
| **Agreement** | Both agree this is a visual task that requires "seeing" the rendered output. |
| **Tension** | **Major.** She assumes only humans can "see" and interpret visual output. Our vision argues multimodal LLMs (GPT-4V, Claude vision) represent a capability shift she doesn't account for. |
| **Honest assessment** | This is where the practitioner critique is most dated. Multimodal LLMs *can* detect text overlap, truncated content, and layout issues in screenshots — this is well within current vision model capabilities. However: (a) reliability at scale is unproven, (b) subtle visual issues (slightly misleading spacing, culturally-specific layout expectations) may be missed, (c) testing across every breakpoint/zoom level requires systematic screenshot capture infrastructure. The capability exists but the pipeline to use it reliably at scale does not yet. |
| **Confidence** | **Medium.** The LLM capability is real; the end-to-end pipeline is unbuilt. |

### 2.5 Content & Semantics

| Aspect | Assessment |
|--------|------------|
| **Byrne-Haber** | Category 3+4: Existing automated tools catch structural issues. But AI "cannot determine whether images are decorative with 100% accuracy or what the correct alt text is, because that requires context." |
| **Our vision** | Tier A: Alt text quality at 7/10 (~85% for simple images). Link purpose at 87.18% (Lopez-Gil). Heading structure at 8/10. |
| **Agreement** | Both agree structural semantics (heading hierarchy, landmark roles) are automatable. |
| **Tension** | **Major.** She says context makes alt text and link purpose impossible for AI. Lopez-Gil 2024 data directly contradicts this with 87.18% accuracy on criteria 1.1.1, 2.4.4, and 4.1.2 — the exact criteria she claims require human context. |
| **Honest assessment** | The evidence favors our vision for straightforward cases. An LLM can evaluate whether alt text describes an image (85%), whether link text conveys purpose (87%), and whether headings are structured logically (8/10). But she has a point on the remaining 13-15%: images whose meaning depends on surrounding article context, links whose purpose depends on multi-page user journey, and decorative vs. informative distinctions that depend on editorial intent. The research shows strong performance, not perfection. |
| **Confidence** | **Medium-High** for simple/common cases. **Low** for context-heavy edge cases. |

### 2.6 Form Testing

| Aspect | Assessment |
|--------|------------|
| **Byrne-Haber** | Category 3+4: Required fields and labels are already automated. Error message evaluation requires triggering errors (runtime) and judging message clarity (context). |
| **Our vision** | Tier A/B: Error message quality at 7/10. Tier B uses browser automation to trigger validation errors, then LLM evaluates message helpfulness. |
| **Agreement** | Both agree field-level checks (labels, required indicators) are automated. Both agree triggering errors requires runtime interaction. |
| **Tension** | **Moderate.** She's right that AI can't trigger errors in isolation. Our Tier B model explicitly addresses this with browser automation as the trigger mechanism. The remaining question: can an LLM judge whether "Please enter a valid email" is helpful enough? |
| **Honest assessment** | The architectural answer is sound: automation triggers, LLM evaluates. But error message helpfulness is subjective and depends on the user's prior actions, their mental model, and the form's purpose. An LLM can catch obviously bad messages ("Error") but may miss subtly unhelpful ones ("Invalid input" when the user doesn't know *what's* invalid). 7/10 quality is reasonable for flagging obvious issues, not for comprehensive assessment. |
| **Confidence** | **Medium** for flagging poor error messages. **Low** for evaluating contextual helpfulness. |

### 2.7 Test Plans

| Aspect | Assessment |
|--------|------------|
| **Byrne-Haber** | Category 2: AI is good at generating starting points but plans require "significant modification." First task she gives AI a vote for. |
| **Our vision** | Agrees: LLM-generated test plans need human review and customization. |
| **Agreement** | Both say AI can draft test plans that humans then refine. |
| **Tension** | None significant. |
| **Honest assessment** | This is a safe, well-understood LLM use case. Generate comprehensive WCAG test matrices, suggest test scenarios based on component type, draft acceptance criteria. Human review catches domain-specific gaps. |
| **Confidence** | **High** for generation. Human review is required, not optional. |

### 2.8 Developer Collaboration

| Aspect | Assessment |
|--------|------------|
| **Byrne-Haber** | Category 2+3: AI can review PRs but only 1/3 of issues are automatable. "Better way" decisions require context. Very limited vote for category 2. |
| **Our vision** | Tier A: Code review for accessibility patterns (ARIA usage, keyboard handler presence, semantic HTML). LLM as WCAG knowledge base during development. |
| **Agreement** | Both agree AI can surface mechanical issues in code review (missing ARIA attributes, incorrect roles). |
| **Tension** | **Moderate.** She emphasizes that recommending *better* approaches requires understanding the component's purpose and user context. We focus on pattern-matching against known WCAG patterns. |
| **Honest assessment** | AI code review for accessibility is useful but limited. It can catch: missing `alt` attributes, incorrect ARIA roles, keyboard handlers without focus management. It struggles with: whether a component *should* be a button vs. a link (semantic choice depends on behavior intent), whether an ARIA live region *should* be assertive vs. polite (depends on urgency context). Pattern matching is valuable; architectural accessibility decisions remain human work. |
| **Confidence** | **Medium-High** for pattern detection. **Low** for "better way" recommendations. |

### 2.9 Design Collaboration

| Aspect | Assessment |
|--------|------------|
| **Byrne-Haber** | Category 2+3: AI is excellent at mechanical checks (contrast ratios, touch target sizes). Cannot participate in strategic accessibility conversations, negotiate with stakeholders, or assess whether a "technically compliant" design is actually usable. |
| **Our vision** | Tier A for mechanical checks. Acknowledges strategic design collaboration as human territory. |
| **Agreement** | Strong. Both see AI as useful for mechanical design validation and insufficient for strategic decisions. |
| **Tension** | Minimal. Her point about "AI evaluates designs against rules, not against human experience" is valid and aligns with our Tier C boundary. |
| **Honest assessment** | This is well-calibrated on both sides. Automated contrast checking, touch target measurement, and spacing validation are straightforward. The human work — advocating for accessibility in design reviews, making trade-offs between aesthetics and usability, understanding how cognitive disabilities affect comprehension — is correctly identified as beyond AI by both perspectives. |
| **Confidence** | **Very High** for mechanical checks. **None** for strategic design decisions. |

### 2.10 Reporting

| Aspect | Assessment |
|--------|------------|
| **Byrne-Haber** | Category 2+4: Dashboard automation already exists (non-AI). AI can help draft ACR/VPAT summaries but "may hallucinate which WCAG criteria to apply." |
| **Our vision** | Agrees: dashboards are pre-AI tech, LLM can help draft compliance documentation with human review. |
| **Agreement** | Strong. Both see AI as a drafting assistant for compliance documents, with human verification required. |
| **Tension** | Minor. Her hallucination warning is valid — LLMs can confidently apply incorrect WCAG criteria. Our structured evaluation approach (specific criteria per check) mitigates but doesn't eliminate this. |
| **Honest assessment** | LLM-assisted report drafting is low-risk because a human reviews the output before it becomes an official compliance document. The hallucination risk is real but the workflow (draft → review → publish) contains it. |
| **Confidence** | **High** for drafting. Human sign-off is non-negotiable. |

### 2.11 User Research

| Aspect | Assessment |
|--------|------------|
| **Byrne-Haber** | Category 2+3: AI might help draft interview questions and analyze transcripts. Cannot participate in sessions, understand emotional responses, or replace the insight of someone with a disability testing a product. |
| **Our vision** | Tier C: Genuinely human-required. Lived experience with disability is not simulatable. |
| **Agreement** | **Complete.** This is the strongest point of agreement. |
| **Tension** | None. |
| **Honest assessment** | Neither AI nor automation can replicate the experience of a person with a disability navigating an interface. This is the irreducible core of human-required accessibility work. AI can help with logistics (scheduling, transcription, question drafting) but the research itself must involve real users with real disabilities. |
| **Confidence** | **None** for replacing human research. **High** for logistical support. |

---

## 3. Where Byrne-Haber Is Right (And We Should Listen)

### 3.1 Context is genuinely hard

Her repeated "requires context" argument is valid for specific scenarios our vision should not overclaim:

- **Alt text depending on surrounding content** — An image of a graph means different things in a financial report vs. a tutorial. The image alone is insufficient; the LLM needs the full page context to generate appropriate alt text. Our 85% figure likely reflects simple, self-contained images.
- **Error messages depending on user's prior actions** — "Invalid date" is unhelpful if the user doesn't know *which* date field or *what format* is expected. The LLM can evaluate message text but may miss that the user saw three date fields and needs disambiguation.
- **Logical tab order depending on page purpose** — A form where Tab moves from "First Name" to "Last Name" to "Email" is logical. The same form where Tab moves from "First Name" to "Submit" to "Last Name" is not. But "logical" depends on visual layout and user expectations, not just DOM order.

### 3.2 Mobile screen reader gestures remain beyond automation

Physical interaction testing on iOS VoiceOver (swipe gestures, rotor navigation) and Android TalkBack (explore-by-touch) has no automation equivalent. Our vision acknowledges this in Tier C but should emphasize the gap: **desktop VoiceOver automation (Guidepup) does not extend to mobile.** This is a platform limitation, not an LLM limitation.

### 3.3 The overlay cautionary tale

The accessiBe FTC settlement ($1M) proves that overclaiming AI capabilities in accessibility causes real harm to:
- **Users with disabilities** who encounter broken experiences marketed as "fixed"
- **Organizations** that face legal liability for relying on unproven automation
- **The accessibility industry** whose credibility suffers from snake oil products

We must not become an overlay-style product. DevAC is a *diagnostic* tool that surfaces issues for human decision-making, not an automated remediation engine that claims compliance.

### 3.4 "Confident-sounding but wrong"

Her implicit warning about AI being wrong while sounding right aligns with the Baymard Institute finding (80% error rate with unstructured prompts). LLMs produce fluent, confident-sounding output regardless of correctness. Our structured evaluation approach (specific WCAG criteria, defined pass/fail conditions) reduces this risk — the Lopez-Gil 87.18% result uses structured evaluation — but does not eliminate it. Every LLM assessment needs a confidence signal.

### 3.5 User empathy has no substitute

No AI can replicate the experience of a person with a disability navigating an interface. A blind user's frustration with a poorly-announced modal, a motor-impaired user's struggle with a small touch target, a cognitively disabled user's confusion at an unclear error message — these are human experiences that inform what "accessible" actually means in practice. This is the strongest argument for Tier C and the clearest boundary on what DevAC should never claim to automate.

---

## 4. Where Our Vision Challenges Her Position (With Evidence)

### 4.1 Lopez-Gil 87.18% on "impossible" criteria

On the exact WCAG criteria she claims "can't be done by AI" — 1.1.1 (Non-text Content), 2.4.4 (Link Purpose), 4.1.2 (Name, Role, Value) — Lopez-Gil & Pereira 2024 achieved 87.18% detection using structured LLM evaluation. This is not hypothetical: it is published, peer-reviewed research on the same criteria she categorizes as "cannot help." The 87% figure doesn't mean replacement, but it directly contradicts the claim that AI "cannot help" with these tasks.

### 4.2 Multimodal vision changes the equation

Her analysis appears to predate or not account for multimodal LLMs (GPT-4V, Claude vision, Gemini Pro Vision). When she writes that visual/display testing "requires a sighted human," she's correct for 2022 but outdated for 2025-2026. Multimodal models can:

- Detect text overlap in screenshots
- Identify truncated content at different viewport sizes
- Compare visual hierarchy against DOM structure
- Flag contrast issues beyond what color-ratio math can catch (e.g., text over complex backgrounds)

This doesn't make multimodal testing production-ready, but it invalidates the premise that "only humans can see."

### 4.3 Browser automation bridges the "trigger" gap

Her keyboard and form testing critique assumes AI operates in isolation — that it would somehow need to "trigger gestures" or "submit forms" itself. Our Tier B model explicitly separates concerns:

1. **Playwright/Storybook play functions** trigger interactions deterministically
2. **The captured output** (focus sequence, error messages, announcement log) is passed to the LLM
3. **The LLM evaluates** the captured data against WCAG criteria

The AI doesn't need to "trigger" anything. It evaluates data captured by browser automation. This is a fundamentally different architecture from the "AI replaces the tester" model she critiques.

### 4.4 Structured evaluation vs. general prompting

The Baymard Institute's 80% error rate finding — which supports her skepticism — used unstructured prompts. Our approach uses structured WCAG criteria evaluation with specific pass/fail conditions, defined element scope, and repeatable methodology. Lopez-Gil's 87.18% result confirms that structured prompting dramatically changes LLM accuracy on accessibility tasks. The gap between "ask ChatGPT about accessibility" and "structured WCAG evaluation pipeline" is the gap between her critique and our architecture.

### 4.5 "Cannot help" vs. "cannot replace" — a false binary

Her category 3 ("cannot replace or help") is too absolute for several domains. On content and semantics, the evidence shows 85-87% accuracy — this is substantial *help*, even if it's not *replacement*. The honest framing is:

- **Cannot replace:** correct. No domain can be fully automated.
- **Cannot help:** incorrect for at least 4 of the 7 domains she puts in this category.

The practical question isn't "can AI replace the accessibility professional?" (no) but "can AI catch 70-87% of issues that currently require manual review?" (yes, for specific criteria, with structured evaluation).

---

## 5. The Calibrated Position — What DevAC Can Actually Deliver

Combining both perspectives into a realistic capability matrix:

| Capability | Confidence | Quality | Evidence / Notes |
|-----------|-----------|---------|------------------|
| Automated scanning (axe-core) | **Very High** | Production-ready | Both agree. Pre-AI, well-proven technology |
| Static analysis (DevAC WCAG rules) | **Very High** | Production-ready | Compile-time detection. Deterministic, zero LLM dependency |
| Behavioral testing (keyboard, focus) | **High** | Reliable via Storybook play functions | Byrne-Haber: "doable pre-AI." Correct — play functions are deterministic |
| Keyboard trap detection | **High** | Deterministic | Mechanical Tab sequence test. No LLM needed |
| Heading structure assessment | **High** | ~8/10 | LLM strength: structural analysis. Byrne-Haber doesn't specifically challenge |
| Link purpose from context | **Medium-High** | ~87% (Lopez-Gil 2024) | Strong evidence, but 13% miss rate means human review still needed for edge cases |
| Alt text quality evaluation | **Medium** | ~85% simple, lower for complex | Evidence supports simple images. **Risk:** contextual/editorial images where meaning depends on surrounding content |
| Error message helpfulness | **Medium** | ~7/10 | Byrne-Haber correctly notes errors require triggering (runtime). Tier B automation addresses triggering; LLM evaluates text quality |
| Visual/display testing | **Medium** | Emerging | Multimodal LLMs challenge "sighted human required" premise. Reliability unproven at scale. Pipeline unbuilt |
| Cross-page consistency | **Medium** | Requires crawl infrastructure | Both agree: needs multi-page context. LLM can evaluate given data, but collecting that data requires E2E infrastructure |
| Focus order evaluation | **Low-Medium** | Needs judgment | Byrne-Haber: "contextual." Correct — but automation captures the sequence and LLM evaluates against visual layout. Catches obvious violations, misses subtle ones |
| Screen reader announcements (desktop) | **Medium-Low** | Immature tooling | Guidepup automates macOS VoiceOver. LLM evaluation of announcement adequacy is lower confidence |
| Screen reader testing (mobile) | **None** | Human-only | Both agree. No automation path for iOS VoiceOver gestures or Android TalkBack |
| Cognitive accessibility (workflow-level) | **Low** | Unreliable | Task flows, mental models, information architecture — beyond current LLM capability for quality assessment |
| User testing with disabilities | **None** | Human-only | Complete agreement. Lived experience is not simulatable |
| Legal/compliance sign-off | **None** | Human-only | Complete agreement. Human accountability required for VPAT, ACR, legal attestation |

---

## 6. Risk Management — How to Not Become accessiBe

The overlay industry's failure is the most important cautionary tale for our work. These principles derive from honest assessment of both documents:

### 6.1 Never claim compliance

DevAC is a diagnostic tool, not a compliance badge. It surfaces issues for human review. Marketing, documentation, and UI must never imply that running DevAC scans equals WCAG compliance. The moment we cross that line, we become an overlay with better engineering.

### 6.2 Always show confidence scores

Every LLM-generated assessment must include a confidence level. Developers need to know when to trust the tool's output and when to escalate to human review. A "pass" with 60% confidence is a flag for review, not clearance.

### 6.3 False positives over false negatives

Better to over-flag than to miss real issues. Byrne-Haber's concern about AI being "confident but wrong" is best addressed by erring toward caution. If the LLM is uncertain about an alt text assessment, flag it for human review rather than marking it as passing.

### 6.4 Human review path always available

Tier C is not optional or aspirational — it's a permanent scope boundary. The tool should make clear what percentage of WCAG criteria it can assess, what percentage it assesses with reduced confidence, and what percentage requires human evaluation. This transparency is the differentiator between a diagnostic tool and an overlay.

### 6.5 Honest capability documentation

This document IS the mitigation. By publishing an honest assessment of what we can and cannot do — including where a credentialed practitioner disagrees with our claims — we demonstrate the kind of intellectual honesty that overlays never show. If a customer reads this document and decides our tool doesn't cover enough, that's a better outcome than a customer who buys our tool thinking it covers everything.

---

## 7. Implications for DevAC Roadmap

This cross-reference analysis directly informs implementation priority:

| Priority | Phase | Rationale |
|----------|-------|-----------|
| **Highest** | Phase 0-3: axe-core integration + behavioral testing (Storybook play functions, keyboard/focus) | Both documents agree: deterministic automation is reliable and proven. Ship this first. No LLM dependency, no confidence ambiguity. |
| **High** | Phase 4: React Native testing (XCTest performAccessibilityAudit) | Platform-native APIs are deterministic. Apple's audit types (contrast, dynamicType, hitRegion, sufficientElementDescription) are well-defined. High confidence. |
| **High** | Phase 6: E2E page-level rules | Fills Storybook's 8-rule gap (bypass, document-title, html-has-lang, etc.). Deterministic, high confidence. Addresses cross-page criteria (3.2.3, 3.2.4) that both perspectives agree need multi-page context. |
| **Medium** | Phase 5 Tier A: Semantic LLM evaluation | Evidence supports 70-87% quality (Lopez-Gil, WebAccessVL). Ship with confidence scores and explicit "needs human review" flagging for low-confidence results. This is where we challenge Byrne-Haber's position — but responsibly, with data. |
| **Medium-Low** | Phase 5 Tier B: Runtime LLM evaluation | Requires browser automation infrastructure (Playwright + Guidepup). Higher complexity, lower confidence. More engineering investment per capability unit. Build after Tier A proves the evaluation model works. |
| **Explicit scope boundary** | Tier C: Human-required | Document as permanently out of automated scope. Mobile SR testing, user research, cognitive UX assessment, legal sign-off. Never claim to cover this. Surface what CAN'T be automated as clearly as what can. |

### Key sequencing insight

Ship deterministic capabilities (Phases 0-4, 6) before LLM-dependent ones (Phase 5). This builds credibility on provably reliable automation before introducing probabilistic assessments. When we do ship LLM evaluation, the foundation of deterministic testing means customers aren't relying solely on LLM output — it augments a proven base.

---

## Appendix: Evidence Quality Assessment

| Source | Type | Year | Strength | Limitation |
|--------|------|------|----------|------------|
| Lopez-Gil & Pereira 2024 | Peer-reviewed research | 2024 | 87.18% on 3 WCAG criteria, structured methodology | Only 3 criteria tested. Sample size not detailed in our reference. |
| WebAccessVL 2025 | Research | 2025 | 5.34 → 0.44 violations per site (92% reduction) | Vision-language model approach; production readiness unclear |
| A11YN 2025 | Research | 2025 | 60% reduction in inaccessibility rate | Reinforcement learning approach; different methodology from our architecture |
| ChatGPT a11y study 2025 | Study | 2025 | 100% automated error detection, 90.91% manual errors | 9.5x difficulty multiplier for complex issues — confirms the easy/hard split |
| Baymard Institute | Industry report | — | 80% error rate with unstructured prompts | Validates that prompting methodology matters enormously |
| Byrne-Haber article | Expert opinion | 2025 | Practitioner experience, overlay cautionary tale | No quantitative data. Categorical arguments. May not account for 2024-2025 multimodal LLM advances |
| Deque 2022 | Industry benchmark | 2022 | 25-35% human-required consensus | Pre-LLM estimate. Our vision argues this is now outdated |

**Evidence gap:** We lack large-scale production validation of LLM-based accessibility evaluation. The research is promising (87.18%, 85%, 7-8/10 ratings) but conducted in controlled settings. Production performance across diverse real-world components at scale remains unvalidated. This gap should be closed before marketing Tier A/B capabilities as reliable.
