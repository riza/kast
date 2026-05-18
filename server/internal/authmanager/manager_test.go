package authmanager_test

import (
	"database/sql"
	"testing"

	"github.com/riza/kast/internal/authmanager"
	"github.com/riza/kast/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	d, err := db.Open(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { d.Close() })
	return d
}

func newManager(t *testing.T) *authmanager.Manager {
	t.Helper()
	return authmanager.New(testDB(t), "test-jwt-secret")
}

// ── Setup ────────────────────────────────────────────────────────────────────

func TestIsSetupRequired_NoUsers(t *testing.T) {
	m := newManager(t)
	assert.True(t, m.IsSetupRequired())
}

func TestIsSetupRequired_WithUsers(t *testing.T) {
	m := newManager(t)
	_, err := m.CreateUser("admin", "password123", authmanager.RoleAdmin)
	require.NoError(t, err)
	assert.False(t, m.IsSetupRequired())
}

func TestSetup_FirstRun(t *testing.T) {
	m := newManager(t)
	token, user, err := m.Setup("admin", "password123")
	require.NoError(t, err)
	assert.NotEmpty(t, token)
	assert.Equal(t, "admin", user.Username)
	assert.Equal(t, authmanager.RoleAdmin, user.Role)
	assert.NotEmpty(t, user.ID)
}

func TestSetup_AlreadyDone(t *testing.T) {
	m := newManager(t)
	_, _, err := m.Setup("admin", "password123")
	require.NoError(t, err)
	_, _, err = m.Setup("admin2", "password456")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "already")
}

// ── CreateUser ───────────────────────────────────────────────────────────────

func TestCreateUser_Success(t *testing.T) {
	m := newManager(t)
	u, err := m.CreateUser("alice", "password123", authmanager.RoleViewer)
	require.NoError(t, err)
	assert.NotEmpty(t, u.ID)
	assert.Equal(t, "alice", u.Username)
	assert.Equal(t, authmanager.RoleViewer, u.Role)
	assert.False(t, u.CreatedAt.IsZero())
}

func TestCreateUser_DuplicateUsername(t *testing.T) {
	m := newManager(t)
	_, err := m.CreateUser("alice", "password123", authmanager.RoleViewer)
	require.NoError(t, err)
	_, err = m.CreateUser("alice", "password456", authmanager.RoleOperator)
	require.Error(t, err)
}

func TestCreateUser_EmptyUsername(t *testing.T) {
	m := newManager(t)
	_, err := m.CreateUser("", "password123", authmanager.RoleViewer)
	require.Error(t, err)
}

func TestCreateUser_EmptyPassword(t *testing.T) {
	m := newManager(t)
	_, err := m.CreateUser("alice", "", authmanager.RoleViewer)
	require.Error(t, err)
}

func TestCreateUser_ShortPassword(t *testing.T) {
	m := newManager(t)
	_, err := m.CreateUser("alice", "short", authmanager.RoleViewer)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "8 characters")
}

// ── Login ────────────────────────────────────────────────────────────────────

func TestLogin_Success(t *testing.T) {
	m := newManager(t)
	_, err := m.CreateUser("alice", "password123", authmanager.RoleViewer)
	require.NoError(t, err)

	token, user, err := m.Login("alice", "password123")
	require.NoError(t, err)
	assert.NotEmpty(t, token)
	assert.Equal(t, "alice", user.Username)
	assert.Equal(t, authmanager.RoleViewer, user.Role)
}

func TestLogin_WrongPassword(t *testing.T) {
	m := newManager(t)
	_, err := m.CreateUser("alice", "password123", authmanager.RoleViewer)
	require.NoError(t, err)

	_, _, err = m.Login("alice", "wrongpassword")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid credentials")
}

func TestLogin_UnknownUser(t *testing.T) {
	m := newManager(t)
	_, _, err := m.Login("nobody", "password123")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid credentials")
}

// ── Verify ───────────────────────────────────────────────────────────────────

func TestVerify_ValidToken(t *testing.T) {
	m := newManager(t)
	_, err := m.CreateUser("alice", "password123", authmanager.RoleAdmin)
	require.NoError(t, err)
	token, _, err := m.Login("alice", "password123")
	require.NoError(t, err)

	claims, err := m.Verify(token)
	require.NoError(t, err)
	assert.Equal(t, "alice", claims.Username)
	assert.Equal(t, authmanager.RoleAdmin, claims.Role)
	assert.NotEmpty(t, claims.UserID)
}

func TestVerify_InvalidToken(t *testing.T) {
	m := newManager(t)
	_, err := m.Verify("this.is.not.a.valid.jwt")
	require.Error(t, err)
}

func TestVerify_WrongSecret(t *testing.T) {
	d := testDB(t)
	m1 := authmanager.New(d, "secret-one")
	m2 := authmanager.New(d, "secret-two")

	_, err := m1.CreateUser("alice", "password123", authmanager.RoleViewer)
	require.NoError(t, err)
	token, _, err := m1.Login("alice", "password123")
	require.NoError(t, err)

	_, err = m2.Verify(token)
	require.Error(t, err)
}

func TestVerify_TokenContainsClaims(t *testing.T) {
	m := newManager(t)
	_, err := m.CreateUser("bob", "password123", authmanager.RoleOperator)
	require.NoError(t, err)
	token, _, err := m.Login("bob", "password123")
	require.NoError(t, err)

	claims, err := m.Verify(token)
	require.NoError(t, err)
	assert.Equal(t, "bob", claims.Username)
	assert.Equal(t, authmanager.RoleOperator, claims.Role)
}

// ── ListUsers / GetUser ───────────────────────────────────────────────────────

func TestListUsers_Empty(t *testing.T) {
	m := newManager(t)
	users, err := m.ListUsers()
	require.NoError(t, err)
	assert.Empty(t, users)
}

func TestListUsers_Multiple(t *testing.T) {
	m := newManager(t)
	_, err := m.CreateUser("alice", "password123", authmanager.RoleAdmin)
	require.NoError(t, err)
	_, err = m.CreateUser("bob", "password456", authmanager.RoleViewer)
	require.NoError(t, err)

	users, err := m.ListUsers()
	require.NoError(t, err)
	assert.Len(t, users, 2)
}

func TestGetUser_Found(t *testing.T) {
	m := newManager(t)
	created, err := m.CreateUser("alice", "password123", authmanager.RoleAdmin)
	require.NoError(t, err)

	got, err := m.GetUser(created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, got.ID)
	assert.Equal(t, "alice", got.Username)
	assert.Equal(t, authmanager.RoleAdmin, got.Role)
}

func TestGetUser_NotFound(t *testing.T) {
	m := newManager(t)
	_, err := m.GetUser("nonexistent-id")
	require.Error(t, err)
}

// ── DeleteUser ───────────────────────────────────────────────────────────────

func TestDeleteUser_Success(t *testing.T) {
	m := newManager(t)
	_, err := m.CreateUser("admin", "password123", authmanager.RoleAdmin)
	require.NoError(t, err)
	viewer, err := m.CreateUser("viewer", "password123", authmanager.RoleViewer)
	require.NoError(t, err)

	require.NoError(t, m.DeleteUser(viewer.ID))

	users, _ := m.ListUsers()
	assert.Len(t, users, 1)
	assert.Equal(t, "admin", users[0].Username)
}

func TestDeleteUser_LastAdmin(t *testing.T) {
	m := newManager(t)
	admin, err := m.CreateUser("admin", "password123", authmanager.RoleAdmin)
	require.NoError(t, err)

	err = m.DeleteUser(admin.ID)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "last admin")
}

func TestDeleteUser_TwoAdmins(t *testing.T) {
	m := newManager(t)
	a1, err := m.CreateUser("admin1", "password123", authmanager.RoleAdmin)
	require.NoError(t, err)
	_, err = m.CreateUser("admin2", "password456", authmanager.RoleAdmin)
	require.NoError(t, err)

	// Deleting one of two admins is allowed.
	require.NoError(t, m.DeleteUser(a1.ID))
}

func TestDeleteUser_NotFound(t *testing.T) {
	m := newManager(t)
	err := m.DeleteUser("nonexistent-id")
	require.Error(t, err)
}

// ── ChangeRole ───────────────────────────────────────────────────────────────

func TestChangeRole_Promote(t *testing.T) {
	m := newManager(t)
	_, err := m.CreateUser("admin", "password123", authmanager.RoleAdmin)
	require.NoError(t, err)
	viewer, err := m.CreateUser("viewer", "password123", authmanager.RoleViewer)
	require.NoError(t, err)

	require.NoError(t, m.ChangeRole(viewer.ID, authmanager.RoleOperator))

	got, _ := m.GetUser(viewer.ID)
	assert.Equal(t, authmanager.RoleOperator, got.Role)
}

func TestChangeRole_DemoteLastAdmin(t *testing.T) {
	m := newManager(t)
	admin, err := m.CreateUser("admin", "password123", authmanager.RoleAdmin)
	require.NoError(t, err)

	err = m.ChangeRole(admin.ID, authmanager.RoleViewer)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "last admin")
}

func TestChangeRole_DemoteWithOtherAdmin(t *testing.T) {
	m := newManager(t)
	a1, err := m.CreateUser("admin1", "password123", authmanager.RoleAdmin)
	require.NoError(t, err)
	_, err = m.CreateUser("admin2", "password456", authmanager.RoleAdmin)
	require.NoError(t, err)

	// Demoting when another admin exists is allowed.
	require.NoError(t, m.ChangeRole(a1.ID, authmanager.RoleViewer))
}

func TestChangeRole_NotFound(t *testing.T) {
	m := newManager(t)
	err := m.ChangeRole("nonexistent-id", authmanager.RoleViewer)
	require.Error(t, err)
}

// ── ChangePassword ───────────────────────────────────────────────────────────

func TestChangePassword_Success(t *testing.T) {
	m := newManager(t)
	u, err := m.CreateUser("alice", "password123", authmanager.RoleViewer)
	require.NoError(t, err)

	require.NoError(t, m.ChangePassword(u.ID, "newpassword456"))

	// Old password must fail.
	_, _, err = m.Login("alice", "password123")
	require.Error(t, err)

	// New password must work.
	_, _, err = m.Login("alice", "newpassword456")
	require.NoError(t, err)
}

func TestChangePassword_TooShort(t *testing.T) {
	m := newManager(t)
	u, err := m.CreateUser("alice", "password123", authmanager.RoleViewer)
	require.NoError(t, err)

	err = m.ChangePassword(u.ID, "short")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "8 characters")
}
