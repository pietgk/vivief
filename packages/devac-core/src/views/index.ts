/**
 * Views Module - Visualization Generation
 *
 * Generates architecture diagrams and visualizations from effects.
 *
 * Part of DevAC v3.0 Foundation - Vision→View Pipeline.
 */

export {
  // C4 Generation
  generateC4Context,
  generateC4Containers,
  exportContextToPlantUML,
  exportContainersToPlantUML,
  exportContextToLikeC4,
  exportContainersToLikeC4,
  // Enhanced LikeC4 Generation
  exportContextToEnhancedLikeC4,
  exportContainersToEnhancedLikeC4,
  sanitizeLikeC4Id,
  discoverDomainBoundaries,
  // Types
  type C4ExternalSystem,
  type C4Container,
  type C4Component,
  type C4Relationship,
  type C4Context,
  type C4ContainerDiagram,
  type DomainSummary,
  type C4GeneratorOptions,
  type DomainBoundary,
  type EnhancedLikeC4Options,
} from "./c4-generator.js";

// LikeC4 Specification Generator
export {
  generateLikeC4Specification,
  exportSpecificationToLikeC4,
  getExternalElementKind,
  getContainerElementKind,
  generateElementTags,
  getRelationshipKind,
  // Types
  type LikeC4ElementKind,
  type LikeC4RelationshipKind,
  type LikeC4Tag,
  type LikeC4Specification,
  type LikeC4Shape,
  type LikeC4Color,
  // Constants
  DEFAULT_ELEMENT_KINDS,
  DOMAIN_ELEMENT_KINDS,
  EXTERNAL_ELEMENT_KINDS,
  DEFAULT_RELATIONSHIP_KINDS,
} from "./likec4-spec-generator.js";

// LikeC4 Dynamic View Generator
export {
  identifyEffectChains,
  chainToSteps,
  generateDynamicViews,
  generateEffectsFlowLikeC4,
  // Types
  type EffectChain,
  type DynamicViewStep,
  type DynamicViewOptions,
} from "./likec4-dynamic-generator.js";
