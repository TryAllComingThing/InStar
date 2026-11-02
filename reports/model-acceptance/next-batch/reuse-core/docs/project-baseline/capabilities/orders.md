# Orders
CAP-ORDERS-LIST: listOrders(transport) requests /orders through network public export and returns parsed JSON. No response schema validation, authorization or state. Errors propagate from request. Owner inferred: orders. Consumer and test: test/requests.test.mjs. This is not a detail query API and should not be repurposed with a silent signature change.
