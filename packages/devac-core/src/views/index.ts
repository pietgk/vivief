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
} from "./c4-generator.js";
