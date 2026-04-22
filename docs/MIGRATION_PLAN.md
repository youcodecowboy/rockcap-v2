# Migration Plan: File Organization Agent → Production App

## Overview
This document outlines the strategy for integrating the file organization agent features into the production Next.js application with SQL backend.

## Architecture Decision: Monolithic Integration ✅

**Decision**: Copy and adapt code into the production app (NOT microservices)

**Rationale**:
- Simpler deployment and maintenance
- Better performance (no inter-service calls)
- Easier data consistency (single database)
- Lower operational complexity
- Shared authentication and authorization

## Migration Steps

### Phase 1: Database Schema Migration

#### 1.1 Create SQL Tables
Create tables in your SQL database to replace localStorage:

```sql
-- Clients table
CREATE TABLE clients (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects table
CREATE TABLE projects (
  id VARCHAR(255) PRIMARY KEY,
  client_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- Documents table
CREATE TABLE documents (
  id VARCHAR(255) PRIMARY KEY,
  file_name VARCHAR(500) NOT NULL,
  file_size INTEGER NOT NULL,
  file_type VARCHAR(100),
  mime_type VARCHAR(100),
  file_content BYTEA, -- or use file storage (S3, etc.)
  file_content_type VARCHAR(100),
  
  -- Analysis results (store as JSON or normalized)
  summary TEXT,
  file_type_category VARCHAR(100),
  category VARCHAR(100),
  client_id VARCHAR(255),
  project_id VARCHAR(255),
  confidence DECIMAL(3,2),
  reasoning TEXT,
  tokens_used INTEGER,
  
  -- Extracted data (store as JSONB if PostgreSQL)
  extracted_data JSONB,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Contacts table
CREATE TABLE contacts (
  id VARCHAR(255) PRIMARY KEY,
  client_id VARCHAR(255),
  project_id VARCHAR(255),
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(255),
  role VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Enrichment suggestions table
CREATE TABLE enrichment_suggestions (
  id VARCHAR(255) PRIMARY KEY,
  client_id VARCHAR(255),
  project_id VARCHAR(255),
  type VARCHAR(100) NOT NULL,
  field VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  confidence DECIMAL(3,2),
  context TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, rejected
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_documents_client_id ON documents(client_id);
CREATE INDEX idx_documents_project_id ON documents(project_id);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE INDEX idx_contacts_client_id ON contacts(client_id);
CREATE INDEX idx_contacts_project_id ON contacts(project_id);
```

#### 1.2 File Storage Decision
**Option A**: Store files in database (BYTEA/BLOB)
- Simple, single system
- Good for small files (< 10MB)
- Database size grows quickly

**Option B**: Store files in object storage (S3, Azure Blob, etc.)
- Better for large files
- Store file path/URL in database
- Recommended for production

**Recommendation**: Use object storage for files > 1MB, database for metadata only.

### Phase 2: Code Migration

#### 2.1 Copy Core Libraries
Copy these directories/files to production app:

```
src/lib/
├── fileProcessor.ts          # File parsing (PDF, DOCX, XLSX)
├── togetherAI.ts              # AI analysis integration
├── dataExtraction.ts          # Spreadsheet extraction
├── dataNormalization.ts       # Data normalization
├── dataVerification.ts        # Data verification
├── spreadsheetClassifier.ts   # Spreadsheet classification
├── fileTypeDefinitions.ts     # File type definitions
├── categories.ts              # Category definitions
└── utils.ts                   # Utility functions
```

#### 2.2 Create Database Adapters
Replace localStorage functions with SQL queries:

**Create**: `src/lib/db/clientStorage.ts`
- Replace `getClients()` → SQL SELECT
- Replace `addClient()` → SQL INSERT
- Replace `deleteClient()` → SQL DELETE
- etc.

**Create**: `src/lib/db/documentStorage.ts`
- Replace `saveDocument()` → SQL INSERT with file storage
- Replace `getLibrary()` → SQL SELECT with joins
- etc.

**Create**: `src/lib/db/contactStorage.ts`
- Replace contact management functions
- etc.

#### 2.3 Copy Components
Copy these components:

```
src/components/
├── FileUpload.tsx
├── ClientManager.tsx
├── OutputWindow.tsx
├── ContactCard.tsx
├── EnrichmentSuggestionCard.tsx
├── CommunicationTimeline.tsx
├── StatsCard.tsx
└── StatusBadge.tsx
```

#### 2.4 Copy Pages/Routes
Copy these pages:

```
src/app/
├── api/analyze-file/route.ts  # API endpoint
├── clients/
│   ├── page.tsx               # Client list
│   └── [clientId]/page.tsx    # Client detail
├── projects/
│   ├── page.tsx               # Project list
│   └── [projectId]/page.tsx   # Project detail
├── docs/
│   ├── page.tsx               # Document library
│   └── [documentId]/page.tsx  # Document detail
└── library/page.tsx           # Library view
```

#### 2.5 Update API Routes
- Update `/api/analyze-file/route.ts` to use SQL storage instead of localStorage
- Add authentication/authorization middleware
- Add rate limiting
- Add error logging

### Phase 3: Integration Points

#### 3.1 Authentication & Authorization
- Integrate with existing auth system
- Add role-based access control (RBAC)
- Ensure users can only access their own clients/projects

#### 3.2 Database Connection
- Use existing database connection pool
- Ensure connection pooling is configured
- Add database migration scripts

#### 3.3 Environment Variables
Add to production `.env`:

```env
# Together.ai API
TOGETHER_API_KEY=your_key_here
TOGETHER_API_URL=https://api.together.xyz

# File Storage (if using S3)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=...
AWS_REGION=...

# Database (if not already configured)
DATABASE_URL=...
```

#### 3.4 Docker Configuration
Update Dockerfile if needed:
- Ensure Node.js version matches (Next.js 16 requires Node 18+)
- Install system dependencies for PDF parsing (if needed)
- Configure webpack if using native modules

### Phase 4: Testing & Validation

#### 4.1 Data Migration Script
Create script to migrate existing localStorage data (if any):

```typescript
// scripts/migrate-localStorage.ts
// Run once to migrate any existing localStorage data to SQL
```

#### 4.2 Integration Tests
- Test file upload → analysis → storage flow
- Test client/project CRUD operations
- Test data extraction pipeline
- Test API endpoints

#### 4.3 Performance Testing
- Test with large files
- Test concurrent uploads
- Test database query performance
- Monitor API response times

### Phase 5: Production Deployment

#### 5.1 Feature Flags
Consider using feature flags to gradually roll out:
- Start with internal users
- Monitor for issues
- Gradually enable for all users

#### 5.2 Monitoring
- Add logging for file processing
- Monitor API usage (Together.ai costs)
- Set up alerts for failures
- Track processing times

#### 5.3 Documentation
- Update API documentation
- Document database schema
- Create user guides
- Document deployment process

## Key Considerations

### 1. File Size Limits
- Set reasonable file size limits (e.g., 50MB)
- Consider chunked uploads for large files
- Implement progress indicators

### 2. API Rate Limiting
- Together.ai has rate limits
- Implement request queuing if needed
- Add retry logic with exponential backoff

### 3. Error Handling
- Graceful degradation if AI service is down
- Clear error messages for users
- Logging for debugging

### 4. Security
- Validate file types server-side
- Sanitize file names
- Scan files for malware (optional)
- Encrypt file storage

### 5. Performance
- Use database indexes (already planned)
- Consider caching frequently accessed data
- Optimize SQL queries
- Use connection pooling

## Rollback Plan

If issues arise:
1. Disable feature via feature flag
2. Keep old system running in parallel
3. Fix issues in staging
4. Re-enable when stable

## Timeline Estimate

- **Phase 1** (Database): 2-3 days
- **Phase 2** (Code Migration): 3-5 days
- **Phase 3** (Integration): 2-3 days
- **Phase 4** (Testing): 2-3 days
- **Phase 5** (Deployment): 1-2 days

**Total**: ~2-3 weeks for careful integration

## Next Steps

1. Review this plan with your team
2. Set up database schema
3. Create database adapter layer
4. Start with one feature (e.g., file upload)
5. Test thoroughly before full migration
6. Deploy incrementally

















