# Test Fixtures

This directory contains test files used by E2E tests.

## Required Files

Create these files before running tests:

### 1. test-photo.jpg
- Valid JPEG image
- Size: < 10MB
- Dimensions: Any

### 2. test-photo.png
- Valid PNG image
- Size: < 10MB
- Dimensions: Any

### 3. test-photo.heic
- Valid HEIC image (iPhone format)
- Size: < 10MB
- Dimensions: Any

### 4. invalid-file.txt
- Plain text file
- Content: "This is not an image"

### 5. large-file.jpg
- Valid JPEG image
- Size: > 50MB (to test file size validation)

## How to Create

```bash
# Create invalid file
echo "This is not an image" > tests/fixtures/invalid-file.txt

# For image files, use any valid images from your system
# Or download sample images from:
# - https://unsplash.com (free stock photos)
# - https://picsum.photos (placeholder images)
```

## Notes

- These files are used by upload tests
- Make sure files are in `.gitignore` to avoid committing large files
- Test files should be representative of real user uploads
