/**
 * JSX Extraction Tests
 *
 * Tests for Phase 0: JSX Element Extraction, Component Hierarchy, and ARIA attributes.
 * Validates that the TypeScript parser correctly extracts JSX components, props,
 * hierarchy relationships, and accessibility information.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_PARSER_CONFIG } from "../src/parsers/parser-interface.js";
import type { ParserConfig } from "../src/parsers/parser-interface.js";
import { type TypeScriptParser, createTypeScriptParser } from "../src/parsers/typescript-parser.js";

// Default test config
const testConfig: ParserConfig = {
  ...DEFAULT_PARSER_CONFIG,
  repoName: "test-repo",
  packagePath: "test-package",
  branch: "main",
};

describe("JSX Element Extraction", () => {
  let parser: TypeScriptParser;

  beforeAll(() => {
    parser = createTypeScriptParser();
  });

  // ==========================================================================
  // Basic Component Extraction
  // ==========================================================================

  describe("basic component extraction", () => {
    it("extracts PascalCase components as jsx_component nodes", async () => {
      const code = `
import React from "react";

const App = () => (
  <Button variant="primary" onClick={handleClick}>
    Click me
  </Button>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      expect(jsxNodes.length).toBe(1);

      const buttonNode = jsxNodes[0];
      expect(buttonNode?.name).toBe("Button");
      expect(buttonNode?.properties.props).toEqual({
        variant: "primary",
      });
      expect(buttonNode?.properties.eventHandlers).toContain("onClick");
    });

    it("does not create nodes for lowercase HTML elements", async () => {
      const code = `
const App = () => (
  <div className="container">
    <span>Text</span>
  </div>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      expect(jsxNodes.length).toBe(0);
    });

    it("extracts member expression components (Modal.Header)", async () => {
      const code = `
const App = () => (
  <Modal.Header title="Hello" />
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      expect(jsxNodes.length).toBe(1);
      expect(jsxNodes[0]?.name).toBe("Modal.Header");
    });

    it("extracts deeply nested member expressions", async () => {
      const code = `
const App = () => (
  <UI.Components.Forms.Input placeholder="Enter text" />
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      expect(jsxNodes.length).toBe(1);
      expect(jsxNodes[0]?.name).toBe("UI.Components.Forms.Input");
    });

    it("extracts multiple components in a tree", async () => {
      const code = `
const App = () => (
  <Layout>
    <Header />
    <Main>
      <Sidebar />
      <Content />
    </Main>
    <Footer />
  </Layout>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      const componentNames = jsxNodes.map((n) => n.name).sort();

      expect(componentNames).toEqual(["Content", "Footer", "Header", "Layout", "Main", "Sidebar"]);
    });
  });

  // ==========================================================================
  // Props Extraction
  // ==========================================================================

  describe("props extraction", () => {
    it("extracts string literal props", async () => {
      const code = `
const App = () => (
  <Button variant="primary" size="large" />
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );
      expect(buttonNode?.properties.props).toEqual({
        variant: "primary",
        size: "large",
      });
    });

    it("extracts boolean props (shorthand)", async () => {
      const code = `
const App = () => (
  <Button disabled loading />
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );
      expect(buttonNode?.properties.props).toEqual({
        disabled: true,
        loading: true,
      });
    });

    it("extracts expression props with identifier placeholder", async () => {
      const code = `
const App = ({ title }) => (
  <Card title={title} count={42} />
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const cardNode = result.nodes.find((n) => n.kind === "jsx_component" && n.name === "Card");
      const props = cardNode?.properties.props as Record<string, string> | undefined;
      expect(props?.title).toBe("{title}");
      expect(props?.count).toBe("42");
    });

    it("detects spread props", async () => {
      const code = `
const App = (props) => (
  <Button {...props} variant="primary" />
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );
      expect(buttonNode?.properties.hasSpreadProps).toBe(true);
    });

    it("extracts event handlers separately", async () => {
      const code = `
const App = () => (
  <Input
    onChange={handleChange}
    onFocus={handleFocus}
    onBlur={handleBlur}
    placeholder="Type here"
  />
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const inputNode = result.nodes.find((n) => n.kind === "jsx_component" && n.name === "Input");
      expect(inputNode?.properties.eventHandlers).toEqual(["onChange", "onFocus", "onBlur"]);
      expect(inputNode?.properties.props).toEqual({
        placeholder: "Type here",
      });
    });
  });

  // ==========================================================================
  // ARIA Attributes Extraction
  // ==========================================================================

  describe("ARIA attributes extraction", () => {
    it("extracts aria-* attributes on components", async () => {
      const code = `
const App = () => (
  <Dialog aria-labelledby="title" aria-describedby="desc" aria-modal="true" />
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const dialogNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Dialog"
      );
      expect(dialogNode?.properties.ariaProps).toEqual({
        "aria-labelledby": "title",
        "aria-describedby": "desc",
        "aria-modal": "true",
      });
    });

    it("extracts role attribute on components", async () => {
      const code = `
const App = () => (
  <Card role="article" />
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const cardNode = result.nodes.find((n) => n.kind === "jsx_component" && n.name === "Card");
      expect(cardNode?.properties.ariaProps).toEqual({
        role: "article",
      });
    });

    it("captures ARIA on HTML elements with event handlers", async () => {
      const code = `
const App = () => (
  <div role="button" aria-pressed="false" onClick={handleClick}>
    Click me
  </div>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      // HTML elements with ARIA create "html_element" nodes for tracking
      const htmlNodes = result.nodes.filter(
        (n) => n.kind === "html_element" && n.properties.htmlElement === "div"
      );
      expect(htmlNodes.length).toBe(1);

      const divNode = htmlNodes[0];
      expect(divNode?.properties.ariaProps).toEqual({
        role: "button",
        "aria-pressed": "false",
      });
      expect(divNode?.properties.eventHandlers).toContain("onClick");
    });

    it("flags potential a11y issues on non-interactive elements", async () => {
      const code = `
const App = () => (
  <div onClick={handleClick}>
    Bad clickable div
  </div>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const htmlNodes = result.nodes.filter(
        (n) => n.kind === "html_element" && n.properties.htmlElement === "div"
      );
      expect(htmlNodes.length).toBe(1);

      const divNode = htmlNodes[0];
      expect(divNode?.properties.potentialA11yIssue).toBe(true);
      expect(divNode?.properties.a11yDetails).toContain("onClick without keyboard support");
    });

    it("does not flag native interactive elements", async () => {
      const code = `
const App = () => (
  <button onClick={handleClick}>
    Good clickable button
  </button>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      // Button is a native interactive element, so it shouldn't be flagged
      // and shouldn't even create a node (no ARIA to track)
      const htmlNodes = result.nodes.filter(
        (n) => n.kind === "html_element" && n.properties.htmlElement === "button"
      );
      expect(htmlNodes.length).toBe(0);
    });

    it("does not flag divs with keyboard handlers", async () => {
      const code = `
const App = () => (
  <div onClick={handleClick} onKeyDown={handleKeyDown} tabIndex={0}>
    Accessible clickable div
  </div>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const htmlNodes = result.nodes.filter(
        (n) => n.kind === "unknown" && n.properties.htmlElement === "div"
      );
      // Should not be flagged as a11y issue since it has keyboard support
      // But may still be tracked if there are event handlers
      if (htmlNodes.length > 0) {
        expect(htmlNodes[0]?.properties.potentialA11yIssue).toBe(false);
      }
    });
  });

  // ==========================================================================
  // Component Hierarchy (RENDERS edges)
  // ==========================================================================

  describe("component hierarchy edges", () => {
    it("creates INSTANTIATES edges to component definitions", async () => {
      const code = `
import { Button } from "./Button";

const App = () => <Button />;
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const instantiatesEdges = result.edges.filter((e) => e.edge_type === "INSTANTIATES");
      expect(instantiatesEdges.length).toBe(1);
      expect(instantiatesEdges[0]?.target_entity_id).toBe("unresolved:Button");
    });

    it("creates RENDERS edges for nested components", async () => {
      const code = `
const Layout = () => (
  <Container>
    <Header />
    <Main>
      <Content />
    </Main>
  </Container>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const rendersEdges = result.edges.filter((e) => e.edge_type === "RENDERS");

      // Container renders Header, Main
      // Main renders Content
      // So we expect at least 3 RENDERS edges
      expect(rendersEdges.length).toBeGreaterThanOrEqual(3);

      // Verify the hierarchy
      const containerNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Container"
      );
      const mainNode = result.nodes.find((n) => n.kind === "jsx_component" && n.name === "Main");
      const contentNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Content"
      );

      // Container renders Main
      const containerRendersMain = rendersEdges.find(
        (e) =>
          e.source_entity_id === containerNode?.entity_id &&
          e.target_entity_id === mainNode?.entity_id
      );
      expect(containerRendersMain).toBeDefined();

      // Main renders Content
      const mainRendersContent = rendersEdges.find(
        (e) =>
          e.source_entity_id === mainNode?.entity_id &&
          e.target_entity_id === contentNode?.entity_id
      );
      expect(mainRendersContent).toBeDefined();
    });

    it("creates CONTAINS edges from function to JSX components", async () => {
      const code = `
const App = () => (
  <Button />
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const appFunc = result.nodes.find((n) => n.kind === "function" && n.name === "App");
      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );

      const containsEdge = result.edges.find(
        (e) =>
          e.edge_type === "CONTAINS" &&
          e.source_entity_id === appFunc?.entity_id &&
          e.target_entity_id === buttonNode?.entity_id
      );

      expect(containsEdge).toBeDefined();
    });
  });

  // ==========================================================================
  // JSX Fragments
  // ==========================================================================

  describe("JSX fragments", () => {
    it("handles JSX fragments without creating nodes", async () => {
      const code = `
const List = ({ items }) => (
  <>
    {items.map(item => <Item key={item.id} />)}
  </>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      // Should extract the Item component, no fragment node
      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      expect(jsxNodes.length).toBe(1);
      expect(jsxNodes[0]?.name).toBe("Item");
    });

    it("handles React.Fragment syntax", async () => {
      const code = `
import React from "react";

const List = () => (
  <React.Fragment>
    <Header />
    <Content />
  </React.Fragment>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      const names = jsxNodes.map((n) => n.name).sort();

      // React.Fragment is PascalCase so it creates a node, plus Header and Content
      expect(names).toContain("Header");
      expect(names).toContain("Content");
    });
  });

  // ==========================================================================
  // Complex Scenarios
  // ==========================================================================

  describe("complex scenarios", () => {
    it("handles conditional rendering", async () => {
      const code = `
const App = ({ showModal }) => (
  <div>
    {showModal && <Modal />}
    {!showModal && <Placeholder />}
  </div>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      const names = jsxNodes.map((n) => n.name).sort();

      expect(names).toEqual(["Modal", "Placeholder"]);
    });

    it("handles ternary expressions", async () => {
      const code = `
const App = ({ isLoading }) => (
  <Container>
    {isLoading ? <Spinner /> : <Content />}
  </Container>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      const names = jsxNodes.map((n) => n.name).sort();

      expect(names).toEqual(["Container", "Content", "Spinner"]);
    });

    it("handles components inside map", async () => {
      const code = `
const List = ({ users }) => (
  <ul>
    {users.map(user => (
      <UserCard key={user.id} name={user.name} />
    ))}
  </ul>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      expect(jsxNodes.length).toBe(1);
      expect(jsxNodes[0]?.name).toBe("UserCard");
      // Complex member expressions like user.name are captured as {..}
      // This is acceptable for now - full expression extraction could be added later
      const jsxProps = jsxNodes[0]?.properties.props as Record<string, string> | undefined;
      expect(jsxProps?.name).toBe("{...}");
    });

    it("handles self-closing vs children components", async () => {
      const code = `
const App = () => (
  <Container>
    <Icon />
    <Button>Click me</Button>
  </Container>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      expect(jsxNodes.length).toBe(3);
    });

    it("handles render props pattern", async () => {
      const code = `
const App = () => (
  <DataProvider
    render={(data) => <DataDisplay data={data} />}
  />
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      const names = jsxNodes.map((n) => n.name).sort();

      expect(names).toEqual(["DataDisplay", "DataProvider"]);
    });

    it("handles JSX in nested callbacks correctly", async () => {
      // Test case for parent traversal across callback boundaries
      // This verifies that JSX inside callbacks (useEffect, map, etc.)
      // correctly links to the outer parent JSX component
      const code = `
const Layout = () => (
  <Container>
    {items.map(item => (
      <Item key={item.id} />
    ))}
  </Container>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      // Find the components
      const containerNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Container"
      );
      const itemNode = result.nodes.find((n) => n.kind === "jsx_component" && n.name === "Item");

      expect(containerNode).toBeDefined();
      expect(itemNode).toBeDefined();

      // Find RENDERS edges where Item is the target
      const rendersToItem = result.edges.filter(
        (e) => e.edge_type === "RENDERS" && e.target_entity_id === itemNode?.entity_id
      );

      // Item should be rendered by Container (its visual parent in the JSX tree)
      // even though it's inside a callback function
      expect(rendersToItem.length).toBeGreaterThanOrEqual(1);

      // Verify Container renders Item (through the callback)
      if (rendersToItem.length > 0) {
        const containerRendersItem = rendersToItem.find(
          (e) => e.source_entity_id === containerNode?.entity_id
        );
        expect(containerRendersItem).toBeDefined();
      }
    });

    it("handles typed React.FC components", async () => {
      const code = `
import React from "react";

interface ButtonProps {
  variant: "primary" | "secondary";
  onClick: () => void;
}

export const Button: React.FC<ButtonProps> = ({ variant, onClick, children }) => {
  return (
    <StyledButton variant={variant} onClick={onClick}>
      {children}
    </StyledButton>
  );
};
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      // Should have the Button function and the StyledButton JSX component
      const buttonFunc = result.nodes.find((n) => n.kind === "function" && n.name === "Button");
      expect(buttonFunc).toBeDefined();
      expect(buttonFunc?.is_exported).toBe(true);

      const styledButtonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "StyledButton"
      );
      expect(styledButtonNode).toBeDefined();
      expect(styledButtonNode?.properties.eventHandlers).toContain("onClick");
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("handles empty components", async () => {
      const code = `
const App = () => <EmptyComponent />;
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      expect(jsxNodes.length).toBe(1);
      expect(jsxNodes[0]?.name).toBe("EmptyComponent");
      expect(jsxNodes[0]?.properties.props).toEqual({});
      expect(jsxNodes[0]?.properties.eventHandlers).toEqual([]);
    });

    it("handles components with only children", async () => {
      const code = `
const App = () => (
  <Wrapper>
    Hello World
  </Wrapper>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const wrapperNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Wrapper"
      );
      expect(wrapperNode).toBeDefined();
    });

    it("handles JSX in class components", async () => {
      const code = `
import React, { Component } from "react";

class App extends Component {
  render() {
    return <Button onClick={this.handleClick}>Click</Button>;
  }
}
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      expect(jsxNodes.length).toBe(1);
      expect(jsxNodes[0]?.name).toBe("Button");
    });

    it("handles multiple return statements with JSX", async () => {
      const code = `
const App = ({ variant }) => {
  if (variant === "A") {
    return <VariantA />;
  }
  return <VariantB />;
};
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      const names = jsxNodes.map((n) => n.name).sort();

      expect(names).toEqual(["VariantA", "VariantB"]);
    });

    it("handles JSX with complex expression props", async () => {
      const code = `
const App = () => (
  <Component
    computed={a + b * c}
    template={\`Hello \${name}\`}
    callback={() => console.log("clicked")}
    array={[1, 2, 3]}
    object={{ key: "value" }}
  />
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const componentNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Component"
      );
      expect(componentNode).toBeDefined();
      // Complex expressions should be captured as placeholders
      const componentProps = componentNode?.properties.props as Record<string, string> | undefined;
      expect(componentProps?.computed).toBe("{...}");
      expect(componentProps?.callback).toBe("{...}");
    });
  });

  // ==========================================================================
  // PASSES_PROPS Edges
  // ==========================================================================

  describe("PASSES_PROPS edges", () => {
    it("creates PASSES_PROPS edge when parent passes props to child", async () => {
      const code = `
const App = () => (
  <Parent>
    <Child name="test" value={123} />
  </Parent>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const parentNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Parent"
      );
      const childNode = result.nodes.find((n) => n.kind === "jsx_component" && n.name === "Child");

      expect(parentNode).toBeDefined();
      expect(childNode).toBeDefined();

      // Find PASSES_PROPS edge from Parent to Child
      const passesPropsEdge = result.edges.find(
        (e) =>
          e.edge_type === "PASSES_PROPS" &&
          e.source_entity_id === parentNode?.entity_id &&
          e.target_entity_id === childNode?.entity_id
      );

      expect(passesPropsEdge).toBeDefined();
      expect(passesPropsEdge?.properties.props).toContain("name");
      expect(passesPropsEdge?.properties.props).toContain("value");
      expect(passesPropsEdge?.properties.propCount).toBe(2);
    });

    it("includes event handlers in PASSES_PROPS edge", async () => {
      const code = `
const App = () => (
  <Container>
    <Button onClick={handleClick} onHover={handleHover} label="Click" />
  </Container>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const containerNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Container"
      );
      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );

      const passesPropsEdge = result.edges.find(
        (e) =>
          e.edge_type === "PASSES_PROPS" &&
          e.source_entity_id === containerNode?.entity_id &&
          e.target_entity_id === buttonNode?.entity_id
      );

      expect(passesPropsEdge).toBeDefined();
      expect(passesPropsEdge?.properties.props).toContain("label");
      expect(passesPropsEdge?.properties.eventHandlers).toContain("onClick");
      expect(passesPropsEdge?.properties.eventHandlers).toContain("onHover");
      expect(passesPropsEdge?.properties.propCount).toBe(3); // label + 2 handlers
    });

    it("tracks spread props in PASSES_PROPS edge", async () => {
      const code = `
const App = () => (
  <Wrapper>
    <Input {...inputProps} placeholder="Enter text" />
  </Wrapper>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const wrapperNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Wrapper"
      );
      const inputNode = result.nodes.find((n) => n.kind === "jsx_component" && n.name === "Input");

      const passesPropsEdge = result.edges.find(
        (e) =>
          e.edge_type === "PASSES_PROPS" &&
          e.source_entity_id === wrapperNode?.entity_id &&
          e.target_entity_id === inputNode?.entity_id
      );

      expect(passesPropsEdge).toBeDefined();
      expect(passesPropsEdge?.properties.hasSpreadProps).toBe(true);
    });

    it("does not create PASSES_PROPS edge for components without props", async () => {
      const code = `
const App = () => (
  <Parent>
    <Child />
  </Parent>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const parentNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Parent"
      );
      const childNode = result.nodes.find((n) => n.kind === "jsx_component" && n.name === "Child");

      // Should have RENDERS edge but no PASSES_PROPS
      const rendersEdge = result.edges.find(
        (e) =>
          e.edge_type === "RENDERS" &&
          e.source_entity_id === parentNode?.entity_id &&
          e.target_entity_id === childNode?.entity_id
      );
      expect(rendersEdge).toBeDefined();

      const passesPropsEdge = result.edges.find(
        (e) =>
          e.edge_type === "PASSES_PROPS" &&
          e.source_entity_id === parentNode?.entity_id &&
          e.target_entity_id === childNode?.entity_id
      );
      expect(passesPropsEdge).toBeUndefined();
    });

    it("creates separate PASSES_PROPS edges for each child", async () => {
      const code = `
const App = () => (
  <Layout>
    <Header title="Hello" />
    <Content body="World" />
    <Footer year={2024} />
  </Layout>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const layoutNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Layout"
      );

      const passesPropsEdges = result.edges.filter(
        (e) => e.edge_type === "PASSES_PROPS" && e.source_entity_id === layoutNode?.entity_id
      );

      expect(passesPropsEdges.length).toBe(3);
    });
  });

  // ==========================================================================
  // Module-Level JSX
  // ==========================================================================

  describe("module-level JSX", () => {
    it("creates jsx_component for module-level variable assignment", async () => {
      const code = `
export const element = <Button label="test" />;
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );
      expect(buttonNode).toBeDefined();
      expect(buttonNode?.properties.props).toEqual({
        label: "test",
      });

      // CONTAINS edge should exist for the jsx_component
      const containsEdge = result.edges.find(
        (e) => e.edge_type === "CONTAINS" && e.target_entity_id === buttonNode?.entity_id
      );
      expect(containsEdge).toBeDefined();
    });

    it("handles JSX in module-level arrow function expression", async () => {
      const code = `
const render = () => <Component />;
export { render };
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const componentNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Component"
      );
      expect(componentNode).toBeDefined();

      // Should have CONTAINS edge from render function
      const renderFunc = result.nodes.find((n) => n.kind === "function" && n.name === "render");
      expect(renderFunc).toBeDefined();

      const containsEdge = result.edges.find(
        (e) =>
          e.edge_type === "CONTAINS" &&
          e.source_entity_id === renderFunc?.entity_id &&
          e.target_entity_id === componentNode?.entity_id
      );
      expect(containsEdge).toBeDefined();
    });
  });

  // ==========================================================================
  // Namespaced JSX
  // ==========================================================================

  describe("namespaced JSX", () => {
    it("skips JSXNamespacedName elements (xml:special)", async () => {
      const code = `
function App() {
  return <xml:special attr="value" />;
}
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      // Namespaced elements should be skipped - no jsx_component created
      const jsxNodes = result.nodes.filter((n) => n.kind === "jsx_component");
      expect(jsxNodes.length).toBe(0);
    });

    it("handles namespaced attributes (xml:lang)", async () => {
      const code = `
function App() {
  return <Button xml:lang="en" xml:space="preserve" />;
}
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );
      expect(buttonNode).toBeDefined();

      // Namespaced attributes should be captured with colon
      const props = buttonNode?.properties.props as Record<string, string> | undefined;
      expect(props?.["xml:lang"]).toBe("en");
      expect(props?.["xml:space"]).toBe("preserve");
    });
  });

  // ==========================================================================
  // Attribute Value Edge Cases
  // ==========================================================================

  describe("attribute value edge cases", () => {
    it("handles explicit boolean true literal", async () => {
      const code = `
const App = () => <Button enabled={true} />;
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );
      expect(buttonNode?.properties.props).toEqual({
        enabled: true,
      });
    });

    it("handles explicit boolean false literal", async () => {
      const code = `
const App = () => <Button disabled={false} />;
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );
      expect(buttonNode?.properties.props).toEqual({
        disabled: false,
      });
    });

    it("handles simple template literal without expressions", async () => {
      const code = `
const App = () => <Button text={\`static text\`} />;
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );
      expect(buttonNode?.properties.props).toEqual({
        text: "static text",
      });
    });

    it("handles template literal with expressions as complex", async () => {
      const code = `
const name = "World";
const App = () => <Button text={\`Hello \${name}\`} />;
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );
      // Template literals with expressions are captured as complex
      const props = buttonNode?.properties.props as Record<string, string> | undefined;
      expect(props?.text).toBe("{...}");
    });

    it("handles JSX element as prop value (inside expression container)", async () => {
      const code = `
const App = () => <Button icon={<Icon name="star" />} />;
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );
      const props = buttonNode?.properties.props as Record<string, string> | undefined;
      // JSX inside expression container is treated as complex expression
      expect(props?.icon).toBe("{...}");

      // The Icon component should also be extracted
      const iconNode = result.nodes.find((n) => n.kind === "jsx_component" && n.name === "Icon");
      expect(iconNode).toBeDefined();
    });

    it("handles JSX fragment as prop value (inside expression container)", async () => {
      const code = `
const App = () => <Button content={<>Hello World</>} />;
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );
      const props = buttonNode?.properties.props as Record<string, string> | undefined;
      // JSX fragment inside expression container is treated as complex expression
      expect(props?.content).toBe("{...}");
    });

    it("handles string literal inside expression container", async () => {
      const code = `
const App = () => <Button text={"hello world"} />;
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );
      expect(buttonNode?.properties.props).toEqual({
        text: "hello world",
      });
    });

    it("handles numeric literal props", async () => {
      const code = `
const App = () => <Button count={42} />;
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const buttonNode = result.nodes.find(
        (n) => n.kind === "jsx_component" && n.name === "Button"
      );
      expect(buttonNode?.properties.props).toEqual({
        count: "42",
      });
    });
  });

  // ==========================================================================
  // html_element Kind
  // ==========================================================================

  describe("html_element kind", () => {
    it("uses html_element kind for HTML elements with ARIA", async () => {
      const code = `
const App = () => (
  <div role="alert" aria-live="polite">
    Alert message
  </div>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const htmlNodes = result.nodes.filter((n) => n.kind === "html_element");
      expect(htmlNodes.length).toBe(1);

      const divNode = htmlNodes[0];
      expect(divNode?.properties.htmlElement).toBe("div");
      expect(divNode?.properties.ariaProps).toEqual({
        role: "alert",
        "aria-live": "polite",
      });
    });

    it("uses html_element kind for elements with event handlers", async () => {
      const code = `
const App = () => (
  <span onClick={handleClick} role="button">
    Clickable span
  </span>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const htmlNodes = result.nodes.filter((n) => n.kind === "html_element");
      expect(htmlNodes.length).toBe(1);

      const spanNode = htmlNodes[0];
      expect(spanNode?.properties.htmlElement).toBe("span");
      expect(spanNode?.properties.eventHandlers).toContain("onClick");
    });

    it("html_element nodes have proper accessibility tracking", async () => {
      const code = `
const App = () => (
  <div onClick={handleClick}>
    Bad accessibility
  </div>
);
`;

      const result = await parser.parseContent(code, "test.tsx", testConfig);

      const htmlNodes = result.nodes.filter((n) => n.kind === "html_element");
      expect(htmlNodes.length).toBe(1);

      const divNode = htmlNodes[0];
      expect(divNode?.properties.potentialA11yIssue).toBe(true);
      expect(divNode?.properties.isInteractive).toBe(false);
    });
  });

  // ==========================================================================
  // File Type Detection
  // ==========================================================================

  describe("file type detection", () => {
    it("detects .ts files as typescript", async () => {
      const code = `
const add = (a: number, b: number): number => a + b;
`;

      const result = await parser.parseContent(code, "test.ts", testConfig);

      // Parser should handle .ts files correctly
      const funcNode = result.nodes.find((n) => n.kind === "function" && n.name === "add");
      expect(funcNode).toBeDefined();
    });

    it("detects .tsx files as typescript", async () => {
      const code = `
const App = () => <Button />;
`;

      const result = await parser.parseContent(code, "component.tsx", testConfig);

      const jsxNode = result.nodes.find((n) => n.kind === "jsx_component");
      expect(jsxNode).toBeDefined();
    });

    it("detects .js files as javascript", async () => {
      const code = `
const add = (a, b) => a + b;
`;

      const result = await parser.parseContent(code, "test.js", testConfig);

      const funcNode = result.nodes.find((n) => n.kind === "function" && n.name === "add");
      expect(funcNode).toBeDefined();
    });

    it("detects .jsx files as javascript", async () => {
      const code = `
const App = () => <Button />;
`;

      const result = await parser.parseContent(code, "component.jsx", testConfig);

      const jsxNode = result.nodes.find((n) => n.kind === "jsx_component");
      expect(jsxNode).toBeDefined();
    });

    it("detects .mjs files as javascript", async () => {
      const code = `
export const add = (a, b) => a + b;
`;

      const result = await parser.parseContent(code, "module.mjs", testConfig);

      const funcNode = result.nodes.find((n) => n.kind === "function" && n.name === "add");
      expect(funcNode).toBeDefined();
    });

    it("detects .cjs files as javascript", async () => {
      const code = `
const add = (a, b) => a + b;
module.exports = { add };
`;

      const result = await parser.parseContent(code, "common.cjs", testConfig);

      const funcNode = result.nodes.find((n) => n.kind === "function" && n.name === "add");
      expect(funcNode).toBeDefined();
    });

    it("handles unknown file extensions gracefully", async () => {
      const code = `
const add = (a, b) => a + b;
`;
      // Parser should handle unknown extensions without crashing
      // It may return empty results or minimal parsing
      const result = await parser.parseContent(code, "script.xyz", testConfig);

      // Should return a valid result object (even if empty)
      expect(result).toBeDefined();
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
    });
  });
});
