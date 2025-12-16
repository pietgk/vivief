/**
 * Sample JSX/TSX file for testing React component parsing
 * Tests: functional components, class components, hooks, props, children
 */

import React, { Component, useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode, FC, PropsWithChildren } from "react";

// =============================================================================
// Type Definitions
// =============================================================================

export interface ButtonProps {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}

export interface CardProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T) => string;
}

// =============================================================================
// Functional Components
// =============================================================================

/**
 * Simple functional component
 */
export function Button({ onClick, label, disabled = false, variant = "primary" }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant}`}
    >
      {label}
    </button>
  );
}

/**
 * Arrow function component with FC type
 */
export const Card: FC<CardProps> = ({ title, children, footer }) => {
  return (
    <div className="card">
      <div className="card-header">
        <h2>{title}</h2>
      </div>
      <div className="card-body">{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
};

/**
 * Generic component
 */
export function List<T>({ items, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <ul className="list">
      {items.map((item, index) => (
        <li key={keyExtractor(item)}>{renderItem(item, index)}</li>
      ))}
    </ul>
  );
}

/**
 * Component with hooks
 */
export function Counter({ initialCount = 0 }: { initialCount?: number }) {
  const [count, setCount] = useState(initialCount);
  const [isEven, setIsEven] = useState(initialCount % 2 === 0);

  useEffect(() => {
    setIsEven(count % 2 === 0);
  }, [count]);

  const increment = useCallback(() => {
    setCount((prev) => prev + 1);
  }, []);

  const decrement = useCallback(() => {
    setCount((prev) => prev - 1);
  }, []);

  const doubledCount = useMemo(() => count * 2, [count]);

  return (
    <div className="counter">
      <span>Count: {count}</span>
      <span>Doubled: {doubledCount}</span>
      <span>{isEven ? "Even" : "Odd"}</span>
      <button onClick={decrement}>-</button>
      <button onClick={increment}>+</button>
    </div>
  );
}

/**
 * Component with children using PropsWithChildren
 */
export const Container: FC<PropsWithChildren<{ className?: string }>> = ({
  children,
  className = "",
}) => {
  return <div className={`container ${className}`}>{children}</div>;
};

/**
 * Component using fragments
 */
export function FragmentExample({ items }: { items: string[] }) {
  return (
    <>
      <h1>Items</h1>
      {items.map((item, i) => (
        <span key={i}>{item}</span>
      ))}
    </>
  );
}

/**
 * Component with conditional rendering
 */
export function ConditionalComponent({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error: Error | null;
  data: string | null;
}) {
  if (isLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error.message}</div>;
  }

  return <div className="data">{data ?? "No data"}</div>;
}

// =============================================================================
// Class Components
// =============================================================================

interface ClassCounterState {
  count: number;
}

interface ClassCounterProps {
  initialCount: number;
  step?: number;
}

/**
 * Class component with state and lifecycle
 */
export class ClassCounter extends Component<ClassCounterProps, ClassCounterState> {
  static defaultProps = {
    step: 1,
  };

  constructor(props: ClassCounterProps) {
    super(props);
    this.state = {
      count: props.initialCount,
    };
  }

  componentDidMount() {
    console.log("Counter mounted");
  }

  componentDidUpdate(prevProps: ClassCounterProps, prevState: ClassCounterState) {
    if (prevState.count !== this.state.count) {
      console.log(`Count changed: ${prevState.count} -> ${this.state.count}`);
    }
  }

  componentWillUnmount() {
    console.log("Counter unmounting");
  }

  increment = () => {
    this.setState((state) => ({
      count: state.count + (this.props.step ?? 1),
    }));
  };

  decrement = () => {
    this.setState((state) => ({
      count: state.count - (this.props.step ?? 1),
    }));
  };

  render() {
    return (
      <div className="class-counter">
        <span>{this.state.count}</span>
        <button onClick={this.decrement}>-</button>
        <button onClick={this.increment}>+</button>
      </div>
    );
  }
}

// =============================================================================
// Higher-Order Components
// =============================================================================

/**
 * HOC for adding loading state
 */
export function withLoading<P extends object>(
  WrappedComponent: React.ComponentType<P>
): FC<P & { isLoading: boolean }> {
  return function WithLoadingComponent({ isLoading, ...props }: P & { isLoading: boolean }) {
    if (isLoading) {
      return <div className="loading-spinner">Loading...</div>;
    }
    return <WrappedComponent {...(props as P)} />;
  };
}

// =============================================================================
// Render Props Pattern
// =============================================================================

interface MouseTrackerProps {
  render: (position: { x: number; y: number }) => ReactNode;
}

/**
 * Component using render props pattern
 */
export class MouseTracker extends Component<MouseTrackerProps, { x: number; y: number }> {
  state = { x: 0, y: 0 };

  handleMouseMove = (event: React.MouseEvent) => {
    this.setState({
      x: event.clientX,
      y: event.clientY,
    });
  };

  render() {
    return (
      <div onMouseMove={this.handleMouseMove} style={{ height: "100vh" }}>
        {this.props.render(this.state)}
      </div>
    );
  }
}

// =============================================================================
// Forwarding Refs
// =============================================================================

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/**
 * Component with forwarded ref
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, ...props }, ref) => {
    return (
      <label>
        {label}
        <input ref={ref} {...props} />
      </label>
    );
  }
);

Input.displayName = "Input";

// =============================================================================
// Context Usage
// =============================================================================

interface ThemeContextValue {
  theme: "light" | "dark";
  toggleTheme: () => void;
}

export const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
});

export function ThemedButton() {
  const { theme, toggleTheme } = React.useContext(ThemeContext);

  return (
    <button
      onClick={toggleTheme}
      className={`themed-btn themed-btn-${theme}`}
    >
      Current theme: {theme}
    </button>
  );
}

// Default export
export default Button;
