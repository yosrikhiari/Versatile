package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/cors"

	"versatile/server/internal/auth"
)

func NewRouter(pool *pgxpool.Pool, a *auth.Auth) *chi.Mux {
	r := chi.NewRouter()

	authHandler := NewAuthHandler(pool, a)

	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	})

	r.Use(corsHandler.Handler)
	r.Use(LoggingMiddleware)

	r.Get("/health", authHandler.Health)

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/register", authHandler.Register)
		r.Post("/auth/login", authHandler.Login)

		r.Group(func(r chi.Router) {
			r.Use(AuthMiddleware(a))
			r.Route("/sync", syncRoutes(pool))
			r.Route("/ai", aiRoutes(pool))
		})
	})

	return r
}
