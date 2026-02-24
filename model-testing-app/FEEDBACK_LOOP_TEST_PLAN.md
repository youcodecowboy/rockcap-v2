# Manual Test Plan: Filing Feedback Loop

## Prerequisites
- Dev server running: `npm run dev`
- Convex dev running: `npx convex dev`

## Test Scenario: Location Plan Correction

### Step 1: Upload a Location Plan
1. Go to the bulk upload page
2. Upload a file named something like `LOC_Site_Plan_01.pdf` (or any PDF)
3. The AI will likely classify it (possibly as "Site Plan" or "Other")
4. Note the AI's classification

### Step 2: Make a Correction
1. In the review queue, find your uploaded document
2. Change the file type to "Location Plans" (or any different type)
3. File the document

### Step 3: Verify Correction Was Captured
1. Open Convex Dashboard: https://dashboard.convex.dev
2. Navigate to your deployment
3. Go to Data → filingCorrections
4. You should see a new entry with:
   - `aiPrediction.fileType`: The AI's original guess
   - `userCorrection.fileType`: "Location Plans"
   - `correctedFields`: ["fileType"]

### Step 4: Check Console Logs
1. Look at the server console output
2. When you made the correction, you should see:
   - No specific log (correction capture is silent)
3. The data should appear in Convex

### Step 5: Test the Learning
1. Upload another similar file (e.g., `LOC_Plan_Project_B.pdf`)
2. Watch the server logs for:
   ```
   [Bulk Analyze] Found X relevant corrections for self-teaching
   [Critic Agent] Applied corrections: Correction 1
   ```
3. The AI should now classify it correctly (or at least show it learned)

### Step 6: Verify UI Badge
1. If corrections influenced the result, look for:
   - "Training" badge (purple) next to confidence
   - Tooltip showing what corrections were made

## Verification Queries

Run these in the Convex Dashboard Functions tab:

### Check Corrections Count
```javascript
// Query: filingFeedback.getCorrectionStats
{}
```

### Get Corrections for a Type
```javascript
// Query: filingFeedback.getRelevantCorrections
{
  "fileType": "Site Plan",
  "category": "Plans",
  "fileName": "test.pdf",
  "limit": 5
}
```

### Check Cache
```javascript
// Query: filingFeedback.checkCache
{
  "contentHash": "your-hash-here"
}
```

## Expected Behavior

### After First Correction
- `filingCorrections` table has 1 entry
- Cache for that document's hash is invalidated
- `getCorrectionStats` shows `totalCorrections: 1`

### After Second Similar Upload
- Critic agent receives past corrections in prompt
- Console shows "Found 1 relevant corrections"
- Classification may be improved
- If Critic applies correction, it will log "Applied corrections"

## Troubleshooting

### No corrections appearing?
1. Check that you actually CHANGED a value (not just clicked)
2. Verify the item had AI classification data (fileTypeDetected, category, targetFolder)
3. Check browser console for errors

### Corrections not being used?
1. Check if AI confidence > 95% (corrections are skipped for high confidence)
2. Verify corrections match the file type/category being queried
3. Check server logs for "[Bulk Analyze] Failed to fetch corrections"

### Cache not working?
1. Cache only stores results with confidence >= 70%
2. Cache is invalidated when corrections are made
3. Cache entries expire based on content hash
