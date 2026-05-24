package model

import "time"

type User struct {
	ID           string    `json:"id" db:"id"`
	Email        string    `json:"email" db:"email"`
	PasswordHash string    `json:"-" db:"password_hash"`
	DisplayName  string    `json:"display_name" db:"display_name"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

type Project struct {
	ID        string    `json:"id" db:"id"`
	UserID    string    `json:"user_id" db:"user_id"`
	Name      string    `json:"name" db:"name"`
	Genre     string    `json:"genre" db:"genre"`
	Synopsis  string    `json:"synopsis" db:"synopsis"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type Manuscript struct {
	ID        string    `json:"id" db:"id"`
	ProjectID string    `json:"project_id" db:"project_id"`
	Content   string    `json:"content" db:"content"`
	WordCount int       `json:"word_count" db:"word_count"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

type Character struct {
	ID        string     `json:"id" db:"id"`
	ProjectID string     `json:"project_id" db:"project_id"`
	Name      string     `json:"name" db:"name"`
	Role      string     `json:"role" db:"role"`
	Goal      string     `json:"goal" db:"goal"`
	Voice     string     `json:"voice" db:"voice"`
	Notes     string     `json:"notes" db:"notes"`
	Color     string     `json:"color" db:"color"`
	Portrait  string     `json:"portrait,omitempty" db:"portrait"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type CharacterRelationship struct {
	ID              string    `json:"id" db:"id"`
	ProjectID       string    `json:"project_id" db:"project_id"`
	FromCharacterID string    `json:"from_character_id" db:"from_character_id"`
	ToCharacterID   string    `json:"to_character_id" db:"to_character_id"`
	Type            string    `json:"type" db:"type"`
	Notes           string    `json:"notes" db:"notes"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}

type Location struct {
	ID          string     `json:"id" db:"id"`
	ProjectID   string     `json:"project_id" db:"project_id"`
	Name        string     `json:"name" db:"name"`
	Description string     `json:"description" db:"description"`
	Notes       string     `json:"notes" db:"notes"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type PlotThread struct {
	ID        string     `json:"id" db:"id"`
	ProjectID string     `json:"project_id" db:"project_id"`
	Title     string     `json:"title" db:"title"`
	Status    string     `json:"status" db:"status"`
	Notes     string     `json:"notes" db:"notes"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type Section struct {
	ID        string     `json:"id" db:"id"`
	ProjectID string     `json:"project_id" db:"project_id"`
	Title     string     `json:"title" db:"title"`
	Summary   string     `json:"summary" db:"summary"`
	Order     int        `json:"order" db:"order"`
	Status    string     `json:"status" db:"status"`
	Tags      []string   `json:"tags" db:"tags"`
	VolumeID  *string    `json:"volume_id,omitempty" db:"volume_id"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type Subsection struct {
	ID        string     `json:"id" db:"id"`
	ProjectID string     `json:"project_id" db:"project_id"`
	SectionID string     `json:"section_id" db:"section_id"`
	Title     string     `json:"title" db:"title"`
	Summary   string     `json:"summary" db:"summary"`
	Order     int        `json:"order" db:"order"`
	Content   string     `json:"content" db:"content"`
	Tags      []string   `json:"tags" db:"tags"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type SparkHistory struct {
	ID         string     `json:"id" db:"id"`
	ProjectID  string     `json:"project_id" db:"project_id"`
	Type       string     `json:"type" db:"type"`
	Prompt     string     `json:"prompt" db:"prompt"`
	Blueprint  string     `json:"blueprint,omitempty" db:"blueprint"`
	Response   string     `json:"response,omitempty" db:"response"`
	CreatedAt  time.Time  `json:"created_at" db:"created_at"`
	DeletedAt  *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type Annotation struct {
	ID              string     `json:"id" db:"id"`
	ProjectID       string     `json:"project_id" db:"project_id"`
	ParagraphIndex  int        `json:"paragraph_index" db:"paragraph_index"`
	Type            string     `json:"type" db:"type"`
	Original        string     `json:"original" db:"original"`
	Suggestion      string     `json:"suggestion" db:"suggestion"`
	Reason          string     `json:"reason" db:"reason"`
	Status          string     `json:"status" db:"status"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt       *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type Snippet struct {
	ID        string     `json:"id" db:"id"`
	ProjectID string     `json:"project_id" db:"project_id"`
	Word      string     `json:"word" db:"word"`
	Count     int        `json:"count" db:"count"`
	LastSeen  time.Time  `json:"last_seen" db:"last_seen"`
	UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type DailyGoal struct {
	ID         string    `json:"id" db:"id"`
	ProjectID  string    `json:"project_id" db:"project_id"`
	Date       string    `json:"date" db:"date"`
	GoalWords  int       `json:"goal_words" db:"goal_words"`
	WordCount  int       `json:"word_count" db:"word_count"`
	UpdatedAt  time.Time `json:"updated_at" db:"updated_at"`
}

type RevisionComment struct {
	ID             string     `json:"id" db:"id"`
	ProjectID      string     `json:"project_id" db:"project_id"`
	ParagraphIndex int        `json:"paragraph_index" db:"paragraph_index"`
	StartOffset    int        `json:"start_offset" db:"start_offset"`
	EndOffset      int        `json:"end_offset" db:"end_offset"`
	SelectedText   string     `json:"selected_text" db:"selected_text"`
	Comment        string     `json:"comment" db:"comment"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	DeletedAt      *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type StoryElement struct {
	ID        string     `json:"id" db:"id"`
	ProjectID string     `json:"project_id" db:"project_id"`
	Type      string     `json:"type" db:"type"`
	Title     string     `json:"title" db:"title"`
	X         float64    `json:"x" db:"x"`
	Y         float64    `json:"y" db:"y"`
	Width     float64    `json:"width" db:"width"`
	Height    float64    `json:"height" db:"height"`
	Data      string     `json:"data,omitempty" db:"data"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type GraphEdge struct {
	ID               string     `json:"id" db:"id"`
	ProjectID        string     `json:"project_id" db:"project_id"`
	SourceID         string     `json:"source_id" db:"source_id"`
	SourceType       string     `json:"source_type" db:"source_type"`
	TargetID         string     `json:"target_id" db:"target_id"`
	TargetType       string     `json:"target_type" db:"target_type"`
	RelationshipType string     `json:"relationship_type" db:"relationship_type"`
	VolumeID         *string    `json:"volume_id,omitempty" db:"volume_id"`
	CreatedAt        time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt        *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type NodePosition struct {
	ID        string    `json:"id" db:"id"`
	ProjectID string    `json:"project_id" db:"project_id"`
	Positions string    `json:"positions" db:"positions"`
	Instances string    `json:"instances" db:"instances"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

type GraphGroup struct {
	ID          string    `json:"id" db:"id"`
	ProjectID   string    `json:"project_id" db:"project_id"`
	Groups      string    `json:"groups" db:"groups"`
	NodeParents string    `json:"node_parents" db:"node_parents"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

type GroupEdge struct {
	ID               string     `json:"id" db:"id"`
	ProjectID        string     `json:"project_id" db:"project_id"`
	SourceGroupID    string     `json:"source_group_id" db:"source_group_id"`
	TargetGroupID    string     `json:"target_group_id" db:"target_group_id"`
	RelationshipType string     `json:"relationship_type" db:"relationship_type"`
	CreatedAt        time.Time  `json:"created_at" db:"created_at"`
	DeletedAt        *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type Snapshot struct {
	ID        string     `json:"id" db:"id"`
	ProjectID string     `json:"project_id" db:"project_id"`
	SectionID *string    `json:"section_id,omitempty" db:"section_id"`
	Timestamp time.Time  `json:"timestamp" db:"timestamp"`
	Label     string     `json:"label" db:"label"`
	Content   string     `json:"content" db:"content"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type Volume struct {
	ID          string     `json:"id" db:"id"`
	ProjectID   string     `json:"project_id" db:"project_id"`
	Title       string     `json:"title" db:"title"`
	Description string     `json:"description" db:"description"`
	Color       string     `json:"color" db:"color"`
	ChapterIDs  []string   `json:"chapter_ids" db:"chapter_ids"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
}

type VolumeEntity struct {
	ID         string    `json:"id" db:"id"`
	VolumeID   string    `json:"volume_id" db:"volume_id"`
	EntityType string    `json:"entity_type" db:"entity_type"`
	EntityID   string    `json:"entity_id" db:"entity_id"`
	IsPrimary  bool      `json:"is_primary" db:"is_primary"`
	AssignedAt time.Time `json:"assigned_at" db:"assigned_at"`
}

type SyncEntity struct {
	Table     string    `json:"table"`
	ID        string    `json:"id"`
	Data      string    `json:"data"`
	UpdatedAt time.Time `json:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
}

type SyncPullRequest struct {
	Since time.Time `json:"since"`
}

type SyncPullResponse struct {
	Entities []SyncEntity `json:"entities"`
	ServerAt time.Time    `json:"server_at"`
}

type SyncPushRequest struct {
	Entities []SyncEntity `json:"entities"`
}

type SyncPushResponse struct {
	Accepted  int `json:"accepted"`
	Conflicts int `json:"conflicts"`
}
