package main

import "fmt"

type Route struct {
	Name   string
	Health int
}

func selectBest(routes []Route) Route {
	best := routes[0]
	for _, r := range routes {
		if r.Health > best.Health {
			best = r
		}
	}
	return best
}

func main() {
	routes := []Route{
		{"cdn-a", 80},
		{"cdn-b", 60},
		{"cdn-c", 90},
	}

	best := selectBest(routes)
	fmt.Println("Selected route:", best.Name)
}
