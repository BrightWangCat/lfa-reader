# Three-Tier User Role System

## Plan

### Step 1: Backend - Database Model
- [ ] Replace `is_admin` (Boolean) with `role` (String) field in User model
- [ ] Role values: `single`, `batch`, `admin`
- [ ] Write migration script to convert existing data (mingshi -> admin, others -> single)

### Step 2: Backend - Auth Middleware
- [ ] Replace `require_admin` with role-based helpers: `require_admin`, `require_batch_or_admin`
- [ ] Add `is_admin` and `can_batch` computed properties or helper checks

### Step 3: Backend - Endpoint Access Control
- [ ] Upload batch endpoint: require batch or admin role
- [ ] Export CSV/Excel: require batch or admin role
- [ ] Export Images ZIP: require admin role (unchanged)
- [ ] User management endpoints: require admin role (unchanged)
- [ ] List batches: admin sees all, others see own (unchanged logic)

### Step 4: Backend - User Management API
- [ ] Change toggle admin endpoint to set-role endpoint (PUT /api/users/{id}/role)
- [ ] Accept role value from request body

### Step 5: Backend - Auth Response
- [ ] Return `role` field instead of `is_admin` in user info / JWT

### Step 6: Frontend - Replace is_admin with role checks
- [ ] AuthContext: use `user.role` instead of `user.is_admin`
- [ ] Navbar: show Users menu for admin only
- [ ] Upload: show batch option for batch + admin
- [ ] Results: show export buttons for batch + admin, export images for admin
- [ ] UserManagement: replace toggle switch with role dropdown

### Step 7: Verify
- [ ] Build frontend
- [ ] Test backend startup
