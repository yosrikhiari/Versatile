package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func aiRoutes(pool *pgxpool.Pool) func(chi.Router) {
	ollamaEndpoint := os.Getenv("OLLAMA_ENDPOINT")
	if ollamaEndpoint == "" {
		ollamaEndpoint = "http://localhost:11434"
	}

	return func(r chi.Router) {
		r.Post("/generate", handleAIGenerate(ollamaEndpoint))
		r.Post("/embeddings", handleAIEmbeddings(ollamaEndpoint))
		r.Get("/models", handleAIModels(ollamaEndpoint))
		r.Post("/chat", handleAIChat(ollamaEndpoint))
	}
}

type generateRequest struct {
	Model    string `json:"model"`
	Prompt   string `json:"prompt"`
	System   string `json:"system"`
	Stream   bool   `json:"stream"`
}

func handleAIGenerate(endpoint string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req generateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		body := map[string]interface{}{
			"model":  req.Model,
			"prompt": req.Prompt,
			"stream": false,
		}
		if req.System != "" {
			body["system"] = req.System
		}

		proxyRequest(endpoint+"/api/generate", body, w)
	}
}

type embeddingsRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

func handleAIEmbeddings(endpoint string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req embeddingsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		body := map[string]interface{}{
			"model":  req.Model,
			"prompt": req.Prompt,
		}

		proxyRequest(endpoint+"/api/embeddings", body, w)
	}
}

func handleAIModels(endpoint string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp, err := http.Get(endpoint + "/api/tags")
		if err != nil {
			http.Error(w, `{"error":"failed to fetch models"}`, http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "application/json")
		io.Copy(w, resp.Body)
	}
}

type chatRequest struct {
	Model    string          `json:"model"`
	Messages json.RawMessage `json:"messages"`
	Stream   bool            `json:"stream"`
}

func handleAIChat(endpoint string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req chatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		body := map[string]interface{}{
			"model":    req.Model,
			"messages": req.Messages,
			"stream":   false,
		}

		proxyRequest(endpoint+"/api/chat", body, w)
	}
}

func proxyRequest(url string, body interface{}, w http.ResponseWriter) {
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		http.Error(w, `{"error":"failed to marshal request"}`, http.StatusInternalServerError)
		return
	}

	resp, err := http.Post(url, "application/json", bytes.NewReader(bodyBytes))
	if err != nil {
		log.Printf("proxy request to %s error: %v", url, err)
		http.Error(w, `{"error":"failed to reach AI backend"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("read proxy response error: %v", err)
		http.Error(w, `{"error":"failed to read AI response"}`, http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	w.Write(respBytes)
}
