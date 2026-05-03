package main

import (
	"fmt"
	"net/http"
	"time"
)

func check(url string) {
	start := time.Now()
	resp, err := http.Get(url)
	duration := time.Since(start)

	if err != nil {
		fmt.Println(url, "DOWN", err)
		return
	}

	fmt.Println(url, resp.StatusCode, duration)
}

func main() {
	check("https://example.com")
	check("https://cloudflare.com")
}
