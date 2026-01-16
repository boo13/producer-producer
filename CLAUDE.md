# Producer Producer

A public-facing website for video producers to find industry-relevant job listings.

## Project Overview

**Domain:** producer-producer.com

This site provides curated job listings specifically for video producers, filtering out unrelated "producer" roles (music producers, manufacturing producers, etc.) using AI and automation.

## Architecture

- **Frontend:** Public website displaying job listings
- **Backend:** Public API (derived from existing private API server)
- **AI/Automation:** Filters and classifies jobs to identify video production roles

## Key Features

- Job listings curated for video production industry
- AI-powered job classification to filter irrelevant postings
- Public API access to job data

## Development

### Getting Started

```bash
# TODO: Add setup instructions
```

### Project Structure

```
# TODO: Document structure as project develops
```

## API

The public API exposes job listing data. Documentation to be added as endpoints are defined.

## Deployment

Target: producer-producer.com

## Notes

- This is the public version of an existing private API
- Focus on UX for video producers seeking work
- Job classification logic distinguishes video producers from other "producer" roles
- **When shipping CSS or JS updates, bump the `?v=YYYYMMDD` cache-busting string in `index.html`.**
