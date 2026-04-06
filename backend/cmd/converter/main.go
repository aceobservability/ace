package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/aceobservability/ace/backend/internal/converter"
)

func main() {
	outputPath := flag.String("output", "", "output file path")
	format := flag.String("format", "json", "output format: json or yaml")
	flag.Parse()

	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: converter <grafana.json> --output <ace.json|ace.yaml> [--format json|yaml]")
		os.Exit(1)
	}

	inputPath := flag.Arg(0)
	if *outputPath == "" {
		fmt.Fprintln(os.Stderr, "--output is required")
		os.Exit(1)
	}

	input, err := os.ReadFile(inputPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read input file: %v\n", err)
		os.Exit(1)
	}

	doc, warnings, err := converter.ConvertGrafanaDashboard(input)
	if err != nil {
		fmt.Fprintf(os.Stderr, "conversion failed: %v\n", err)
		os.Exit(1)
	}

	encoded, err := converter.EncodeDashboardDocument(doc, *format)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to encode output: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(*outputPath, encoded, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "failed to write output file: %v\n", err)
		os.Exit(1)
	}

	for _, warning := range warnings {
		fmt.Fprintf(os.Stderr, "warning: %s\n", warning)
	}

	fmt.Printf("converted dashboard written to %s\n", *outputPath)
}
