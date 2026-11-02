# API contract
GET /orders returns {items, limit}. Limit must be an integer from 1 to 100; invalid values return INVALID_LIMIT.
