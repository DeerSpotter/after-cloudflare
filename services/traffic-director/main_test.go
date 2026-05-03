package main

import "testing"

func TestSelectBest(t *testing.T) {
	routes := []Route{
		{"a", 10},
		{"b", 50},
		{"c", 30},
	}

	best := selectBest(routes)

	if best.Name != "b" {
		t.Errorf("expected b, got %s", best.Name)
	}
}
