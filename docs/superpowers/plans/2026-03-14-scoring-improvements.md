# Scoring Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve scoring accuracy by extracting salary data from job descriptions and raising the AI analysis threshold to 70.

**Architecture:** Add a salary extraction step to the parsing pipeline that runs regex patterns against `description_cleaned` (or `description`) to populate `salary_min`/`salary_max` when ATS structured data is missing. Update the AI analysis threshold from 50 to 70. Both changes are in the existing backend codebase.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, pytest

**Repo:** `producer-producer-api`

---

## Chunk 1: Salary Extraction from Job Descriptions

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `fly_app/services/parsing_service.py` | Add `extract_salary_from_description()` function |
| Modify | `fly_app/services/scoring_engine.py` | Call description-based salary extraction in `parse_and_enrich_opportunity()` |
| Modify | `tests/test_parsing_service.py` | Tests for description-based salary extraction |

### Task 1: Add description-based salary extraction function

**Files:**
- Modify: `fly_app/services/parsing_service.py`
- Test: `tests/test_parsing_service.py`

The existing `parse_salary()` function (line 410) handles structured `salary_raw` text from ATS fields. We need a new function that scans the full job description for salary mentions — a different input with different noise characteristics.

- [ ] **Step 1: Write failing tests for description salary extraction**

Add to `tests/test_parsing_service.py`:

```python
class TestExtractSalaryFromDescription:
    """Extract salary_min/salary_max from free-text job descriptions."""

    def test_explicit_range_with_dollar_signs(self):
        desc = "The salary range for this role is $120,000 - $150,000 annually."
        result = extract_salary_from_description(desc)
        assert result is not None
        assert result.min == 120000
        assert result.max == 150000

    def test_k_suffix_range(self):
        desc = "Compensation: $120k–$150k plus benefits."
        result = extract_salary_from_description(desc)
        assert result is not None
        assert result.min == 120000
        assert result.max == 150000

    def test_salary_range_label(self):
        desc = "Salary range: $100,000 to $130,000 per year."
        result = extract_salary_from_description(desc)
        assert result is not None
        assert result.min == 100000
        assert result.max == 130000

    def test_single_salary_value(self):
        desc = "This position pays $95,000 per year."
        result = extract_salary_from_description(desc)
        assert result is not None
        assert result.min == 95000
        assert result.max == 95000

    def test_hourly_rate_annualized(self):
        desc = "Pay rate: $50/hr - $65/hr"
        result = extract_salary_from_description(desc)
        assert result is not None
        assert result.min == 104000  # 50 * 2080
        assert result.max == 135200  # 65 * 2080

    def test_no_salary_in_description(self):
        desc = "We offer competitive compensation and great benefits."
        result = extract_salary_from_description(desc)
        assert result is None

    def test_ignores_revenue_numbers(self):
        desc = "Our company generates $500,000,000 in revenue. Great benefits."
        result = extract_salary_from_description(desc)
        assert result is None

    def test_ignores_budget_numbers(self):
        desc = "You will manage a $2,000,000 production budget."
        result = extract_salary_from_description(desc)
        assert result is None

    def test_salary_buried_in_long_description(self):
        desc = (
            "About the role\n\n"
            "We are looking for a senior producer to join our team. "
            "You will lead a team of 5 producers.\n\n"
            "Requirements\n\n"
            "5+ years of experience in video production.\n\n"
            "Compensation\n\n"
            "The annual salary for this position is $140,000 - $180,000, "
            "depending on experience.\n\n"
            "Benefits\n\n"
            "Health insurance, 401(k), PTO."
        )
        result = extract_salary_from_description(desc)
        assert result is not None
        assert result.min == 140000
        assert result.max == 180000

    def test_validates_reasonable_salary_range(self):
        """Ignore values outside the $10k-$2M annual range."""
        desc = "Salary: $500 - $1,000 per week"
        result = extract_salary_from_description(desc)
        # Weekly amounts without annualization context should be ignored
        assert result is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/randycounsman/Git/p-p/producer-producer-api && python -m pytest tests/test_parsing_service.py::TestExtractSalaryFromDescription -v`
Expected: FAIL — `ImportError` or `NameError` for `extract_salary_from_description`

- [ ] **Step 3: Implement `extract_salary_from_description()`**

Add to `fly_app/services/parsing_service.py` after the existing `parse_salary()` function (around line 558).

**Important:** The existing `parse_salary()` already handles `$Xk–$Yk` ranges, hourly rate annualization (`$50/hr - $65/hr`), and range validation (MIN_ANNUAL_SALARY=10000, MAX_ANNUAL_SALARY=2000000). The new function leverages `parse_salary()` by extracting salary-contextual text windows and passing them through. This avoids duplicating parsing logic.

```python
def extract_salary_from_description(description: str | None) -> ParsedSalary | None:
    """Extract salary from free-text job description.

    Scans for salary-related patterns near contextual keywords
    (salary, compensation, pay, etc.) to avoid matching revenue,
    budget, or other unrelated dollar amounts.

    Returns ParsedSalary(min, max) or None if no salary found.
    """
    if not description:
        return None

    # Normalize whitespace
    text = " ".join(description.split())

    # Look for salary near contextual keywords to reduce false positives.
    # Extract a window of ~200 chars around each keyword match.
    salary_keywords = r"(?:salary|compensation|pay\s+(?:range|rate)|annual|annually|per\s+year|base\s+pay)"

    # Strategy: find keyword positions, extract surrounding text windows,
    # then pass each window to parse_salary().
    candidates = []
    for match in re.finditer(salary_keywords, text, re.IGNORECASE):
        start = max(0, match.start() - 50)
        end = min(len(text), match.end() + 150)
        window = text[start:end]
        candidates.append(window)

    if not candidates:
        return None

    # Try parse_salary on each candidate window
    for candidate in candidates:
        result = parse_salary(candidate)
        if result and (result.min or result.max):
            # Validate the result falls in reasonable annual salary range
            # (parse_salary already does MIN/MAX validation internally)
            return result

    return None
```

- [ ] **Step 4: Add import and export for the new function**

Ensure `extract_salary_from_description` is importable from `parsing_service`. Add the import to the test file:

```python
from fly_app.services.parsing_service import extract_salary_from_description
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/randycounsman/Git/p-p/producer-producer-api && python -m pytest tests/test_parsing_service.py::TestExtractSalaryFromDescription -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/randycounsman/Git/p-p/producer-producer-api
git add fly_app/services/parsing_service.py tests/test_parsing_service.py
git commit -m "feat: add salary extraction from job descriptions

Adds extract_salary_from_description() that scans free-text job
descriptions for salary patterns near contextual keywords to avoid
matching revenue/budget numbers."
```

### Task 2: Integrate description salary extraction into enrichment pipeline

**Files:**
- Modify: `fly_app/services/scoring_engine.py:39-61`
- Test: `tests/test_parsing_service.py` (integration test)

Currently `parse_and_enrich_opportunity()` only extracts salary from `salary_raw` (the structured ATS field). We need it to also try extracting from `description_cleaned` or `description` when `salary_raw` is empty.

- [ ] **Step 1: Write failing test for enrichment integration**

Add to `tests/test_parsing_service.py`:

```python
class TestParseAndEnrichSalaryFromDescription:
    """Salary extraction falls back to description when salary_raw is empty."""

    def test_extracts_salary_from_description_when_no_salary_raw(self):
        """When salary_raw is empty, extract from description."""
        from fly_app.services.scoring_engine import parse_and_enrich_opportunity
        from fly_app.models import Opportunity

        opp = Opportunity(
            external_id="test-1",
            source="test",
            source_company="test",
            title="Senior Producer",
            url="https://example.com/job/1",
            salary_raw=None,
            salary_min=None,
            salary_max=None,
            description_cleaned="The salary for this role is $120,000 - $150,000 per year.",
        )
        parse_and_enrich_opportunity(opp)
        assert opp.salary_min == 120000
        assert opp.salary_max == 150000

    def test_does_not_overwrite_existing_salary(self):
        """When salary_raw already parsed, don't touch it."""
        from fly_app.services.scoring_engine import parse_and_enrich_opportunity
        from fly_app.models import Opportunity

        opp = Opportunity(
            external_id="test-2",
            source="test",
            source_company="test",
            title="Producer",
            url="https://example.com/job/2",
            salary_raw="$100,000 - $120,000",
            salary_min=100000,
            salary_max=120000,
            description_cleaned="Compensation: $140,000 - $180,000 per year.",
        )
        parse_and_enrich_opportunity(opp)
        # Should keep the structured ATS salary, not overwrite from description
        assert opp.salary_min == 100000
        assert opp.salary_max == 120000

    def test_falls_back_to_description_when_description_cleaned_missing(self):
        """When description_cleaned is None, try description."""
        from fly_app.services.scoring_engine import parse_and_enrich_opportunity
        from fly_app.models import Opportunity

        opp = Opportunity(
            external_id="test-3",
            source="test",
            source_company="test",
            title="Producer",
            url="https://example.com/job/3",
            salary_raw=None,
            salary_min=None,
            salary_max=None,
            description_cleaned=None,
            description="Pay range: $90,000 - $110,000 annually.",
        )
        parse_and_enrich_opportunity(opp)
        assert opp.salary_min == 90000
        assert opp.salary_max == 110000
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/randycounsman/Git/p-p/producer-producer-api && python -m pytest tests/test_parsing_service.py::TestParseAndEnrichSalaryFromDescription -v`
Expected: FAIL — salary_min/salary_max remain None

- [ ] **Step 3: Modify `parse_and_enrich_opportunity()` in scoring_engine.py**

In `fly_app/services/scoring_engine.py`, update `parse_and_enrich_opportunity()` (around line 39) to add description-based extraction after the existing `salary_raw` parsing:

```python
from fly_app.services.parsing_service import extract_salary_from_description

# After existing salary_raw parsing block (around line 50), add:
# If still no salary, try extracting from description
if not opp.salary_min and not opp.salary_max:
    desc_text = opp.description_cleaned or opp.description
    if desc_text:
        desc_salary = extract_salary_from_description(desc_text)
        if desc_salary:
            if desc_salary.min:
                opp.salary_min = desc_salary.min
            if desc_salary.max:
                opp.salary_max = desc_salary.max
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/randycounsman/Git/p-p/producer-producer-api && python -m pytest tests/test_parsing_service.py::TestParseAndEnrichSalaryFromDescription -v`
Expected: All PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `cd /Users/randycounsman/Git/p-p/producer-producer-api && python -m pytest tests/ -v --timeout=60`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
cd /Users/randycounsman/Git/p-p/producer-producer-api
git add fly_app/services/scoring_engine.py tests/test_parsing_service.py
git commit -m "feat: integrate description salary extraction into enrichment pipeline

Falls back to extracting salary from description_cleaned (or description)
when salary_raw is empty and salary_min/salary_max are not set."
```

### Task 3: Raise AI analysis threshold from 50 to 70

**Files:**
- Modify: `fly_app/services/ai_analysis_service.py:128-130`
- Test: `tests/test_ai_analysis_service.py`

- [ ] **Step 1: Write failing tests for new threshold**

Add to `tests/test_ai_analysis_service.py` (as standalone functions matching the existing pattern — this file uses plain functions with the `ai_service` and `session_factory` fixtures, not classes):

```python
def test_ai_service_skip_score_below_70(ai_service, session_factory):
    """Jobs scoring below 70 should not be analyzed."""
    service, session = ai_service

    opportunity = Opportunity(
        external_id="TEST-THRESHOLD-1",
        source="test",
        source_company="test",
        title="Below Threshold",
        company_name="Test Co",
        url="https://example.com/job/THRESHOLD-1",
        description="Test job description",
    )
    opportunity.total_score = 65.0  # Below new threshold of 70
    session.add(opportunity)
    session.commit()

    analysis = service.analyze_opportunity(opportunity.id)
    assert analysis is None  # Should skip

def test_ai_service_analyze_at_70(ai_service, session_factory):
    """Jobs scoring exactly 70 should be analyzed."""
    service, session = ai_service

    opportunity = Opportunity(
        external_id="TEST-THRESHOLD-2",
        source="test",
        source_company="test",
        title="At Threshold",
        company_name="Test Co",
        url="https://example.com/job/THRESHOLD-2",
        description="Test job description with enough content",
    )
    opportunity.total_score = 70.0  # Exactly at new threshold
    session.add(opportunity)
    session.commit()

    analysis = service.analyze_opportunity(opportunity.id)
    assert analysis is not None  # Should analyze
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/randycounsman/Git/p-p/producer-producer-api && python -m pytest tests/test_ai_analysis_service.py -k "threshold" -v`
Expected: `test_ai_service_skip_score_below_70` PASSES (65 is below both 50 and 70) but `test_ai_service_analyze_at_70` may behave differently depending on existing threshold. Also check `test_ai_service_config_variations` which asserts `min_score_for_analysis` defaults to 50 — that test will need updating.

- [ ] **Step 3: Update threshold default**

In `fly_app/services/ai_analysis_service.py`, change line ~130:

```python
# Before:
min_score = config.get("min_score_for_analysis", 50)

# After:
min_score = config.get("min_score_for_analysis", 70)
```

- [ ] **Step 4: Update existing test that asserts old default**

In `tests/test_ai_analysis_service.py`, find `test_ai_service_config_variations` (around line 385). It asserts:

```python
assert service.ai_config.get("min_score_for_analysis", 50) == 50
```

This tests the config dict's `.get()` default, not the service behavior. Since we're changing the default in `_should_analyze()`, this test's assertion is still correct (it tests the raw dict). However, if the `ai_service` fixture passes `"min_score_for_analysis": 50` in its config (line 73), update it to 70 so fixture-based tests use the new threshold.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/randycounsman/Git/p-p/producer-producer-api && python -m pytest tests/test_ai_analysis_service.py -v`
Expected: All PASS. If `test_ai_service_skip_low_score` (which uses `total_score=30.0`) still passes, that confirms scores well below 70 are still skipped.

- [ ] **Step 5: Run full test suite**

Run: `cd /Users/randycounsman/Git/p-p/producer-producer-api && python -m pytest tests/ -v --timeout=60`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
cd /Users/randycounsman/Git/p-p/producer-producer-api
git add fly_app/services/ai_analysis_service.py tests/test_ai_analysis_service.py
git commit -m "feat: raise AI analysis threshold from 50 to 70

Jobs below 70 won't appear in the redesigned UI, so no need to spend
AI tokens analyzing them."
```

---

## Chunk 1 Complete

**Verification:** After all three tasks, run the full test suite one final time:

```bash
cd /Users/randycounsman/Git/p-p/producer-producer-api && python -m pytest tests/ -v --timeout=60
```

All tests should pass. The scoring improvements are now ready — salary extraction from descriptions populates compensation data for better scoring, and only jobs scoring 70+ will get AI analysis.

**Note on AI salary fallback:** The spec mentions a two-pass approach: regex first, AI fallback second. The AI fallback (extracting salary as part of the AI analysis call) is deferred to Plan 2 (AI Sentence Classification), where the AI prompt can be extended to also extract salary when the regex pass found nothing. This keeps Plan 1 focused on the regex extraction and threshold change.
