#!/usr/bin/env python3
"""
Python AST Parser for DevAC v2.0

Parses Python source files and outputs a JSON structure compatible with
the DevAC v2.0 StructuralParseResult format.

Usage:
    python python_parser.py <filepath> [--config <json>]

Output format matches StructuralParseResult:
{
    "nodes": [...],
    "edges": [...],
    "externalRefs": [...],
    "sourceFileHash": "...",
    "filePath": "...",
    "parseTimeMs": 0,
    "warnings": []
}
"""

import ast
import hashlib
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple


class DevACPythonParser(ast.NodeVisitor):
    """
    AST visitor that extracts nodes, edges, and external references
    in DevAC v2.0 format.
    """

    def __init__(self, filepath: str, source: str, config: Dict[str, Any]):
        self.filepath = filepath.replace("\\", "/")
        self.source = source
        self.config = config
        self.repo_name = config.get("repoName", "")
        self.package_path = config.get("packagePath", "")

        self.nodes: List[Dict[str, Any]] = []
        self.edges: List[Dict[str, Any]] = []
        self.external_refs: List[Dict[str, Any]] = []
        self.warnings: List[str] = []

        # Scope tracking
        self.scope_stack: List[str] = []
        self.current_class_name: Optional[str] = None
        self.current_class_entity_id: Optional[str] = None
        self.current_function_entity_id: Optional[str] = None

        # Track decorators for the next function/class
        self.pending_decorators: List[ast.expr] = []

    def _get_location(self, node: ast.AST) -> Dict[str, int]:
        """Extract location information from an AST node."""
        if isinstance(node, ast.Module):
            return {"start_line": 1, "end_line": 1, "start_column": 0, "end_column": 0}
        try:
            return {
                "start_line": getattr(node, "lineno", 0),
                "end_line": getattr(node, "end_lineno", getattr(node, "lineno", 0)),
                "start_column": getattr(node, "col_offset", 0),
                "end_column": getattr(node, "end_col_offset", 0),
            }
        except AttributeError:
            return {"start_line": 0, "end_line": 0, "start_column": 0, "end_column": 0}

    def _generate_scope_hash(self, scoped_name: str) -> str:
        """Generate a short hash for scoped name."""
        return hashlib.sha256(scoped_name.encode()).hexdigest()[:12]

    def _generate_entity_id(self, kind: str, scoped_name: str) -> str:
        """Generate entity ID in DevAC v2.0 format: {repo}:{pkg}:{kind}:{hash}"""
        scope_hash = self._generate_scope_hash(scoped_name)
        return f"{self.repo_name}:{self.package_path}:{kind}:{scope_hash}"

    def _get_scoped_name(self, name: str) -> str:
        """Get fully scoped name for the current context."""
        if self.scope_stack:
            return ".".join(self.scope_stack + [name])
        return name

    def _get_qualified_name(self, name: str) -> str:
        """Get qualified name (same as scoped name for Python)."""
        return self._get_scoped_name(name)

    def _get_docstring(self, node: ast.AST) -> Optional[str]:
        """Extract docstring from a node if present."""
        if isinstance(
            node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Module)
        ):
            if node.body and isinstance(node.body[0], ast.Expr):
                if isinstance(node.body[0].value, ast.Constant) and isinstance(
                    node.body[0].value.value, str
                ):
                    return node.body[0].value.value
        return None

    def _get_type_annotation(self, annotation: Optional[ast.expr]) -> Optional[str]:
        """Convert type annotation AST to string."""
        if annotation is None:
            return None
        return ast.unparse(annotation)

    def _has_decorator(self, decorators: List[ast.expr], name: str) -> bool:
        """Check if a decorator with given name exists."""
        for dec in decorators:
            if isinstance(dec, ast.Name) and dec.id == name:
                return True
            if isinstance(dec, ast.Attribute) and dec.attr == name:
                return True
        return False

    def _is_generator(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
        """Check if function is a generator."""
        for child in ast.walk(node):
            if isinstance(child, (ast.Yield, ast.YieldFrom)):
                return True
        return False

    def _add_node(
        self,
        kind: str,
        name: str,
        node: ast.AST,
        parent_entity_id: Optional[str] = None,
        **extra_props,
    ) -> str:
        """Add a node to the result and return its entity ID."""
        location = self._get_location(node)
        scoped_name = self._get_scoped_name(name)
        entity_id = self._generate_entity_id(kind, scoped_name)
        qualified_name = self._get_qualified_name(name)

        node_data = {
            "entity_id": entity_id,
            "kind": kind,
            "name": name,
            "qualified_name": qualified_name,
            "file_path": self.filepath,
            "start_line": location["start_line"],
            "end_line": location["end_line"],
            "start_column": location["start_column"],
            "end_column": location["end_column"],
            "language": "python",
            "is_exported": True,  # Python modules export everything by default
            **extra_props,
        }

        # Add optional fields if present
        docstring = self._get_docstring(node) if hasattr(node, "body") else None
        if docstring:
            node_data["documentation"] = docstring

        self.nodes.append(node_data)

        # Add CONTAINS edge if there's a parent
        if parent_entity_id:
            self._add_edge("CONTAINS", parent_entity_id, entity_id)

        return entity_id

    def _add_edge(
        self,
        edge_type: str,
        source_entity_id: str,
        target_entity_id: str,
        **extra_props,
    ) -> None:
        """Add an edge to the result."""
        edge_id = f"{edge_type}:{source_entity_id}:{target_entity_id}"
        edge_data = {
            "edge_id": edge_id,
            "edge_type": edge_type,
            "source_entity_id": source_entity_id,
            "target_entity_id": target_entity_id,
            "source_file_path": self.filepath,
            **extra_props,
        }
        self.edges.append(edge_data)

    def _add_external_ref(
        self,
        module_specifier: str,
        imported_symbol: str,
        source_entity_id: str,
        local_name: Optional[str] = None,
    ) -> None:
        """Add an external reference (import)."""
        ref_data = {
            "source_entity_id": source_entity_id,
            "source_file_path": self.filepath,
            "module_specifier": module_specifier,
            "imported_symbol": imported_symbol,
            "is_type_only": False,
            "is_relative": module_specifier.startswith("."),
        }
        if local_name and local_name != imported_symbol:
            ref_data["local_name"] = local_name
        self.external_refs.append(ref_data)

    def visit_Module(self, node: ast.Module) -> None:
        """Visit the module (file) root."""
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        """Visit a class definition."""
        # Save current context
        prev_class_name = self.current_class_name
        prev_class_entity_id = self.current_class_entity_id

        # Get decorators
        decorators = [ast.unparse(d) for d in node.decorator_list]

        # Create class node
        entity_id = self._add_node(
            "class",
            node.name,
            node,
            parent_entity_id=self.current_class_entity_id,
            properties={"decorators": decorators} if decorators else {},
        )

        # Add EXTENDS edges for base classes
        for base in node.bases:
            base_name = ast.unparse(base)
            # Create a placeholder target entity ID for the base class
            base_entity_id = self._generate_entity_id("class", base_name)
            self._add_edge("EXTENDS", entity_id, base_entity_id, target_name=base_name)

        # Update context
        self.current_class_name = node.name
        self.current_class_entity_id = entity_id
        self.scope_stack.append(node.name)

        # Visit class body
        self.generic_visit(node)

        # Restore context
        self.scope_stack.pop()
        self.current_class_name = prev_class_name
        self.current_class_entity_id = prev_class_entity_id

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        """Visit a function definition."""
        self._visit_function(node, is_async=False)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        """Visit an async function definition."""
        self._visit_function(node, is_async=True)

    def _visit_function(
        self, node: ast.FunctionDef | ast.AsyncFunctionDef, is_async: bool
    ) -> None:
        """Common logic for function and async function definitions."""
        # Determine if this is a method (inside a class)
        is_method = self.current_class_entity_id is not None
        kind = "method" if is_method else "function"

        # Check for static/classmethod decorators
        is_static = self._has_decorator(node.decorator_list, "staticmethod")
        is_classmethod = self._has_decorator(node.decorator_list, "classmethod")
        is_property = self._has_decorator(node.decorator_list, "property")
        is_generator = self._is_generator(node)

        # Get return type
        return_type = self._get_type_annotation(node.returns)

        # Get decorators
        decorators = [ast.unparse(d) for d in node.decorator_list]

        # Build extra properties
        extra_props: Dict[str, Any] = {}
        if is_async:
            extra_props["is_async"] = True
        if is_static:
            extra_props["is_static"] = True
        if is_classmethod:
            extra_props["properties"] = {"is_class_method": True}
        if is_property:
            extra_props["is_property"] = True
        if is_generator:
            extra_props["is_generator"] = True
        if return_type:
            extra_props["return_type"] = return_type
        if decorators:
            if "properties" in extra_props:
                extra_props["properties"]["decorators"] = decorators
            else:
                extra_props["properties"] = {"decorators": decorators}

        # Create function/method node
        parent_id = self.current_class_entity_id if is_method else None
        entity_id = self._add_node(
            kind, node.name, node, parent_entity_id=parent_id, **extra_props
        )

        # Save previous function context
        prev_function_entity_id = self.current_function_entity_id
        self.current_function_entity_id = entity_id
        self.scope_stack.append(node.name)

        # Process parameters
        self._process_function_args(node.args, entity_id)

        # Visit function body (for nested functions, etc.)
        self.generic_visit(node)

        # Restore context
        self.scope_stack.pop()
        self.current_function_entity_id = prev_function_entity_id

    def _process_function_args(self, args: ast.arguments, func_entity_id: str) -> None:
        """Process function arguments as parameter nodes."""
        all_args = []

        # Regular args
        for arg in args.args:
            # Skip 'self' and 'cls' for methods
            if arg.arg in ("self", "cls"):
                continue
            all_args.append(arg)

        # *args
        if args.vararg:
            all_args.append(args.vararg)

        # Keyword-only args
        all_args.extend(args.kwonlyargs)

        # **kwargs
        if args.kwarg:
            all_args.append(args.kwarg)

        for arg in all_args:
            type_annotation = self._get_type_annotation(arg.annotation)
            param_entity_id = self._add_node(
                "parameter", arg.arg, arg, type_annotation=type_annotation
            )
            self._add_edge("PARAMETER_OF", param_entity_id, func_entity_id)

    def visit_Import(self, node: ast.Import) -> None:
        """Visit an import statement."""
        # Create a module-level entity for the import source
        source_entity_id = (
            self.current_function_entity_id or self.current_class_entity_id or ""
        )
        if not source_entity_id:
            # Create a virtual module entity for file-level imports
            source_entity_id = self._generate_entity_id(
                "module", os.path.basename(self.filepath)
            )

        for alias in node.names:
            self._add_external_ref(
                module_specifier=alias.name,
                imported_symbol="*",  # import X imports the whole module
                source_entity_id=source_entity_id,
                local_name=alias.asname,
            )

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        """Visit a from...import statement."""
        source_entity_id = (
            self.current_function_entity_id or self.current_class_entity_id or ""
        )
        if not source_entity_id:
            source_entity_id = self._generate_entity_id(
                "module", os.path.basename(self.filepath)
            )

        # Build module specifier with relative dots
        module = node.module or ""
        if node.level > 0:
            dots = "." * node.level
            module = dots + module if module else dots

        for alias in node.names:
            self._add_external_ref(
                module_specifier=module,
                imported_symbol=alias.name,
                source_entity_id=source_entity_id,
                local_name=alias.asname,
            )

    def visit_Assign(self, node: ast.Assign) -> None:
        """Visit an assignment (module-level variables)."""
        # Only capture module-level assignments (not inside functions/classes)
        if self.current_function_entity_id is None:
            for target in node.targets:
                if isinstance(target, ast.Name):
                    # Determine if it's a constant (UPPER_CASE)
                    is_constant = target.id.isupper()
                    kind = "constant" if is_constant else "variable"
                    self._add_node(
                        kind,
                        target.id,
                        node,
                        parent_entity_id=self.current_class_entity_id,
                    )
        self.generic_visit(node)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        """Visit an annotated assignment (type aliases, typed variables)."""
        if self.current_function_entity_id is None and isinstance(
            node.target, ast.Name
        ):
            name = node.target.id
            type_annotation = self._get_type_annotation(node.annotation)

            # Check if it's a type alias (e.g., UserId = str)
            is_type_alias = (
                node.value is not None
                and isinstance(node.value, ast.Name)
                and node.value.id
                in (
                    "str",
                    "int",
                    "float",
                    "bool",
                    "bytes",
                    "list",
                    "dict",
                    "set",
                    "tuple",
                )
            )

            kind = (
                "type"
                if is_type_alias
                else ("constant" if name.isupper() else "variable")
            )

            self._add_node(
                kind,
                name,
                node,
                parent_entity_id=self.current_class_entity_id,
                type_annotation=type_annotation,
            )
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        """Visit a function/method call expression and create CALLS edges."""
        # Determine the source entity (caller)
        source_entity_id = self.current_function_entity_id
        if not source_entity_id:
            # Module-level call - use a virtual module entity
            source_entity_id = self._generate_entity_id(
                "module", os.path.basename(self.filepath)
            )

        # Extract callee name
        callee_name = self._extract_callee_name(node.func)
        if callee_name:
            # Create target entity ID with unresolved prefix
            target_entity_id = f"unresolved:{callee_name}"

            # Get source location
            location = self._get_location(node)

            # Add CALLS edge
            self._add_edge(
                "CALLS",
                source_entity_id,
                target_entity_id,
                callee=callee_name,
                argument_count=len(node.args) + len(node.keywords),
                start_line=location["start_line"],
                start_column=location["start_column"],
            )

        self.generic_visit(node)

    def _extract_callee_name(self, func: ast.expr) -> Optional[str]:
        """Extract the callee name from a call expression's func node."""
        if isinstance(func, ast.Name):
            # Simple function call: foo()
            return func.id
        elif isinstance(func, ast.Attribute):
            # Method/attribute call: obj.method()
            obj_name = self._extract_object_name(func.value)
            if obj_name:
                return f"{obj_name}.{func.attr}"
            return func.attr
        elif isinstance(func, ast.Call):
            # Chained call: foo()() - skip intermediate
            return None
        elif isinstance(func, ast.Subscript):
            # Subscript call: foo[x]() - extract the base
            return self._extract_callee_name(func.value)
        return None

    def _extract_object_name(self, node: ast.expr) -> Optional[str]:
        """Extract object name for method calls."""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            # Nested attribute: a.b.c
            obj_name = self._extract_object_name(node.value)
            if obj_name:
                return f"{obj_name}.{node.attr}"
            return node.attr
        elif isinstance(node, ast.Call):
            # Chained call: foo().bar() - just use the method name
            return None
        return None


def parse_python_file(filepath: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse a Python file and return DevAC v2.0 compatible result.
    """
    start_time = time.time()
    warnings: List[str] = []

    # Read file content
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            source = f.read()
    except FileNotFoundError:
        return {
            "error": f"File not found: {filepath}",
            "nodes": [],
            "edges": [],
            "externalRefs": [],
            "sourceFileHash": "",
            "filePath": filepath,
            "parseTimeMs": 0,
            "warnings": [f"File not found: {filepath}"],
        }
    except Exception as e:
        return {
            "error": f"Error reading file: {str(e)}",
            "nodes": [],
            "edges": [],
            "externalRefs": [],
            "sourceFileHash": "",
            "filePath": filepath,
            "parseTimeMs": 0,
            "warnings": [f"Error reading file: {str(e)}"],
        }

    # Compute source hash
    source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()

    # Parse AST
    try:
        tree = ast.parse(source, filename=filepath)
    except SyntaxError as e:
        warnings.append(f"Syntax error: {str(e)}")
        parse_time_ms = (time.time() - start_time) * 1000
        return {
            "nodes": [],
            "edges": [],
            "externalRefs": [],
            "sourceFileHash": source_hash,
            "filePath": filepath,
            "parseTimeMs": parse_time_ms,
            "warnings": warnings,
        }

    # Visit AST
    parser = DevACPythonParser(filepath, source, config)
    parser.visit(tree)

    parse_time_ms = (time.time() - start_time) * 1000

    return {
        "nodes": parser.nodes,
        "edges": parser.edges,
        "externalRefs": parser.external_refs,
        "sourceFileHash": source_hash,
        "filePath": filepath,
        "parseTimeMs": parse_time_ms,
        "warnings": parser.warnings + warnings,
    }


def main():
    """Main entry point for CLI usage."""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "File path argument required"}), file=sys.stderr)
        sys.exit(1)

    filepath = os.path.abspath(sys.argv[1])

    # Parse optional config
    config = {"repoName": "", "packagePath": "", "branch": "base"}

    if len(sys.argv) >= 4 and sys.argv[2] == "--config":
        try:
            config = json.loads(sys.argv[3])
        except json.JSONDecodeError as e:
            print(
                json.dumps({"error": f"Invalid config JSON: {str(e)}"}), file=sys.stderr
            )
            sys.exit(1)

    result = parse_python_file(filepath, config)

    if "error" in result and result.get("nodes") == []:
        print(json.dumps(result), file=sys.stderr)
        sys.exit(1)

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
