package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port          int
	Host          string
	DatabaseURL   string
	JWTSecret     string
	JWTExpiry     time.Duration
	OllamaEndpoint string
	OpenAIEndpoint string
}

func Load() *Config {
	return &Config{
		Port:          getEnvInt("PORT", 8080),
		Host:          getEnv("HOST", "0.0.0.0"),
		DatabaseURL:   getEnv("DATABASE_URL", "postgres://versatile:versatile@localhost:5432/versatile?sslmode=disable"),
		JWTSecret:     getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		JWTExpiry:     time.Duration(getEnvInt("JWT_EXPIRY_HOURS", 720)) * time.Hour,
		OllamaEndpoint: getEnv("OLLAMA_ENDPOINT", "http://localhost:11434"),
		OpenAIEndpoint: getEnv("OPENAI_ENDPOINT", "https://api.openai.com/v1"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
