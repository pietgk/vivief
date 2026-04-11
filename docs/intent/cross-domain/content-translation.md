# Content & Translation in Vivief Concepts

> Brainstorm document. Four alternative approaches to handling content (CMS-like structured content) and translation (language + cultural adaptation) within the vivief concept model.
>
> Context: Pre-LLM development used CMS systems for content and schema. In vivief, schema is already datoms. Content and code overlap. Translation is deeper than i18n string replacement — different languages express things that other languages cannot, and culture shapes meaning.

---

## The Two Problems

### Problem 1: Content

A CMS manages structured content — pages, blocks, rich text, media, navigation, templates. It has:
- **Content types** (schema): blog post has title, body, author, tags
- **Content instances** (data): the actual blog post
- **Content workflows** (publishing): draft → review → published → archived
- **Content composition** (blocks): a page is assembled from reusable blocks

In vivief, schema is datoms, data is datoms, workflows are effectHandlers. So content should already be covered. But the question is: how cleanly? And does the content pattern reveal something the concepts miss?

### Problem 2: Translation

Translation is NOT:
- String replacement ("Hello" → "Hallo")
- Locale switching (date format, number format)

Translation IS:
- **Semantic equivalence across languages** — "How are you feeling?" in Dutch therapy carries different connotations than in English. The Dutch "Hoe gaat het met je?" is more intimate (using "je" not "u") and implies a different therapeutic relationship.
- **Cultural concepts without equivalents** — The Japanese concept of "amae" (甘え, dependent indulgence) has no English equivalent. A counseling app serving Japanese clients needs to work with concepts that don't translate.
- **Structural differences** — Arabic reads right-to-left. Chinese has no spaces between words. German compounds nouns without limit. These aren't rendering quirks — they change how content is structured.
- **Legal/regulatory variation** — Clinical terminology varies by jurisdiction. "Diagnosis" means different things under DSM-5 (US) vs ICD-11 (EU).

The real question: is translation a rendering concern (Surface), a data concern (Datom), a query concern (Projection), or a domain concern (effectHandler)?

---

## Alternative 1: "Content IS Datoms, Locale IS Attribute"

> The purist datom approach. Content is datoms. Locale is part of the attribute namespace.

### Content

Content types ARE Schema Contracts. A blog post type:

```
[:schema/post-title    :schema/type      :text       tx:1  true]
[:schema/post-title    :schema/required   true        tx:1  true]
[:schema/post-body     :schema/type      :richtext   tx:1  true]
[:schema/post-status   :schema/type      :keyword    tx:1  true]
[:schema/post-status   :schema/enum      [:draft :review :published :archived]  tx:1  true]
```

A blog post instance:

```
[post:42  :post/title    "Understanding CBT"        tx:10  true]
[post:42  :post/body     "<rich>...</rich>"          tx:10  true]
[post:42  :post/status   :published                  tx:10  true]
[post:42  :post/author   :user/anna                  tx:10  true]
```

Publishing workflow is an effectHandler: `(state, :content/publication-requested) => { datoms: [status-change], intents: [:notification/subscribers-notified] }`. Draft → review → published is a Behavior Contract (state machine). This is already covered by the concepts — zero new machinery.

**Content blocks** are datoms with ref attributes composing a page:

```
[page:1    :page/blocks    [block:a, block:b, block:c]    tx:11  true]
[block:a   :block/type     :hero                           tx:11  true]
[block:a   :block/content  post:42                         tx:11  true]
[block:b   :block/type     :sidebar                        tx:11  true]
```

A CMS is: Surface (Canvas mode) + Projection (content datoms) + Contract (content type schema) + effectHandler (publishing workflow). No new concept needed.

### Translation

Locale is encoded in the attribute namespace:

```
[post:42  :post/title          "Understanding CBT"          tx:10  true]
[post:42  :post/title:nl       "CBT begrijpen"              tx:15  true]
[post:42  :post/title:de       "CBT verstehen"              tx:16  true]
[post:42  :post/title:ja       "CBTを理解する"                tx:17  true]
```

The Projection filters by locale:

```typescript
Projection({
  filter: { entity: 'post:42', attributeSuffix: ':nl' },
  fallback: { attributeSuffix: ':en' }  // Fall back to English if no Dutch
})
```

**Cultural concepts without equivalents:** When a concept exists in one language but not another, the translated attribute simply doesn't exist. The fallback chain handles this — Surface shows the original-language term with an annotation, or the content author writes a culturally adapted version instead of a translation.

**AI translation as effectHandler:** `(state, :content/translation-requested) => { datoms: [translated-content] }`. The AI loop proposes translations (`:tx/source :ai`, `:tx/status :pending`), human translator reviews and approves.

### Assessment

**Strengths:** Pure. No new concepts. Content and translation are just datoms with attribute conventions. Schema Contracts validate content types. Everything composes naturally.

**Weaknesses:** Attribute namespace explosion. `:post/title:nl`, `:post/title:de`, `:post/title:ja` for every translatable attribute. DatomQuery needs to understand locale suffixes and fallback chains — this adds complexity to the query model. Cultural adaptation is reduced to "different text per locale" — it doesn't capture that a Dutch therapy session might need entirely different content structure, not just translated strings.

---

## Alternative 2: "Content as Layered Datoms, Translation as Overlay"

> Content and translations are separate datom layers. The base layer is language-neutral structure. Translation layers overlay locale-specific values.

### Content

Same as Alternative 1 — content types are Schema Contracts, instances are datoms. No difference for content.

### Translation

Instead of locale in the attribute name, translations are a separate **overlay entity** linked to the source:

```
// Base content (language-neutral or default locale)
[post:42       :post/title       "Understanding CBT"        tx:10  true]
[post:42       :post/body        "<rich>...</rich>"          tx:10  true]
[post:42       :post/locale      :en                         tx:10  true]

// Dutch overlay
[post:42:nl    :translation/of   post:42                     tx:15  true]
[post:42:nl    :post/title       "CBT begrijpen"             tx:15  true]
[post:42:nl    :post/body        "<rich>...</rich>"           tx:15  true]
[post:42:nl    :post/locale      :nl                         tx:15  true]

// Japanese cultural adaptation (not a translation — different content)
[post:42:ja    :translation/of   post:42                     tx:17  true]
[post:42:ja    :post/title       "CBTを理解する"              tx:17  true]
[post:42:ja    :post/body        "<rich>completely different structure</rich>"  tx:17  true]
[post:42:ja    :post/locale      :ja                         tx:17  true]
[post:42:ja    :post/cultural    true                        tx:17  true]  // Flag: this is adaptation, not translation
```

The Projection resolves overlays:

```typescript
Projection({
  filter: { entity: 'post:42' },
  locale: 'nl',
  resolution: 'overlay'  // Merge overlay datoms over base, fall back to base for missing
})
```

**The key insight: `:post/cultural true` distinguishes translation from cultural adaptation.** A Dutch title might be a literal translation of the English. A Japanese body might be entirely rewritten to fit Japanese therapeutic conventions. Both are overlays, but the `:cultural` flag tells the system (and the human reviewer) that this content was adapted, not translated.

**Cultural concepts without equivalents:**

```
// Japanese concept with no English equivalent
[concept:amae       :concept/name:ja    "甘え"                           tx:20  true]
[concept:amae       :concept/name:en    "amae (dependent indulgence)"    tx:20  true]
[concept:amae       :concept/locale     :ja                              tx:20  true]
[concept:amae       :concept/untranslatable  true                        tx:20  true]
```

When `:concept/untranslatable true`, Surfaces in other locales render the original term with explanation rather than attempting translation.

### Assessment

**Strengths:** Clean separation of base content and translations. Cultural adaptation is first-class (`:cultural true`). Untranslatable concepts are modeled explicitly. Each translation is its own entity with full history (who translated, when, why). Translation quality can be tracked per overlay.

**Weaknesses:** Entity proliferation. Every translatable content item gets N overlay entities (one per locale). The Projection needs an overlay resolution mechanism — this is new complexity. The ref chain (overlay → base) adds a layer of indirection to every query.

---

## Alternative 3: "Locale as Projection Dimension, Culture as Contract"

> Locale is a first-class Projection dimension. Cultural rules are Contracts. Content is datoms.

### Content

Same as previous — content types are Schema Contracts, instances are datoms.

### Translation

Locale is a **dimension of the Projection**, not a property of the datom:

```typescript
interface Projection {
  filter: DatomQuery
  // ... existing fields ...

  // Locale dimension (new)
  locale: {
    preferred: LocaleCode          // "nl", "ja", "en"
    fallback: LocaleCode[]         // ["en", "neutral"]
    direction: "ltr" | "rtl"       // Layout direction
    script: "latin" | "cjk" | "arabic" | ...
  }
}
```

Datoms store values in their authored locale. The Projection resolves which value to surface:

```
// Multi-locale values stored as struct V
[post:42  :post/title  {
  en: "Understanding CBT",
  nl: "CBT begrijpen",
  ja: "CBTを理解する"
}  tx:10  true]
```

Or, if struct V feels wrong for this, as locale-tagged datoms that the Projection resolves:

```
[post:42  :post/title       "Understanding CBT"    tx:10  true]   // default
[post:42  :post/title       "CBT begrijpen"        tx:15  true]   // nl
[post:42  :post/title       "CBTを理解する"          tx:17  true]   // ja
// Locale tag as Tx metadata:
[tx:15    :tx/locale        :nl                     tx:15  true]
[tx:17    :tx/locale        :ja                     tx:17  true]
```

The Projection with `locale: { preferred: 'nl' }` resolves: find the most recent value from a transaction tagged `:nl`, fall back to `:en`, fall back to untranslated.

### Culture as Contract

The radical part: **cultural rules are Contracts, not translations.**

```
// Dutch therapeutic culture Contract
[:contract/nl-therapy  :contract/locale     :nl                    tx:5  true]
[:contract/nl-therapy  :contract/rule       "Use informal 'je' not formal 'u' in client communication"  tx:5  true]
[:contract/nl-therapy  :contract/rule       "Sessions reference 'huisarts' (GP) as primary referral"    tx:5  true]

// Japanese therapeutic culture Contract
[:contract/ja-therapy  :contract/locale     :ja                    tx:6  true]
[:contract/ja-therapy  :contract/rule       "Recognize 'amae' as valid attachment behavior"             tx:6  true]
[:contract/ja-therapy  :contract/rule       "Indirect communication patterns are therapeutic, not avoidant"  tx:6  true]
```

These Contracts constrain what AI effectHandlers produce in each locale. When the AI generates a session recap in Dutch, the `:contract/nl-therapy` Contract validates that the output uses "je" (informal) not "u" (formal). When generating in Japanese, the `:contract/ja-therapy` Contract validates that the analysis doesn't pathologize "amae."

**This is the in-flight Contract from Hybrid C applied to cultural sensitivity.** The AI generates text, the cultural Contract validates mid-stream, violations are caught before commit.

### Surface adapts to locale

Surface rendering adapts based on the Projection's locale dimension:

| Locale property | Surface adaptation |
|-----------------|-------------------|
| `direction: "rtl"` | Layout mirrors. Arabic/Hebrew read right-to-left. |
| `script: "cjk"` | Typography shifts. Line-breaking, vertical text support. |
| `preferred: "nl"` | Date format, number format, currency. |
| Cultural Contract | Content structure adapts (different blocks, different flows). |

### Assessment

**Strengths:** Locale is a query dimension — the most natural place. Cultural rules as Contracts is elegant: the same mechanism that validates "no diagnosis language" also validates "use informal Dutch." In-flight cultural validation is powerful for AI safety across cultures. Surface adapts to locale naturally.

**Weaknesses:** Two storage options for translations (struct V or Tx-metadata locale tags) and neither is clean. Struct V mixes locales in one value (hard to track who translated what). Tx-metadata locale tags add complexity to the Tx model. Cultural Contracts are powerful but hard to write — who defines the rules for Japanese therapeutic culture?

---

## Alternative 4: "Content World, Translation as Bridging"

> Each locale is a semi-independent **content world**. Translation is not mapping strings — it's **bridging between worlds**.

### The Insight

A CMS translates strings. But therapeutic content in Japanese is not "English content with Japanese strings." It's content authored within Japanese clinical culture, by people who think in Japanese, for clients whose experience is shaped by Japanese culture.

What if we stop treating translation as "take English, produce Japanese" and instead treat each locale as its own content world with its own integrity?

### Content Worlds

Each locale has its own content entities, authored in that locale:

```
// English world
[post:en:42   :post/title      "Understanding CBT"           tx:10  true]
[post:en:42   :post/locale     :en                            tx:10  true]
[post:en:42   :post/world      :world/en                      tx:10  true]

// Dutch world — adapted, not translated
[post:nl:42   :post/title      "CBT in de Nederlandse praktijk"    tx:15  true]
[post:nl:42   :post/locale     :nl                                  tx:15  true]
[post:nl:42   :post/world      :world/nl                            tx:15  true]

// Japanese world — entirely different content
[post:ja:42   :post/title      "日本の臨床実践におけるCBT"              tx:17  true]
[post:ja:42   :post/locale     :ja                                   tx:17  true]
[post:ja:42   :post/world      :world/ja                             tx:17  true]
```

**Bridging** links related content across worlds:

```
[bridge:42    :bridge/en       post:en:42       tx:20  true]
[bridge:42    :bridge/nl       post:nl:42       tx:20  true]
[bridge:42    :bridge/ja       post:ja:42       tx:20  true]
[bridge:42    :bridge/type     :adaptation      tx:20  true]  // not :literal-translation
```

A bridge can be:
- **Literal translation** — the Dutch is a faithful translation of the English
- **Adaptation** — the Dutch content is adapted for Dutch clinical practice
- **Original** — the Japanese content was authored independently, linked by topic
- **Untranslatable** — no bridge exists to this locale for this content

### The Projection resolves worlds

```typescript
Projection({
  filter: { world: 'world/nl' },     // Show Dutch world
  bridge: {
    fallback: ['world/en'],            // Fall back to English world via bridges
    showOriginal: true                 // When falling back, mark as untranslated
  }
})
```

### Cultural integrity as Contract

Each content world has its own **Cultural Contract** — rules that content in that world must satisfy:

```
[:contract/world-nl  :contract/world    :world/nl                           tx:5  true]
[:contract/world-nl  :contract/rule     "Therapeutic language uses 'je'"     tx:5  true]
[:contract/world-nl  :contract/rule     "Reference huisarts pathway"        tx:5  true]
[:contract/world-nl  :contract/rule     "Comply with Dutch WGBO law"        tx:5  true]

[:contract/world-ja  :contract/world    :world/ja                           tx:6  true]
[:contract/world-ja  :contract/rule     "Honor amae as valid attachment"    tx:6  true]
[:contract/world-ja  :contract/rule     "Use keigo (敬語) in formal contexts"  tx:6  true]
[:contract/world-ja  :contract/rule     "Comply with Japanese 精神保健福祉法"   tx:6  true]
```

**The AI generates content within a world, constrained by that world's Cultural Contract.** It doesn't "translate from English" — it "generates within the Dutch world." This is a fundamentally different framing.

### Content creation flow

```
Author writes in their world
  → effectHandler validates against Cultural Contract
    → Content committed to that world's datom log
      → Bridge actor checks: does related content exist in other worlds?
        → If yes: create/update bridge link
        → If no: flag for adaptation in other worlds (not translation — adaptation)
          → AI proposes adaptation within target world's Cultural Contract
            → Human reviewer in target culture approves/modifies
```

### P2P and content worlds

In the P2P model, each content world can be an independent agent log. A Dutch counseling practice runs in `:world/nl`. A Japanese practice runs in `:world/ja`. They sync via bridges, not via translations. Each world has sovereignty over its content.

This mirrors the P2P philosophy: **your data lives with you**. Your *culture's content* lives in your *culture's world*.

### Assessment

**Strengths:** Respects cultural integrity. Not everything is translatable, and that's fine. Content authored within a culture is authentic to that culture. AI generates within cultural constraints, not by translating. P2P worlds give cultural communities sovereignty. Bridge links are explicit about the relationship (literal, adapted, original, untranslatable).

**Weaknesses:** Entity and infrastructure proliferation. Every content item potentially exists N times (one per world). Bridges are a new concept (or at least a new pattern). "Content worlds" sounds like it might be a new concept, even if technically it's just a Projection filter on `:post/world`. The overhead for a team that only operates in one or two languages might be excessive.

---

## Cross-Cutting Observations

### What all four alternatives share

1. **Content is datoms.** No alternative needs a new data primitive. Content types are Schema Contracts, instances are datoms, workflows are effectHandlers, views are Projections rendered by Surfaces.

2. **Translation interacts with every concept:**

| Concept | Translation touch point |
|---------|----------------------|
| **Datom** | Values in different locales (Alt 1: attribute suffix, Alt 2: overlay, Alt 3: Tx tag, Alt 4: world entity) |
| **Projection** | Locale resolution (fallback chains, world selection) |
| **Surface** | RTL/LTR, typography, date/number format, cultural layout |
| **Contract** | Cultural validation rules, therapeutic language norms, legal compliance per jurisdiction |
| **effectHandler** | AI translation/adaptation, publishing workflows, bridge management |

3. **Cultural rules as Contracts** appears in Alt 3 and 4. This is the strongest insight — using in-flight Contract validation for cultural sensitivity is powerful and novel. The same mechanism that catches "Based on my diagnosis..." also catches "using formal 'u' in Dutch therapy context."

4. **The counseling domain makes this urgent.** Therapy is deeply cultural. A CBT technique that works in American English doesn't automatically work in Japanese clinical practice. Translation of clinical content is not a string operation — it's a clinical adaptation that requires domain expertise in the target culture.

### The spectrum

```
Alt 1 ──────── Alt 2 ──────── Alt 3 ──────── Alt 4
pure datom     overlay       locale as       content worlds
attributes     entities      dimension       with bridges
                             + cultural
                             contracts
simple ────────────────────────────────────── rich
one world ─────────────────────────────────── multi-world
translate ─────────────────────────────────── adapt
```

### What each alternative uniquely contributes

| Alternative | Unique contribution |
|-------------|-------------------|
| **1** | Simplicity. Content is just datoms. If you only have 2-3 locales, this is all you need. |
| **2** | Translation history. Each overlay is its own entity with full audit trail. `:cultural true` flag distinguishes translation from adaptation. |
| **3** | Cultural Contracts. In-flight validation of cultural rules during AI generation. Locale as Projection dimension (not data concern). |
| **4** | Content sovereignty. Each culture's content is independently authored, not derived from a "source" language. Bridges are explicit about relationship type. P2P worlds for cultural communities. |

### What might combine well

A hybrid could take:
- **Alt 1's simplicity** for UI strings and labels (attribute locale suffix)
- **Alt 3's Cultural Contracts** for AI-generated content validation
- **Alt 4's bridge concept** for clinical/therapeutic content where cultural adaptation matters
- **Alt 2's `:cultural true` flag** to distinguish literal translation from adaptation

The resulting model: simple things are simple (locale suffix on attributes), cultural AI guardrails exist (Cultural Contracts), and deep clinical content respects cultural integrity (content worlds with bridges).

---

## How This Fits the Concept Model

### In vivief-concepts (5 concepts — current model)

| Concept | Content role | Translation role |
|---------|-------------|-----------------|
| **Datom** | Content + Schema Contract for types | Locale values + observability (translation quality metrics) |
| **Projection** | Content views + authorization | Locale dimension + fallback + redaction of untranslatable |
| **Surface** | CMS editor + content display + Diagram for content maps | Cultural layout adaptation, RTL, typography |
| **Contract** | Schema (types), Render (display rules), Behavior (workflows) | Cultural Contract (therapeutic norms), Trust (per-locale consent), Sync (cross-world bridging) |
| **effectHandler** | Publishing, AI generation, block composition | AI adaptation within Cultural Contract, bridge actor |

### The question for the main concepts document

Content doesn't need a new concept. But it does need:
1. **Locale awareness in Projection** — whether as suffix (Alt 1), overlay (Alt 2), dimension (Alt 3), or world (Alt 4)
2. **Cultural Contracts** — a Contract sub-pattern for cultural validation rules
3. **A position on translation vs. adaptation** — is the platform's default "translate from source" or "author within culture"?

The answer to #3 probably varies by content type:
- UI strings: translate from source (Alt 1)
- Clinical content: author within culture (Alt 4)
- AI-generated content: generate within culture, constrained by Cultural Contract (Alt 3)

---

*Version: brainstorm — 4 alternatives for content and translation in vivief concepts. Key insight: Cultural Contracts validate AI output against cultural therapeutic norms using the same in-flight mechanism that validates clinical language. Content doesn't need a new concept; translation needs locale awareness in Projection and Cultural Contracts.*
