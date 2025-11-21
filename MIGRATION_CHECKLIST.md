# Quick Migration Checklist

## Pre-Migration

- [ ] Review existing production app structure
- [ ] Identify database type (PostgreSQL, MySQL, etc.)
- [ ] Identify database client/library being used
- [ ] Review authentication/authorization system
- [ ] Review existing API patterns
- [ ] Set up development/staging environment

## Database Setup

- [ ] Create database schema (see MIGRATION_PLAN.md)
- [ ] Create indexes for performance
- [ ] Set up foreign key constraints
- [ ] Test database migrations
- [ ] Decide on file storage strategy (database vs object storage)

## Code Migration

### Core Libraries
- [ ] Copy `src/lib/fileProcessor.ts`
- [ ] Copy `src/lib/togetherAI.ts`
- [ ] Copy `src/lib/dataExtraction.ts`
- [ ] Copy `src/lib/dataNormalization.ts`
- [ ] Copy `src/lib/dataVerification.ts`
- [ ] Copy `src/lib/spreadsheetClassifier.ts`
- [ ] Copy `src/lib/fileTypeDefinitions.ts`
- [ ] Copy `src/lib/categories.ts`
- [ ] Copy `src/lib/utils.ts`

### Database Adapters
- [ ] Create `src/lib/db/clientStorage.ts` (replace localStorage)
- [ ] Create `src/lib/db/documentStorage.ts` (replace localStorage)
- [ ] Create `src/lib/db/contactStorage.ts` (replace localStorage)
- [ ] Update all imports to use new database adapters

### Components
- [ ] Copy `src/components/FileUpload.tsx`
- [ ] Copy `src/components/ClientManager.tsx`
- [ ] Copy `src/components/OutputWindow.tsx`
- [ ] Copy `src/components/ContactCard.tsx`
- [ ] Copy `src/components/EnrichmentSuggestionCard.tsx`
- [ ] Copy `src/components/CommunicationTimeline.tsx`
- [ ] Copy `src/components/StatsCard.tsx`
- [ ] Copy `src/components/StatusBadge.tsx`
- [ ] Copy UI components from `src/components/ui/`

### Pages/Routes
- [ ] Copy `src/app/api/analyze-file/route.ts`
- [ ] Update API route to use database adapters
- [ ] Add authentication middleware to API route
- [ ] Add rate limiting to API route
- [ ] Copy `src/app/clients/page.tsx`
- [ ] Copy `src/app/clients/[clientId]/page.tsx`
- [ ] Copy `src/app/projects/page.tsx`
- [ ] Copy `src/app/projects/[projectId]/page.tsx`
- [ ] Copy `src/app/docs/page.tsx`
- [ ] Copy `src/app/docs/[documentId]/page.tsx`
- [ ] Copy `src/app/library/page.tsx`

### Types
- [ ] Copy `src/types/index.ts`
- [ ] Ensure types match database schema

## Integration

- [ ] Integrate with existing authentication system
- [ ] Add authorization checks (users can only access their data)
- [ ] Configure environment variables
- [ ] Update Docker configuration if needed
- [ ] Test file upload → analysis → storage flow
- [ ] Test client/project CRUD operations
- [ ] Test data extraction pipeline

## Testing

- [ ] Unit tests for database adapters
- [ ] Integration tests for API routes
- [ ] End-to-end tests for file upload flow
- [ ] Test with various file types (PDF, DOCX, XLSX)
- [ ] Test with large files
- [ ] Test concurrent uploads
- [ ] Performance testing
- [ ] Security testing (file validation, SQL injection, etc.)

## Deployment

- [ ] Set up feature flags (if using)
- [ ] Configure monitoring and logging
- [ ] Set up error tracking
- [ ] Create rollback plan
- [ ] Deploy to staging
- [ ] Test in staging environment
- [ ] Deploy to production (gradual rollout recommended)
- [ ] Monitor for issues
- [ ] Document deployment process

## Post-Deployment

- [ ] Monitor API usage (Together.ai costs)
- [ ] Monitor database performance
- [ ] Monitor error rates
- [ ] Gather user feedback
- [ ] Optimize slow queries
- [ ] Update documentation

## Key Files to Modify

1. **Database Adapters** (NEW)
   - `src/lib/db/clientStorage.ts`
   - `src/lib/db/documentStorage.ts`
   - `src/lib/db/contactStorage.ts`

2. **API Route** (MODIFY)
   - `src/app/api/analyze-file/route.ts`
   - Add database calls instead of localStorage
   - Add auth middleware

3. **Components** (MINIMAL CHANGES)
   - Most components should work as-is
   - Update imports if paths change
   - May need to handle async database calls differently

4. **Pages** (MINIMAL CHANGES)
   - Update imports
   - May need to convert to server components or add data fetching

## Common Issues & Solutions

### Issue: localStorage is synchronous, database is async
**Solution**: Update all components to handle async database calls. Use React Server Components or add loading states.

### Issue: File storage in database is too large
**Solution**: Use object storage (S3, Azure Blob) for files, store only metadata in database.

### Issue: Database queries are slow
**Solution**: Add indexes, optimize queries, use connection pooling, consider caching.

### Issue: Together.ai API rate limits
**Solution**: Implement request queuing, add retry logic, consider caching analysis results.

### Issue: Authentication/authorization conflicts
**Solution**: Wrap database queries with auth checks, use row-level security if supported.

## Estimated Time

- **Database Setup**: 1-2 days
- **Code Migration**: 3-5 days
- **Integration**: 2-3 days
- **Testing**: 2-3 days
- **Deployment**: 1-2 days

**Total**: ~2-3 weeks













