package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"versatile/server/internal/model"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func syncRoutes(pool *pgxpool.Pool) func(chi.Router) {
	return func(r chi.Router) {
		r.Post("/pull", handleSyncPull(pool))
		r.Post("/push", handleSyncPush(pool))
	}
}

type pullRequest struct {
	Since time.Time `json:"since"`
}

type pullResponse struct {
	Entities []syncEntity `json:"entities"`
	ServerAt time.Time    `json:"server_at"`
}

type pushRequest struct {
	Entities []syncEntity `json:"entities"`
}

type pushResponse struct {
	Accepted int `json:"accepted"`
}

type syncEntity struct {
	Table     string     `json:"table"`
	ID        string     `json:"id"`
	Data      string     `json:"data"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
}

func handleSyncPull(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req pullRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		userID := r.Context().Value("user_id").(string)
		entities := []syncEntity{}

		tables := []string{
			"projects", "manuscripts", "characters", "character_relationships",
			"locations", "plot_threads", "sections", "subsections",
			"chapters", "scenes", "spark_history", "annotations",
			"snippets", "daily_goals", "revision_comments", "story_elements",
			"graph_edges", "graph_groups", "node_positions", "group_edges",
			"snapshots", "volumes", "volume_entities",
		}

		for _, table := range tables {
			rows, err := pool.Query(r.Context(),
				`SELECT row_to_json(t)::text FROM `+table+` t
				 WHERE (updated_at > $1 OR (deleted_at IS NOT NULL AND deleted_at > $1))
				 AND project_id IN (SELECT id FROM projects WHERE user_id = $2)`,
				req.Since, userID,
			)
			if err != nil {
				log.Printf("sync pull %s error: %v", table, err)
				continue
			}

			for rows.Next() {
				var data string
				if err := rows.Scan(&data); err != nil {
					log.Printf("scan row error: %v", err)
					continue
				}
				entities = append(entities, syncEntity{
					Table:     table,
					Data:      data,
					UpdatedAt: req.Since,
				})
			}
			rows.Close()
		}

		writeJSON(w, http.StatusOK, pullResponse{
			Entities: entities,
			ServerAt: time.Now().UTC(),
		})
	}
}

func handleSyncPush(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req pushRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		accepted := 0
		for _, entity := range req.Entities {
			if err := upsertEntity(pool, r.Context(), entity); err != nil {
				log.Printf("sync push %s/%s error: %v", entity.Table, entity.ID, err)
				continue
			}
			accepted++
		}

		writeJSON(w, http.StatusOK, pushResponse{Accepted: accepted})
	}
}

func upsertEntity(pool *pgxpool.Pool, ctx interface{}, entity syncEntity) error {
	return nil
}

func init() {
	var _ = model.SyncEntity{}
}
