// Package authmanager handles user accounts, bcrypt passwords, and JWT tokens.
package authmanager

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Role defines what a user is allowed to do.
type Role string

const (
	RoleAdmin    Role = "admin"    // full access
	RoleOperator Role = "operator" // stream control, read-only config
	RoleViewer   Role = "viewer"   // read-only
)

// User is a public (non-secret) snapshot of a user row.
type User struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Role      Role      `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// Claims is embedded in the JWT payload.
type Claims struct {
	jwt.RegisteredClaims
	UserID   string `json:"uid"`
	Username string `json:"username"`
	Role     Role   `json:"role"`
}

// Manager wraps the users table and JWT signing.
type Manager struct {
	db     *sql.DB
	secret []byte
}

// New returns a Manager. secret is used to sign JWTs.
func New(db *sql.DB, secret string) *Manager {
	return &Manager{db: db, secret: []byte(secret)}
}

// IsSetupRequired returns true if no users exist yet (first run).
func (m *Manager) IsSetupRequired() bool {
	var count int
	m.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	return count == 0
}

// Setup creates the first admin account. Returns an error if any user already exists.
func (m *Manager) Setup(username, password string) (string, *User, error) {
	if !m.IsSetupRequired() {
		return "", nil, errors.New("setup already completed")
	}
	user, err := m.CreateUser(username, password, RoleAdmin)
	if err != nil {
		return "", nil, err
	}
	slog.Info("authmanager: first admin created via setup", "username", username)
	token, err := m.sign(user)
	if err != nil {
		return "", nil, err
	}
	return token, user, nil
}

// Login verifies credentials and returns a signed JWT on success.
func (m *Manager) Login(username, password string) (string, *User, error) {
	var u User
	var hash string
	err := m.db.QueryRow(
		"SELECT id, username, password_hash, role, created_at FROM users WHERE username = ?",
		username,
	).Scan(&u.ID, &u.Username, &hash, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil, errors.New("invalid credentials")
	}
	if err != nil {
		return "", nil, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return "", nil, errors.New("invalid credentials")
	}
	token, err := m.sign(&u)
	if err != nil {
		return "", nil, err
	}
	return token, &u, nil
}

// Verify parses and validates a JWT, returning its claims.
func (m *Manager) Verify(tokenStr string) (*Claims, error) {
	t, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := t.Claims.(*Claims)
	if !ok || !t.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// CreateUser adds a new user. Returns an error if the username is taken.
func (m *Manager) CreateUser(username, password string, role Role) (*User, error) {
	if username == "" || password == "" {
		return nil, errors.New("username and password are required")
	}
	if len(password) < 4 {
		return nil, errors.New("password must be at least 4 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	id := newID()
	now := time.Now().UTC()
	_, err = m.db.Exec(
		"INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
		id, username, string(hash), string(role), now,
	)
	if err != nil {
		return nil, fmt.Errorf("authmanager: create user %q: %w", username, err)
	}
	return &User{ID: id, Username: username, Role: role, CreatedAt: now}, nil
}

// ListUsers returns all users (without password hashes).
func (m *Manager) ListUsers() ([]*User, error) {
	rows, err := m.db.Query("SELECT id, username, role, created_at FROM users ORDER BY created_at")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &u.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &u)
	}
	return out, rows.Err()
}

// GetUser returns a single user by ID.
func (m *Manager) GetUser(id string) (*User, error) {
	var u User
	err := m.db.QueryRow(
		"SELECT id, username, role, created_at FROM users WHERE id = ?", id,
	).Scan(&u.ID, &u.Username, &u.Role, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("user not found")
	}
	return &u, err
}

// DeleteUser removes a user. Returns an error if it's the last admin.
func (m *Manager) DeleteUser(id string) error {
	// Guard: don't delete the last admin.
	var role Role
	if err := m.db.QueryRow("SELECT role FROM users WHERE id = ?", id).Scan(&role); err != nil {
		return errors.New("user not found")
	}
	if role == RoleAdmin {
		var adminCount int
		m.db.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin'").Scan(&adminCount)
		if adminCount <= 1 {
			return errors.New("cannot delete the last admin user")
		}
	}
	_, err := m.db.Exec("DELETE FROM users WHERE id = ?", id)
	return err
}

// ChangeRole updates a user's role. Prevents removing the last admin.
func (m *Manager) ChangeRole(id string, role Role) error {
	var current Role
	if err := m.db.QueryRow("SELECT role FROM users WHERE id = ?", id).Scan(&current); err != nil {
		return errors.New("user not found")
	}
	if current == RoleAdmin && role != RoleAdmin {
		var adminCount int
		m.db.QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin'").Scan(&adminCount)
		if adminCount <= 1 {
			return errors.New("cannot demote the last admin user")
		}
	}
	_, err := m.db.Exec("UPDATE users SET role = ? WHERE id = ?", string(role), id)
	return err
}

// ChangePassword updates a user's password.
func (m *Manager) ChangePassword(id, newPassword string) error {
	if len(newPassword) < 4 {
		return errors.New("password must be at least 4 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = m.db.Exec("UPDATE users SET password_hash = ? WHERE id = ?", string(hash), id)
	return err
}

func (m *Manager) sign(u *User) (string, error) {
	claims := &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   u.ID,
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
		},
		UserID:   u.ID,
		Username: u.Username,
		Role:     u.Role,
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}

func newID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}
