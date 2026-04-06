// Command docgen generates API route documentation from the Ace backend source.
//
// It parses cmd/api/main.go to extract all mux.HandleFunc registrations and
// reads handler files to pull doc comments. Output is a Markdown file suitable
// for VitePress.
//
// Usage:
//
//	go run ./cmd/docgen -out ../website/api/routes.md
package main

import (
	"flag"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Route represents a single extracted API route.
type Route struct {
	Method     string
	Path       string
	Auth       bool
	OrgMember  bool
	Section    string
	HandlerVar string // local variable name, e.g. "authHandler"
	MethodName string // method name, e.g. "Register"
	TypeName   string // resolved struct type, e.g. "AuthHandler"
	DocComment string // doc comment from handler source
}

func main() {
	outPath := flag.String("out", "", "output markdown file path (required)")
	mainFile := flag.String("main", "cmd/api/main.go", "path to main.go relative to backend/")
	handlersDir := flag.String("handlers", "internal/handlers", "path to handlers directory")
	flag.Parse()

	if *outPath == "" {
		fmt.Fprintln(os.Stderr, "usage: docgen -out <path>")
		os.Exit(1)
	}

	routes, err := extractRoutes(*mainFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "extracting routes: %v\n", err)
		os.Exit(1)
	}

	docs, err := loadHandlerDocs(*handlersDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "loading handler docs: %v\n", err)
		os.Exit(1)
	}

	for i := range routes {
		r := &routes[i]
		key := r.TypeName + "." + r.MethodName
		if r.TypeName == "" {
			key = r.MethodName // bare function
		}
		if doc, ok := docs[key]; ok {
			r.DocComment = doc
		}
	}

	md := renderMarkdown(routes)
	if err := os.MkdirAll(filepath.Dir(*outPath), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "creating output directory: %v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(*outPath, []byte(md), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "writing %s: %v\n", *outPath, err)
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "docgen: wrote %d routes to %s\n", len(routes), *outPath)
}

// extractRoutes parses main.go and returns all registered routes.
func extractRoutes(mainFile string) ([]Route, error) {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, mainFile, nil, parser.ParseComments)
	if err != nil {
		return nil, fmt.Errorf("parsing %s: %w", mainFile, err)
	}

	// Build variable name → type name map from constructor calls.
	// e.g. authHandler := handlers.NewAuthHandler(...) → "authHandler" → "AuthHandler"
	varTypes := make(map[string]string)
	ast.Inspect(f, func(n ast.Node) bool {
		assign, ok := n.(*ast.AssignStmt)
		if !ok || len(assign.Lhs) == 0 || len(assign.Rhs) == 0 {
			return true
		}
		call, ok := assign.Rhs[0].(*ast.CallExpr)
		if !ok {
			return true
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		pkg, ok := sel.X.(*ast.Ident)
		if !ok || pkg.Name != "handlers" {
			return true
		}
		name := sel.Sel.Name
		if strings.HasPrefix(name, "New") && strings.HasSuffix(name, "Handler") {
			typeName := strings.TrimPrefix(name, "New")
			if lhs, ok := assign.Lhs[0].(*ast.Ident); ok {
				varTypes[lhs.Name] = typeName
			}
		}
		return true
	})

	// Build a sorted list of all comments with line numbers for section detection.
	type lineComment struct {
		line int
		text string
	}
	var comments []lineComment
	for _, cg := range f.Comments {
		for _, c := range cg.List {
			pos := fset.Position(c.Pos())
			text := strings.TrimPrefix(c.Text, "// ")
			comments = append(comments, lineComment{line: pos.Line, text: text})
		}
	}
	sort.Slice(comments, func(i, j int) bool { return comments[i].line < comments[j].line })

	// findSection returns the nearest section comment before the given line.
	isSectionComment := func(text string) bool {
		lower := strings.ToLower(text)
		return strings.Contains(lower, "route") || strings.Contains(lower, "endpoint")
	}

	findSection := func(line int) string {
		// Search backwards through comments for the nearest section header.
		best := ""
		for i := len(comments) - 1; i >= 0; i-- {
			c := comments[i]
			if c.line >= line {
				continue
			}
			if c.line < line-20 {
				break // too far away
			}
			if isSectionComment(c.text) {
				best = c.text
				break
			}
		}
		return best
	}

	// Walk AST to find all mux.HandleFunc calls.
	var routes []Route
	ast.Inspect(f, func(n ast.Node) bool {
		stmt, ok := n.(*ast.ExprStmt)
		if !ok {
			return true
		}
		call, ok := stmt.X.(*ast.CallExpr)
		if !ok {
			return true
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || sel.Sel.Name != "HandleFunc" {
			return true
		}
		muxIdent, ok := sel.X.(*ast.Ident)
		if !ok || muxIdent.Name != "mux" {
			return true
		}
		if len(call.Args) < 2 {
			return true
		}
		routeLit, ok := call.Args[0].(*ast.BasicLit)
		if !ok || routeLit.Kind != token.STRING {
			return true
		}
		routeStr := strings.Trim(routeLit.Value, `"`)
		parts := strings.SplitN(routeStr, " ", 2)
		if len(parts) != 2 {
			return true
		}

		line := fset.Position(stmt.Pos()).Line
		route := Route{
			Method:  parts[0],
			Path:    parts[1],
			Section: findSection(line),
		}

		// Unwrap the handler expression to detect auth middleware.
		handlerExpr := call.Args[1]
		route.Auth, route.OrgMember, handlerExpr = unwrapAuth(handlerExpr)

		// Extract handler variable and method name.
		if handlerSel, ok := handlerExpr.(*ast.SelectorExpr); ok {
			route.MethodName = handlerSel.Sel.Name
			if ident, ok := handlerSel.X.(*ast.Ident); ok {
				route.HandlerVar = ident.Name
				if typeName, ok := varTypes[ident.Name]; ok {
					route.TypeName = typeName
				}
			}
		}

		routes = append(routes, route)
		return true
	})

	return routes, nil
}

// unwrapAuth recursively unwraps auth.RequireAuth and auth.RequireOrgMember
// wrappers, returning the innermost handler expression and the auth flags.
func unwrapAuth(expr ast.Expr) (auth, orgMember bool, inner ast.Expr) {
	call, ok := expr.(*ast.CallExpr)
	if !ok {
		return false, false, expr
	}
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return false, false, expr
	}
	pkg, ok := sel.X.(*ast.Ident)
	if !ok {
		return false, false, expr
	}
	if pkg.Name != "auth" {
		return false, false, expr
	}

	switch sel.Sel.Name {
	case "RequireAuth":
		if len(call.Args) < 2 {
			return false, false, expr
		}
		_, innerOrg, innerExpr := unwrapAuth(call.Args[1])
		return true, innerOrg, innerExpr

	case "RequireOrgMember":
		if len(call.Args) < 2 {
			return false, false, expr
		}
		innerAuth, _, innerExpr := unwrapAuth(call.Args[1])
		return innerAuth, true, innerExpr

	default:
		return false, false, expr
	}
}

// loadHandlerDocs parses all Go files in the handlers directory and extracts
// doc comments for exported methods and functions.
//
// Returns a map keyed by "TypeName.MethodName" for methods or just
// "FunctionName" for bare functions.
func loadHandlerDocs(dir string) (map[string]string, error) {
	docs := make(map[string]string)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", dir, err)
	}

	fset := token.NewFileSet()
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") {
			continue
		}
		if strings.HasSuffix(entry.Name(), "_test.go") {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		f, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
		if err != nil {
			fmt.Fprintf(os.Stderr, "docgen: warning: skipping %s: %v\n", path, err)
			continue
		}

		for _, decl := range f.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || !fn.Name.IsExported() {
				continue
			}
			doc := ""
			if fn.Doc != nil {
				doc = strings.TrimSpace(fn.Doc.Text())
			}
			if doc == "" {
				continue
			}

			if fn.Recv != nil && len(fn.Recv.List) > 0 {
				// Method with receiver.
				typeName := receiverTypeName(fn.Recv.List[0].Type)
				if typeName != "" {
					docs[typeName+"."+fn.Name.Name] = doc
				}
			} else {
				// Bare function.
				docs[fn.Name.Name] = doc
			}
		}
	}
	return docs, nil
}

// receiverTypeName extracts the type name from a receiver expression,
// handling both value receivers (T) and pointer receivers (*T).
func receiverTypeName(expr ast.Expr) string {
	switch t := expr.(type) {
	case *ast.StarExpr:
		if ident, ok := t.X.(*ast.Ident); ok {
			return ident.Name
		}
	case *ast.Ident:
		return t.Name
	}
	return ""
}

// renderMarkdown produces the final Markdown output grouped by section.
func renderMarkdown(routes []Route) string {
	var b strings.Builder
	b.WriteString("---\ntitle: API Routes\n---\n\n")
	b.WriteString("# API Routes\n\n")
	b.WriteString("> Auto-generated by `docgen`. Do not edit directly.\n\n")

	currentSection := ""
	firstSection := true
	for _, r := range routes {
		if r.Section != currentSection {
			if !firstSection {
				b.WriteString("\n")
			}
			firstSection = false
			currentSection = r.Section
			if currentSection != "" {
				heading := strings.ToUpper(currentSection[:1]) + currentSection[1:]
				b.WriteString("## " + heading + "\n\n")
			} else {
				b.WriteString("## Other\n\n")
			}
			b.WriteString("| Method | Path | Auth | Org Member | Description |\n")
			b.WriteString("|--------|------|------|------------|-------------|\n")
		}

		auth := "-"
		if r.Auth {
			auth = "Yes"
		}
		orgMember := "-"
		if r.OrgMember {
			orgMember = "Yes"
		}
		desc := r.DocComment
		if desc == "" {
			desc = r.MethodName
		}
		// Use only the first line of multi-line doc comments.
		if idx := strings.IndexByte(desc, '\n'); idx >= 0 {
			desc = desc[:idx]
		}
		// Escape pipe characters so they don't break the markdown table.
		desc = strings.ReplaceAll(desc, "|", `\|`)

		fmt.Fprintf(&b, "| %s | `%s` | %s | %s | %s |\n",
			r.Method, r.Path, auth, orgMember, desc)
	}
	b.WriteString("\n")
	return b.String()
}
