// Example: Database adapter to replace localStorage
// This shows how to convert clientStorage.ts to use SQL

// src/lib/db/clientStorage.ts
import { Client, Project, Contact, EnrichmentSuggestion } from '@/types';

// Example using a generic database client (adapt to your SQL library)
// This could be Prisma, Drizzle, Kysely, or raw SQL with pg/mysql2

interface DatabaseClient {
  query: (sql: string, params?: any[]) => Promise<any>;
}

// Initialize your database client here
// const db = getDatabaseClient(); // Your existing DB connection

// ============================================
// CLIENT FUNCTIONS
// ============================================

export async function getClients(): Promise<Client[]> {
  const result = await db.query(
    'SELECT id, name, status, created_at as createdAt FROM clients ORDER BY created_at DESC'
  );
  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.createdat,
  }));
}

export async function getClientById(id: string): Promise<Client | undefined> {
  const result = await db.query(
    'SELECT id, name, status, created_at as createdAt FROM clients WHERE id = $1',
    [id]
  );
  if (result.rows.length === 0) return undefined;
  
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.createdat,
  };
}

export async function addClient(name: string): Promise<Client> {
  const id = `c${Date.now()}`;
  const createdAt = new Date().toISOString();
  
  await db.query(
    'INSERT INTO clients (id, name, status, created_at) VALUES ($1, $2, $3, $4)',
    [id, name.trim(), 'active', createdAt]
  );
  
  return {
    id,
    name: name.trim(),
    status: 'active',
    createdAt,
  };
}

export async function deleteClient(id: string): Promise<void> {
  // CASCADE will handle projects deletion
  await db.query('DELETE FROM clients WHERE id = $1', [id]);
}

export async function clientExists(name: string): Promise<boolean> {
  const result = await db.query(
    'SELECT COUNT(*) as count FROM clients WHERE LOWER(name) = LOWER($1)',
    [name.trim()]
  );
  return result.rows[0].count > 0;
}

// ============================================
// PROJECT FUNCTIONS
// ============================================

export async function getProjects(): Promise<Project[]> {
  const result = await db.query(
    'SELECT id, client_id as clientId, name, status, created_at as createdAt FROM projects ORDER BY created_at DESC'
  );
  return result.rows.map(row => ({
    id: row.id,
    clientId: row.clientid,
    name: row.name,
    status: row.status,
    createdAt: row.createdat,
  }));
}

export async function getProjectsByClient(clientId: string): Promise<Project[]> {
  const result = await db.query(
    'SELECT id, client_id as clientId, name, status, created_at as createdAt FROM projects WHERE client_id = $1 ORDER BY created_at DESC',
    [clientId]
  );
  return result.rows.map(row => ({
    id: row.id,
    clientId: row.clientid,
    name: row.name,
    status: row.status,
    createdAt: row.createdat,
  }));
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const result = await db.query(
    'SELECT id, client_id as clientId, name, status, created_at as createdAt FROM projects WHERE id = $1',
    [id]
  );
  if (result.rows.length === 0) return undefined;
  
  const row = result.rows[0];
  return {
    id: row.id,
    clientId: row.clientid,
    name: row.name,
    status: row.status,
    createdAt: row.createdat,
  };
}

export async function addProject(clientId: string, name: string): Promise<Project> {
  const id = `p${Date.now()}`;
  const createdAt = new Date().toISOString();
  
  await db.query(
    'INSERT INTO projects (id, client_id, name, status, created_at) VALUES ($1, $2, $3, $4, $5)',
    [id, clientId, name.trim(), 'active', createdAt]
  );
  
  return {
    id,
    clientId,
    name: name.trim(),
    status: 'active',
    createdAt,
  };
}

export async function deleteProject(id: string): Promise<void> {
  await db.query('DELETE FROM projects WHERE id = $1', [id]);
}

export async function getProjectByName(clientId: string, projectName: string): Promise<Project | undefined> {
  const result = await db.query(
    'SELECT id, client_id as clientId, name, status, created_at as createdAt FROM projects WHERE client_id = $1 AND LOWER(name) = LOWER($2)',
    [clientId, projectName.trim()]
  );
  if (result.rows.length === 0) return undefined;
  
  const row = result.rows[0];
  return {
    id: row.id,
    clientId: row.clientid,
    name: row.name,
    status: row.status,
    createdAt: row.createdat,
  };
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;
  
  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }
  
  fields.push(`updated_at = $${paramIndex++}`);
  values.push(new Date().toISOString());
  values.push(id);
  
  await db.query(
    `UPDATE projects SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
  
  const updated = await getProjectById(id);
  if (!updated) throw new Error('Project not found after update');
  return updated;
}

// ============================================
// CONTACT FUNCTIONS
// ============================================

export async function getContactsByClient(clientId: string): Promise<Contact[]> {
  const result = await db.query(
    'SELECT id, client_id as clientId, project_id as projectId, name, email, phone, role, created_at as createdAt FROM contacts WHERE client_id = $1 ORDER BY created_at DESC',
    [clientId]
  );
  return result.rows.map(row => ({
    id: row.id,
    clientId: row.clientid,
    projectId: row.projectid,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    createdAt: row.createdat,
  }));
}

export async function getContactsByProject(projectId: string): Promise<Contact[]> {
  const result = await db.query(
    'SELECT id, client_id as clientId, project_id as projectId, name, email, phone, role, created_at as createdAt FROM contacts WHERE project_id = $1 ORDER BY created_at DESC',
    [projectId]
  );
  return result.rows.map(row => ({
    id: row.id,
    clientId: row.clientid,
    projectId: row.projectid,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    createdAt: row.createdat,
  }));
}

export async function addContactToClient(clientId: string, contact: Omit<Contact, 'id' | 'clientId' | 'createdAt'>): Promise<Contact> {
  const id = `contact${Date.now()}`;
  const createdAt = new Date().toISOString();
  
  await db.query(
    'INSERT INTO contacts (id, client_id, name, email, phone, role, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, clientId, contact.name, contact.email, contact.phone, contact.role, createdAt]
  );
  
  return {
    id,
    clientId,
    ...contact,
    createdAt,
  };
}

export async function addContactToProject(projectId: string, contact: Omit<Contact, 'id' | 'projectId' | 'createdAt'>): Promise<Contact> {
  const id = `contact${Date.now()}`;
  const createdAt = new Date().toISOString();
  
  // Get clientId from project
  const project = await getProjectById(projectId);
  if (!project) throw new Error('Project not found');
  
  await db.query(
    'INSERT INTO contacts (id, client_id, project_id, name, email, phone, role, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [id, project.clientId, projectId, contact.name, contact.email, contact.phone, contact.role, createdAt]
  );
  
  return {
    id,
    clientId: project.clientId,
    projectId,
    ...contact,
    createdAt,
  };
}

// ============================================
// ENRICHMENT SUGGESTION FUNCTIONS
// ============================================

export async function addEnrichmentSuggestion(
  clientId: string,
  suggestion: Omit<EnrichmentSuggestion, 'id' | 'clientId' | 'createdAt'>
): Promise<EnrichmentSuggestion> {
  const id = `enrich${Date.now()}`;
  const createdAt = new Date().toISOString();
  
  await db.query(
    'INSERT INTO enrichment_suggestions (id, client_id, type, field, value, confidence, context, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [id, clientId, suggestion.type, suggestion.field, suggestion.value, suggestion.confidence, suggestion.context, 'pending', createdAt]
  );
  
  return {
    id,
    clientId,
    ...suggestion,
    createdAt,
  };
}

export async function getEnrichmentSuggestionsByClient(clientId: string): Promise<EnrichmentSuggestion[]> {
  const result = await db.query(
    'SELECT id, client_id as clientId, project_id as projectId, type, field, value, confidence, context, status, created_at as createdAt FROM enrichment_suggestions WHERE client_id = $1 AND status = $2 ORDER BY created_at DESC',
    [clientId, 'pending']
  );
  return result.rows.map(row => ({
    id: row.id,
    clientId: row.clientid,
    projectId: row.projectid,
    type: row.type,
    field: row.field,
    value: row.value,
    confidence: row.confidence,
    context: row.context,
    createdAt: row.createdat,
  }));
}

// ... continue with other functions

// ============================================
// NOTES
// ============================================

/*
 * IMPORTANT ADAPTATIONS NEEDED:
 * 
 * 1. Replace `db.query()` with your actual database client:
 *    - Prisma: `prisma.$queryRaw` or use Prisma Client
 *    - Drizzle: `db.execute(sql)`
 *    - Kysely: `db.selectFrom('clients').selectAll().execute()`
 *    - pg (PostgreSQL): `pool.query(sql, params)`
 *    - mysql2: `connection.query(sql, params)`
 * 
 * 2. Adjust SQL syntax for your database:
 *    - PostgreSQL uses $1, $2 for parameters
 *    - MySQL uses ? for parameters
 *    - Column naming conventions may differ
 * 
 * 3. Add error handling:
 *    - Wrap in try/catch blocks
 *    - Handle database connection errors
 *    - Handle constraint violations
 * 
 * 4. Add transaction support for multi-step operations
 * 
 * 5. Add connection pooling configuration
 * 
 * 6. Consider using an ORM/query builder for type safety:
 *    - Prisma (recommended for TypeScript)
 *    - Drizzle ORM
 *    - Kysely
 */













